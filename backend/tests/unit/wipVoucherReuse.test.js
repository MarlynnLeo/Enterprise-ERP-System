jest.mock('../../src/services/business/costAccounting/runtime', () => ({
  BusinessError: jest.requireActual('../../src/utils/BusinessError'),
  businessConfig: {},
  toLocalDateString: value => value,
  resolveActorUserId: jest.fn().mockResolvedValue(2),
  GLService: { createEntry: jest.fn().mockResolvedValue(90) },
  Precision: jest.requireActual('../../src/utils/precision'),
  financeConfig: { get: jest.fn().mockReturnValue('CNY') },
}));
const runtime = require('../../src/services/business/costAccounting/runtime');
const helpers = require('../../src/services/business/costAccounting/helpersMethods');

describe('WIP voucher reuse converges on one posted closing voucher', () => {
  const base = { document_type: '期末WIP结转', document_number: 'WIP-10', is_posted: 1 };
  const items = [
    { account_id: 2, debit_amount: 500, credit_amount: 0 },
    { account_id: 1, debit_amount: 0, credit_amount: 500 },
  ];
  const connectionFor = entries => ({ execute: jest.fn(async sql => {
    if (sql.includes('FROM gl_entries')) return [entries];
    if (sql.includes('FROM gl_entry_items')) return [items];
    return [{ affectedRows: 1 }];
  }) });

  it('retains one correct posted voucher and reverses an additional duplicate', async () => {
    const connection = connectionFor([{ ...base, id: 1 }, { ...base, id: 2 }]);
    const result = await helpers.releaseExistingWIPVoucherIfNeeded(connection, 10, '2026-10-31', 500, 2, 1);
    expect(result).toMatchObject({ reused: true, entryId: 1, repairedCount: 1 });
    expect(runtime.GLService.createEntry).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls.find(([sql]) => sql.includes('SET is_reversed'))[1]).toEqual([90, 2]);
  });

  it('never treats a numerically matching draft as a posted WIP voucher', async () => {
    const connection = connectionFor([{ ...base, id: 3, is_posted: 0 }]);
    const result = await helpers.releaseExistingWIPVoucherIfNeeded(connection, 10, '2026-10-31', 500, 2, 1);
    expect(result.reused).not.toBe(true);
    expect(result.repairedCount).toBe(1);
    expect(connection.execute).toHaveBeenCalledWith('DELETE FROM gl_entries WHERE id = ?', [3]);
    expect(runtime.GLService.createEntry).not.toHaveBeenCalled();
  });

  it('blocks a same-number voucher belonging to another source', async () => {
    const connection = connectionFor([{ ...base, id: 4, document_type: 'manual' }]);
    await expect(helpers.releaseExistingWIPVoucherIfNeeded(connection, 10, '2026-10-31', 500, 2, 1))
      .rejects.toMatchObject({ errorCode: 'WIP_VOUCHER_SOURCE_CONFLICT' });
    expect(runtime.GLService.createEntry).not.toHaveBeenCalled();
    expect(connection.execute).toHaveBeenCalledTimes(1);
  });
});
