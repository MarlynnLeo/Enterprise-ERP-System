/**
 * FIFO出库算法服务
 * 实现先进先出(FIFO)出库算法，确保按批次时间顺序进行出库
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const BatchManagementService = require('./BatchManagementService');

class FIFOOutboundService {
  /**
   * 生产出库 - 按FIFO原则分配物料
   * @param {Object} outboundData - 出库数据
   * @returns {Promise<Object>} - 出库结果
   */
  static async processProductionOutbound(outboundData) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        production_task_id,
        production_order_no,
        materials, // [{ material_id, material_code, required_quantity, unit }]
        operator,
        outbound_date,
        remarks,
      } = outboundData;

      const outboundResults = [];
      let totalCost = 0;

      // 逐个物料执行FIFO出库
      for (const material of materials) {
        logger.info(
          `开始处理物料 ${material.material_code} 出库 ${material.required_quantity} ${material.unit}`
        );

        // 执行FIFO出库
        const fifoResult = await BatchManagementService.executeFIFOOutbound({
          material_id: material.material_id,
          material_code: material.material_code,
          required_quantity: material.required_quantity,
          reference_type: 'production_outbound',
          reference_id: production_task_id,
          reference_no: production_order_no,
          operator,
          remarks: `生产出库 - ${remarks || ''}`,
        });

        outboundResults.push({
          material_id: material.material_id,
          material_code: material.material_code,
          required_quantity: material.required_quantity,
          allocated_quantity: fifoResult.total_quantity,
          outbound_batches: fifoResult.outbound_records,
          total_cost: fifoResult.total_cost,
        });

        totalCost += fifoResult.total_cost;

        logger.info(
          `物料 ${material.material_code} 出库完成，分配数量: ${fifoResult.total_quantity}`
        );
      }

      await connection.commit();

      return {
        success: true,
        production_task_id,
        production_order_no,
        outbound_date,
        materials: outboundResults,
        total_cost: totalCost,
        operator,
        remarks,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('生产出库失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 销售出库 - 按FIFO原则分配成品
   * @param {Object} outboundData - 出库数据
   * @returns {Promise<Object>} - 出库结果
   */
  static async processSalesOutbound(outboundData) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        sales_order_id,
        sales_order_no,
        customer_id,
        customer_name,
        products, // [{ product_id, product_code, required_quantity, unit }]
        operator,
        outbound_date,
        remarks,
      } = outboundData;

      const outboundResults = [];
      let totalCost = 0;

      // 逐个产品执行FIFO出库
      for (const product of products) {
        logger.info(
          `开始处理产品 ${product.product_code} 出库 ${product.required_quantity} ${product.unit}`
        );

        // 执行FIFO出库
        const fifoResult = await BatchManagementService.executeFIFOOutbound({
          material_id: product.product_id, // 产品也作为物料处理
          material_code: product.product_code,
          required_quantity: product.required_quantity,
          reference_type: 'sales_outbound',
          reference_id: sales_order_id,
          reference_no: sales_order_no,
          operator,
          remarks: `销售出库 - ${customer_name} - ${remarks || ''}`,
        });

        outboundResults.push({
          product_id: product.product_id,
          product_code: product.product_code,
          required_quantity: product.required_quantity,
          allocated_quantity: fifoResult.total_quantity,
          outbound_batches: fifoResult.outbound_records,
          total_cost: fifoResult.total_cost,
        });

        totalCost += fifoResult.total_cost;

        logger.info(
          `产品 ${product.product_code} 出库完成，分配数量: ${fifoResult.total_quantity}`
        );
      }

      await connection.commit();

      return {
        success: true,
        sales_order_id,
        sales_order_no,
        customer_id,
        customer_name,
        outbound_date,
        products: outboundResults,
        total_cost: totalCost,
        operator,
        remarks,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('销售出库失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取物料的FIFO出库预览
   * @param {number} materialId - 物料ID
   * @param {number} requiredQuantity - 需要数量
   * @returns {Promise<Object>} - FIFO出库预览
   */
  static async getFIFOOutboundPreview(materialId, requiredQuantity) {
    try {
      const fifoResult = await BatchManagementService.getFIFOOutboundBatches(
        materialId,
        requiredQuantity
      );

      // 计算成本信息
      let totalCost = 0;
      let weightedAvgCost = 0;

      if (fifoResult.allocated_batches.length > 0) {
        totalCost = fifoResult.allocated_batches.reduce((sum, batch) => {
          return sum + batch.allocated_quantity * (batch.unit_cost || 0);
        }, 0);

        weightedAvgCost =
          fifoResult.total_allocated > 0 ? totalCost / fifoResult.total_allocated : 0;
      }

      return {
        material_id: materialId,
        required_quantity: requiredQuantity,
        total_allocated: fifoResult.total_allocated,
        shortage: fifoResult.shortage,
        total_cost: totalCost,
        weighted_avg_cost: weightedAvgCost,
        batch_details: fifoResult.allocated_batches.map((batch) => ({
          batch_number: batch.batch_number,
          allocated_quantity: batch.allocated_quantity,
          unit_cost: batch.unit_cost || 0,
          total_cost: batch.allocated_quantity * (batch.unit_cost || 0),
          warehouse_name: batch.warehouse_name,
          location: batch.location,
          receipt_date: batch.receipt_date,
          expiry_date: batch.expiry_date,
          remaining_in_batch: batch.remaining_in_batch,
        })),
        can_fulfill: fifoResult.shortage === 0,
      };
    } catch (error) {
      logger.error('获取FIFO出库预览失败:', error);
      throw error;
    }
  }

  /**
   * 批量获取多个物料的FIFO出库预览
   * @param {Array} materials - 物料列表 [{ material_id, required_quantity }]
   * @returns {Promise<Array>} - FIFO出库预览列表
   */
  static async getBatchFIFOOutboundPreview(materials) {
    try {
      const previews = [];

      for (const material of materials) {
        const preview = await this.getFIFOOutboundPreview(
          material.material_id,
          material.required_quantity
        );
        previews.push(preview);
      }

      // 汇总信息
      const summary = {
        total_materials: materials.length,
        can_fulfill_all: previews.every((p) => p.can_fulfill),
        total_cost: previews.reduce((sum, p) => sum + p.total_cost, 0),
        materials_with_shortage: previews.filter((p) => p.shortage > 0).length,
        shortage_details: previews
          .filter((p) => p.shortage > 0)
          .map((p) => ({
            material_id: p.material_id,
            shortage: p.shortage,
          })),
      };

      return {
        summary,
        material_previews: previews,
      };
    } catch (error) {
      logger.error('批量获取FIFO出库预览失败:', error);
      throw error;
    }
  }

  /**
   * 检查物料库存是否满足FIFO出库需求
   * @param {Array} materials - 物料需求列表
   * @returns {Promise<Object>} - 库存检查结果
   */
  static async checkInventoryAvailability(materials) {
    try {
      const checkResults = [];
      let allAvailable = true;

      for (const material of materials) {
        // 获取物料库存汇总
        const summary = await BatchManagementService.getMaterialInventorySummary(
          material.material_id
        );

        const available = summary ? summary.available_quantity : 0;
        const isAvailable = available >= material.required_quantity;

        if (!isAvailable) {
          allAvailable = false;
        }

        checkResults.push({
          material_id: material.material_id,
          material_code: material.material_code || summary?.material_code,
          material_name: material.material_name || summary?.material_name,
          required_quantity: material.required_quantity,
          available_quantity: available,
          shortage: isAvailable ? 0 : material.required_quantity - available,
          is_available: isAvailable,
          batch_count: summary ? summary.batch_count : 0,
        });
      }

      return {
        all_available: allAvailable,
        check_results: checkResults,
        unavailable_materials: checkResults.filter((r) => !r.is_available),
      };
    } catch (error) {
      logger.error('检查库存可用性失败:', error);
      throw error;
    }
  }

  /**
   * 获取物料的批次老化报告
   * @param {number} materialId - 物料ID
   * @param {number} daysThreshold - 老化天数阈值
   * @returns {Promise<Object>} - 批次老化报告
   */
  static async getBatchAgingReport(materialId, daysThreshold = 30) {
    try {
      const query = `
        SELECT 
          NULL as id,
          batch_number,
          current_quantity,
          current_quantity as available_quantity,
          receipt_date,
          expiry_date,
          warehouse_name,
          NULL as location, -- 视图未包含具体库位名称
          unit_cost,
          (current_quantity * unit_cost) as total_cost,
          DATEDIFF(CURDATE(), receipt_date) as aging_days,
          CASE 
            WHEN expiry_date IS NOT NULL AND expiry_date < CURDATE() THEN 'expired'
            WHEN DATEDIFF(CURDATE(), receipt_date) > ? THEN 'aging'
            ELSE 'normal'
          END as aging_status
        FROM v_batch_stock
        WHERE material_id = ? 
          AND current_quantity > 0
        ORDER BY receipt_date ASC
      `;

      const result = await db.query(query, [daysThreshold, materialId]);
      const batches = result.rows || [];

      // 分类统计
      const summary = {
        total_batches: batches.length,
        total_quantity: batches.reduce((sum, b) => sum + parseFloat(b.current_quantity), 0),
        total_value: batches.reduce((sum, b) => sum + parseFloat(b.total_cost || 0), 0),
        normal_batches: batches.filter((b) => b.aging_status === 'normal').length,
        aging_batches: batches.filter((b) => b.aging_status === 'aging').length,
        expired_batches: batches.filter((b) => b.aging_status === 'expired').length,
        aging_quantity: batches
          .filter((b) => b.aging_status === 'aging')
          .reduce((sum, b) => sum + parseFloat(b.current_quantity), 0),
        expired_quantity: batches
          .filter((b) => b.aging_status === 'expired')
          .reduce((sum, b) => sum + parseFloat(b.current_quantity), 0),
      };

      return {
        material_id: materialId,
        aging_threshold_days: daysThreshold,
        summary,
        batch_details: batches,
      };
    } catch (error) {
      logger.error('获取批次老化报告失败:', error);
      throw error;
    }
  }
}

module.exports = FIFOOutboundService;
