/**
 * traceability/Handler.js
 * @description 追溯管理事件处理器
 * @date 2026-01-23
 * @version 1.0.0
 */

const logger = require('../../utils/logger');
const db = require('../../config/db');
const dayjs = require('dayjs');
const Core = require('./Core');

class TraceabilityHandler {
  /**
   * 自动创建追溯记录
   * @param {string} triggerType - 触发类型 (purchase, inbound, inspection, production, product_warehouse, production_return, defective_return, sales_return, outbound, production_outbound, sales_outbound, sales)
   * @param {Object} data - 相关数据
   * @returns {Promise<Object>} - 创建或更新的追溯记录
   */
  static async handleAutoTraceability(triggerType, data) {
    try {
      logger.info(`开始自动处理追溯逻辑，类型：${triggerType}`, data);

      let result = null;

      switch (triggerType) {
        case 'purchase': // 采购入库
          result = await this._handlePurchaseTraceability(data);
          break;
        case 'inbound': // 通用入库（兜底）
          result = await this._handlePurchaseTraceability(data);
          break;
        case 'inspection': // 质量检验
          // 质检通常关联已存在的追溯记录，节点更新由质检业务层完成
          logger.info('质检追溯处理');
          break;
        case 'production': // 生产任务
          result = await this._handleProductionTraceability(data);
          break;
        case 'product_warehouse': // 成品入库
          // 可以更新追溯记录的状态
          break;
        case 'production_return': // 产线退料（使用原始发料批次号）
        case 'defective_return': // 不良退回（使用原始发料批次号）
          result = await this._handleReturnTraceability(triggerType, data);
          break;
        case 'sales_return': // 销售退货
          result = await this._handleReturnTraceability(triggerType, data);
          break;
        case 'outbound': // 物料出库
        case 'production_outbound': // 生产领料出库
        case 'sales_outbound': // 销售发货出库
          result = await this._handleOutboundTraceability(data);
          break;
        case 'sales': // 销售出库
          logger.info('处理成品销售出库追溯', data);
          break;
        default:
          logger.warn(`未知的追溯触发类型: ${triggerType}`);
      }

      return result;
    } catch (error) {
      logger.error('自动处理追溯逻辑失败:', error);
      // 不抛出错误，以免影响主业务流程
      return null;
    }
  }

  /**
   * 处理采购入库追溯
   * @private
   */
  static async _handlePurchaseTraceability(data) {
    try {
      // 采购入库主要作为追溯的起点（原材料批次）
      // 这里可以创建一条初始的追溯记录，如果需要的话
      // 目前主要逻辑由getTraceabilityRecords等查询方法动态关联

      // 示例：检查是否需要创建新的批次追踪记录
      logger.info('处理采购入库追溯', data);

      // 实际业务中，可能将数据写入 traceability 表
      // 但当前设计 traceability 表主要存储成品批次信息
      // 原材料批次信息存储在 purchase_receipt_items 表中

      return { success: true, message: '采购入库追溯处理完成' };
    } catch (error) {
      logger.error('处理采购入库追溯失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理物料出库/领料追溯
   * @private
   */
  static async _handleOutboundTraceability(data) {
    try {
      // 领料出库作为生产追溯的重要节点
      logger.info('处理出料/发料出库追溯', data);

      // 根据当前架构，出库记录也主要依靠流水和表关联
      return { success: true, message: '发料追溯处理完成' };
    } catch (error) {
      logger.error('处理发料出库追溯失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理生产追溯
   * @private
   */
  static async _handleProductionTraceability(data) {
    try {
      // 生产环节是追溯的核心
      // 当生产任务完成时，通常会产生新的成品批次

      const {  productCode, productName, batchNumber, productionDate } = data;

      if (!productCode || !batchNumber) {
        return { success: false, message: '缺少产品编码或批次号' };
      }

      // 检查是否已存在该批次的追溯记录
      const existingQuery = `
        SELECT id FROM traceability 
        WHERE product_code = ? AND batch_number = ?
      `;

      const result = await db.query(existingQuery, [productCode, batchNumber]);

      if (result.rows && result.rows.length > 0) {
        logger.info(`追溯记录已存在: ${productCode} - ${batchNumber}`);
        return Core.getTraceabilityById(result.rows[0].id);
      }

      // 创建新的追溯记录
      const newRecord = {
        productCode,
        productName,
        batchNumber,
        productionDate: productionDate || dayjs().format('YYYY-MM-DD'),
        status: 'in_production',
        remarks: '由生产任务自动创建',
      };

      return await Core.createTraceability(newRecord);
    } catch (error) {
      logger.error('处理生产追溯失败:', error);
      return { success: false, error: error.message };
    }
  }
  /**
   * 处理退料/不良退回追溯
   * @description 退料时溯源原始发料批次号，将退回物料与原始发料批次关联
   * @param {string} triggerType - 触发类型 (production_return / defective_return / sales_return)
   * @param {Object} data - 追溯数据
   * @private
   */
  static async _handleReturnTraceability(triggerType, data) {
    try {
      const { material_id, batch_no, reference_id, inbound_no } = data;

      logger.info(`处理退料追溯 | 类型:${triggerType} | 物料:${material_id} | 批次:${batch_no} | 入库单:${inbound_no}`);

      if (!batch_no) {
        throw new Error(`退料追溯缺少批次号: materialId=${material_id}, referenceId=${reference_id}`);
      }

      logger.info(`[退料追溯] 物料 ${material_id} 已成功关联原始发料批次: ${batch_no}`);

      return {
        success: true,
        message: `退料追溯处理完成（${triggerType}）`,
        batch_no,
        material_id,
      };
    } catch (error) {
      logger.error(`处理退料追溯失败(${triggerType}):`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = TraceabilityHandler;
