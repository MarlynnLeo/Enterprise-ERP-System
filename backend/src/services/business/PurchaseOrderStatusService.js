/**
 * 采购订单状态管理服务
 * 处理采购订单的状态自动更新和完成度计算
 * @author 系统
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const PurchaseOrderQuantityService = require('./PurchaseOrderQuantityService');
const { purchaseValidationError, purchaseQuantity } = require('../../utils/purchase/purchaseValidation');

const QUANTITY_EPSILON = 0.0001;

class PurchaseOrderStatusService {
  /**
   * 更新采购订单项目的已收货数量
   * ✅ 重构后只更新received_quantity,不更新warehoused_quantity
   * @param {number} orderId - 采购订单ID
   * @param {number} materialId - 物料ID
   * @param {number} receivedQuantity - 收货数量
   * @param {Object} connection - 数据库连接（可选）
   */
  static async updateOrderItemReceivedQuantity(orderId, materialId, receivedQuantity, connection = null, orderItemId = null) {
    const client = connection || db.pool;
    const allocation = await PurchaseOrderQuantityService.read(client, orderId);
    const line = allocation.resolve(materialId, orderItemId);
    const quantity = purchaseQuantity(receivedQuantity, '本次到货数量');
    if (line.reserved + quantity > Number(line.item.quantity) + QUANTITY_EPSILON) {
      throw purchaseValidationError(`收货数量超过订单数量: 订单数量=${line.item.quantity}, 已占用=${line.reserved}, 本次收货=${quantity}`);
    }
    await client.execute('UPDATE purchase_order_items SET received_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [Math.max(0, line.received) + quantity, line.item.id]);
    await this.updateOrderStatus(orderId, client);
  }

  static async syncOrderItemReceivedFromReceipts(orderId, materialId, connection = null, orderItemId = null) {
    const client = connection || db.pool;
    const allocation = await PurchaseOrderQuantityService.read(client, orderId);
    const line = allocation.resolve(materialId, orderItemId);
    if (line.received > Number(line.item.quantity) + QUANTITY_EPSILON) throw purchaseValidationError('收货单汇总量超过采购订单数量');
    await client.execute('UPDATE purchase_order_items SET received_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [Math.max(0, line.received), line.item.id]);
    await this.updateOrderStatus(orderId, client);
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
          SUM(CASE WHEN received_quantity + ? >= quantity THEN 1 ELSE 0 END) as received_items,
          SUM(CASE WHEN warehoused_quantity + ? >= quantity THEN 1 ELSE 0 END) as completed_items
        FROM purchase_order_items
        WHERE order_id = ?
      `;

    const [itemsResult] = await client.execute(itemsQuery, [QUANTITY_EPSILON, QUANTITY_EPSILON, orderId]);
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
    const receivedItems = parseInt(stats.received_items, 10) || 0;
    const completedItems = parseInt(stats.completed_items, 10) || 0;
    const completionPercentage = totalQuantity > 0 ? (totalWarehoused / totalQuantity) * 100 : 0;
    const canComplete =
      totalQuantity > 0 &&
      completedItems === itemCount &&
      totalWarehoused + QUANTITY_EPSILON >= totalQuantity;

    return {
      orderId,
      totalQuantity,
      totalReceived,
      totalInspected,
      totalQualified,
      totalUnqualified,
      totalWarehoused,
      itemCount,
      receivedItems,
      completedItems,
      completionPercentage,
      canComplete,
    };
  }

  static deriveStatusFromQuantityStats(currentStatus, stats) {
    if (currentStatus === 'cancelled' || !stats) {
      return currentStatus;
    }

    // 订单还有任意明细未足量收货时，不能进入检验完成、入库中或已完成。
    // 必须先保留“部分收货”，避免某一条物料已收货/检验就把整张订单提前结束。
    const hasOutstandingReceivedLine = Number.isFinite(stats.receivedItems)
      ? stats.receivedItems < stats.itemCount
      : stats.totalReceived + QUANTITY_EPSILON < stats.totalQuantity;
    if (hasOutstandingReceivedLine) {
      return stats.totalReceived > 0 ? 'partial_received' : (['partial_received', 'received', 'inspecting', 'inspected', 'warehousing', 'completed'].includes(currentStatus) ? 'approved' : currentStatus);
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
  static async syncOrderItemInspectionQuantityFromInspections(orderId, materialId, connection = null, orderItemId = null) {
    const client = connection || db.pool;
    const allocation = await PurchaseOrderQuantityService.read(client, orderId);
    const line = allocation.resolve(materialId, orderItemId);
    // Historical inspections include failed deliveries and replacements. Only
    // the net accepted/reserved quantity is limited by the ordered quantity.
    if (line.reserved > Number(line.item.quantity) + QUANTITY_EPSILON) throw purchaseValidationError('检验放行数量超过采购订单剩余数量');
    await client.execute(
      `UPDATE purchase_order_items SET inspected_quantity = ?, qualified_quantity = ?, unqualified_quantity = ?,
        received_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [line.inspected, line.qualified, line.unqualified, Math.max(0, line.received), line.item.id]
    );
    await this.updateOrderStatus(orderId, client);
    return { orderId, materialId, inspectedQuantity: line.inspected, qualifiedQuantity: line.qualified, unqualifiedQuantity: line.unqualified };
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

        if (!materialId) {
          throw new Error(`质检单缺少物料ID，无法回写采购订单: 订单ID=${orderId}`);
        }

        if (inspectedQuantity <= 0) {
          throw new Error(`质检数量必须大于0，无法回写采购订单: 订单ID=${orderId}, 物料ID=${materialId}`);
        }

        await this.syncOrderItemInspectionQuantityFromInspections(
          orderId, materialId, connection, inspectionData.purchase_order_item_id || null
        );

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
  static async updateOrderItemWarehousingQuantity(orderId, materialId, warehousingQuantity, connection = null, orderItemId = null) {
    const client = connection || db.pool;
    const allocation = await PurchaseOrderQuantityService.read(client, orderId);
    const line = allocation.resolve(materialId, orderItemId);
    const quantity = purchaseQuantity(warehousingQuantity, '本次入库数量');
    const total = Number(line.item.warehoused_quantity || 0) + quantity;
    if (total > Math.max(0, line.received) + QUANTITY_EPSILON) throw purchaseValidationError('入库数量超出已收货合格数量');
    await client.execute('UPDATE purchase_order_items SET warehoused_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [total, line.item.id]);
    await this.updateOrderStatus(orderId, client);
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
