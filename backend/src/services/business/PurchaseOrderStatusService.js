/**
 * 采购订单状态管理服务
 * 处理采购订单的状态自动更新和完成度计算
 * @author 系统
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

const QUANTITY_EPSILON = 0.0001;
const TERMINAL_INSPECTION_STATUSES = ['passed', 'failed', 'partial', 'completed'];

class PurchaseOrderStatusService {
  /**
   * 更新采购订单项目的已收货数量
   * ✅ 重构后只更新received_quantity,不更新warehoused_quantity
   * @param {number} orderId - 采购订单ID
   * @param {number} materialId - 物料ID
   * @param {number} receivedQuantity - 收货数量
   * @param {Object} connection - 数据库连接（可选）
   */
  static async updateOrderItemReceivedQuantity(
    orderId,
    materialId,
    receivedQuantity,
    connection = null
  ) {
    const client = connection || db.pool;

    try {
      logger.info(
        `[PurchaseOrderStatusService] 更新收货数量：订单ID=${orderId}, 物料ID=${materialId}, 收货数量=${receivedQuantity}`
      );

      // ✅ 安全修复: 使用 FOR UPDATE 行级锁防止并发收货时校验被绕过
      // 场景: 两个收货请求同时读取 received_quantity 后计算是否超量，
      //        无锁情况下两个请求各自读到相同旧值，均通过校验导致超量收货
      const [orderItem] = await client.execute(
        'SELECT quantity, received_quantity FROM purchase_order_items WHERE order_id = ? AND material_id = ? FOR UPDATE',
        [orderId, materialId]
      );

      if (orderItem.length === 0) {
        throw new Error(`采购订单项目不存在: 订单ID=${orderId}, 物料ID=${materialId}`);
      }

      const orderQuantity = parseFloat(orderItem[0].quantity) || 0;
      const currentReceived = parseFloat(orderItem[0].received_quantity) || 0;
      const newReceivedQty = parseFloat(receivedQuantity) || 0;
      const totalReceived = currentReceived + newReceivedQty;

      // ✅ 检查是否超过订单数量
      if (totalReceived > orderQuantity) {
        const errorMsg = `收货数量超过订单数量: 订单数量=${orderQuantity}, 已收货=${currentReceived}, 本次收货=${newReceivedQty}, 总计=${totalReceived}`;
        logger.error(`[PurchaseOrderStatusService] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      logger.info(
        `[PurchaseOrderStatusService] 收货数量校验通过: 订单数量=${orderQuantity}, 已收货=${currentReceived}, 本次收货=${newReceivedQty}, 总计=${totalReceived}`
      );

      // ✅ 只更新received_quantity,不更新warehoused_quantity
      // warehoused_quantity应该在入库完成时通过updateOrderItemWarehousingQuantity更新
      const updateQuery = `
        UPDATE purchase_order_items
        SET
          received_quantity = received_quantity + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND material_id = ?
      `;

      const params = [newReceivedQty, orderId, materialId];

      const [updateResult] = await client.execute(updateQuery, params);
      if (!updateResult || updateResult.affectedRows === 0) {
        throw new Error(`采购订单项目不存在: 订单ID=${orderId}, 物料ID=${materialId}`);
      }

      logger.info('[PurchaseOrderStatusService] 收货数量更新完成');

      // 更新订单整体状态
      await this.updateOrderStatus(orderId, client);
    } catch (error) {
      logger.error('更新采购订单项目收货数量失败:', error);
      throw error;
    }
  }


  /**
   * 从所有已确认/完成的收货单全量同步收货数量（幂等）
   * 替代累加模式，无论调用多少次结果都一致
   * @param {number} orderId - 采购订单ID
   * @param {number} materialId - 物料ID
   * @param {Object} connection - 数据库连接（可选）
   */
  static async syncOrderItemReceivedFromReceipts(orderId, materialId, connection = null) {
    const client = connection || db.pool;

    try {
      logger.info(
        `[PurchaseOrderStatusService] Syncing received quantity from receipts: orderId=${orderId}, materialId=${materialId}`
      );

      // 从所有非草稿、非取消的收货单汇总该物料的实际收货量
      const [result] = await client.execute(
        `SELECT GREATEST(
           COALESCE((
             SELECT SUM(COALESCE(NULLIF(ri.received_quantity, 0), ri.quantity, ri.qualified_quantity, 0))
             FROM purchase_receipt_items ri
             JOIN purchase_receipts r ON ri.receipt_id = r.id
             WHERE r.order_id = ?
               AND ri.material_id = ?
               AND r.status IN ('confirmed', 'completed')
               AND r.deleted_at IS NULL
           ), 0),
           COALESCE((
             SELECT SUM(COALESCE(NULLIF(qi.quantity, 0), qi.qualified_quantity, 0))
             FROM quality_inspections qi
             WHERE qi.reference_id = ?
               AND qi.material_id = ?
               AND qi.inspection_type = 'incoming'
               AND qi.deleted_at IS NULL
               AND qi.status NOT IN ('cancelled', 'rejected')
           ), 0)
         ) AS total_received`,
        [orderId, materialId, orderId, materialId]
      );

      const totalReceived = parseFloat(result[0]?.total_received) || 0;

      // 校验不超过订单数量
      const [orderItem] = await client.execute(
        'SELECT quantity FROM purchase_order_items WHERE order_id = ? AND material_id = ? FOR UPDATE',
        [orderId, materialId]
      );

      if (orderItem.length === 0) {
        logger.warn(`[PurchaseOrderStatusService] 采购订单项目不存在: 订单ID=${orderId}, 物料ID=${materialId}`);
        return;
      }

      const orderQuantity = parseFloat(orderItem[0].quantity) || 0;
      if (totalReceived > orderQuantity + QUANTITY_EPSILON) {
        const error = new Error(
          `收货单汇总量超过采购订单数量: 订单ID=${orderId}, 物料ID=${materialId}, 订单数量=${orderQuantity}, 收货汇总=${totalReceived}`
        );
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 直接SET，非累加，保证幂等
      await client.execute(
        `UPDATE purchase_order_items
         SET received_quantity = ?,
             updated_at = CURRENT_TIMESTAMP
          WHERE order_id = ? AND material_id = ?`,
        [totalReceived, orderId, materialId]
      );

      logger.info(
        `[PurchaseOrderStatusService] Received quantity synchronized: orderId=${orderId}, materialId=${materialId}, totalReceived=${totalReceived}`
      );

      // 更新订单整体状态
      await this.updateOrderStatus(orderId, client);
    } catch (error) {
      logger.error('Received quantity synchronization failed:', error);
      throw error;
    }
  }

  static async getOrderQuantityStats(orderId, connection = null) {
    const client = connection || db.pool;
    const itemsQuery = `
        SELECT
          SUM(quantity) as total_quantity,
          SUM(received_quantity) as total_received,
          SUM(inspected_quantity) as total_inspected,
          SUM(qualified_quantity) as total_qualified,
          SUM(unqualified_quantity) as total_unqualified,
          SUM(warehoused_quantity) as total_warehoused,
          COUNT(*) as item_count,
          SUM(CASE WHEN warehoused_quantity >= quantity THEN 1 ELSE 0 END) as completed_items
        FROM purchase_order_items
        WHERE order_id = ?
      `;

    const [itemsResult] = await client.execute(itemsQuery, [orderId]);
    const stats = itemsResult && itemsResult[0];
    const itemCount = parseInt(stats?.item_count, 10) || 0;

    if (!stats || itemCount === 0) {
      logger.warn(`[PurchaseOrderStatusService] 订单${orderId}没有项目数据`);
      return null;
    }

    const totalQuantity = parseFloat(stats.total_quantity) || 0;
    const totalReceived = parseFloat(stats.total_received) || 0;
    const totalInspected = parseFloat(stats.total_inspected) || 0;
    const totalQualified = parseFloat(stats.total_qualified) || 0;
    const totalUnqualified = parseFloat(stats.total_unqualified) || 0;
    const totalWarehoused = parseFloat(stats.total_warehoused) || 0;
    const completedItems = parseInt(stats.completed_items, 10) || 0;
    const completionPercentage = totalQuantity > 0 ? (totalWarehoused / totalQuantity) * 100 : 0;
    const canComplete =
      totalQuantity > 0 && totalWarehoused + QUANTITY_EPSILON >= totalQuantity;

    return {
      orderId,
      totalQuantity,
      totalReceived,
      totalInspected,
      totalQualified,
      totalUnqualified,
      totalWarehoused,
      itemCount,
      completedItems,
      completionPercentage,
      canComplete,
    };
  }

  static deriveStatusFromQuantityStats(currentStatus, stats) {
    if (currentStatus === 'cancelled' || !stats) {
      return currentStatus;
    }

    if (stats.canComplete) {
      return 'completed';
    }

    if (stats.totalWarehoused > 0) {
      return 'warehousing';
    }

    if (stats.totalInspected > 0) {
      return stats.totalInspected + QUANTITY_EPSILON >= stats.totalReceived
        ? 'inspected'
        : 'inspecting';
    }

    if (stats.totalReceived > 0) {
      return stats.totalReceived + QUANTITY_EPSILON >= stats.totalQuantity
        ? 'received'
        : 'partial_received';
    }

    if (currentStatus === 'completed') {
      return 'approved';
    }

    return currentStatus;
  }

  static async assertOrderCanComplete(orderId, connection = null) {
    const stats = await this.getOrderQuantityStats(orderId, connection);

    if (!stats || !stats.canComplete) {
      const totalQuantity = stats ? stats.totalQuantity : 0;
      const totalWarehoused = stats ? stats.totalWarehoused : 0;
      const error = new Error(
        `采购订单尚未全部入库，不能设置为已完成: 订单数量=${totalQuantity}, 已入库=${totalWarehoused}`
      );
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    return stats;
  }

  /**
   * 计算并更新采购订单的完成状态
   * @param {number} orderId - 采购订单ID
   * @param {Object} connection - 数据库连接（可选）
   */
  static async updateOrderStatus(orderId, connection = null) {
    const client = connection || db.pool;

    try {
      const stats = await this.getOrderQuantityStats(orderId, client);
      if (!stats) {
        return null;
      }

      const {
        totalQuantity,
        totalReceived,
        totalInspected,
        totalQualified,
        totalUnqualified,
        totalWarehoused,
        itemCount,
        completedItems,
        completionPercentage,
      } = stats;

      // 获取当前订单状态
      const [currentOrder] = await client.execute(
        'SELECT status FROM purchase_orders WHERE id = ? AND deleted_at IS NULL',
        [orderId]
      );
      if (!currentOrder || currentOrder.length === 0) {
        logger.warn(`[PurchaseOrderStatusService] 订单${orderId}不存在或已删除，跳过状态更新`);
        return null;
      }
      const currentStatus = currentOrder[0].status;

      if (currentStatus === 'cancelled') {
        logger.info(`[PurchaseOrderStatusService] 订单${orderId}状态为${currentStatus},不更新`);
        return {
          ...stats,
          status: currentStatus,
          skipped: true,
        };
      }

      const newStatus = this.deriveStatusFromQuantityStats(currentStatus, stats);

      logger.info(
        `[PurchaseOrderStatusService] 订单${orderId}状态: ${currentStatus} -> ${newStatus}, 完成度: ${completionPercentage.toFixed(2)}%`
      );
      logger.info(
        `[PurchaseOrderStatusService] 数量统计: 订单=${totalQuantity}, 收货=${totalReceived}, 检验=${totalInspected}, 合格=${totalQualified}, 不合格=${totalUnqualified}, 入库=${totalWarehoused}`
      );

      // 更新订单状态和完成百分比
      const updateOrderQuery = `
        UPDATE purchase_orders
        SET
          status = ?,
          completion_percentage = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL
      `;

      await client.execute(updateOrderQuery, [
        newStatus,
        Math.round(completionPercentage * 100) / 100, // 保留2位小数
        orderId,
      ]);

      return {
        orderId,
        status: newStatus,
        completionPercentage,
        totalQuantity,
        totalReceived,
        totalWarehoused,
        itemCount,
        completedItems,
      };
    } catch (error) {
      logger.error('更新采购订单状态失败:', error);
      throw error;
    }
  }

  /**
   * 更新采购订单项目的检验数量
   * @param {number} orderId - 采购订单ID
   * @param {number} materialId - 物料ID
   * @param {number} inspectedQuantity - 检验数量
   * @param {number} qualifiedQuantity - 合格数量
   * @param {number} unqualifiedQuantity - 不合格数量
   * @param {Object} connection - 数据库连接（可选）
   */
  static async updateOrderItemInspectionQuantity(
    orderId,
    materialId,
    inspectedQuantity,
    qualifiedQuantity,
    unqualifiedQuantity,
    connection = null
  ) {
    const client = connection || db.pool;

    try {
      logger.info(
        `[PurchaseOrderStatusService] 更新检验数量：订单ID=${orderId}, 物料ID=${materialId}, 检验数量=${inspectedQuantity}, 合格=${qualifiedQuantity}, 不合格=${unqualifiedQuantity}`
      );

      // 更新采购订单项目的检验相关数量
      const updateQuery = `
        UPDATE purchase_order_items
        SET
          inspected_quantity = inspected_quantity + ?,
          qualified_quantity = qualified_quantity + ?,
          unqualified_quantity = unqualified_quantity + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND material_id = ?
      `;

      const params = [
        parseFloat(inspectedQuantity) || 0,
        parseFloat(qualifiedQuantity) || 0,
        parseFloat(unqualifiedQuantity) || 0,
        orderId,
        materialId,
      ];

      const [updateResult] = await client.execute(updateQuery, params);
      if (!updateResult || updateResult.affectedRows === 0) {
        throw new Error(`采购订单项目不存在: 订单ID=${orderId}, 物料ID=${materialId}`);
      }

      logger.info('[PurchaseOrderStatusService] 检验数量更新完成');

      // 更新订单整体状态
      await this.updateOrderStatus(orderId, client);
    } catch (error) {
      logger.error('更新采购订单项目检验数量失败:', error);
      throw error;
    }
  }

  static async syncOrderItemInspectionQuantityFromInspections(
    orderId,
    materialId,
    connection = null
  ) {
    const client = connection || db.pool;

    try {
      const [orderItem] = await client.execute(
        'SELECT quantity FROM purchase_order_items WHERE order_id = ? AND material_id = ? FOR UPDATE',
        [orderId, materialId]
      );

      if (orderItem.length === 0) {
        throw new Error(`采购订单项目不存在: 订单ID=${orderId}, 物料ID=${materialId}`);
      }

      const orderQuantity = parseFloat(orderItem[0].quantity) || 0;
      const [inspectionRows] = await client.execute(
        `SELECT
           COALESCE(SUM(quantity), 0) AS inspected_quantity,
           COALESCE(SUM(qualified_quantity), 0) AS qualified_quantity,
           COALESCE(SUM(unqualified_quantity), 0) AS unqualified_quantity
         FROM quality_inspections
         WHERE deleted_at IS NULL
           AND inspection_type = 'incoming'
           AND reference_id = ?
           AND material_id = ?
           AND status IN (?, ?, ?, ?)`,
        [orderId, materialId, ...TERMINAL_INSPECTION_STATUSES]
      );

      const stats = inspectionRows[0] || {};
      const inspectedQuantity = parseFloat(stats.inspected_quantity) || 0;
      const qualifiedQuantity = parseFloat(stats.qualified_quantity) || 0;
      const unqualifiedQuantity = parseFloat(stats.unqualified_quantity) || 0;

      if (inspectedQuantity > orderQuantity + QUANTITY_EPSILON) {
        throw new Error(
          `检验数量超过采购订单数量: 订单数量=${orderQuantity}, 已终态检验=${inspectedQuantity}`
        );
      }

      const [updateResult] = await client.execute(
        `UPDATE purchase_order_items
         SET inspected_quantity = ?,
             qualified_quantity = ?,
             unqualified_quantity = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE order_id = ? AND material_id = ?`,
        [inspectedQuantity, qualifiedQuantity, unqualifiedQuantity, orderId, materialId]
      );

      if (!updateResult || updateResult.affectedRows === 0) {
        throw new Error(`采购订单项目不存在: 订单ID=${orderId}, 物料ID=${materialId}`);
      }

      await this.updateOrderStatus(orderId, client);

      return {
        orderId,
        materialId,
        inspectedQuantity,
        qualifiedQuantity,
        unqualifiedQuantity,
      };
    } catch (error) {
      logger.error('同步采购订单项目检验数量失败:', error);
      throw error;
    }
  }

  /**
   * 处理质检完成后的订单更新
   * @param {Object} inspectionData - 质检数据
   */
  static async handleInspectionComplete(inspectionData, connection = null) {
    try {
      logger.info('[PurchaseOrderStatusService] 处理检验完成:', inspectionData);

      // 获取质检单关联的采购订单信息
      if (inspectionData.reference_type === 'purchase_order' && inspectionData.reference_id) {
        const orderId = inspectionData.reference_id;
        const materialId = inspectionData.material_id || inspectionData.product_id;
        const inspectedQuantity = parseFloat(inspectionData.quantity) || 0;
        const qualifiedQuantity = parseFloat(inspectionData.qualified_quantity) || 0;
        const unqualifiedQuantity = parseFloat(inspectionData.unqualified_quantity) || 0;

        if (!materialId) {
          throw new Error(`质检单缺少物料ID，无法回写采购订单: 订单ID=${orderId}`);
        }

        if (inspectedQuantity <= 0) {
          throw new Error(`质检数量必须大于0，无法回写采购订单: 订单ID=${orderId}, 物料ID=${materialId}`);
        }

        if (inspectionData.inspection_id) {
          await this.syncOrderItemInspectionQuantityFromInspections(
            orderId,
            materialId,
            connection
          );
        } else {
          await this.updateOrderItemInspectionQuantity(
            orderId,
            materialId,
            inspectedQuantity,
            qualifiedQuantity,
            unqualifiedQuantity,
            connection
          );
        }

        logger.info(`[PurchaseOrderStatusService] 订单${orderId}物料${materialId}检验数量已更新`);
      } else if (inspectionData.reference_type === 'purchase_order') {
        throw new Error('质检单缺少采购订单引用ID，无法回写采购订单');
      }
    } catch (error) {
      logger.error('处理质检完成后的采购订单更新失败:', error);
      throw error;
    }
  }

  /**
   * 更新采购订单项目的入库数量
   * @param {number} orderId - 采购订单ID
   * @param {number} materialId - 物料ID
   * @param {number} warehousingQuantity - 入库数量
   * @param {Object} connection - 数据库连接（可选）
   */
  static async updateOrderItemWarehousingQuantity(
    orderId,
    materialId,
    warehousingQuantity,
    connection = null
  ) {
    const client = connection || db.pool;

    try {
      logger.info(
        `[PurchaseOrderStatusService] 更新入库数量：订单ID=${orderId}, 物料ID=${materialId}, 入库数量=${warehousingQuantity}`
      );

      // [M-4] 入库数量上限校验：入库数量不能超过合格数量（或收货数量）
      const [orderItem] = await client.execute(
        'SELECT quantity, received_quantity, inspected_quantity, qualified_quantity, warehoused_quantity FROM purchase_order_items WHERE order_id = ? AND material_id = ? FOR UPDATE',
        [orderId, materialId]
      );

      if (orderItem.length === 0) {
        throw new Error(`采购订单项目不存在: 订单ID=${orderId}, 物料ID=${materialId}`);
      }

      const inspectedQuantity = parseFloat(orderItem[0].inspected_quantity) || 0;
      const qualifiedQuantity = parseFloat(orderItem[0].qualified_quantity) || 0;
      const receivedQuantity = parseFloat(orderItem[0].received_quantity) || 0;
      const orderedQuantity = parseFloat(orderItem[0].quantity) || 0;
      const maxAllowed = inspectedQuantity > 0
        ? qualifiedQuantity
        : (receivedQuantity > 0 ? receivedQuantity : orderedQuantity);
      const currentWarehoused = parseFloat(orderItem[0].warehoused_quantity) || 0;
      const newWarehousingQty = parseFloat(warehousingQuantity) || 0;

      if (currentWarehoused + newWarehousingQty > maxAllowed + 0.001) {
        const errorMsg = `入库数量超额: 允许上限=${maxAllowed}, 已入库=${currentWarehoused}, 本次入库=${newWarehousingQty}`;
        logger.error(`[PurchaseOrderStatusService] ${errorMsg}`);
        const error = new Error(errorMsg);
        error.statusCode = 400;
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 更新采购订单项目的已入库数量
      const updateQuery = `
        UPDATE purchase_order_items
        SET
          warehoused_quantity = warehoused_quantity + ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE order_id = ? AND material_id = ?
      `;

      const params = [parseFloat(warehousingQuantity) || 0, orderId, materialId];

      const [updateResult] = await client.execute(updateQuery, params);
      if (!updateResult || updateResult.affectedRows === 0) {
        throw new Error(`采购订单项目不存在: 订单ID=${orderId}, 物料ID=${materialId}`);
      }

      logger.info('[PurchaseOrderStatusService] Warehousing quantity updated');

      // 更新订单整体状态
      await this.updateOrderStatus(orderId, client);
    } catch (error) {
      logger.error('更新采购订单项目入库数量失败:', error);
      throw error;
    }
  }

  /**
   * 批量更新所有采购订单的状态
   */
  static async updateAllOrderStatuses() {
    try {
      // 获取所有非取消的采购订单，已完成订单也需要重算以纠正异常状态
      const ordersQuery = `
        SELECT id FROM purchase_orders
        WHERE deleted_at IS NULL
          AND status <> 'cancelled'
      `;

      const [orders] = await db.pool.execute(ordersQuery);

      for (const order of orders) {
        try {
          await this.updateOrderStatus(order.id);
        } catch (error) {
          logger.error(`更新订单ID=${order.id}状态失败:`, error);
          // 继续处理其他订单
        }
      }
    } catch (error) {
      logger.error('批量更新采购订单状态失败:', error);
      throw error;
    }
  }
}

module.exports = PurchaseOrderStatusService;
