/**
 * 生产批次追溯服务
 * 处理生产过程中的批次追溯，包括物料消耗和成品生产
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

class ProductionTraceabilityService {
  /**
   * 处理生产任务完成时的批次追溯
   * @param {Object} productionData - 生产数据
   */
  static async handleProductionComplete(productionData) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        task_id,
        task_code,
        product_id,
        product_code,
        product_name,
        batch_number,
        produced_quantity,
        production_date,
        operator,
      } = productionData;

      logger.info(
        `🏭 处理生产任务完成追溯: ${task_code}, 产品: ${product_code}, 批次: ${batch_number}`
      );

      // 1. 获取生产任务消耗的物料
      const consumedMaterials = await this.getConsumedMaterials(connection, task_id);

      // 2. 创建成品批次记录
      const productBatch = await this.createProductBatch(connection, {
        task_id,
        task_code,
        product_id,
        product_code,
        product_name,
        batch_number,
        produced_quantity,
        production_date,
        consumed_materials,
        operator,
      });

      // 3. 创建物料消耗的FIFO出库记录
      await this.processConsumedMaterials(connection, task_id, consumedMaterials, operator);

      // 4. 建立原材料到成品的追溯关系
      await this.createMaterialToProductTraceability(
        connection,
        productBatch.id,
        consumedMaterials
      );

      await connection.commit();

      return productBatch;
    } catch (error) {
      await connection.rollback();
      logger.error('处理生产完成追溯失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取生产任务消耗的物料
   */
  static async getConsumedMaterials(connection, taskId) {
    try {
      // 从出库记录中获取实际消耗的物料
      const [outboundResult] = await connection.execute(
        `
        SELECT 
          oi.material_id,
          m.code AS material_code,
          m.name AS material_name,
          oi.quantity AS consumed_quantity,
          oi.unit,
          io.outbound_no,
          io.outbound_date
        FROM inventory_outbound_items oi
        JOIN inventory_outbound io ON oi.outbound_id = io.id
        JOIN materials m ON oi.material_id = m.id
        WHERE io.reference_type = 'production_task' 
        AND io.reference_id = ?
        AND io.status = 'completed'
      `,
        [taskId]
      );

      return outboundResult || [];
    } catch (error) {
      logger.error('获取消耗物料失败:', error);
      return [];
    }
  }

  /**
   * 创建成品批次记录 (单表架构版本)
   */
  static async createProductBatch(connection, productData) {
    try {
      const {
        task_id,
        task_code,
        product_id,
        product_code,
        product_name,
        batch_number,
        produced_quantity,
        production_date,
        operator,
      } = productData;

      // 计算生产成本（基于消耗物料的FIFO成本）
      const productionCost = await this.calculateProductionCost(connection, task_id);

      // ✅ 从物料基础资料读取默认仓库，不再硬编码
      const InventoryService = require('../InventoryService');
      const productLocationId = await InventoryService.getMaterialLocation(product_id, connection);

      // ✅ 单表架构：使用 InventoryService 写入 inventory_ledger
      await InventoryService.updateStock(
        {
          materialId: product_id,
          locationId: productLocationId,
          quantity: produced_quantity,
          transactionType: 'inbound',
          referenceNo: task_code,
          referenceType: 'production_complete',
          operator: operator || 'system',
          remark: `生产完工入库: ${task_code}`,
          batchNumber: batch_number,
          productionDate: production_date,
        },
        connection
      );

      logger.info(
        `✅ 成品批次入库(单表架构): ${product_code} - ${batch_number}, 数量: ${produced_quantity}`
      );

      return {
        material_id: product_id,
        material_code: product_code,
        material_name: product_name,
        batch_number,
        quantity: produced_quantity,
        unit_cost: productionCost.unit_cost,
        total_cost: productionCost.total_cost,
      };
    } catch (error) {
      logger.error('创建成品批次失败:', error);
      throw error;
    }
  }

  /**
   * 处理消耗物料的FIFO出库 (单表架构版本)
   */
  static async processConsumedMaterials(connection, taskId, consumedMaterials, operator) {
    try {
      const InventoryService = require('../InventoryService');

      for (const material of consumedMaterials) {
        // ✅ 从 v_batch_stock 视图获取FIFO批次
        const [fifoBatches] = await connection.execute(
          `
          SELECT 
            vbs.*,
            m.code as material_code
          FROM v_batch_stock vbs
          LEFT JOIN materials m ON vbs.material_id = m.id
          WHERE vbs.material_id = ? AND vbs.current_quantity > 0
          ORDER BY vbs.receipt_date ASC
        `,
          [material.material_id]
        );

        let remainingQuantity = material.consumed_quantity;

        for (const batch of fifoBatches) {
          if (remainingQuantity <= 0) break;

          const allocatedQuantity = Math.min(batch.current_quantity, remainingQuantity);

          // ✅ 使用 InventoryService 更新库存
          await InventoryService.updateStock(
            {
              materialId: material.material_id,
              locationId: batch.location_id,
              quantity: -allocatedQuantity,
              transactionType: 'outbound',
              referenceNo: material.outbound_no || `TASK-${taskId}`,
              referenceType: 'production_consume',
              operator: operator || 'system',
              remark: `生产消耗: 任务${taskId}`,
              batchNumber: batch.batch_number,
            },
            connection
          );

          remainingQuantity -= allocatedQuantity;

          logger.info(
            `📤 FIFO出库(单表架构): ${material.material_code} - ${batch.batch_number}, 消耗: ${allocatedQuantity}`
          );
        }

        if (remainingQuantity > 0) {
          logger.warn(`⚠️ 物料 ${material.material_code} 库存不足，缺少: ${remainingQuantity}`);
        }
      }
    } catch (error) {
      logger.error('处理消耗物料FIFO出库失败:', error);
      throw error;
    }
  }

  /**
   * 建立原材料到成品的追溯关系 (单表架构版本)
   */
  static async createMaterialToProductTraceability(
    connection,
    productBatchNumber,
    consumedMaterials
  ) {
    try {
      for (const material of consumedMaterials) {
        // ✅ 从 inventory_ledger 获取消耗的批次
        const [consumedBatches] = await connection.execute(
          `
          SELECT DISTINCT 
            batch_number,
            ABS(SUM(quantity)) as quantity
          FROM inventory_ledger
          WHERE material_id = ? 
            AND transaction_type = 'outbound'
            AND reference_no = ?
            AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
          GROUP BY batch_number
        `,
          [material.material_id, material.outbound_no]
        );

        for (const consumedBatch of consumedBatches) {
          // 创建追溯关系记录（使用batch_number作为标识）
          await connection.execute(
            `
            INSERT INTO batch_traceability_relations (
              source_batch_id, target_batch_id, relation_type,
              source_quantity, target_quantity, created_at
            ) VALUES (?, ?, ?, ?, ?, NOW())
          `,
            [
              consumedBatch.batch_number, // 改用批次号
              productBatchNumber,
              'material_to_product',
              consumedBatch.quantity,
              0,
            ]
          );
        }
      }
    } catch (error) {
      logger.error('建立追溯关系失败:', error);
      // 不抛出错误，追溯关系失败不影响主流程
    }
  }

  /**
   * 计算生产成本 (单表架构版本)
   */
  static async calculateProductionCost(connection, taskId) {
    try {
      // ✅ 从 inventory_ledger 计算消耗的物料成本
      const [costResult] = await connection.execute(
        `
        SELECT 
          SUM(ABS(il.quantity) * COALESCE(il.unit_cost, 0)) AS total_material_cost,
          COUNT(DISTINCT il.material_id) AS material_count
        FROM inventory_ledger il
        WHERE il.reference_type = 'production_consume'
          AND il.reference_no LIKE CONCAT('%', ?, '%')
          AND il.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
          AND il.quantity < 0
      `,
        [taskId]
      );

      const materialCost = costResult[0]?.total_material_cost || 0;

      // 简化的成本计算，实际应该包括人工成本、制造费用等
      const totalCost = materialCost * 1.2; // 假设总成本是材料成本的1.2倍

      return {
        material_cost: materialCost,
        total_cost: totalCost,
        unit_cost: totalCost,
      };
    } catch (error) {
      logger.error('计算生产成本失败:', error);
      return {
        material_cost: 0,
        total_cost: 0,
        unit_cost: 0,
      };
    }
  }

  /**
   * 获取成品批次的完整追溯信息 (单表架构版本)
   */
  static async getProductBatchTraceability(materialCode, batchNumber) {
    const connection = await db.pool.getConnection();

    try {
      // ✅ 从 v_batch_stock 视图获取成品批次信息
      const [productBatch] = await connection.execute(
        `
        SELECT 
          vbs.*,
          m.code as material_code,
          m.name as material_name,
          u.name as unit
        FROM v_batch_stock vbs
        LEFT JOIN materials m ON vbs.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE m.code = ? AND vbs.batch_number = ?
      `,
        [materialCode, batchNumber]
      );

      if (!productBatch || productBatch.length === 0) {
        throw new Error(`未找到成品批次: ${materialCode} - ${batchNumber}`);
      }

      const batch = productBatch[0];

      // ✅ 获取消耗的原材料批次（基于关系表，使用batch_number）
      const [consumedMaterials] = await connection.execute(
        `
        SELECT 
          m.code as material_code,
          m.name as material_name,
          btr.source_batch_id as batch_number,
          vbs.supplier_name,
          vbs.receipt_date,
          btr.source_quantity AS consumed_quantity,
          vbs.unit_cost
        FROM batch_traceability_relations btr
        LEFT JOIN v_batch_stock vbs ON btr.source_batch_id = vbs.batch_number
        LEFT JOIN materials m ON vbs.material_id = m.id
        WHERE btr.target_batch_id = ? AND btr.relation_type = 'material_to_product'
        ORDER BY vbs.receipt_date ASC
      `,
        [batchNumber]
      );

      // ✅ 从 inventory_ledger 获取流转记录
      const [transactions] = await connection.execute(
        `
        SELECT * FROM inventory_ledger 
        WHERE batch_number = ?
        ORDER BY created_at ASC
      `,
        [batchNumber]
      );

      return {
        success: true,
        data: {
          batch_info: batch,
          consumed_materials: consumedMaterials,
          transaction_history: transactions,
          production_info: {
            production_date: batch.production_date,
          },
        },
      };
    } catch (error) {
      logger.error('获取成品批次追溯失败:', error);
      return {
        success: false,
        message: error.message,
      };
    } finally {
      connection.release();
    }
  }
}

module.exports = ProductionTraceabilityService;
