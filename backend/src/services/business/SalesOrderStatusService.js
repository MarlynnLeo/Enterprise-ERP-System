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
      const [[currentOrder]] = await client.query(
        'SELECT status FROM sales_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [orderId]
      );
      if (!currentOrder) return null;
      if (currentOrder.status === SALES_STATUS_KEYS.CANCELLED) {
        return {
          orderId,
          status: currentOrder.status,
          skipped: true,
          message: '订单已取消，跳过状态更新',
        };
      }

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
        FOR UPDATE
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
          sobi.product_id AS material_id,
          SUM(sobi.quantity) as shipped_quantity
        FROM sales_outbound_items sobi
        INNER JOIN sales_outbound sob ON sobi.outbound_id = sob.id
        WHERE COALESCE(sobi.source_order_id, sob.order_id) = ?
          AND sob.deleted_at IS NULL
          AND sob.status IN (?, ?)
        GROUP BY sobi.product_id
        FOR UPDATE
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
          AND sr.deleted_at IS NULL AND sr.status = 'completed'
        GROUP BY sri.product_id
        FOR UPDATE
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
        const currentStatus = currentOrder.status;
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
        WHERE id = ? AND deleted_at IS NULL AND status <> 'cancelled'
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
        ...new Set(
          outboundItems.map((item) => item.source_order_id || item.order_id).filter(Boolean)
        ),
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
   * 检查所有 in_procurement 和 in_production 状态的销售订单，
   * 如果其物料库存均已满足，则将其状态自动推进为 ready_to_ship。
   * 这个方法应在采购入库、生产入库等导致库存增加的操作后调用。
   *
   * @param {Object} connection - 数据库连接（可选）
   * @param {Object} options - throwOnError 让持久化事件处理器保留失败并重试
   * @returns {Promise<void>}
   */
  static async checkAndReleasePendingOrders(connection = null, { throwOnError = false } = {}) {
    const client = connection || (await getConnection());
    const shouldRelease = !connection;

    try {
      if (shouldRelease) {
        await client.beginTransaction();
      }

      const [pendingOrders] = await client.query(
        'SELECT id, order_no, status, created_by FROM sales_orders WHERE deleted_at IS NULL AND status IN ("in_procurement", "in_production") ORDER BY id FOR UPDATE'
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

        const materialIds = [
          ...new Set(allOrderItems.map((item) => item.material_id).filter(Boolean)),
        ];
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
            reservedByMaterial.set(
              materialId,
              (reservedByMaterial.get(materialId) || 0) + reserved
            );
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
              const reservedForThisOrder =
                reservedByOrderMaterial.get(`${Number(order.id)}:${materialId}`) || 0;
              const availableStock = Math.max(
                0,
                totalStock - (totalReserved - reservedForThisOrder)
              );
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
            if (throwOnError) throw orderError;
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
      if (throwOnError) throw error;
    } finally {
      if (shouldRelease && client) {
        client.release();
      }
    }
  }
}

module.exports = SalesOrderStatusService;
