jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
const db = require('../../src/config/db');
const tax = require('../../src/models/tax');

describe('tax invoice identity and posting boundaries', () => {
  let invoice;
  let document;
  let connection;
  beforeEach(() => {
    invoice = { id: 1, invoice_type: '进项', supplier_id: 3, status: '未认证', related_document_type: 'purchase_receipt', related_document_id: 7 };
    document = { id: 9, supplier_id: 3, source_type: 'purchase_receipt', source_id: 7 };
    connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: jest.fn(async (sql) => {
        if (sql.includes('FROM tax_invoices')) return [[invoice]];
        if (sql.includes('FROM ap_invoices')) return [[document]];
        return [{ affectedRows: 1, insertId: 12 }];
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    db.pool.execute.mockReset().mockResolvedValue([{ insertId: 12 }]);
  });

  test.each(['purchase_receipt', '采购入库单', '采购收货单'])('preserves source identity %s when adding AP association', async (source) => {
    invoice.related_document_type = source;
    await tax.linkToDocument(1, 'ap_invoice', 9);
    expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining('SET remark'), [expect.stringContaining('linked_ap_invoice=9'), 1]);
    expect(connection.execute.mock.calls.some(([sql]) => sql.includes('SET related_document_type'))).toBe(false);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test.each(['purchase_receipt', '采购入库单', 'sales_outbound', '采购收货单'])('cannot unlink generated source %s', async (source) => {
    invoice.related_document_type = source;
    await expect(tax.unlinkDocument(1)).rejects.toThrow('源业务单据关联不能解除');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });

  test('refuses cross-party and unrelated-source invoice links', async () => {
    document.supplier_id = 4;
    await expect(tax.linkToDocument(1, 'ap_invoice', 9)).rejects.toThrow('往来单位');
    document.supplier_id = 3;
    document.source_id = 8;
    await expect(tax.linkToDocument(1, 'ap_invoice', 9)).rejects.toThrow('同一业务单据');
  });

  test('legacy sales-order AR invoice can link to its own outbound tax source', async () => {
    Object.assign(invoice, { invoice_type: '销项', customer_id: 4, related_document_type: 'sales_outbound' });
    connection.execute.mockImplementation(async (sql) => {
      if (sql.includes('FROM tax_invoices')) return [[invoice]];
      if (sql.includes('FROM ar_invoices')) return [[{ id: 9, customer_id: 4, source_type: 'sales_order', source_id: 20 }]];
      if (sql.includes('FROM sales_outbound')) return [[{ order_id: 20 }]];
      return [{ affectedRows: 1 }];
    });
    await expect(tax.linkToDocument(1, 'ar_invoice', 9)).resolves.toBe(true);
    expect(connection.execute.mock.calls.some(([sql]) => sql.includes('SET related_document_type'))).toBe(false);
  });

  test('checks current certified state under lock before a rename or link mutation', async () => {
    invoice.status = '已认证';
    await expect(tax.updateTaxInvoiceNumber(1, 'NEW')).rejects.toThrow('不能直接修改');
    await expect(tax.linkToDocument(1, 'ap_invoice', 9)).rejects.toThrow('不能直接修改');
    expect(connection.execute.mock.calls.every(([sql]) => sql.includes('FOR UPDATE'))).toBe(true);
  });

  const valid = { invoice_type: '进项', invoice_number: 'TAX1', invoice_date: '2026-10-15', amount_excluding_tax: 100, tax_rate: 13, tax_amount: 13, total_amount: 113, created_by: 8 };
  test.each(['已抵扣', '已作废', 'garbage'])('creation cannot bypass posting with initial status %s', async (status) => {
    await expect(tax.createTaxInvoice({ ...valid, status })).rejects.toThrow('新建税票只能');
    expect(db.pool.execute).not.toHaveBeenCalled();
  });

  test.each([Infinity, NaN, 'oops', true, null, ''])('malformed numeric input %s cannot silently become zero', async (amount) => {
    await expect(tax.createTaxInvoice({ ...valid, tax_amount: amount, total_amount: 100 })).rejects.toThrow('有效数字');
    expect(db.pool.execute).not.toHaveBeenCalled();
  });

  test('valid tax invoice remains creatable', async () => {
    await expect(tax.createTaxInvoice(valid)).resolves.toBe(12);
  });
});
