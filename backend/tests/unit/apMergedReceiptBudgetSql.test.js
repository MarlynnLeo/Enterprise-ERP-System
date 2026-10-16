jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() } }));
const { DatabaseSync } = require('node:sqlite');
const Service = require('../../src/services/finance/APPaymentBudgetService');
const { buildCostDocumentNumber } = require('../../src/utils/inventoryCostDocumentIdentity');
let database;
let connection;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE gl_entries (id INTEGER PRIMARY KEY, entry_date TEXT, document_type TEXT, document_number TEXT, is_posted INTEGER, is_reversed INTEGER, reversal_entry_id INTEGER);
    CREATE TABLE gl_entry_items (entry_id INTEGER, account_id INTEGER, cost_center_id INTEGER, debit_amount REAL, credit_amount REAL);
    CREATE TABLE cost_centers (id INTEGER PRIMARY KEY, department_id INTEGER);
    CREATE TABLE document_links (source_type TEXT, source_id INTEGER, target_type TEXT, target_id INTEGER);
    CREATE TABLE budgets (id INTEGER PRIMARY KEY, budget_no TEXT, budget_name TEXT, department_id INTEGER, status TEXT, start_date TEXT, end_date TEXT, budget_year INTEGER);
    CREATE TABLE budget_details (id INTEGER, budget_id INTEGER, account_id INTEGER, department_id INTEGER, budget_amount REAL, used_amount REAL, remaining_amount REAL, warning_threshold REAL);
    CREATE TABLE budget_execution (budget_detail_id INTEGER, execution_amount REAL, gl_entry_id INTEGER);
    CREATE TABLE purchase_receipts (id INTEGER PRIMARY KEY, receipt_no TEXT, supplier_id INTEGER, status TEXT, deleted_at TEXT);
    CREATE TABLE inventory_posting_documents (id INTEGER PRIMARY KEY, source_no TEXT, source_id INTEGER, source_type TEXT, posting_kind TEXT, finance_status TEXT, locked INTEGER);
    CREATE TABLE inventory_posting_lines (id INTEGER PRIMARY KEY, posting_document_id INTEGER, material_id INTEGER, reference_no TEXT, posted_quantity REAL, posted_value REAL, transaction_type TEXT, signed_quantity REAL);
    INSERT INTO cost_centers VALUES (5,8);
    INSERT INTO budgets VALUES (1,'B26','材料预算',NULL,'执行中','2026-09-01','2026-09-30',2026);
    INSERT INTO budget_details VALUES (1,1,1403,NULL,200,0,200,90);
    -- The normal merged voucher number differs from BOTH individual AP numbers.
    INSERT INTO gl_entries VALUES (90,'2026-10-10','invoice','MV20261010PR-MERGED',1,0,NULL);
    INSERT INTO gl_entry_items VALUES (90,220299,NULL,200,0),(90,222101,NULL,26,0),(90,2202,NULL,0,226);
    INSERT INTO document_links VALUES ('ap_invoice',1,'finance_voucher',90),('ap_invoice',2,'finance_voucher',90);
    INSERT INTO purchase_receipts VALUES (11,'PR-11',7,'completed',NULL),(12,'PR-12',7,'completed',NULL);
    INSERT INTO inventory_posting_documents VALUES (101,'PR-11',NULL,'inbound','movement','approved',1),(102,'PR-12',NULL,'inbound','movement','approved',1);
    INSERT INTO inventory_posting_lines VALUES (201,101,3,'PR-11',10,100,'purchase_inbound',10),(202,102,3,'PR-12',10,100,'purchase_inbound',10);
    INSERT INTO gl_entries VALUES (91,'2026-09-10','adjustment','PR-11-M3-L201',1,0,NULL),(92,'2026-09-20','adjustment','PR-12-M3-L202',1,0,NULL);
    INSERT INTO gl_entry_items VALUES (91,1403,5,100,0),(91,220299,NULL,0,100),(92,1403,5,100,0),(92,220299,NULL,0,100);
  `);
  connection = { execute: jest.fn(async (sql, values = []) => {
    // Execute production SQL against real relational rows. Only strip MySQL's
    // row-lock syntax; no query-specific canned replies or monetary shortcuts.
    const query = database.prepare(sql.replace(/ FOR (SHARE|UPDATE)/g, ''));
    return [query.all(...values)];
  }) };
});
afterEach(() => database.close());
const invoice = id => ({ id, invoice_number: `AP-${id}`, supplier_id: 7, source_type: 'purchase_receipt', source_id: id + 10 });

test('both invoices linked to one merged voucher can pay without duplicate budget usage', async () => {
  await Service.assertInvoiceWithinBudget(connection, invoice(1));
  await Service.assertInvoiceWithinBudget(connection, invoice(2));
  await Service.assertInvoiceWithinBudget(connection, invoice(1)); // another partial payment
  expect(database.prepare('SELECT SUM(debit_amount-credit_amount) amount FROM gl_entry_items WHERE account_id=1403').get().amount).toBe(200);
  expect(database.prepare('SELECT COUNT(*) n FROM budget_execution').get().n).toBe(0);
  const checks = connection.execute.mock.calls.filter(([sql]) => sql.includes('FROM budgets'));
  expect(checks.some(([, params]) => params[0] === 1403 && params[1] === '2026-09-10')).toBe(true);
  expect(checks.some(([, params]) => params[0] === 1403 && params[1] === '2026-09-20')).toBe(true);
});

test('raw material overrun blocks payment although GR/IR and VAT have no configured budget', async () => {
  database.exec('UPDATE budget_details SET budget_amount=199');
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).rejects.toThrow(/预算余额不足/);
});

test('real inventory cost center selects department budget; missing one cannot bypass it', async () => {
  database.exec('UPDATE budget_details SET department_id=8');
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).resolves.toBeUndefined();
  database.exec('UPDATE gl_entry_items SET cost_center_id=NULL WHERE entry_id=91');
  await expect(Service.assertInvoiceWithinBudget(connection, { ...invoice(1), department_id: 8 })).rejects.toThrow(/成本中心/);
});

test('duplicate link rows do not turn one merged voucher into two sources', async () => {
  database.exec("INSERT INTO document_links VALUES ('ap_invoice',1,'finance_voucher',90)");
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).resolves.toBeUndefined();
});

test('unrelated invoice links cannot supply missing payable confirmation', async () => {
  database.exec("DELETE FROM document_links WHERE source_id=1");
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).rejects.toThrow(/唯一有效/);
});

test('another active payable voucher for one invoice is ambiguous', async () => {
  database.exec("INSERT INTO gl_entries VALUES (93,'2026-10-10','invoice','AP-1',1,0,NULL)");
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).rejects.toThrow(/唯一有效/);
});

test.each([
  "UPDATE gl_entries SET is_posted=0 WHERE id=90",
  "UPDATE gl_entries SET is_reversed=1 WHERE id=90",
  "UPDATE gl_entries SET reversal_entry_id=90 WHERE id=91",
])('inactive or reversal payable entry cannot authorize payment: %s', async change => {
  database.exec(change);
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).rejects.toThrow(/唯一有效/);
});

test.each([
  "DELETE FROM gl_entries WHERE id=91",
  "UPDATE inventory_posting_documents SET finance_status='pending' WHERE id=101",
  "UPDATE gl_entry_items SET debit_amount=99 WHERE entry_id=91 AND account_id=1403",
  "UPDATE purchase_receipts SET supplier_id=9 WHERE id=11",
])('missing or mismatched receipt cost evidence fails closed: %s', async change => {
  database.exec(change);
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).rejects.toThrow(/不能/);
});

test('legacy receipt/material voucher is matched once against all its frozen batch lines', async () => {
  database.exec("UPDATE gl_entries SET document_number='PR-11-M3' WHERE id=91; UPDATE inventory_posting_lines SET posted_value=50, posted_quantity=5,signed_quantity=5 WHERE id=201; INSERT INTO inventory_posting_lines VALUES (203,101,3,'PR-11',5,50,'purchase_inbound',5)");
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).resolves.toBeUndefined();
});

test('long source numbers use the same hashed cost identity as InventoryCostService', async () => {
  const no = `PR-${'A'.repeat(70)}`;
  database.prepare('UPDATE purchase_receipts SET receipt_no=? WHERE id=11').run(no);
  database.prepare('UPDATE inventory_posting_documents SET source_no=? WHERE id=101').run(no);
  database.prepare('UPDATE inventory_posting_lines SET reference_no=? WHERE id=201').run(no);
  database.prepare('UPDATE gl_entries SET document_number=? WHERE id=91').run(buildCostDocumentNumber({ reference_no: no, material_id: 3, posting_line_id: 201 }, 'IN'));
  await expect(Service.assertInvoiceWithinBudget(connection, invoice(1))).resolves.toBeUndefined();
});
