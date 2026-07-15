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
  TRANSFER: businessConfig.status.transfer,
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

module.exports = {
  STATUS,
  getMaterialBatchNumber,
};
