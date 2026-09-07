jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const InventoryService = require('../../src/services/InventoryService');

describe('single material inventory cost contract', () => {
  it('returns the persisted cost required by ordinary inbound posting', async () => {
    const connection = { execute: jest.fn().mockResolvedValue([[{
      id: 3, code: 'RM-3', name: 'Raw material', location_id: 2, unit_id: 1, cost_price: '12.50',
    }]]) };
    expect(await InventoryService.getMaterialInfo(3, connection)).toMatchObject({
      costPrice: 12.5, locationId: 2, unitId: 1,
    });
    expect(connection.execute).toHaveBeenCalledWith(expect.stringMatching(/SELECT.*cost_price.*FROM materials/), [3]);
  });

  it('keeps missing cost at zero so posting validation can block it', async () => {
    const connection = { execute: jest.fn().mockResolvedValue([[{
      id: 3, location_id: 2, unit_id: 1, cost_price: null, price: 100,
    }]]) };
    expect((await InventoryService.getMaterialInfo(3, connection)).costPrice).toBe(0);
  });
});
