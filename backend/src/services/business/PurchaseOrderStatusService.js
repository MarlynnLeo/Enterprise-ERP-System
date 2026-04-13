/**
 * 采购订单状态管理服务
 * 处理采购订单的状态自动更新和完成度计算
 * @author 系统
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

class PurchaseOrderStatusService {
  /**
   * 更新采购订单项目的已收货数量
   * ✅ 重构后只更新received_quantity,不更新warehoused_quantity
   * @param {number} orderId - 采购订单ID
   * @param {number} materialId - 物料ID
   * @param {number} receivedQuantity - 收货数量
   * @param {number} qualifiedQuantity - 合格数量(已废弃,保留参数以兼容旧代码)
   * @param {Object} connection - 数据库连接（可选）
   */
  static async updateOrderItemReceivedQuantity(
    orderId,
    materialId,
    receivedQuantity,
    qualifiedQuantity,
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

      await client.execute(updateQuery, params);

      logger.info('[PurchaseOrderStatusService] 收货数量更新完成');

      // 更新订单整体状态
      await this.updateOrderStatus(orderId, client);
    } catch (error) {
      logger.error('更新采购订单项目收货数量失败:', error);
      logger.error('错误堆栈:', error.stack);
      throw error;
    }
  }

  /**
   * 计算并更新采购订单的完成状态
   * @param {number} orderId - 采购订单ID
   * @param {Object} connection - 数据库连接（可选）
   */
  static async updateOrderStatus(orderId, connection = null) {
    const client = connection || db.pool;

    try {
      // 获取订单项目的完成情况
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

      if (!itemsResult || itemsResult.length === 0) {
        logger.warn(`[PurchaseOrderStatusService] 订单${orderId}没有项目数据`);
        return;
      }

      const stats = itemsResult[0];
      const totalQuantity = parseFloat(stats.total_quantity) || 0;
      const totalReceived = parseFloat(stats.total_received) || 0;
      const totalInspected = parseFloat(stats.total_inspected) || 0;
      const totalQualified = parseFloat(stats.total_qualified) || 0;
      const totalUnqualified = parseFloat(stats.total_unqualified) || 0;
      const totalWarehoused = parseFloat(stats.total_warehoused) || 0;
      const itemCount = parseInt(stats.item_count) || 0;
      const completedItems = parseInt(stats.completed_items) || 0;

      // 计算完成百分比(基于入库数量)
      const completionPercentage = totalQuantity > 0 ? (totalWarehoused / totalQuantity) * 100 : 0;

      // 获取当前订单状态
      const [currentOrder] = await client.execute(
        'SELECT status FROM purchase_orders WHERE id = ?',
        [orderId]
      );
      const currentStatus =
        currentOrder && currentOrder.length > 0 ? currentOrder[0].status : 'draft';

      // ✅ 优化后的状态流转逻辑
      let newStatus = currentStatus;

      // 如果已完成或已取消,不再改变状态
      if (['completed', 'cancelled'].includes(currentStatus)) {
        logger.info(`[PurchaseOrderStatusService] 订单${orderId}状态为${currentStatus},不更新`);
        return;
      }

      // 根据数量情况确定状态
      if (completionPercentage >= 100) {
        // 全部入库完成
        newStatus = 'completed';
      } else if (totalWarehoused > 0) {
        // 部分入库
        newStatus = 'warehousing';
      } else if (totalInspected > 0) {
        // 已检验但未入库
        if (totalInspected >= totalReceived) {
          newStatus = 'inspected';
        } else {
          newStatus = 'inspecting';
        }
      } else if (totalReceived > 0) {
        // ✅ 修复：区分部分收货和全部收货
        if (totalReceived >= totalQuantity) {
          // 全部收货完成
          newStatus = 'received';
        } else {
          // 部分收货
          newStatus = 'partial_received';
        }
      } else if (['approved', 'pending', 'draft'].includes(currentStatus)) {
        // 保持原状态
        newStatus = currentStatus;
      }

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
        WHERE id = ?
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

      await client.execute(updateQuery, params);

      logger.info('[PurchaseOrderStatusService] 检验数量更新完成');

      // 更新订单整体状态
      await this.updateOrderStatus(orderId, client);
    } catch (error) {
      logger.error('更新采购订单项目检验数量失败:', error);
      logger.error('错误堆栈:', error.stack);
      throw error;
    }
  }

  /**
   * 处理质检完成后的订单更新
   * @param {Object} inspectionData - 质检数据
   */
  static async handleInspectionComplete(inspectionData) {
    try {
      logger.info('[PurchaseOrderStatusService] 处理检验完成:', inspectionData);

      // 获取质检单关联的采购订单信息
      if (inspectionData.reference_type === 'purchase_order' && inspectionData.reference_id) {
        const orderId = inspectionData.reference_id;
        const materialId = inspectionData.material_id || inspectionData.product_id;
        const inspectedQuantity = parseFloat(inspectionData.quantity) || 0;
        const qualifiedQuantity = parseFloat(inspectionData.qualified_quantity) || 0;
        const unqualifiedQuantity = parseFloat(inspectionData.unqualified_quantity) || 0;

        if (orderId && materialId && inspectedQuantity > 0) {
          // ✅ 检验完成时只更新检验相关数量,不更新warehoused_quantity
          // warehoused_quantity应该在入库单完成时更新
          await this.updateOrderItemInspectionQuantity(
            orderId,
            materialId,
            inspectedQuantity,
            qualifiedQuantity,
            unqualifiedQuantity
          );

          logger.info(`[PurchaseOrderStatusService] 订单${orderId}物料${materialId}检验数量已更新`);
        }
      }
    } catch (error) {
      logger.error('处理质检完成后的采购订单更新失败:', error);
      // 不抛出错误，避免影响质检流程
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
        'SELECT quantity, received_quantity, qualified_quantity, warehoused_quantity FROM purchase_order_items WHERE order_id = ? AND material_id = ? FOR UPDATE',
        [orderId, materialId]
      );

      if (orderItem.length > 0) {
        const maxAllowed = parseFloat(orderItem[0].qualified_quantity || orderItem[0].received_quantity || orderItem[0].quantity) || 0;
        const currentWarehoused = parseFloat(orderItem[0].warehoused_quantity) || 0;
        const newWarehousingQty = parseFloat(warehousingQuantity) || 0;

        if (currentWarehoused + newWarehousingQty > maxAllowed + 0.001) {
          const errorMsg = `入库数量超额: 允许上限=${maxAllowed}, 已入库=${currentWarehoused}, 本次入库=${newWarehousingQty}`;
          logger.error(`[PurchaseOrderStatusService] ${errorMsg}`);
          throw new Error(errorMsg);
        }
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

      await client.execute(updateQuery, params);

      logger.info('[PurchaseOrderStatusService] 入库数量更新完成');

      // 更新订单整体状态
      await this.updateOrderStatus(orderId, client);
    } catch (error) {
      logger.error('更新采购订单项目入库数量失败:', error);
      logger.error('错误堆栈:', error.stack);
      throw error;
    }
  }

  /**
   * 批量更新所有采购订单的状态
   */
  static async updateAllOrderStatuses() {
    try {
      // 获取所有未完成的采购订单
      const ordersQuery = `
        SELECT id FROM purchase_orders 
        WHERE status NOT IN ('completed', 'cancelled')
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
