/**
 * PurchaseOrderService.js
 * @description 采购订单服务类 - 统一处理重复的业务逻辑
 * @date 2025-09-29
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const db = require('../config/db');
const pool = db.pool;

class PurchaseOrderService {
  /**
   * 获取物料信息
   * @param {Object} connection - 数据库连接
   * @param {number} materialId - 物料ID
   * @returns {Object|null} 物料信息
   */
  static async getMaterialInfo(connection, materialId) {
    try {
      const [rows] = await connection.query(
        'SELECT code, name, specs, unit_id FROM materials WHERE id = ?',
        [materialId]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error(`查询物料信息失败，物料ID: ${materialId}`, error);
      throw error;
    }
  }

  /**
   * 获取供应商信息
   * @param {Object} connection - 数据库连接
   * @param {number} supplierId - 供应商ID
   * @returns {Object|null} 供应商信息
   */
  static async getSupplierInfo(connection, supplierId) {
    try {
      const [rows] = await connection.query('SELECT name FROM suppliers WHERE id = ? AND deleted_at IS NULL', [
        supplierId,
      ]);
      return rows[0] || null;
    } catch (error) {
      logger.error(`查询供应商信息失败，供应商ID: ${supplierId}`, error);
      throw error;
    }
  }

  /**
   * 更新采购申请状态
   * @param {Object} connection - 数据库连接
   * @param {number} requisitionId - 申请单ID
   * @param {string} status - 新状态，默认为'completed'
   */
  static async updateRequisitionStatus(connection, requisitionId, status = 'completed') {
    if (!requisitionId) return;

    try {
      // 首先检查申请单是否存在
      const [checkReqRows] = await connection.query(
        'SELECT id, status FROM purchase_requisitions WHERE id = ?',
        [requisitionId]
      );

      if (checkReqRows.length > 0) {
        const currentReqStatus = checkReqRows[0].status;
        logger.info(
          `更新采购申请状态: ID=${requisitionId}, 当前状态=${currentReqStatus}, 目标状态=${status}`
        );

        // 更新采购申请状态
        const updateRequisitionStatusQuery = `
          UPDATE purchase_requisitions
          SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `;
        const [updateResult] = await connection.query(updateRequisitionStatusQuery, [
          status,
          requisitionId,
        ]);

        if (updateResult.affectedRows === 0) {
          logger.error(`更新采购申请状态失败，ID:${requisitionId}，未影响任何行`);
        } else {
          logger.info(`采购申请状态更新成功，ID:${requisitionId}`);
        }
      } else {
        logger.error(`找不到ID为${requisitionId}的采购申请，无法更新状态`);
      }
    } catch (error) {
      logger.error('更新采购申请状态失败:', error);
      // 不抛出错误，避免影响主要业务流程
    }
  }

  /**
   * 处理物料项目信息补充
   * @param {Object} connection - 数据库连接
   * @param {Object} item - 物料项目
   * @returns {Object} 处理后的物料项目
   */
  static async processOrderItem(connection, item) {
    const {
      material_id,
      material_code,
      material_name,
      specification,
      unit_id,
      price,
      unit_price,
      quantity,
      total_price: totalPrice,
    } = item;

    // 兼容price和unit_price字段
    const itemPrice = price || unit_price || 0;

    // 如果缺少物料代码或物料名称，从数据库中查询补充
    let itemCode = material_code;
    let itemName = material_name;
    let itemSpec = specification || '';
    let itemUnitId = unit_id;

    if (!itemCode || !itemName) {
      const materialInfo = await this.getMaterialInfo(connection, material_id);

      if (materialInfo) {
        itemCode = itemCode || materialInfo.code;
        itemName = itemName || materialInfo.name;
        itemSpec = itemSpec || materialInfo.specs || '';
        itemUnitId = itemUnitId || materialInfo.unit_id;
      }
    }

    // 检查必须字段
    if (!itemCode || !itemName) {
      throw new Error(`物料信息不完整，ID: ${material_id}, 编码: ${itemCode}, 名称: ${itemName}`);
    }

    // ✅ 数据完整性校验：价格和数量必须为非负数
    if (typeof quantity !== 'number' || quantity <= 0) {
      throw new Error(`物料 ${itemCode} 的数量必须大于0，当前值: ${quantity}`);
    }
    if (itemPrice < 0) {
      throw new Error(`物料 ${itemCode} 的单价不能为负数，当前值: ${itemPrice}`);
    }

    return {
      material_id,
      material_code: itemCode,
      material_name: itemName,
      specification: itemSpec,
      unit_id: itemUnitId,
      price: itemPrice,
      quantity,
      tax_rate: item.tax_rate || 0,
      tax_amount: item.tax_amount || 0,
      amount: totalPrice || itemPrice * quantity,
    };
  }

  /**
   * 批量处理订单物料项目
   * @param {Object} connection - 数据库连接
   * @param {Array} items - 物料项目数组
   * @returns {Array} 处理后的物料项目数组
   */
  static async processOrderItems(connection, items) {
    if (!items || items.length === 0) {
      return [];
    }

    const processedItems = [];
    for (const item of items) {
      const processedItem = await this.processOrderItem(connection, item);
      processedItems.push(processedItem);
    }

    return processedItems;
  }

  /**
   * 插入订单物料项目
   * @param {Object} connection - 数据库连接
   * @param {number} orderId - 订单ID
   * @param {Array} items - 物料项目数组
   */
  static async insertOrderItems(connection, orderId, items) {
    if (!items || items.length === 0) {
      return;
    }

    const processedItems = await this.processOrderItems(connection, items);

    if (processedItems.length === 0) {
      return;
    }

    // ✅ 性能优化: 批量 INSERT 替代逐条插入，N 次 SQL → 1 次
    const placeholders = processedItems.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = [];
    for (const item of processedItems) {
      values.push(
        orderId,
        item.material_id,
        item.material_code,
        item.material_name,
        item.specification,
        null, // unit字段设为null
        item.unit_id,
        item.price,
        item.quantity,
        item.amount, // amount 对应 total 列
        item.tax_rate
      );
    }

    // 使用数据库实际列名：price, total (不是 unit_price, amount)
    await connection.query(
      `INSERT INTO purchase_order_items 
      (order_id, material_id, material_code, material_name, specification, unit, unit_id, price, quantity, total, tax_rate)
      VALUES ${placeholders}`,
      values
    );
  }

  /**
   * 验证供应商存在性
   * @param {Object} connection - 数据库连接
   * @param {number} supplierId - 供应商ID
   * @returns {string} 供应商名称
   * @throws {Error} 供应商不存在时抛出错误
   */
  static async validateSupplier(connection, supplierId) {
    const supplierInfo = await this.getSupplierInfo(connection, supplierId);

    if (!supplierInfo) {
      throw new Error('供应商不存在');
    }

    return supplierInfo.name;
  }

  /**
   * 验证订单状态是否可编辑
   * @param {Object} connection - 数据库连接
   * @param {number} orderId - 订单ID
   * @returns {Object} 订单信息
   * @throws {Error} 订单不存在或状态不可编辑时抛出错误
   */
  static async validateOrderEditable(connection, orderId) {
    const [checkRows] = await connection.query('SELECT status FROM purchase_orders WHERE id = ?', [
      orderId,
    ]);

    if (checkRows.length === 0) {
      throw new Error('采购订单不存在');
    }

    const currentStatus = checkRows[0].status;
    if (currentStatus !== 'pending' && currentStatus !== 'draft') {
      throw new Error('只能编辑待处理或草稿状态的采购订单');
    }

    return checkRows[0];
  }
}

module.exports = PurchaseOrderService;
