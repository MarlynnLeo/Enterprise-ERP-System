jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/models/finance', () => ({}));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({}));
jest.mock('../../src/services/business/DocumentLinkService', () => ({}));

const db = require('../../src/config/db');
const assetsModel = require('../../src/models/assets');
const assetsController = require('../../src/controllers/business/assets/assetsController');

const createResponse = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });

describe('fixed asset values across list, detail and updates', () => {
  let row;

  beforeEach(() => {
    row = {
      id: 7, asset_code: 'ASSET-7', asset_name: 'Test equipment', asset_type: '电子设备',
      acquisition_date: '2026-09-05', acquisition_cost: '100.00',
      accumulated_depreciation: '20.00', impairment_amount: '5.00',
      depreciation_method: '直线法', useful_life: 60, salvage_value: 0,
      status: '闲置', audit_status: 'draft', notes: '',
    };
    db.pool.query.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*) as count')) return [[{ count: 1 }]];
      if (sql.includes('COUNT(*) as total')) return [[{ total: 1 }]];
      if (sql.includes('FROM departments')) return [[]];
      if (sql.includes('FROM fixed_assets')) return [[{ ...row }]];
      throw new Error(`Unexpected query: ${sql}`);
    });
  });

  it('returns the same book value, idle status and zero residual rate in list and detail', async () => {
    const listRes = createResponse();
    const detailRes = createResponse();
    await assetsController.getAssets({ query: {} }, listRes);
    await assetsController.getAssetById({ params: { id: '7' } }, detailRes);

    const expected = {
      originalValue: 100, netValue: 75, accumulatedDepreciation: 20,
      status: 'idle', salvageRate: 0, usefulLife: 5,
    };
    expect(listRes.json.mock.calls[0][0].data.list[0]).toMatchObject(expected);
    expect(detailRes.json.mock.calls[0][0].data).toMatchObject({ ...expected, impairmentAmount: 5 });
  });

  it('does not report a negative net value when depreciation and impairment exhaust the asset', async () => {
    row.accumulated_depreciation = '95.00';
    row.impairment_amount = '10.00';
    const res = createResponse();
    await assetsController.getAssetById({ params: { id: '7' } }, res);
    expect(res.json.mock.calls[0][0].data.netValue).toBe(0);
  });

  it.each(['0', 0])('allows changing an existing residual rate to %s without changing useful life', async (salvageRate) => {
    row.salvage_value = 5;
    const update = jest.spyOn(assetsModel, 'updateAsset').mockResolvedValue(true);
    const res = createResponse();

    await assetsController.updateAsset({
      params: { id: '7' }, body: { assetName: row.asset_name, salvageRate },
    }, res);

    expect(update).toHaveBeenCalledWith(7, expect.objectContaining({ salvage_value: 0, useful_life: 5 }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toMatchObject({ netValue: 75, status: 'idle', usefulLife: 5 });
  });

  it.each([-1, 101, 'invalid'])('rejects invalid residual rate %s before updating the asset', async (salvageRate) => {
    const update = jest.spyOn(assetsModel, 'updateAsset').mockResolvedValue(true);
    const res = createResponse();
    await assetsController.updateAsset({ params: { id: '7' }, body: { salvageRate } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports disposal gain or loss using the same net book value as the asset detail', async () => {
    row.audit_status = 'approved';
    jest.spyOn(assetsModel, 'disposeAsset').mockResolvedValue({ documentNumber: 'DISPOSE-7' });
    const res = createResponse();
    await assetsController.disposeAsset({
      params: { id: '7' }, user: { id: 1, username: 'reviewer' },
      body: { disposalDate: '2026-09-06', disposalReason: 'Replacement', disposalAmount: 60, bankAccountId: 2 },
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].data).toMatchObject({ netBookValue: 75, disposalGainLoss: -15 });
  });

  it.each([
    ['createAssetCategory', null],
    ['updateAssetCategory', 4],
  ])('%s preserves a configured zero residual rate', async (method, id) => {
    db.pool.execute.mockResolvedValue([{ insertId: 4, affectedRows: 1 }]);
    const category = { name: 'No residual value', code: 'ZERO', default_salvage_rate: 0 };
    if (id === null) await assetsModel[method](category);
    else await assetsModel[method](id, category);
    expect(db.pool.execute.mock.calls[0][1][4]).toBe(0);
  });
});
