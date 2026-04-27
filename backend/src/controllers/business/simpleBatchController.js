/**
 * 简化的批次追溯控制器
 * 提供基本的批次追溯查询功能
 */

require('dotenv').config();
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

// 使用统一的连接池，不再自建裸连接
const { pool } = require('../../config/db');

const simpleBatchController = {
  /**
   * 获取批次追溯信息 (单表架构版本)
   */
  async getBatchDetails(req, res) {
    try {
      const { materialCode, batchNumber } = req.params;

      if (!materialCode || !batchNumber) {
        return ResponseHandler.error(res, '物料编码和批次号不能为空', 'BAD_REQUEST', 400);
      }

      const [batchResult] = await pool.execute(
        `
        SELECT 
          vbs.*,
          m.code as material_code,
          m.name as material_name,
          s.name as supplier_name,
          wl.name as warehouse_name
        FROM v_batch_stock vbs
        LEFT JOIN materials m ON vbs.material_id = m.id
        LEFT JOIN suppliers s ON vbs.supplier_id = s.id
        LEFT JOIN warehouse_locations wl ON vbs.location_id = wl.id
        WHERE m.code = ? AND vbs.batch_number = ?
      `,
        [materialCode, batchNumber]
      );

      if (batchResult.length === 0) {
        return res.status(404).json({
          success: false,
          message: `未找到批次: ${materialCode} - ${batchNumber}`,
        });
      }

      const batch = batchResult[0];

      // ✅ 从 inventory_ledger 获取流转历史
      const [transactionResult] = await pool.execute(
        `
        SELECT 
          transaction_type, quantity, unit_id, before_quantity, after_quantity,
          reference_type, reference_no, operator, remark as remarks, created_at as transaction_date
        FROM inventory_ledger 
        WHERE batch_number = ?
        ORDER BY created_at DESC
      `,
        [batchNumber]
      );

      // 构建追溯数据
      const traceabilityData = {
        batch_info: {
          material_code: batch.material_code,
          material_name: batch.material_name,
          batch_number: batch.batch_number,
          current_quantity: batch.current_quantity,
          supplier_name: batch.supplier_name,
          receipt_date: batch.receipt_date,
          warehouse_name: batch.warehouse_name,
        },
        inbound_info: {
          receipt_date: batch.receipt_date,
          supplier_name: batch.supplier_name,
        },
        transaction_history: transactionResult,
        relationships: [],
        trace_path: [],
      };

      ResponseHandler.success(res, traceabilityData, '操作成功');
    } catch (error) {
      logger.error('获取批次追溯失败:', error);
      ResponseHandler.error(res, '获取批次追溯失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * FIFO出库预览 (单表架构版本)
   */
  async getFIFOOutboundPreview(req, res) {
    try {
      const { materialId, requiredQuantity } = req.query;

      if (!materialId || !requiredQuantity) {
        return ResponseHandler.error(res, '物料ID和需要数量不能为空', 'BAD_REQUEST', 400);
      }

      const [batchResult] = await pool.execute(
        `
        SELECT 
          batch_number,
          current_quantity as available_quantity,
          unit_cost,
          location_id,
          receipt_date
        FROM v_batch_stock 
        WHERE material_id = ? 
          AND current_quantity > 0
        ORDER BY receipt_date ASC
      `,
        [parseInt(materialId)]
      );

      // 计算FIFO分配
      const allocatedBatches = [];
      let remainingQuantity = parseFloat(requiredQuantity);
      let totalCost = 0;

      for (const batch of batchResult) {
        if (remainingQuantity <= 0) break;

        const allocatedQuantity = Math.min(batch.available_quantity, remainingQuantity);
        const batchCost = allocatedQuantity * (batch.unit_cost || 0);

        allocatedBatches.push({
          ...batch,
          allocated_quantity: allocatedQuantity,
          total_cost: batchCost,
          remaining_in_batch: batch.available_quantity - allocatedQuantity,
        });

        totalCost += batchCost;
        remainingQuantity -= allocatedQuantity;
      }

      const totalAllocated = parseFloat(requiredQuantity) - remainingQuantity;
      const preview = {
        material_id: parseInt(materialId),
        required_quantity: parseFloat(requiredQuantity),
        total_allocated: totalAllocated,
        shortage: remainingQuantity > 0 ? remainingQuantity : 0,
        total_cost: totalCost,
        weighted_avg_cost: totalAllocated > 0 ? totalCost / totalAllocated : 0,
        batch_details: allocatedBatches,
        can_fulfill: remainingQuantity === 0,
      };

      ResponseHandler.success(res, preview, '操作成功');
    } catch (error) {
      logger.error('获取FIFO出库预览失败:', error);
      ResponseHandler.error(res, '获取FIFO出库预览失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * @deprecated 此方法已废弃
   * 测试数据应通过 InventoryService.updateStock 创建
   */
  async createTestData(req, res) {
    return ResponseHandler.error(
      res,
      '此接口已废弃，请使用 InventoryService.updateStock 创建测试数据',
      'DEPRECATED',
      410
    );
  },
};

module.exports = simpleBatchController;
