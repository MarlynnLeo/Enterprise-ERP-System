/**
 * helpers.js
 * @description 库存模块辅助函数
 * @date 2025-12-30
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');
const businessConfig = require('../../../config/businessConfig');

const STATUS = {
  OUTBOUND: businessConfig.status.outbound,
  INBOUND: businessConfig.status.inbound,
  PRODUCTION_TASK: businessConfig.status.productionTask,
  PRODUCTION_PLAN: businessConfig.status.productionPlan,
  APPROVAL: businessConfig.status.approval,
  TRANSFER: businessConfig.status.transfer
};

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @returns {Promise<string>} 批次号
 */
const getMaterialBatchNumber = async (connection, materialId, locationId = null) => {
  try {
    // ✅ 单表架构：从 v_batch_stock 视图查询
    let query = `
      SELECT batch_number
      FROM v_batch_stock
      WHERE material_id = ?
        AND current_quantity > 0
    `;
    const params = [materialId];

    if (locationId) {
      query += ' AND location_id = ?';
      params.push(locationId);
    }

    query += ' ORDER BY receipt_date ASC LIMIT 1'; // FIFO: 先进先出

    const [stockBatchRecords] = await connection.execute(query, params);

    if (stockBatchRecords.length > 0 && stockBatchRecords[0].batch_number) {
      return stockBatchRecords[0].batch_number;
    }

    throw new Error(`物料 ${materialId} 在当前库位没有可用批次库存`);
  } catch (error) {
    logger.error('获取物料批次号失败:', error);
    throw error;
  }
};

/**
 * 插入库存流水记录（本地辅助函数）
 */
const insertInventoryLedgerLocal = async (connection, {
  material_id,
  location_id,
  transaction_type,
  quantity,
  unit_id,
  batch_number = null,
  reference_no,
  reference_type,
  operator,
  remark = null,
  beforeQuantity = null,
  afterQuantity = null,
  checkStockSufficiency = false,
  allowNegativeStock = true
}) => {
  try {
    // 验证必填字段
    if (!material_id || !location_id || !transaction_type || quantity === undefined || quantity === null) {
      throw new Error('缺少必填字段: material_id, location_id, transaction_type, quantity');
    }

    // 解析数量
    const parsedQuantity = parseFloat(quantity);
    if (isNaN(parsedQuantity)) {
      throw new Error(`无效的数量值: ${quantity}`);
    }

    // 验证 unit_id
    let validUnitId = unit_id;
    if (!validUnitId) {
      const [materialInfo] = await connection.execute(
        'SELECT unit_id FROM materials WHERE id = ?',
        [material_id]
      );
      if (materialInfo.length === 0) {
        throw new Error(`物料不存在: ${material_id}`);
      }
      validUnitId = materialInfo[0].unit_id;
    }

    // 获取当前库存（使用行级锁）
    const [stockRecords] = await connection.execute(
      `SELECT COALESCE(SUM(quantity), 0) as total_quantity
       FROM inventory_ledger
       WHERE material_id = ? AND location_id = ?
       FOR UPDATE`,
      [material_id, location_id]
    );

    const currentQuantity = parseFloat(stockRecords[0].total_quantity || 0);
    const calculatedBeforeQuantity = beforeQuantity !== null ? beforeQuantity : currentQuantity;
    const calculatedAfterQuantity = afterQuantity !== null ? afterQuantity : (calculatedBeforeQuantity + parsedQuantity);

    // 库存充足性检查
    if (checkStockSufficiency && !allowNegativeStock && calculatedAfterQuantity < 0) {
      throw new Error(`库存不足: 当前库存 ${calculatedBeforeQuantity}, 需要 ${Math.abs(parsedQuantity)}, 差额 ${Math.abs(calculatedAfterQuantity)}`);
    }

    // 构建完整备注
    const fullRemark = remark || `${transaction_type} - ${reference_no || 'N/A'}`;

    // 插入库存流水记录
    const sql = `INSERT INTO inventory_ledger (
      transaction_type,
      material_id,
      location_id,
      quantity,
      unit_id,
      batch_number,
      reference_no,
      reference_type,
      operator,
      remark,
      before_quantity,
      after_quantity,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

    const params = [
      transaction_type,
      material_id,
      location_id,
      parsedQuantity,
      validUnitId,
      batch_number || null,
      reference_no || null,
      reference_type || null,
      operator || 'system',
      fullRemark,

      calculatedBeforeQuantity,
      calculatedAfterQuantity
    ];

    const [result] = await connection.execute(sql, params);

    return {
      id: result.insertId,
      before_quantity: calculatedBeforeQuantity,
      after_quantity: calculatedAfterQuantity,
      quantity: parsedQuantity
    };
  } catch (error) {
    logger.error('插入库存流水记录失败:', error);
    throw error;
  }
};

module.exports = {
  STATUS,
  getMaterialBatchNumber,
  insertInventoryLedgerLocal
};
