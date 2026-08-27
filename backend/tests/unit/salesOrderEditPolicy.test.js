const {
  EDITABLE_SALES_ORDER_STATUSES,
  INVENTORY_RECONCILE_SALES_ORDER_STATUSES,
  canEditSalesOrder,
  assertSalesOrderEditable,
} = require('../../src/utils/sales/salesOrderEditPolicy');

describe('sales order edit policy', () => {
  test('allows unlocked pre-fulfillment statuses', () => {
    EDITABLE_SALES_ORDER_STATUSES.forEach((status) => {
      expect(canEditSalesOrder({ status, is_locked: 0 })).toBe(true);
    });
  });

  test('rejects locked and fulfillment-complete orders', () => {
    expect(canEditSalesOrder({ status: 'ready_to_ship', is_locked: 1 })).toBe(false);
    expect(canEditSalesOrder({ status: 'shipped', is_locked: 0 })).toBe(false);
    expect(() => assertSalesOrderEditable({ status: 'completed', is_locked: 0 })).toThrow(
      '不允许编辑订单明细'
    );
    expect(() => assertSalesOrderEditable({ status: 'pending', is_locked: 1 })).toThrow(
      '订单已锁定'
    );
  });

  test('reconciles only inventory-backed statuses', () => {
    expect(INVENTORY_RECONCILE_SALES_ORDER_STATUSES).toEqual([
      'confirmed',
      'ready_to_ship',
      'shortage',
      'in_production',
      'in_procurement',
    ]);
  });
});
