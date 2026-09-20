/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({}));
jest.mock('../../src/services/business/SalesOutboundReversalService', () => ({
  compensateFinance: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../../src/services/business/SalesOrderStatusService', () => ({ updateOrderStatus: jest.fn() }));
jest.mock('../../src/services/InventoryReservationService', () => ({ reserveInventoryForOrder: jest.fn() }));

const ClosureService = require('../../src/services/business/InventoryPostingReversalClosureService');
const SalesOrderStatusService = require('../../src/services/business/SalesOrderStatusService');
const ReservationService = require('../../src/services/InventoryReservationService');

describe('sales outbound reversal closes all related order state atomically', () => {
  let connection;
  const context = { sourceType: 'sales_outbound', sourceId: 9, sourceNo: 'SO-OUT-9' };
  beforeEach(() => {
    jest.clearAllMocks();
    SalesOrderStatusService.updateOrderStatus.mockResolvedValue();
    ReservationService.reserveInventoryForOrder.mockResolvedValue({ fullSuccess: true });
    connection = {
      execute: jest.fn(async (sql) => {
        if (/FROM sales_outbound\s/.test(sql)) {
          return [[{ id: 9, outbound_no: 'SO-OUT-9', order_id: 3, status: 'completed' }]];
        }
        if (/SELECT DISTINCT source_order_id/.test(sql)) return [[]];
        if (/FROM sales_orders/.test(sql)) return [[{ id: 3, order_no: 'SO-3', status: 'approved' }]];
        if (/FROM sales_order_items/.test(sql)) {
          const lines = [{ material_id: 40, quantity: 6 }, { material_id: 40, quantity: 4 }];
          if (/GROUP BY material_id/.test(sql)) return [[{ material_id: 40, ordered_quantity: 10 }]];
          return [lines.map((line) => ({ material_id: line.material_id, ordered_quantity: line.quantity }))];
        }
        if (/AS shipped_qty/.test(sql)) return [[{ shipped_qty: 3 }]];
        return [{ affectedRows: 1 }];
      }),
    };
  });

  test('state synchronization errors abort closure so its caller can roll back', async () => {
    SalesOrderStatusService.updateOrderStatus.mockRejectedValueOnce(new Error('order state unavailable'));
    await expect(ClosureService.closeSalesOutbound(connection, context, { id: 7 })).rejects.toThrow('order state unavailable');
    expect(ReservationService.reserveInventoryForOrder).not.toHaveBeenCalled();
  });

  test('reservation write errors abort closure instead of reporting a successful reversal', async () => {
    ReservationService.reserveInventoryForOrder.mockRejectedValueOnce(new Error('reservation unavailable'));
    await expect(ClosureService.closeSalesOutbound(connection, context, { id: 7 })).rejects.toThrow('reservation unavailable');
  });

  test('repeated material lines deduct shipped quantities once under the line source order', async () => {
    await ClosureService.closeSalesOutbound(connection, context, { id: 7 });
    expect(ReservationService.reserveInventoryForOrder).toHaveBeenCalledWith(
      3, 'SO-3', [{ material_id: 40, quantity: 7, ordered_quantity: 7 }], 7, connection
    );
    const [sql, values] = connection.execute.mock.calls.find(([query]) => /AS shipped_qty/.test(query));
    expect(sql).toContain('COALESCE(sobi.source_order_id, sob.order_id) = ?');
    expect(values).toEqual([40, 3]);
  });
});
