/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/services/business/BudgetControlService', () => ({ checkBudgetAvailability: jest.fn() }));
const { DatabaseSync } = require('node:sqlite');
const Budget = require('../../src/services/business/BudgetControlService');
const Service = require('../../src/services/finance/APPaymentBudgetService');
const { DOCUMENT_TYPE_MAPPING: Types } = require('../../src/constants/financeConstants');
const { buildCostDocumentNumber } = require('../../src/utils/inventoryCostDocumentIdentity');
let database;
let connection;
const invoice = { id: 1, invoice_number: 'AP-ONE', source_type: 'purchase_receipt', source_id: 2, supplier_id: 7 };
beforeEach(() => {
  database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE gl_entries (id INTEGER, document_type TEXT, document_number TEXT,
    entry_date TEXT, is_posted INTEGER, is_reversed INTEGER, reversal_entry_id INTEGER);
    CREATE TABLE document_links (source_type TEXT, source_id INTEGER, target_type TEXT, target_id INTEGER);
    CREATE TABLE purchase_receipts (id INTEGER, receipt_no TEXT, supplier_id INTEGER, status TEXT, deleted_at TEXT);
    CREATE TABLE inventory_posting_documents (id INTEGER, source_no TEXT, source_id INTEGER, source_type TEXT, posting_kind TEXT, finance_status TEXT, locked INTEGER);
    CREATE TABLE inventory_posting_lines (id INTEGER, posting_document_id INTEGER, material_id INTEGER, reference_no TEXT,
      posted_quantity REAL, posted_value REAL, transaction_type TEXT, signed_quantity REAL);
    CREATE TABLE gl_entry_items (entry_id INTEGER, account_id INTEGER, cost_center_id INTEGER, debit_amount REAL);
    CREATE TABLE cost_centers (id INTEGER, department_id INTEGER);
    INSERT INTO document_links VALUES ('ap_invoice',1,'finance_voucher',100),('ap_invoice',3,'finance_voucher',100);
    INSERT INTO purchase_receipts VALUES (2,'RCV-2',7,'completed',NULL);
    INSERT INTO inventory_posting_documents VALUES (9,'RCV-2',2,'inbound','movement','approved',1);
    INSERT INTO inventory_posting_lines VALUES (11,9,4,'RCV-2',5,50,'purchase_inbound',5);
    INSERT INTO gl_entry_items VALUES (100,10,8,50),(101,20,8,50);
    INSERT INTO cost_centers VALUES (8,6);
  `);
  database.prepare('INSERT INTO gl_entries VALUES (100,?,?,?,1,0,NULL)').run(Types.PURCHASE_INVOICE, 'MERGED-AP-1-3', '2026-09-16');
  database.prepare('INSERT INTO gl_entries VALUES (101,?,?,?,1,0,NULL)').run(Types.INVENTORY_INBOUND,
    buildCostDocumentNumber({ posting_line_id: 11, material_id: 4, reference_no: 'RCV-2' }, 'IN'), '2026-09-15');
  connection = { execute: jest.fn(async (sql, params = []) => [database.prepare(sql.replace(/ FOR SHARE/g, '')).all(...params)]) };
  Budget.checkBudgetAvailability.mockReset().mockResolvedValue({ available: true });
});
afterEach(() => database.close());

test('merged AP voucher resolves by persisted invoice link and reaches receipt material budget', async () => {
  await expect(Service.assertInvoiceWithinBudget(connection, invoice)).resolves.toBeUndefined();
  expect(Budget.checkBudgetAvailability).toHaveBeenCalledWith(20, 6, 0, '2026-09-15', connection, null, { allowZeroAmount: true });
  expect(database.prepare('SELECT COUNT(*) AS n FROM gl_entries').get().n).toBe(2);
});

test('material budget overrun blocks payment even when GR/IR has no configured budget', async () => {
  Budget.checkBudgetAvailability.mockImplementation(async account => account === 20
    ? { available: false, budget: { id: 99 }, reason: '材料预算余额不足' }
    : { available: true, budget: null });
  await expect(Service.assertInvoiceWithinBudget(connection, invoice)).rejects.toThrow('材料预算余额不足');
});

test('legacy inbound invoice alias uses the same receipt identity and does not create duplicate budget usage', async () => {
  await Service.assertInvoiceWithinBudget(connection, { ...invoice, source_type: 'inbound' });
  expect(Budget.checkBudgetAvailability.mock.calls.every(call => call[2] === 0)).toBe(true);
});

test('an unrelated merged voucher cannot be substituted by a client invoice number', async () => {
  database.exec('DELETE FROM document_links WHERE source_id=1');
  await expect(Service.assertInvoiceWithinBudget(connection, invoice)).rejects.toThrow('唯一有效');
  expect(Budget.checkBudgetAvailability).not.toHaveBeenCalled();
});

test('duplicate active AP voucher or an invalid material voucher is blocked', async () => {
  database.prepare('INSERT INTO gl_entries VALUES (102,?,?,?,1,0,NULL)').run(Types.PURCHASE_INVOICE, invoice.invoice_number, '2026-09-16');
  await expect(Service.assertInvoiceWithinBudget(connection, invoice)).rejects.toThrow('唯一有效');
  database.exec('DELETE FROM gl_entries WHERE id=102; UPDATE gl_entries SET is_posted=0 WHERE id=101');
  await expect(Service.assertInvoiceWithinBudget(connection, invoice)).rejects.toThrow('材料成本缺少唯一有效凭证');
});
