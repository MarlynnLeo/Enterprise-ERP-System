/**
 * 库存流转追溯服务
 * 记录每个批次的入库、出库、转移等操作，实现完整的库存流转追溯
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const BatchManagementService = require('./BatchManagementService');

const toRows = (result) => (Array.isArray(result?.rows) ? result.rows : (result?.rows ? [result.rows] : []));

class InventoryTraceabilityService {
  /**
   * 处理采购入库追溯
   * @param {Object} receiptData - 入库数据
   * @returns {Promise<Object>} - 处理结果
   */
  /**
   * 处理采购入库追溯
   * @param {Object} receiptData - 入库数据
   * @param {Object} [externalConnection] - 外部数据库连接（可选，用于事务统一）
   * @returns {Promise<Object>} - 处理结果
   */
  static async handlePurchaseReceipt(receiptData, externalConnection = null) {
    // 如果提供了外部连接，使用外部连接；否则创建新连接
    const connection = externalConnection || (await db.pool.getConnection());
    const isExternalTransaction = !!externalConnection;

    try {
      // 只有在非外部事务时才开启新事务
      if (!isExternalTransaction) {
        await connection.beginTransaction();
      }

      const {
        receipt_id,
        receipt_no,
        supplier_id,
        supplier_name,
        receipt_date,
        items, // [{ material_id, material_code, material_name, quantity, unit, batch_number, unit_cost }]
        operator,
      } = receiptData;

      const createdBatches = [];

      // 逐个物料项目创建批次
      for (const item of items) {
        // 生成批次号（如果没有提供）
        const batchNumber =
          item.batch_number || (await this.generateBatchNumber(item.material_code));

        // 创建批次库存记录
        const batchData = {
          material_id: item.material_id,
          material_code: item.material_code,
          material_name: item.material_name,
          batch_number: batchNumber,
          supplier_id,
          supplier_name,
          original_quantity: item.quantity,
          unit: item.unit,
          production_date: item.production_date,
          receipt_date,
          expiry_date: item.expiry_date,
          warehouse_id: item.warehouse_id,
          warehouse_name: item.warehouse_name,
          location: item.location,
          unit_cost: item.unit_cost,
          purchase_order_id: item.purchase_order_id,
          purchase_order_no: item.purchase_order_no,
          receipt_id,
          receipt_no,
          inspection_id: item.inspection_id,
          created_by: operator,
        };

        // ✅ 传递 connection 给 BatchManagementService
        const batch = await BatchManagementService.createBatch(batchData, connection);
        createdBatches.push(batch);

        logger.info(`创建批次: ${item.material_code} - ${batchNumber}, 数量: ${item.quantity}`);
      }

      if (!isExternalTransaction) {
        await connection.commit();
      }

      return {
        success: true,
        receipt_id,
        receipt_no,
        created_batches: createdBatches.length,
        batch_details: createdBatches,
      };
    } catch (error) {
      if (!isExternalTransaction) {
        await connection.rollback();
      }
      logger.error('处理采购入库追溯失败:', error);
      throw error;
    } finally {
      if (!isExternalTransaction) {
        connection.release();
      }
    }
  }

  /**
   * 处理生产入库追溯
   * @param {Object} productionData - 生产入库数据
   * @returns {Promise<Object>} - 处理结果
   */
  static async handleProductionInbound(productionData, externalConn = null) {
    const isExternalConn = !!externalConn;
    const connection = externalConn || await db.pool.getConnection();

    try {
      if (!isExternalConn) await connection.beginTransaction();

      const {
        production_task_id,
        production_order_no,
        product_id,
        product_code,
        product_name,
        batch_number,
        produced_quantity,
        unit,
        production_date,
        warehouse_id,
        warehouse_name,
        location,
        consumed_materials, // [{ material_id, material_code, batch_number, consumed_quantity }]
        operator,
        remarks,
      } = productionData;

      // 1. 创建成品批次
      const productBatch = await BatchManagementService.createBatch({
        material_id: product_id,
        material_code: product_code,
        material_name: product_name,
        batch_number,
        original_quantity: produced_quantity,
        unit,
        production_date,
        receipt_date: production_date || new Date(),
        warehouse_id,
        warehouse_name,
        location,
        unit_cost: 0, // 生产成本需要单独计算
        transaction_type: 'production_inbound',
        reference_type: 'production_task',
        reference_no: production_order_no || `TASK-${production_task_id}`,
        reference_id: production_task_id,
        created_by: operator,
      }, connection);

      // 2. 记录原料消耗关系
      const consumptionRecords = [];
      for (const material of consumed_materials || []) {
        // 查找对应的原料批次
        const materialBatches = await BatchManagementService.getBatchByMaterialAndBatch(
          material.material_code,
          material.batch_number
        );

        if (materialBatches.length > 0) {
          const materialBatch = materialBatches[0];

          // 创建批次关联关系
          await this.createBatchRelationship({
            parent_batch_id: materialBatch.id,
            child_batch_id: productBatch.id,
            parent_material_code: material.material_code,
            child_material_code: product_code,
            parent_batch_number: material.batch_number,
            child_batch_number: batch_number,
            relationship_type: 'consume',
            consumed_quantity: material.consumed_quantity,
            produced_quantity: produced_quantity,
            process_type: 'production',
            reference_type: 'production_task',
            reference_id: production_task_id,
            reference_no: production_order_no,
            operator,
            remarks: `生产消耗 - ${remarks || ''}`,
          }, connection);

          consumptionRecords.push({
            material_code: material.material_code,
            batch_number: material.batch_number,
            consumed_quantity: material.consumed_quantity,
          });
        }
      }

      if (!isExternalConn) await connection.commit();

      return {
        success: true,
        production_task_id,
        product_batch: productBatch,
        consumption_records: consumptionRecords,
      };
    } catch (error) {
      if (!isExternalConn) await connection.rollback();
      logger.error('处理生产入库追溯失败:', error);
      throw error;
    } finally {
      if (!isExternalConn) connection.release();
    }
  }

  /**
   * 创建批次关联关系
   * @param {Object} relationshipData - 关系数据
   */
  static async createBatchRelationship(relationshipData, externalConnection = null) {
    const query = `
      INSERT INTO batch_relationships (
        parent_batch_id, child_batch_id, parent_material_code, child_material_code,
        parent_batch_number, child_batch_number, relationship_type, consumed_quantity,
        produced_quantity, conversion_ratio, process_type, reference_type,
        reference_id, reference_no, operator, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const conversion_ratio =
      relationshipData.produced_quantity > 0
        ? relationshipData.consumed_quantity / relationshipData.produced_quantity
        : 1;

    const params = [
      relationshipData.parent_batch_id,
      relationshipData.child_batch_id,
      relationshipData.parent_material_code,
      relationshipData.child_material_code,
      relationshipData.parent_batch_number,
      relationshipData.child_batch_number,
      relationshipData.relationship_type,
      relationshipData.consumed_quantity,
      relationshipData.produced_quantity,
      conversion_ratio,
      relationshipData.process_type,
      relationshipData.reference_type,
      relationshipData.reference_id,
      relationshipData.reference_no,
      relationshipData.operator,
      relationshipData.remarks,
    ];

    if (externalConnection) {
      await externalConnection.execute(query, params);
      return;
    }

    await db.query(query, params);
  }

  /**
   * 生成批次号 (单表架构版本)
   * @param {string} materialCode - 物料编码
   * @returns {Promise<string>} - 批次号
   */
  static async generateBatchNumber(materialCode) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = materialCode.substring(0, 4).toUpperCase();

    // ✅ 从 inventory_ledger 查询当天该物料的批次数量
    const query = `
      SELECT COUNT(DISTINCT batch_number) as count
      FROM inventory_ledger
      WHERE batch_number LIKE ? AND DATE(created_at) = CURDATE()
    `;

    const result = await db.query(query, [`${prefix}${today}%`]);
    const count = (result.rows && result.rows[0] ? result.rows[0].count : 0) + 1;

    return `${prefix}${today}${count.toString().padStart(3, '0')}`;
  }

  /**
   * 获取批次的完整追溯链路
   * @param {string} materialCode - 物料编码
   * @param {string} batchNumber - 批次号
   * @param {string} direction - 追溯方向 ('forward' | 'backward')
   * @returns {Promise<Object>} - 追溯链路
   */
  static async getBatchTraceabilityChain(materialCode, batchNumber, direction = 'forward') {
    try {
      // 查找起始批次
      const startBatch = await this.findBatchByCodeAndNumber(materialCode, batchNumber);

      if (!startBatch) {
        throw new Error(`未找到批次: ${materialCode} - ${batchNumber}`);
      }

      let traceabilityChain;

      if (direction === 'forward') {
        // 正向追溯：从原料到成品
        traceabilityChain = await this.traceForward(startBatch);
      } else {
        // 反向追溯：从成品到原料
        traceabilityChain = await this.traceBackward(startBatch);
      }

      return {
        success: true,
        direction,
        start_batch: {
          material_code: startBatch.material_code,
          material_name: startBatch.material_name,
          batch_number: startBatch.batch_number,
          quantity: startBatch.current_quantity,
          receipt_date: startBatch.receipt_date,
        },
        traceability_chain: traceabilityChain,
      };
    } catch (error) {
      logger.error('获取批次追溯链路失败:', error);
      throw error;
    }
  }

  /**
   * 正向追溯：从原料到成品
   * @param {Object} startBatch - 起始批次
   * @returns {Promise<Array>} - 追溯链路
   */
  static async traceForward(startBatch) {
    const chain = [];
    const visited = new Set();

    const traceRecursive = async (batch, level = 0) => {
      const batchKey = `${batch.material_code}_${batch.batch_number}`;

      if (visited.has(batchKey) || level > 10) {
        // 防止无限循环
        return;
      }

      visited.add(batchKey);

      // 查找该批次作为父批次的关系
      const query = `
        SELECT
          br.*,
          m.code as child_material_code,
          m.name as child_material_name,
          b.batch_number as child_batch_number,
          b.current_quantity as child_quantity,
          b.receipt_date as child_receipt_date
        FROM batch_relationships br
        LEFT JOIN materials m ON m.code = br.child_material_code
        LEFT JOIN (
          SELECT
            il.material_id,
            il.batch_number,
            SUM(il.quantity) as current_quantity,
            COALESCE(MIN(CASE WHEN il.quantity > 0 THEN il.created_at END), MIN(il.created_at)) as receipt_date
          FROM inventory_ledger il
          GROUP BY il.material_id, il.batch_number
        ) b
          ON b.material_id = m.id
         AND b.batch_number = br.child_batch_number
        WHERE br.parent_material_code = ?
          AND br.parent_batch_number = ?
        ORDER BY br.created_at ASC
      `;

      const relationships = toRows(await db.query(query, [batch.material_code, batch.batch_number]));

      for (const rel of relationships) {
        const childBatch = {
          id: rel.child_batch_id || rel.child_batch_number,
          material_code: rel.child_material_code,
          material_name: rel.child_material_name,
          batch_number: rel.child_batch_number || rel.child_batch_id,
          current_quantity: rel.child_quantity,
          receipt_date: rel.child_receipt_date,
        };

        chain.push({
          level,
          relationship_type: rel.relationship_type,
          parent_batch: {
            material_code: batch.material_code,
            material_name: batch.material_name,
            batch_number: batch.batch_number,
          },
          child_batch: {
            material_code: childBatch.material_code,
            material_name: childBatch.material_name,
            batch_number: childBatch.batch_number,
          },
          consumed_quantity: rel.consumed_quantity,
          produced_quantity: rel.produced_quantity,
          conversion_ratio: rel.conversion_ratio,
          process_type: rel.process_type,
          reference_no: rel.reference_no,
          created_at: rel.created_at,
        });

        // 递归追溯子批次
        await traceRecursive(childBatch, level + 1);
      }
    };

    await traceRecursive(startBatch);

    return chain;
  }

  /**
   * 反向追溯：从成品到原料
   * @param {Object} startBatch - 起始批次
   * @returns {Promise<Array>} - 追溯链路
   */
  static async traceBackward(startBatch) {
    const chain = [];
    const visited = new Set();

    const traceRecursive = async (batch, level = 0) => {
      const batchKey = `${batch.material_code}_${batch.batch_number}`;

      if (visited.has(batchKey) || level > 10) {
        // 防止无限循环
        return;
      }

      visited.add(batchKey);

      // 查找该批次作为子批次的关系
      const query = `
        SELECT
          br.*,
          m.code as parent_material_code,
          m.name as parent_material_name,
          b.batch_number as parent_batch_number,
          b.current_quantity as parent_quantity,
          b.receipt_date as parent_receipt_date
        FROM batch_relationships br
        LEFT JOIN materials m ON m.code = br.parent_material_code
        LEFT JOIN (
          SELECT
            il.material_id,
            il.batch_number,
            SUM(il.quantity) as current_quantity,
            COALESCE(MIN(CASE WHEN il.quantity > 0 THEN il.created_at END), MIN(il.created_at)) as receipt_date
          FROM inventory_ledger il
          GROUP BY il.material_id, il.batch_number
        ) b
          ON b.material_id = m.id
         AND b.batch_number = br.parent_batch_number
        WHERE br.child_material_code = ?
          AND br.child_batch_number = ?
        ORDER BY br.created_at ASC
      `;

      const relationships = toRows(await db.query(query, [batch.material_code, batch.batch_number]));

      for (const rel of relationships) {
        const parentBatch = {
          id: rel.parent_batch_id || rel.parent_batch_number,
          material_code: rel.parent_material_code,
          material_name: rel.parent_material_name,
          batch_number: rel.parent_batch_number || rel.parent_batch_id,
          current_quantity: rel.parent_quantity,
          receipt_date: rel.parent_receipt_date,
        };

        chain.push({
          level,
          relationship_type: rel.relationship_type,
          child_batch: {
            material_code: batch.material_code,
            material_name: batch.material_name,
            batch_number: batch.batch_number,
          },
          parent_batch: {
            material_code: parentBatch.material_code,
            material_name: parentBatch.material_name,
            batch_number: parentBatch.batch_number,
          },
          consumed_quantity: rel.consumed_quantity,
          produced_quantity: rel.produced_quantity,
          conversion_ratio: rel.conversion_ratio,
          process_type: rel.process_type,
          reference_no: rel.reference_no,
          created_at: rel.created_at,
        });

        // 递归追溯父批次
        await traceRecursive(parentBatch, level + 1);
      }
    };

    await traceRecursive(startBatch);

    return chain;
  }

  /**
   * 根据物料编码和批次号查找批次
   * @param {string} materialCode - 物料编码
   * @param {string} batchNumber - 批次号
   * @returns {Promise<Object>} - 批次记录
   */
  static async findBatchByCodeAndNumber(materialCode, batchNumber) {
    // 单表架构：从库存台账汇总，保证当前库存为 0 的批次也可以追溯
    const query = `
      SELECT
        CONCAT(m.code, '_', il.batch_number) as id,
        il.material_id,
        il.batch_number,
        SUM(il.quantity) as current_quantity,
        SUM(CASE WHEN il.quantity > 0 THEN il.quantity ELSE 0 END) as original_quantity,
        COALESCE(MIN(CASE WHEN il.quantity > 0 THEN il.created_at END), MIN(il.created_at)) as receipt_date,
        m.code as material_code,
        m.name as material_name,
        u.name as unit
      FROM inventory_ledger il
      LEFT JOIN materials m ON il.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE m.code = ? AND il.batch_number = ?
      GROUP BY il.material_id, il.batch_number, m.code, m.name, u.name
      LIMIT 1
    `;

    const rows = toRows(await db.query(query, [materialCode, batchNumber]));
    return rows.length > 0 ? rows[0] : null;
  }
}

module.exports = InventoryTraceabilityService;
