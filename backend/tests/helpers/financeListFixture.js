const { DatabaseSync } = require('node:sqlite');

// In-memory SQL fixtures; models keep their real SQL and return mapping.
function createFinanceListFixture() {
  const fixture = new DatabaseSync(':memory:');
  fixture.exec(`
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE users (id INTEGER PRIMARY KEY, real_name TEXT, department_id INTEGER);
    CREATE TABLE ap_invoices (id INTEGER PRIMARY KEY, invoice_number TEXT, total_amount NUMERIC, status TEXT);
    CREATE TABLE ar_invoices (id INTEGER PRIMARY KEY, invoice_number TEXT, total_amount NUMERIC, status TEXT);
    CREATE TABLE purchase_receipts (id INTEGER PRIMARY KEY, receipt_no TEXT, total_amount NUMERIC, status TEXT);
    CREATE TABLE sales_outbound (id INTEGER PRIMARY KEY, outbound_no TEXT, status TEXT);
    CREATE TABLE tax_invoices (
      id INTEGER PRIMARY KEY, invoice_type TEXT, invoice_number TEXT, invoice_date TEXT,
      supplier_id INTEGER, customer_id INTEGER, created_by INTEGER, status TEXT,
      amount_excluding_tax NUMERIC, tax_rate NUMERIC, tax_amount NUMERIC, total_amount NUMERIC,
      related_document_type TEXT, related_document_id INTEGER,
      original_tax_invoice_id INTEGER, remark TEXT
    );
    CREATE INDEX tax_invoice_date_id ON tax_invoices(invoice_date, id);
    CREATE TABLE bank_accounts (id INTEGER PRIMARY KEY, account_name TEXT, bank_name TEXT);
    CREATE TABLE bank_transactions (
      id INTEGER PRIMARY KEY, transaction_number TEXT, transaction_date TEXT, bank_account_id INTEGER,
      transaction_type TEXT, amount NUMERIC, description TEXT, related_party TEXT,
      related_invoice_type TEXT, related_invoice_id INTEGER, category TEXT,
      status TEXT, is_reconciled INTEGER, created_by INTEGER
    );
    CREATE INDEX bank_transaction_date_id ON bank_transactions(transaction_date, id);
    INSERT INTO suppliers VALUES (7, '供应商甲'), (9, '供应商乙');
    INSERT INTO customers VALUES (8, '客户甲'), (10, '客户乙');
    INSERT INTO users VALUES (7, '财务甲', 8), (99, '财务乙', 9);
    INSERT INTO ap_invoices VALUES (21, 'AP-21', 113.01, '已确认');
    INSERT INTO ar_invoices VALUES (22, 'AR-22', 226.02, '部分付款');
    INSERT INTO purchase_receipts VALUES (23, 'REC-23', 339.03, 'completed');
    INSERT INTO sales_outbound VALUES (24, 'OUT-24', 'completed');
    INSERT INTO bank_accounts VALUES (7, '经营户', '银行甲');
  `);
  return fixture;
}

function seedTaxInvoice(fixture, id, overrides = {}) {
  const row = {
    id, invoice_type: '进项', invoice_number: `TAX-${id}`, invoice_date: '2026-10-17',
    supplier_id: 7, customer_id: 8, created_by: 7, status: '未认证',
    amount_excluding_tax: 100, tax_rate: 13.01, tax_amount: 13.01, total_amount: 113.01,
    related_document_type: 'ap_invoice', related_document_id: 21,
    original_tax_invoice_id: null, remark: `税票备注 ${id}`,
    ...overrides,
  };
  fixture.prepare(`INSERT INTO tax_invoices (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  return row;
}

function seedBankTransaction(fixture, id, overrides = {}) {
  const row = {
    id, transaction_number: `BANK-${id}`, transaction_date: '2026-10-17', bank_account_id: 7,
    transaction_type: 'income', amount: 113.01, description: `说明 ${id}`, related_party: '客户甲',
    related_invoice_type: 'AR', related_invoice_id: 22, category: 'sales_income',
    status: 'approved', is_reconciled: 0, created_by: 7,
    ...overrides,
  };
  fixture.prepare(`INSERT INTO bank_transactions (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  return row;
}

module.exports = { createFinanceListFixture, seedTaxInvoice, seedBankTransaction };
