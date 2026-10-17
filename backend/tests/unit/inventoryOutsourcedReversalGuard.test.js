/* global beforeEach, describe, expect, jest, test */
jest.mock('../../src/services/business/TaskLifecycleService', () => ({}));
jest.mock('../../src/services/finance/VoucherReversalService', () => ({
  reverseBusinessVouchers: jest.fn(async () => ({})),
}));
const Closure = require('../../src/services/business/InventoryPostingReversalClosureService');
const Vouchers = require('../../src/services/finance/VoucherReversalService');

describe('outsourced issue reversal downstream guard', () => {
  beforeEach(() => jest.clearAllMocks());
  const context = { sourceType: 'outsourced_processing_material', sourceId: 7, sourceNo: 'WW-7' };
  const connection = (receipts) => ({ execute: jest.fn(async (sql, args) => {
    if (sql.includes('FROM outsourced_processings')) return [[{ id: 7, processing_no: 'WW-7', status: 'in_progress' }]];
    if (sql.includes('FROM outsourced_processing_receipts')) {
      expect(sql).toContain("status <> 'cancelled'");
      expect(sql).toContain('FOR UPDATE');
      expect(args).toEqual([7]);
      return [receipts];
    }
    if (sql.includes('UPDATE outsourced_processings')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL ${sql}`);
  }) });

  test.each(['draft', 'arrived', 'completed'])('refuses a parent cancellation while a %s receipt exists', async (status) => {
    const conn = connection([{ id: 11, status }]);
    await expect(Closure.closeOutsourcedProcessing(conn, context, { id: 1 }))
      .rejects.toMatchObject({ statusCode: 409, code: 'DOWNSTREAM_RECEIPT_EXISTS' });
    expect(conn.execute.mock.calls.some(([sql]) => sql.includes('UPDATE outsourced_processings'))).toBe(false);
    expect(Vouchers.reverseBusinessVouchers).not.toHaveBeenCalled();
  });

  test('cancels the parent and compensates vouchers once all downstream receipts are cancelled', async () => {
    const conn = connection([]);
    await expect(Closure.closeOutsourcedProcessing(conn, context, { id: 1 }))
      .resolves.toMatchObject({ businessClosed: true, sourceId: 7 });
    expect(conn.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(Vouchers.reverseBusinessVouchers).toHaveBeenCalledTimes(1);
  });
});
