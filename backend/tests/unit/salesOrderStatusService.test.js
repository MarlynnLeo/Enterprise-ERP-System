jest.mock('../../src/config/db', () => ({ getConnection: jest.fn() }));
jest.mock('../../src/services/InventoryReservationService', () => ({ reserveInventoryForOrder: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));

const SalesOrderStatusService = require('../../src/services/business/SalesOrderStatusService');
const { getConnection } = require('../../src/config/db');

describe('sales fulfillment state protection', () => {
  test('cancelled orders remain cancelled when a related outbound is edited', async () => {
    const connection = { query: jest.fn().mockResolvedValueOnce([[{ status: 'cancelled' }]]) };
    await expect(SalesOrderStatusService.updateOrderStatus(12, connection))
      .resolves.toMatchObject({ status: 'cancelled', skipped: true });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test('missing or soft-deleted orders are not updated', async () => {
    const connection = { query: jest.fn().mockResolvedValueOnce([[]]) };
    await expect(SalesOrderStatusService.updateOrderStatus(12, connection)).resolves.toBeNull();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL FOR UPDATE'), [12]);
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  test('completed returns reopen fulfillment using aggregated material quantities', async () => {
    const connection = {
      query: jest.fn()
        .mockResolvedValueOnce([[{ status: 'shipped' }]])
        .mockResolvedValueOnce([[
          { material_id: 8, ordered_quantity: 6 }, { material_id: 8, ordered_quantity: 4 },
        ]])
        .mockResolvedValueOnce([[{ material_id: 8, shipped_quantity: 10 }]])
        .mockResolvedValueOnce([[{ material_id: 8, returned_quantity: 3 }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };
    await expect(SalesOrderStatusService.updateOrderStatus(12, connection)).resolves.toMatchObject({
      status: 'partial_shipped', totalOrdered: 10, totalShipped: 7, completionPercentage: 70,
    });
    expect(connection.query.mock.calls[4][1]).toEqual(['partial_shipped', 12]);
  });

  test('automatic fulfillment locks only active pending orders before reserving stock', async () => {
    const connection = {
      query: jest.fn().mockResolvedValueOnce([[]]), beginTransaction: jest.fn(),
      commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    };
    getConnection.mockResolvedValue(connection);
    await SalesOrderStatusService.checkAndReleasePendingOrders();
    expect(connection.query).toHaveBeenCalledWith(expect.stringMatching(/deleted_at IS NULL.*ORDER BY id FOR UPDATE/));
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
