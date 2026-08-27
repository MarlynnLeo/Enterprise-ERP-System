/**
 * Sales order edit policy.
 *
 * An order may be changed while it is still pre-fulfillment and unlocked.
 * Downstream documents and outbound activity are checked by the controller;
 * this module keeps the status rules explicit and reusable.
 */

const EDITABLE_SALES_ORDER_STATUSES = Object.freeze([
  'draft',
  'pending',
  'confirmed',
  'ready_to_ship',
  'shortage',
  'in_production',
  'in_procurement',
]);

const INVENTORY_RECONCILE_SALES_ORDER_STATUSES = Object.freeze([
  'confirmed',
  'ready_to_ship',
  'shortage',
  'in_production',
  'in_procurement',
]);

const canEditSalesOrder = (order) => {
  if (!order || order.is_locked) return false;
  return EDITABLE_SALES_ORDER_STATUSES.includes(order.status);
};

const assertSalesOrderEditable = (order) => {
  if (!order) {
    const error = new Error('销售订单不存在');
    error.statusCode = 404;
    throw error;
  }

  if (order.is_locked) {
    const error = new Error('订单已锁定，无法编辑订单明细。请先解锁订单。');
    error.statusCode = 400;
    throw error;
  }

  if (!EDITABLE_SALES_ORDER_STATUSES.includes(order.status)) {
    const error = new Error(`订单当前状态为"${order.status}"，不允许编辑订单明细。`);
    error.statusCode = 400;
    throw error;
  }
};

module.exports = {
  EDITABLE_SALES_ORDER_STATUSES,
  INVENTORY_RECONCILE_SALES_ORDER_STATUSES,
  canEditSalesOrder,
  assertSalesOrderEditable,
};
