/* global beforeEach, describe, expect, it, jest */
jest.mock('../../src/services/business/costAccounting/runtime', () => ({
  db: { pool: { getConnection: jest.fn() } },
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
  currentDateString: () => '2026-10-31',
  toLocalDateString: (value) => String(value).slice(0, 10),
  resolveActorUserId: jest.fn().mockResolvedValue(1),
  GLService: { createEntry: jest.fn().mockResolvedValue(99) },
  Precision: jest.requireActual('../../src/utils/precision'),
  BusinessError: jest.requireActual('../../src/utils/BusinessError'),
}));
jest.mock('../../src/config/accountingConfig', () => ({
  accountingConfig: {
    loadFromDatabase: jest.fn(),
    getAccountCode: (key) => key,
  },
}));
const runtime = require('../../src/services/business/costAccounting/runtime');
const methods = require('../../src/services/business/costAccounting/wipMethods');

describe('period-end WIP snapshot closure', () => {
  let connection, service, snapshots, tasks;
  beforeEach(() => {
    tasks = [];
    snapshots = [
      { period: 10, date: '2026-10-15', value: 500 },
      { period: 10, date: '2026-10-31', value: 500 },
      { period: 9, date: '2026-09-30', value: 700 },
    ];
    connection = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
      execute: jest.fn(async (sql, params) => {
        if (sql.includes('DELETE FROM wip_snapshots')) {
          snapshots = snapshots.filter((row) => row.period !== params[0] || row.date !== params[1]);
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('SUM(wip_material_cost)')) {
          const rows = snapshots.filter(
            (row) =>
              row.period === params[0] &&
              (!sql.includes('snapshot_date =') || row.date === '2026-10-31')
          );
          return [
            [
              {
                snapshot_count: rows.length,
                total_cost: rows.reduce((sum, row) => sum + row.value, 0),
              },
            ],
          ];
        }
        if (sql.includes('FROM gl_periods'))
          return [[{ start_date: '2026-10-01', end_date: '2026-10-31' }]];
        if (sql.includes('FROM production_tasks')) return [tasks];
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    runtime.db.pool.getConnection.mockResolvedValue(connection);
    service = {
      ...methods,
      assertOpenPeriod: jest.fn(),
      toDateOnly: (value) => String(value).slice(0, 10),
      getAccountIdByCode: jest.fn(async (_conn, code) => (code === 'PRODUCTION_COST' ? 1 : 2)),
      releaseExistingWIPVoucherIfNeeded: jest.fn().mockResolvedValue(null),
    };
  });

  it('posts only period-end WIP instead of adding daily observations', async () => {
    const result = await service.generateWIPVoucher(10);
    expect(result.totalWIPCost).toBe(500);
    expect(runtime.GLService.createEntry).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({ debit_amount: 500 }),
        expect.objectContaining({ credit_amount: 500 }),
      ],
      connection
    );
  });

  it('replaces an empty final snapshot and releases stale WIP without reusing midmonth amounts', async () => {
    const result = await service.calculateWIPCost(10);
    expect(result.summary.totalWIPCost).toBe(0);
    expect(snapshots).toEqual([
      { period: 10, date: '2026-10-15', value: 500 },
      { period: 9, date: '2026-09-30', value: 700 },
    ]);
    const voucher = await service.generateWIPVoucher(10);
    expect(voucher.skipped).toBe(true);
    expect(service.releaseExistingWIPVoucherIfNeeded).toHaveBeenCalledWith(
      connection,
      10,
      '2026-10-31',
      0,
      null,
      null
    );
    expect(runtime.GLService.createEntry).not.toHaveBeenCalled();
  });

  it('does not touch snapshots when the period is closed or the requested date is outside it', async () => {
    service.assertOpenPeriod.mockRejectedValueOnce(new Error('period closed'));
    await expect(service.calculateWIPCost(10)).rejects.toThrow('period closed');
    await expect(service.calculateWIPCost(10, '2026-11-01')).rejects.toThrow('不在会计期间');
    expect(snapshots).toHaveLength(3);
    expect(connection.rollback).toHaveBeenCalledTimes(2);
  });

  it('does not reverse an existing voucher when period-end WIP has not been calculated', async () => {
    snapshots = snapshots.filter((row) => row.date !== '2026-10-31');
    tasks = [{ id: 7, task_id: 7 }];
    await expect(service.generateWIPVoucher(10)).rejects.toMatchObject({
      errorCode: 'WIP_SNAPSHOT_REQUIRED',
      httpStatus: 409,
    });
    expect(service.releaseExistingWIPVoucherIfNeeded).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalled();
  });

  it('accepts an explicitly calculated zero-cost snapshot even with an eligible task', async () => {
    snapshots.find((row) => row.date === '2026-10-31').value = 0;
    tasks = [{ id: 7, task_id: 7 }];
    await expect(service.generateWIPVoucher(10)).resolves.toMatchObject({ skipped: true });
    expect(service.releaseExistingWIPVoucherIfNeeded).toHaveBeenCalledWith(
      connection,
      10,
      '2026-10-31',
      0,
      null,
      null
    );
  });

  it('refuses a negative WIP snapshot instead of treating it as an empty set', async () => {
    snapshots.find((row) => row.date === '2026-10-31').value = -100;
    await expect(service.generateWIPVoucher(10)).rejects.toMatchObject({
      errorCode: 'INVALID_WIP_SNAPSHOT',
      httpStatus: 409,
    });
    expect(service.releaseExistingWIPVoucherIfNeeded).not.toHaveBeenCalled();
  });
});
