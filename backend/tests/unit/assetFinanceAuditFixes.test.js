jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn().mockResolvedValue(501) }));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({
  nextCode: jest.fn().mockResolvedValue('DEP-TEST'),
}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({
  tryAutoLink: jest.fn().mockResolvedValue(),
}));
jest.mock('../../src/config/accountingConfig', () => ({
  accountingConfig: {
    loadFromDatabase: jest.fn().mockResolvedValue(),
    getAccountCode: jest.fn((key) => key),
  },
}));
jest.mock('../../src/utils/userUtils', () => ({
  resolveActorUserId: jest.fn().mockResolvedValue(5),
  resolveActorLabel: jest.fn().mockResolvedValue('Finance reviewer'),
}));
jest.mock('../../src/config/financeConfig', () => ({
  financeConfig: {
    loadFromDatabase: jest.fn().mockResolvedValue(),
    get: jest.fn().mockReturnValue(5),
  },
}));

const db = require('../../src/config/db');
const financeModel = require('../../src/models/finance');
const assetsModel = require('../../src/models/assets');
const DepreciationService = require('../../src/services/business/DepreciationService');
const { calculateDepreciationSnapshot } = require('../../src/utils/finance/assetDepreciation');

const makeAsset = (overrides = {}) => ({
  id: 1,
  asset_code: 'FA-1',
  asset_name: 'Machine',
  asset_type: '机器设备',
  category_id: 2,
  acquisition_date: '2026-01-31',
  acquisition_cost: 60000,
  accumulated_depreciation: 0,
  impairment_amount: 0,
  salvage_value: 0,
  useful_life: 60,
  depreciation_method: 'sum_of_years',
  current_value: 60000,
  status: '在用',
  audit_status: 'approved',
  location_id: 1,
  department_id: 1,
  custodian: 'Operator',
  ...overrides,
});

describe('sum-of-years depreciation schedule', () => {
  test.each(['年数总和法', 'sum_of_years'])(
    'automated %s calculation matches manual calculation for every month of a partial final year',
    async (method) => {
      const asset = makeAsset({
        depreciation_method: method,
        useful_life: 18,
        acquisition_cost: 60000.01,
      });
      let total = 0;
      for (let month = 0; month <= 18; month++) {
        const date = `${2026 + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}`;
        const expected = calculateDepreciationSnapshot(asset, `${date}-01`).depreciationAmount;
        const actual = await DepreciationService.calculateAssetDepreciation(asset, date);
        expect(actual).toBe(expected);
        expect(DepreciationService.calculateSumOfYearsDepreciation(asset, date)).toBe(expected);
        total = Math.round((total + actual) * 100) / 100;
        asset.accumulated_depreciation = total;
      }
      expect(total).toBe(60000.01);
    }
  );

  test.each(['不计提', 'no_depreciation'])(
    'automation never depreciates %s assets',
    async (method) => {
      expect(
        await DepreciationService.calculateAssetDepreciation(
          makeAsset({ depreciation_method: method }),
          '2026-01'
        )
      ).toBe(0);
    }
  );
  test.each(['年数总和法', 'sum_of_years'])(
    '%s uses declining annual weights at month boundaries',
    (method) => {
      const asset = makeAsset({ depreciation_method: method });
      expect(calculateDepreciationSnapshot(asset, '2026-01-01').depreciationAmount).toBe(1666.67);
      expect(calculateDepreciationSnapshot(asset, '2027-01-01').depreciationAmount).toBe(1333.33);
      expect(calculateDepreciationSnapshot(asset, '2030-01-01').depreciationAmount).toBe(333.33);
      expect(calculateDepreciationSnapshot(asset, '2031-01-01').depreciationAmount).toBe(0);
    }
  );

  test.each([60, 18, 6])(
    'the full %s-month schedule preserves cents and residual value',
    (life) => {
      const asset = makeAsset({
        useful_life: life,
        acquisition_cost: 60000.01,
        salvage_value: 3000,
      });
      const yearlyTotals = [];
      for (let month = 0; month < life; month++) {
        const date = new Date(2026, month, 1);
        const snapshot = calculateDepreciationSnapshot(asset, date);
        asset.accumulated_depreciation =
          Math.round((asset.accumulated_depreciation + snapshot.depreciationAmount) * 100) / 100;
        yearlyTotals[Math.floor(month / 12)] =
          (yearlyTotals[Math.floor(month / 12)] || 0) + snapshot.depreciationAmount;
        expect(snapshot.netValueAfter).toBeGreaterThanOrEqual(3000);
      }
      expect(asset.accumulated_depreciation).toBe(57000.01);
      if (life === 60)
        expect(yearlyTotals.map((n) => Math.round(n * 100) / 100)).toEqual([
          19000, 15200.01, 11400, 7600, 3800,
        ]);
    }
  );

  test('honors an explicit start month and does not depreciate before acquisition', () => {
    const asset = makeAsset();
    expect(calculateDepreciationSnapshot(asset, '2025-12-01').depreciationAmount).toBe(0);
    asset.depreciation_start_date = '2026-03-15';
    expect(calculateDepreciationSnapshot(asset, '2026-02-01').depreciationAmount).toBe(0);
    expect(calculateDepreciationSnapshot(asset, '2026-03-01').depreciationAmount).toBe(1666.67);
  });

  test('caps depreciation at remaining book value and never reverses impairment', () => {
    const asset = makeAsset({
      salvage_value: 3000,
      accumulated_depreciation: 55000,
      impairment_amount: 1900,
    });
    expect(calculateDepreciationSnapshot(asset, '2026-01-01')).toMatchObject({
      depreciationAmount: 100,
      netValueAfter: 3000,
    });
    asset.impairment_amount = 2200;
    expect(calculateDepreciationSnapshot(asset, '2026-01-01')).toMatchObject({
      depreciationAmount: 0,
      netValueBefore: 2800,
      netValueAfter: 2800,
    });
  });

  test('an already submitted period is a no-op', () => {
    expect(calculateDepreciationSnapshot(makeAsset(), '2026-01-01', true)).toMatchObject({
      depreciationAmount: 0,
      netValueAfter: 60000,
    });
  });
});

describe('asset finance mutations and shared calculation paths', () => {
  let connection;
  let asset;
  let submitted;

  beforeEach(() => {
    asset = makeAsset();
    submitted = false;
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('FROM fixed_assets fa')) return [submitted ? [] : [{ ...asset }]];
      if (sql.includes('FROM fixed_assets WHERE id')) return [[{ ...asset }]];
      if (sql.includes('count(id)')) return [[{ count: 0 }]];
      if (sql.includes('FROM asset_impairments')) return [[]];
      if (sql.includes('FROM gl_accounts') || sql.includes('FROM gl_periods'))
        return [[{ id: 10 }]];
      if (sql.includes('SELECT id FROM fixed_asset_depreciation_details'))
        return [submitted ? [{ id: 20 }] : []];
      if (sql.includes('INSERT INTO fixed_asset_depreciation_details')) submitted = true;
      if (sql.includes('UPDATE fixed_assets') && sql.includes('last_depreciation_date')) {
        asset.accumulated_depreciation = params[0];
        asset.current_value = params[1];
      }
      return [{ insertId: 20, affectedRows: 1 }];
    });
    connection = {
      query,
      execute: query,
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      release: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    db.pool.query.mockImplementation(async () => [[{ ...asset }]]);
  });

  test('impairment writes change history and a balanced voucher before committing', async () => {
    await expect(
      assetsModel.createImpairment(1, {
        impairment_date: '2026-09-29',
        impairment_amount: 100,
        created_by: 5,
      })
    ).resolves.toBe(20);
    expect(
      connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO asset_change_logs'))
    ).toBe(true);
    expect(financeModel.createEntry).toHaveBeenCalledWith(
      expect.any(Object),
      [
        expect.objectContaining({ debit_amount: 100 }),
        expect.objectContaining({ credit_amount: 100 }),
      ],
      connection
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('splitting an approved asset writes both histories and commits', async () => {
    await expect(assetsModel.splitAsset(1, { split_cost: 20000 }, 5)).resolves.toMatchObject({
      newAssetId: 20,
      newAssetCode: 'FA-1-1',
    });
    expect(
      connection.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO asset_change_logs'))
    ).toHaveLength(2);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('split preserves every ledger component and the original depreciation schedule', async () => {
    Object.assign(asset, {
      acquisition_cost: 100.03, accumulated_depreciation: 20.01, impairment_amount: 10.01,
      salvage_value: 5.01, audited_by: 'reviewer', audited_at: '2026-01-10',
      depreciation_start_date: '2026-02-01', depreciation_end_date: '2031-01-31',
      last_depreciation_date: '2026-09-01',
    });
    await assetsModel.splitAsset(1, { split_cost: 33.34 }, 5);
    const [, created] = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO fixed_assets'));
    const [, remaining] = connection.query.mock.calls.find(([sql]) => sql.includes('UPDATE fixed_assets'));
    const cents = (value) => Math.round(value * 100);
    expect(cents(created[5]) + cents(remaining[0])).toBe(10003);
    expect(cents(created[11]) + cents(remaining[1])).toBe(2001);
    expect(cents(created[12]) + cents(remaining[2])).toBe(1001);
    expect(cents(created[8]) + cents(remaining[5])).toBe(501);
    expect(cents(created[9])).toBe(cents(created[5]) - cents(created[11]) - cents(created[12]));
    expect(cents(remaining[3])).toBe(cents(remaining[0]) - cents(remaining[1]) - cents(remaining[2]));
    expect(created.slice(18)).toEqual([
      'approved', 'reviewer', '2026-01-10', 5, '2026-02-01', '2031-01-31', '2026-09-01',
    ]);
    expect(calculateDepreciationSnapshot(asset, '2026-09-01').depreciationAmount).toBe(0);
    expect(calculateDepreciationSnapshot(asset, '2026-10-01').depreciationAmount).toBeGreaterThan(0);
  });

  test.each(['1oops', Infinity, 0.001, -5])('split rejects malformed or sub-cent amount %s', async (split_cost) => {
    await expect(assetsModel.splitAsset(1, { split_cost }, 5)).rejects.toThrow('拆分金额必须大于0');
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO fixed_assets'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('fully depreciated tiny split cannot allocate more depreciation and impairment than its cost', async () => {
    Object.assign(asset, { acquisition_cost: 0.06, accumulated_depreciation: 0.03, impairment_amount: 0.03 });
    await assetsModel.splitAsset(1, { split_cost: 0.01 }, 5);
    const [, created] = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO fixed_assets'));
    const [, remaining] = connection.query.mock.calls.find(([sql]) => sql.includes('UPDATE fixed_assets'));
    expect(created[9]).toBe(0);
    expect(remaining[3]).toBe(0);
    expect(created[11] + created[12]).toBe(0.01);
  });

  test('preview and posting use the same schedule and repeat submission creates no second voucher', async () => {
    const [preview] = await assetsModel.calculateBatchDepreciation('2026-01');
    const result = await assetsModel.submitDepreciation(
      '2026-01',
      [{ id: 1, depreciationAmount: preview.depreciationAmount }],
      { created_by: 5 }
    );
    expect(result).toMatchObject({ totalAmount: 1666.67, processedAssets: 1 });
    expect(financeModel.createEntry).toHaveBeenCalledWith(
      expect.any(Object),
      [
        expect.objectContaining({ debit_amount: 1666.67 }),
        expect.objectContaining({ credit_amount: 1666.67 }),
      ],
      connection
    );
    await expect(
      assetsModel.submitDepreciation('2026-01', [{ id: 1 }], { created_by: 5 })
    ).rejects.toThrow('没有可计提折旧的资产');
    expect(financeModel.createEntry).toHaveBeenCalledTimes(1);
    expect(
      connection.query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO fixed_asset_depreciation_details')
      )
    ).toHaveLength(1);
  });

  test('a stale straight-line preview is rejected before writing annual-method depreciation', async () => {
    await expect(
      assetsModel.submitDepreciation('2026-01', [{ id: 1, depreciationAmount: 1000 }], {
        created_by: 5,
      })
    ).rejects.toThrow('折旧金额与服务端试算不一致');
    expect(financeModel.createEntry).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('automation posts the preview amount and manual resubmission cannot post it again', async () => {
    const [preview] = await assetsModel.calculateBatchDepreciation('2026-01');
    const result = await DepreciationService.calculateMonthlyDepreciation('2026-01');
    expect(result).toMatchObject({ assetCount: 1, totalDepreciation: preview.depreciationAmount });
    expect(financeModel.createEntry).toHaveBeenCalledWith(
      expect.any(Object),
      [
        expect.objectContaining({ debit_amount: 1666.67 }),
        expect.objectContaining({ credit_amount: 1666.67 }),
      ],
      connection
    );
    await expect(
      assetsModel.submitDepreciation('2026-01', [{ id: 1 }], { created_by: 5 })
    ).rejects.toThrow('没有可计提折旧的资产');
    expect(financeModel.createEntry).toHaveBeenCalledTimes(1);
  });

  test('automation skips a month already posted through the manual endpoint', async () => {
    await assetsModel.submitDepreciation('2026-01', [{ id: 1 }], { created_by: 5 });
    const result = await DepreciationService.calculateMonthlyDepreciation('2026-01');
    expect(result).toMatchObject({ assetCount: 0, totalDepreciation: 0 });
    expect(financeModel.createEntry).toHaveBeenCalledTimes(1);
  });

  test('forecast crosses the anniversary using the same annual schedule', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 11, 15));
    try {
      const forecast = await assetsModel.getDepreciationForecast(2);
      expect(forecast).toEqual([
        { month: '2027-01', amount: 1333.33 },
        { month: '2027-02', amount: 1333.34 },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
