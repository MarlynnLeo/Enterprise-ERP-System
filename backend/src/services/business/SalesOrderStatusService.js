/**
 * 销售订单状态服务
 * @description 根据发货情况智能更新销售订单状态
 * @author ERP系统开发团队
 * @date 2025-09-26
 */

const { logger } = require('../../utils/logger');
const { getConnection } = require('../../config/db');
const { SALES_STATUS_KEYS } = require('../../constants/systemConstants');
const InventoryReservationService = require('../InventoryReservationService');

class SalesOrderStatusService {
  /**
   * 根据发货情况更新订单状态
   * @param {number} orderId - 订单ID
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Object>} - 更新结果
   */
  static async updateOrderStatus(orderId, connection = null) {
    const client = connection || (await getConnection());
    const shouldRelease = !connection;

    try {
      const [orderItems] = await client.query(
        `
        SELECT
          soi.id as order_item_id,
          soi.material_id,
          soi.quantity as ordered_quantity,
          m.code as material_code,
          m.name as material_name
        FROM sales_order_items soi
        INNER JOIN materials m ON soi.material_id = m.id
        WHERE soi.order_id = ?
      `,
        [orderId]
      );

      if (orderItems.length === 0) {
        return {
          orderId,
          status: SALES_STATUS_KEYS.DRAFT,
          message: '订单没有产品明细',
        };
      }

      const [shippedItems] = await client.query(
        `
        SELECT
          soi.material_id,
          SUM(sobi.quantity) as shipped_quantity
        FROM sales_order_items soi
        INNER JOIN sales_outbound_items sobi ON soi.material_id = sobi.product_id
        INNER JOIN sales_outbound sob ON sobi.outbound_id = sob.id
        WHERE soi.order_id = ?
          AND sob.status IN (?, ?)
          AND (
            -- 单订单出库：直接匹配 order_id
            (COALESCE(sob.is_multi_order, 0) = 0 AND sob.order_id = soi.order_id)
            OR
            -- 多订单出库：优先按明细来源订单匹配，避免同物料被所有关联订单重复计数
            (sob.is_multi_order = 1 AND sobi.source_order_id = soi.order_id)
            OR
            -- 兼容旧数据：没有 source_order_id 时再回退到 related_orders
            (sob.is_multi_order = 1 AND sobi.source_order_id IS NULL AND sob.related_orders IS NOT NULL
             AND (
               JSON_CONTAINS(sob.related_orders, CAST(soi.order_id AS JSON))
               OR sob.related_orders LIKE CONCAT('%', soi.order_id, '%')
             ))
          )
        GROUP BY soi.material_id
      `,
        [orderId, SALES_STATUS_KEYS.COMPLETED, SALES_STATUS_KEYS.PROCESSING]
      );

      const [returnedItems] = await client.query(
        `
        SELECT
          sri.product_id as material_id,
          SUM(sri.quantity) as returned_quantity
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sri.return_id = sr.id
        WHERE sr.order_id = ?
          AND sr.status NOT IN ('rejected', 'cancelled', 'draft')
        GROUP BY sri.product_id
      `,
        [orderId]
      );

      const shippedMap = {};
      shippedItems.forEach((item) => {
        shippedMap[item.material_id] = parseFloat(item.shipped_quantity) || 0;
      });

      // 从发货量中扣减退货量
      const returnedMap = {};
      returnedItems.forEach((item) => {
        returnedMap[item.material_id] = parseFloat(item.returned_quantity) || 0;
      });

      Object.keys(shippedMap).forEach((materialId) => {
        const returnedQty = returnedMap[materialId] || 0;
        if (returnedQty > 0) {
          shippedMap[materialId] = Math.max(0, shippedMap[materialId] - returnedQty);
          logger.info(
            `Sales order net shipped quantity calculated: orderId=${orderId}, materialId=${materialId}, grossShipped=${shippedMap[materialId] + returnedQty}, returned=${returnedQty}, netShipped=${shippedMap[materialId]}`
          );
        }
      });

      // 4. 计算发货统计
      // 出库明细仅按物料(product_id)记录、不区分订单明细行，故订购量也按物料汇总后比对，
      // 避免同一物料存在多条订单明细行时发货量被每行重复计数导致的状态误判(H12)
      const orderedMap = {};
      orderItems.forEach((item) => {
        const mid = item.material_id;
        orderedMap[mid] = (orderedMap[mid] || 0) + (parseFloat(item.ordered_quantity) || 0);
      });
      const orderedMaterialIds = Object.keys(orderedMap);

      let totalOrdered = 0;
      let totalShipped = 0;
      let fullyShippedItems = 0;
      let partiallyShippedItems = 0;
      let unshippedItems = 0;

      orderedMaterialIds.forEach((mid) => {
        const orderedQty = orderedMap[mid];
        const shippedQty = shippedMap[mid] || 0;

        totalOrdered += orderedQty;
        totalShipped += shippedQty;

        if (shippedQty === 0) {
          unshippedItems++;
        } else if (shippedQty >= orderedQty) {
          fullyShippedItems++;
        } else {
          partiallyShippedItems++;
        }
      });

      let newStatus;
      let statusMessage;

      if (totalShipped === 0) {
        // 完全未发货 - 保持原状态或设为 ready_to_ship
        const [currentOrder] = await client.query('SELECT status FROM sales_orders WHERE id = ? FOR UPDATE', [
          orderId,
        ]);

        if (currentOrder && currentOrder.length > 0) {
          const currentStatus = currentOrder[0].status;
          if (
            [
              SALES_STATUS_KEYS.DRAFT,
              SALES_STATUS_KEYS.PENDING,
              SALES_STATUS_KEYS.CONFIRMED,
              SALES_STATUS_KEYS.IN_PRODUCTION,
              SALES_STATUS_KEYS.IN_PROCUREMENT,
              SALES_STATUS_KEYS.READY_TO_SHIP,
            ].includes(currentStatus)
          ) {
            newStatus = currentStatus;
            statusMessage = '未发货，保持原状态';
          } else {
            newStatus = SALES_STATUS_KEYS.READY_TO_SHIP;
            statusMessage = '未发货，设为待发货';
          }
        } else {
          newStatus = SALES_STATUS_KEYS.READY_TO_SHIP;
          statusMessage = '未发货，设为待发货';
        }
      } else if (fullyShippedItems === orderedMaterialIds.length) {
        // 全部产品完全发货
        newStatus = SALES_STATUS_KEYS.SHIPPED;
        statusMessage = `全部产品已发货 (${fullyShippedItems}/${orderedMaterialIds.length})`;
      } else {
        // 部分发货
        newStatus = SALES_STATUS_KEYS.PARTIAL_SHIPPED;
        statusMessage = `部分发货 (完全发货: ${fullyShippedItems}, 部分发货: ${partiallyShippedItems}, 未发货: ${unshippedItems})`;
      }

      const completionPercentage =
        totalOrdered > 0 ? Math.round((totalShipped / totalOrdered) * 100 * 100) / 100 : 0;

      await client.query(
        `
        UPDATE sales_orders
        SET
          status = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
        [newStatus, orderId]
      );

      logger.info(`订单 ${orderId} 状态更新: ${newStatus} (${statusMessage})`);

      return {
        orderId,
        status: newStatus,
        completionPercentage,
        totalOrdered,
        totalShipped,
        itemCount: orderItems.length,
        fullyShippedItems,
        partiallyShippedItems,
        unshippedItems,
        message: statusMessage,
      };
    } catch (error) {
      logger.error('更新销售订单状态失败', error);
      throw error;
    } finally {
      if (shouldRelease && client) {
        client.release();
      }
    }
  }

  /**
   * 批量更新多个订单状态
   * @param {Array<number>} orderIds - 订单ID数组
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Array>} - 更新结果数组
   */
  static async updateMultipleOrderStatus(orderIds, connection = null) {
    const results = [];

    for (const orderId of orderIds) {
      try {
        const result = await this.updateOrderStatus(orderId, connection);
        results.push(result);
      } catch (error) {
        logger.error(`更新订单 ${orderId} 状态失败`, error);
        results.push({
          orderId,
          error: error.message,
        });
      }
    }

    const failures = results.filter((result) => result && result.error);
    if (failures.length > 0) {
      throw new Error(
        `销售订单状态更新失败 ${failures.map((failure) => `${failure.orderId}:${failure.error}`).join(', ')}`
      );
    }

    return results;
  }

  /**
   * 根据出库的物料更新所有相关订单状态
   * @param {Array} outboundItems - 出库物料列表 [{product_id, quantity}]
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Array>} - 更新结果数组
   */
  static async updateOrderStatusByMaterials(outboundItems, connection = null) {
    const client = connection || (await getConnection());
    const shouldRelease = !connection;

    try {
      if (!outboundItems || outboundItems.length === 0) {
        return [];
      }

      const explicitOrderIds = [
        ...new Set(outboundItems
          .map((item) => item.source_order_id || item.order_id)
          .filter(Boolean)),
      ];

      let affectedOrders;
      if (explicitOrderIds.length > 0) {
        affectedOrders = explicitOrderIds.map((orderId) => ({ order_id: orderId }));
      } else {
        // 兼容旧调用：没有来源订单时才按物料回退查找
        const materialIds = outboundItems.map((item) => item.product_id).filter(Boolean);
        if (materialIds.length === 0) {
          return [];
        }
        const placeholders = materialIds.map(() => '?').join(',');

        [affectedOrders] = await client.query(
          `
          SELECT DISTINCT soi.order_id
          FROM sales_order_items soi
          WHERE soi.material_id IN (${placeholders})
        `,
          materialIds
        );
      }

      logger.info(
        `Updating sales order statuses for outbound materials: affectedOrders=${affectedOrders.length}`
      );

      const results = [];
      for (const orderRow of affectedOrders) {
        try {
          const result = await this.updateOrderStatus(orderRow.order_id, client);
          results.push(result);
        } catch (error) {
          logger.error(`更新订单 ${orderRow.order_id} 状态失败`, error);
          results.push({
            orderId: orderRow.order_id,
            error: error.message,
          });
        }
      }

      const failures = results.filter((result) => result && result.error);
      if (failures.length > 0) {
        throw new Error(
          `销售订单状态更新失败 ${failures.map((failure) => `${failure.orderId}:${failure.error}`).join(', ')}`
        );
      }

      return results;
    } catch (error) {
      logger.error('根据物料更新订单状态失败', error);
      throw error;
    } finally {
      if (shouldRelease && client) {
        client.release();
      }
    }
  }

  /**
   * 获取订单发货状态统计
   * @param {number} orderId - 订单ID
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Object>} - 发货统计信息
   */
  static async getOrderShippingStats(orderId, connection = null) {
    const client = connection || (await getConnection());
    const shouldRelease = !connection;

    try {
      // 1. 获取毛发货量统计
      const [stats] = await client.query(
        `
        SELECT
          so.id as order_id,
          so.order_no,
          so.status as order_status,
          COUNT(soi.id) as total_items,
          SUM(soi.quantity) as total_ordered,
          COALESCE(SUM(shipped_summary.shipped_quantity), 0) as total_gross_shipped,
          COALESCE(SUM(returned_summary.returned_quantity), 0) as total_returned
        FROM sales_orders so
        INNER JOIN sales_order_items soi ON so.id = soi.order_id
        LEFT JOIN (
          SELECT
            soi_inner.order_id,
            soi_inner.material_id,
            SUM(sobi.quantity) as shipped_quantity
          FROM sales_order_items soi_inner
          INNER JOIN sales_outbound_items sobi ON soi_inner.material_id = sobi.product_id
          INNER JOIN sales_outbound sob ON sobi.outbound_id = sob.id
          WHERE sob.status IN (?, ?)
            AND (
              -- 单订单出库：直接匹配 order_id
              (COALESCE(sob.is_multi_order, 0) = 0 AND sob.order_id = soi_inner.order_id)
              OR
              -- 多订单出库：优先按明细来源订单匹配
              (sob.is_multi_order = 1 AND sobi.source_order_id = soi_inner.order_id)
              OR
              -- 兼容旧数据：没有 source_order_id 时再回退到 related_orders
              (sob.is_multi_order = 1 AND sobi.source_order_id IS NULL AND sob.related_orders IS NOT NULL
               AND (
                 JSON_CONTAINS(sob.related_orders, CAST(soi_inner.order_id AS JSON))
                 OR sob.related_orders LIKE CONCAT('%', soi_inner.order_id, '%')
               ))
            )
          GROUP BY soi_inner.order_id, soi_inner.material_id
        ) shipped_summary ON soi.order_id = shipped_summary.order_id
          AND soi.material_id = shipped_summary.material_id
        LEFT JOIN (
          SELECT
            sr.order_id,
            sri.product_id as material_id,
            SUM(sri.quantity) as returned_quantity
          FROM sales_return_items sri
          INNER JOIN sales_returns sr ON sri.return_id = sr.id
          WHERE sr.status NOT IN ('rejected', 'cancelled', 'draft')
          GROUP BY sr.order_id, sri.product_id
        ) returned_summary ON soi.order_id = returned_summary.order_id
          AND soi.material_id = returned_summary.material_id
        WHERE so.id = ?
        GROUP BY so.id, so.order_no, so.status
      `,
        [SALES_STATUS_KEYS.COMPLETED, SALES_STATUS_KEYS.PROCESSING, orderId]
      );

      if (stats.length === 0) {
        return null;
      }

      const stat = stats[0];

      // 2. 计算净发货量 = 毛发货量 - 退货量（与 updateOrderStatus 保持一致）
      const totalGrossShipped = parseFloat(stat.total_gross_shipped) || 0;
      const totalReturned = parseFloat(stat.total_returned) || 0;
      const totalShipped = Math.max(0, totalGrossShipped - totalReturned);

      // 3. 重新计算各明细项的发货状态（基于净发货量）
      const [detailStats] = await client.query(
        `
        SELECT
          soi.material_id,
          soi.quantity as ordered_qty,
          COALESCE(shipped_sub.shipped_qty, 0) as gross_shipped,
          COALESCE(returned_sub.returned_qty, 0) as returned_qty
        FROM sales_order_items soi
        LEFT JOIN (
          SELECT sobi.product_id, SUM(sobi.quantity) as shipped_qty
          FROM sales_outbound_items sobi
          INNER JOIN sales_outbound sob ON sobi.outbound_id = sob.id
          WHERE sob.status IN (?, ?)
            AND (
              (COALESCE(sob.is_multi_order, 0) = 0 AND sob.order_id = ?)
              OR (sob.is_multi_order = 1 AND sobi.source_order_id = ?)
              OR (sob.is_multi_order = 1 AND sobi.source_order_id IS NULL AND sob.related_orders LIKE CONCAT('%', ?, '%'))
            )
          GROUP BY sobi.product_id
        ) shipped_sub ON soi.material_id = shipped_sub.product_id
        LEFT JOIN (
          SELECT sri.product_id, SUM(sri.quantity) as returned_qty
          FROM sales_return_items sri
          INNER JOIN sales_returns sr ON sri.return_id = sr.id
          WHERE sr.order_id = ? AND sr.status NOT IN ('rejected', 'cancelled', 'draft')
          GROUP BY sri.product_id
        ) returned_sub ON soi.material_id = returned_sub.product_id
        WHERE soi.order_id = ?
      `,
        [SALES_STATUS_KEYS.COMPLETED, SALES_STATUS_KEYS.PROCESSING, orderId, orderId, orderId, orderId, orderId]
      );

      // 出库/退货均按物料(product_id)汇总，而订单明细可能存在同物料多行，
      // 需先按物料归并(订购量累加，已发/已退取该物料汇总值)再判定状态，
      // 避免同物料多行时发货量被每行重复计数导致的统计失真(H12)
      const byMaterial = new Map();
      detailStats.forEach((item) => {
        const mid = Number(item.material_id);
        if (!byMaterial.has(mid)) {
          byMaterial.set(mid, {
            ordered: 0,
            grossShipped: parseFloat(item.gross_shipped) || 0,
            returnedQty: parseFloat(item.returned_qty) || 0,
          });
        }
        byMaterial.get(mid).ordered += parseFloat(item.ordered_qty) || 0;
      });

      let unshippedItems = 0;
      let partialItems = 0;
      let fullyShippedItems = 0;

      byMaterial.forEach((agg) => {
        const netShipped = Math.max(0, agg.grossShipped - agg.returnedQty);
        const orderedQty = agg.ordered;

        if (netShipped === 0) {
          unshippedItems++;
        } else if (netShipped >= orderedQty) {
          fullyShippedItems++;
        } else {
          partialItems++;
        }
      });

      const totalOrdered = parseFloat(stat.total_ordered) || 0;
      const completionPercentage =
        totalOrdered > 0
          ? Math.round((totalShipped / totalOrdered) * 100 * 100) / 100
          : 0;

      return {
        order_id: stat.order_id,
        order_no: stat.order_no,
        order_status: stat.order_status,
        // total_items 按物料归并口径，使其与下方 unshipped/partial/fully 三项之和保持一致
        total_items: byMaterial.size,
        total_ordered: totalOrdered,
        total_shipped: totalShipped,
        total_returned: totalReturned,
        unshipped_items: unshippedItems,
        partial_items: partialItems,
        fully_shipped_items: fullyShippedItems,
        completion_percentage: completionPercentage,
      };
    } catch (error) {
      logger.error('获取订单发货统计失败:', error);
      throw error;
    } finally {
      if (shouldRelease && client) {
        client.release();
      }
    }
  }

  /**
   * 检查所有 in_procurement 和 in_production 状态的销售订单，
   * 如果其物料库存均已满足，则将其状态自动推进为 ready_to_ship。
   * 这个方法应在采购入库、生产入库等导致库存增加的操作后调用。
   *
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<void>}
   */
  static async checkAndReleasePendingOrders(connection = null) {
    const client = connection || (await getConnection());
    const shouldRelease = !connection;

    try {
      if (shouldRelease) {
        await client.beginTransaction();
      }

      const [pendingOrders] = await client.query(
        'SELECT id, order_no, status, created_by FROM sales_orders WHERE status IN ("in_procurement", "in_production")'
      );

      if (pendingOrders && pendingOrders.length > 0) {
        const orderIds = pendingOrders.map((order) => order.id);
        const orderPlaceholders = orderIds.map(() => '?').join(',');
        const [allOrderItems] = await client.query(
          `
          SELECT order_id, material_id, SUM(quantity) as quantity
          FROM sales_order_items
          WHERE order_id IN (${orderPlaceholders})
          GROUP BY order_id, material_id
          `,
          orderIds
        );

        const materialIds = [...new Set(allOrderItems.map((item) => item.material_id).filter(Boolean))];
        const stockByMaterial = new Map();
        const reservedByMaterial = new Map();
        const reservedByOrderMaterial = new Map();

        if (materialIds.length > 0) {
          const materialPlaceholders = materialIds.map(() => '?').join(',');
          const [stockRows] = await client.query(
            `
            SELECT material_id, COALESCE(SUM(quantity), 0) as current_stock
            FROM inventory_ledger
            WHERE material_id IN (${materialPlaceholders})
            GROUP BY material_id
            `,
            materialIds
          );
          stockRows.forEach((row) => {
            stockByMaterial.set(Number(row.material_id), parseFloat(row.current_stock || 0));
          });

          const [reservationRows] = await client.query(
            `
            SELECT material_id, order_id, COALESCE(SUM(reserved_quantity), 0) as reserved_quantity
            FROM inventory_reservations
            WHERE material_id IN (${materialPlaceholders}) AND status = 'active'
            GROUP BY material_id, order_id
            `,
            materialIds
          );
          reservationRows.forEach((row) => {
            const materialId = Number(row.material_id);
            const orderId = Number(row.order_id);
            const reserved = parseFloat(row.reserved_quantity || 0);
            reservedByMaterial.set(materialId, (reservedByMaterial.get(materialId) || 0) + reserved);
            reservedByOrderMaterial.set(`${orderId}:${materialId}`, reserved);
          });
        }

        const itemsByOrder = new Map();
        allOrderItems.forEach((item) => {
          const orderId = Number(item.order_id);
          if (!itemsByOrder.has(orderId)) itemsByOrder.set(orderId, []);
          itemsByOrder.get(orderId).push({
            material_id: Number(item.material_id),
            quantity: parseFloat(item.quantity || 0),
          });
        });

        for (const order of pendingOrders) {
          try {
            const orderItems = itemsByOrder.get(Number(order.id)) || [];
            if (orderItems.length === 0) continue;

            const allItemsInStock = orderItems.every((item) => {
              const materialId = Number(item.material_id);
              const totalStock = stockByMaterial.get(materialId) || 0;
              const totalReserved = reservedByMaterial.get(materialId) || 0;
              const reservedForThisOrder = reservedByOrderMaterial.get(`${Number(order.id)}:${materialId}`) || 0;
              const availableStock = Math.max(0, totalStock - (totalReserved - reservedForThisOrder));
              return availableStock >= (parseFloat(item.quantity) || 0);
            });

            if (!allItemsInStock) continue;

            const reservationResult = await InventoryReservationService.reserveInventoryForOrder(
              order.id,
              order.order_no,
              orderItems,
              order.created_by,
              client
            );

            if (reservationResult.fullSuccess) {
              await client.query(
                `
                UPDATE sales_orders
                SET status = "ready_to_ship",
                    is_locked = TRUE,
                    locked_at = COALESCE(locked_at, NOW()),
                    locked_by = COALESCE(locked_by, ?),
                    lock_reason = COALESCE(lock_reason, ?),
                    updated_at = NOW()
                WHERE id = ?
                `,
                [order.created_by || null, 'Auto reserved by fulfillment flow', order.id]
              );
              logger.info(`销售订单${order.id} 库存已预留，自动流转为 ready_to_ship`);
            } else {
              logger.info(`销售订单${order.id} 库存未完整预留，暂不流转 ready_to_ship`, {
                insufficientItems: reservationResult.insufficientItems,
              });
            }
          } catch (orderError) {
            logger.error(`检查销售订单 ${order.id} 时出错`, orderError);
          }
        }
      }

      if (shouldRelease) {
        await client.commit();
      }
    } catch (error) {
      if (shouldRelease) {
        await client.rollback();
      }
      logger.error('检查并流转采购/生产销售订单时发生错误:', error);
    } finally {
      if (shouldRelease && client) {
        client.release();
      }
    }
  }
}

module.exports = SalesOrderStatusService;
