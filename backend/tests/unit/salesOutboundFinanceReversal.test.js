jest.mock('../../src/config/db', () => ({ getConnection: jest.fn(), pool: { getConnection: jest.fn() } }));
jest.mock('../../src/models/finance', () => ({ reverseEntry: jest.fn() }));
jest.mock('../../src/utils/userUtils', () => ({
  resolveActorLabel: jest.fn(async () => '财务'), resolveActorUserId: jest.fn(async () => 2),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const SalesOutboundReversalService = require('../../src/services/business/SalesOutboundReversalService');
const VoucherReversalService = require('../../src/services/finance/VoucherReversalService');
const financeModel = require('../../src/models/finance');
const { INVOICE_STATUS, TAX_INVOICE_STATUS } = require('../../src/constants/financeConstants');

describe('sales outbound accounting reversal', () => {
  const invoice = { id: 31, invoice_number: 'AR31', status: INVOICE_STATUS.CONFIRMED, paid_amount: 0 };

  function stubOtherStages() {
    jest.spyOn(SalesOutboundReversalService, 'reverseCostEntries').mockResolvedValue(0);
    jest.spyOn(SalesOutboundReversalService, 'resolveRelatedOrderIds').mockResolvedValue([]);
    jest.spyOn(SalesOutboundReversalService, 'voidRelatedTaxInvoices').mockResolvedValue(0);
  }

  test('a paid outbound-level invoice blocks the inventory reversal', async () => {
    stubOtherStages();
    const connection = { execute: jest.fn().mockResolvedValueOnce([[{ ...invoice, paid_amount: 10 }]]) };
    await expect(SalesOutboundReversalService.compensateFinance(connection, { outboundId: 7 }))
      .rejects.toMatchObject({ code: 'AR_HAS_PAYMENT' });
    expect(connection.execute.mock.calls[0][0]).toContain("source_type = 'sales_outbound'");
    expect(SalesOutboundReversalService.voidRelatedTaxInvoices).not.toHaveBeenCalled();
  });

  test('unpaid outbound-level AR and its linked voucher are reversed before tax processing', async () => {
    stubOtherStages();
    financeModel.reverseEntry.mockResolvedValue(56);
    const connection = { execute: jest.fn(async (sql) => {
      if (sql.includes("source_type = 'sales_outbound'")) return [[invoice]];
      if (sql.includes('SELECT target_id')) return [[{ target_id: 55 }]];
      if (sql.includes('document_number = ?')) return [[]];
      if (sql.includes('WHERE id IN')) return [[{ id: 55 }]];
      if (sql.includes('SELECT i.id FROM document_links')) return [[]];
      if (sql.includes('UPDATE ar_invoices')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
    await expect(SalesOutboundReversalService.compensateFinance(connection, { outboundId: 7 }))
      .resolves.toMatchObject({ arInvoicesCancelled: 1 });
    expect(financeModel.reverseEntry).toHaveBeenCalledWith(55, expect.any(Object), connection);
    expect(financeModel.reverseEntry.mock.invocationCallOrder[0])
      .toBeLessThan(SalesOutboundReversalService.voidRelatedTaxInvoices.mock.invocationCallOrder[0]);
  });

  test('legacy AR reversal failures propagate to the surrounding inventory transaction', async () => {
    stubOtherStages();
    SalesOutboundReversalService.resolveRelatedOrderIds.mockResolvedValue([12]);
    const failure = new Error('会计期间已关闭');
    jest.spyOn(SalesOutboundReversalService, 'cancelUnpaidArIfSafe').mockRejectedValue(failure);
    await expect(SalesOutboundReversalService.compensateFinance({}, { orderId: 12 }))
      .rejects.toBe(failure);
  });

  test('tax-voucher failures prevent tax invoice voiding', async () => {
    const failure = new Error('冲销科目不存在');
    financeModel.reverseEntry.mockRejectedValue(failure);
    const connection = { execute: jest.fn()
      .mockResolvedValueOnce([[{ id: 9, invoice_number: 'TAX9', status: TAX_INVOICE_STATUS.CERTIFIED, gl_entry_id: 55 }]])
      .mockResolvedValueOnce([[{ id: 55, is_reversed: false }]]) };
    await expect(SalesOutboundReversalService.voidRelatedTaxInvoices(connection, 7, '财务')).rejects.toBe(failure);
    expect(connection.execute.mock.calls.some(([sql]) => sql.includes('UPDATE tax_invoices'))).toBe(false);
  });

  test('a tax invoice can reuse an already reversed AR voucher without reversing it twice', async () => {
    const connection = { execute: jest.fn()
      .mockResolvedValueOnce([[{ id: 9, status: TAX_INVOICE_STATUS.CERTIFIED, gl_entry_id: 55 }]])
      .mockResolvedValueOnce([[{ id: 55, is_reversed: true }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]) };
    await expect(SalesOutboundReversalService.voidRelatedTaxInvoices(connection, 7, '财务')).resolves.toBe(1);
    expect(financeModel.reverseEntry).not.toHaveBeenCalled();
  });
});

describe('shared invoice voucher protection', () => {
  test.each(['ar_invoice', 'ap_invoice'])('%s cannot cancel another active invoice through a shared voucher', async (sourceType) => {
    jest.spyOn(VoucherReversalService, 'findActiveVoucherIds').mockResolvedValue([55]);
    const connection = { execute: jest.fn().mockResolvedValueOnce([[{ id: 32 }]]) };
    await expect(VoucherReversalService.reverseBusinessVouchers(connection, { sourceType, sourceId: 31 }))
      .rejects.toMatchObject({ code: 'SHARED_INVOICE_VOUCHER' });
    expect(financeModel.reverseEntry).not.toHaveBeenCalled();
  });

  test('missing historical vouchers have a precise code, distinct from reversal failures', async () => {
    jest.spyOn(VoucherReversalService, 'findActiveVoucherIds').mockResolvedValue([]);
    await expect(VoucherReversalService.reverseBusinessVouchers({}, { sourceType: 'ar_invoice', sourceId: 31 }))
      .rejects.toMatchObject({ code: 'VOUCHER_NOT_FOUND' });
  });

  test.each(['ar', 'ap'])('%s cancellation rolls back a real reversal failure even when its message says 不存在', async (kind) => {
    const failure = new Error('冲销科目不存在');
    jest.spyOn(VoucherReversalService, 'reverseBusinessVouchers').mockRejectedValue(failure);
    const connection = {
      beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
      execute: jest.fn().mockResolvedValueOnce([[{
        id: 31, invoice_number: 'INV31', status: INVOICE_STATUS.CONFIRMED,
        total_amount: 100, paid_amount: 0, created_by: 1,
      }]]),
    };
    const db = require('../../src/config/db');
    db.getConnection.mockResolvedValue(connection);
    db.pool.getConnection.mockResolvedValue(connection);
    const model = require(`../../src/models/${kind}`);
    await expect(model.updateInvoiceStatus(31, INVOICE_STATUS.CANCELLED, { updated_by: 2 }))
      .rejects.toBe(failure);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.execute.mock.calls.some(([sql]) => /UPDATE (ar|ap)_invoices/.test(sql))).toBe(false);
  });
});
