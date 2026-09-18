'use strict';

const validationError = message => Object.assign(new Error(message), {
  statusCode: 400, code: 'VALIDATION_ERROR',
});

/** 退货和换货共用销售额度；调用方必须在同一事务中校验并保存。 */
class SalesReturnEligibilityService {
  static async assertReturnable(connection, {
    orderId, outboundId = null, items, excludeReturnId = null, excludeExchangeId = null,
  }) {
    if (!Number.isSafeInteger(Number(orderId)) || Number(orderId) <= 0) {
      throw validationError('请选择有效的原销售订单');
    }
    if (!Array.isArray(items) || items.length === 0) throw validationError('退回商品不能为空');

    const [[order]] = await connection.query(
      'SELECT id, order_no, customer_id FROM sales_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [orderId]
    );
    if (!order) throw validationError('原销售订单不存在或已删除');

    const grouped = new Map();
    for (const item of items) {
      const productId = Number(item.product_id ?? item.material_id);
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
        throw validationError('退回商品必须有效，数量必须为正整数');
      }
      grouped.set(productId, (grouped.get(productId) || 0) + quantity);
    }

    const availability = await this.getAvailability(connection, {
      orderId, outboundId, productIds: [...grouped.keys()], excludeReturnId, excludeExchangeId,
      order, lock: true,
    });
    for (const [productId, quantity] of grouped) {
      const remaining = availability.get(productId);
      if (!(remaining.orderedQuantity > 0)) throw validationError(`原销售订单中不存在有效商品 ${productId}`);
      if (quantity > remaining.availableQuantity) {
        throw validationError(`商品 ${productId} 本次退回 ${quantity}，超过已出库可退数量 ${remaining.availableQuantity}（含已有退货、换货申请）`);
      }
    }
    return order;
  }

  /** The page and write validation share the same return/exchange quota. */
  static async getAvailability(connection, {
    orderId, outboundId = null, productIds, excludeReturnId = null, excludeExchangeId = null,
    order = null, lock = false,
  }) {
    const locking = lock ? ' FOR UPDATE' : '';
    if (!order) {
      [[order]] = await connection.query('SELECT id, order_no FROM sales_orders WHERE id=? AND deleted_at IS NULL', [orderId]);
    }
    const availability = new Map();
    if (!order) return availability;
    for (const productId of new Set(productIds.map(Number))) {
      const [[sold]] = await connection.query(
        `SELECT COALESCE(SUM(soi.quantity), 0) AS quantity
           FROM sales_order_items soi JOIN materials m ON m.id = soi.material_id AND m.deleted_at IS NULL
          WHERE soi.order_id = ? AND soi.material_id = ?${locking}`, [orderId, productId]
      );

      const [[shipped]] = await connection.query(
        `SELECT COALESCE(SUM(i.quantity), 0) AS quantity,
                COALESCE(SUM(CASE WHEN o.id = ? THEN i.quantity ELSE 0 END), 0) AS outbound_quantity
           FROM sales_outbound_items i JOIN sales_outbound o ON o.id = i.outbound_id
          WHERE o.deleted_at IS NULL AND o.status = 'completed'
            AND COALESCE(i.source_order_id, o.order_id) = ? AND i.product_id = ?${locking}`,
        [outboundId, orderId, productId]
      );
      const [[returned]] = await connection.query(
        `SELECT COALESCE(SUM(i.quantity), 0) AS quantity,
                COALESCE(SUM(CASE WHEN r.outbound_id = ? THEN i.quantity ELSE 0 END), 0) AS outbound_quantity
           FROM sales_return_items i JOIN sales_returns r ON r.id = i.return_id
          WHERE r.deleted_at IS NULL AND r.status NOT IN ('rejected', 'cancelled')
            AND r.order_id = ? AND i.product_id = ? AND (? IS NULL OR r.id <> ?)${locking}`,
        [outboundId, orderId, productId, excludeReturnId, excludeReturnId]
      );
      const [[exchanged]] = await connection.query(
        `SELECT COALESCE(SUM(i.quantity), 0) AS quantity,
                COALESCE(SUM(CASE WHEN e.outbound_id = ? THEN i.quantity ELSE 0 END), 0) AS outbound_quantity
           FROM sales_exchange_items i JOIN sales_exchanges e ON e.id = i.exchange_id
           JOIN materials m ON CONVERT(i.product_code USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(m.code USING utf8mb4) COLLATE utf8mb4_unicode_ci
          WHERE e.deleted_at IS NULL AND e.status NOT IN ('rejected', 'cancelled', '已拒绝', '已取消')
            AND i.item_type = 'return' AND (e.order_id = ? OR (e.order_id IS NULL AND e.order_no = ?))
            AND m.id = ? AND (? IS NULL OR e.id <> ?)${locking}`,
        [outboundId, orderId, order.order_no, productId, excludeExchangeId, excludeExchangeId]
      );
      const orderRemaining = Math.min(Number(sold.quantity), Number(shipped.quantity)) - Number(returned.quantity) - Number(exchanged.quantity);
      const outboundReturned = Number(returned.outbound_quantity) + Number(exchanged.outbound_quantity);
      const outboundRemaining = Number(shipped.outbound_quantity) - outboundReturned;
      availability.set(productId, {
        orderedQuantity: Number(sold.quantity), shippedQuantity: Number(shipped.quantity),
        returnedQuantity: Number(returned.quantity), exchangedQuantity: Number(exchanged.quantity),
        outboundReturnedQuantity: outboundReturned,
        availableQuantity: Math.max(0, outboundId ? Math.min(orderRemaining, outboundRemaining) : orderRemaining),
      });
    }
    return availability;
  }
}

module.exports = SalesReturnEligibilityService;
module.exports.validationError = validationError;
