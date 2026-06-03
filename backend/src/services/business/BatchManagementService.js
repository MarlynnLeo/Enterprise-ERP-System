/**
 * 批次管理核心服务
 * 实现批次创建、更新、查询和FIFO逻辑
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const InventoryService = require('../InventoryService');

class BatchManagementService {
  /**
   * 创建批次
   * @param {Object} batchData - 批次数据
   * @param {Object} [externalConnection] - 外部数据库连接（可选）
   * @returns {Promise<Object>} - 创建的批次记录
   */
  static async createBatch(batchData, externalConnection = null) {
    const connection = externalConnection || (await db.pool.getConnection());
    const isExternalTransaction = !!externalConnection;

    try {
      if (!isExternalTransaction) {
        await connection.beginTransaction();
      }

      const {
        material_id,
        material_code,
        material_name,
        batch_number,
        supplier_id,
        supplier_name,
        original_quantity,
        unit,
        production_date,
        receipt_date,
        expiry_date,
        warehouse_id,
        warehouse_name,
        unit_cost,
        purchase_order_id,
        purchase_order_no,
        receipt_id,
        receipt_no,
        transaction_type,
        transactionType,
        reference_type,
        referenceType,
        reference_no,
        referenceNo,
        transaction_date,
        transactionDate,
        created_by,
      } = batchData;

      // 写入 inventory_ledger 台账
      // 优先使用业务上下文判断交易类型，避免依赖单号前缀造成 RCV/GR 等编码规则差异断链。
      const refNo = reference_no || referenceNo || receipt_no || `BATCH-${batch_number}`;
      const refType = reference_type || referenceType || 'batch_create';
      let txType = transaction_type || transactionType || 'inbound';
      if (!transaction_type && !transactionType && (receipt_id || receipt_no || purchase_order_id || purchase_order_no)) {
        txType = 'purchase_inbound';
      } else if (!transaction_type && !transactionType && refNo.startsWith('PR')) {
        txType = 'production_inbound';
      }

      await InventoryService.updateStock(
        {
          materialId: material_id,
          locationId: warehouse_id,
          quantity: original_quantity,
          transactionType: txType,
          referenceNo: refNo,
          referenceType: refType,
          operator: created_by || 'system',
          remark: `批次入库: ${batch_number}`,
          unitId: unit ? await this._getUnitId(connection, unit) : null,
          batchNumber: batch_number,
          supplierId: supplier_id,
          supplierName: supplier_name,
          productionDate: production_date,
          expiryDate: expiry_date,
          warehouseName: warehouse_name,
          unitCost: unit_cost, // ✅ 新增：透传单价供成本核算
          purchaseOrderId: purchase_order_id, // ✅ 原生批次追踪属性透传
          purchaseOrderNo: purchase_order_no,
          receiptId: receipt_id,
          receiptNo: receipt_no,
          transactionDate: transaction_date || transactionDate || receipt_date,
        },
        connection
      );

      logger.info(`✅ 批次创建成功(单表架构): ${batch_number}, 数量: ${original_quantity}`);

      if (!isExternalTransaction) {
        await connection.commit();
      }

      // 返回批次信息（从视图查询）
      return {
        batch_number,
        material_id,
        material_code,
        material_name,
        current_quantity: original_quantity,
        supplier_name,
        warehouse_name,
        receipt_date: receipt_date || new Date(),
      };
    } catch (error) {
      if (!isExternalTransaction) {
        await connection.rollback();
      }
      logger.error('创建批次失败:', error);
      throw error;
    } finally {
      if (!isExternalTransaction) {
        connection.release();
      }
    }
  }

  // 辅助方法：获取单位ID
  static async _getUnitId(connection, unitName) {
    if (!unitName) return null;
    const [rows] = await connection.execute('SELECT id FROM units WHERE name = ? AND deleted_at IS NULL', [unitName]);
    return rows.length > 0 ? rows[0].id : null;
  }


  /**
   * 根据批次号获取批次记录 (单表架构版本)
   * @param {string} batchNumber - 批次号
   * @returns {Promise<Object>} - 批次记录
   */
  static async getBatchById(batchNumber) {
    try {
      // ✅ 单表架构：从 v_batch_stock 视图查询
      const query = `
        SELECT
          vbs.*,
          m.name as material_name,
          m.code as material_code,
          u.name as unit
        FROM v_batch_stock vbs
        LEFT JOIN materials m ON vbs.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE vbs.batch_number = ?
        LIMIT 1
      `;

      const result = await db.query(query, [batchNumber]);
      return result.rows && result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('获取批次记录失败:', error);
      throw error;
    }
  }

  /**
   * 根据物料和批次号获取批次记录 (单表架构版本)
   * @param {string} materialCode - 物料编码
   * @param {string} batchNumber - 批次号
   * @returns {Promise<Array>} - 批次记录列表
   */
  static async getBatchByMaterialAndBatch(materialCode, batchNumber) {
    try {
      // ✅ 单表架构：从 v_batch_stock 视图查询
      const query = `
        SELECT
          vbs.*,
          m.name as material_name,
          m.code as material_code,
          u.name as unit
        FROM v_batch_stock vbs
        LEFT JOIN materials m ON vbs.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE m.code = ? AND vbs.batch_number = ?
        ORDER BY vbs.receipt_date ASC
      `;

      const result = await db.query(query, [materialCode, batchNumber]);
      return result.rows || [];
    } catch (error) {
      logger.error('获取批次记录失败:', error);
      throw error;
    }
  }

  /**
   * 获取物料的FIFO出库顺序
   * @param {number} materialId - 物料ID
   * @param {number} requiredQuantity - 需要数量
   * @returns {Promise<Array>} - FIFO出库批次列表
   */
  static async getFIFOOutboundBatches(materialId, requiredQuantity, excludeReservationOrderId = null) {
    // ✅ 单表架构：直接从批次库存视图查询 (v_batch_stock)
    const query = `
      SELECT
        material_id,
        location_id,
        batch_number,
        current_quantity as available_quantity,
        receipt_date,
        expiry_date,
        unit_cost,
        warehouse_name,
        supplier_name
      FROM v_batch_stock
      WHERE material_id = ?
        AND current_quantity > 0
      ORDER BY receipt_date ASC
    `;

    const result = await db.query(query, [materialId]);
    const batches = result.rows || [];

    // H9 修复：扣减其他订单的 active 预留，避免 FIFO 出库把已为别的订单预留的库存发走。
    // 销售出库排除本订单自身的预留（本单出库本应消费自己的预留）。
    // 注：预留为 (material, location) 级，此处按 material 汇总做总量上限管控。
    let reservedSql = `
      SELECT COALESCE(SUM(reserved_quantity), 0) AS reserved
      FROM inventory_reservations
      WHERE material_id = ? AND status = 'active'
    `;
    const reservedParams = [materialId];
    if (excludeReservationOrderId) {
      reservedSql += ' AND order_id != ?';
      reservedParams.push(excludeReservationOrderId);
    }
    const reservedResult = await db.query(reservedSql, reservedParams);
    const reservedByOthers = parseFloat((reservedResult.rows || [])[0]?.reserved || 0);

    const totalOnHand = batches.reduce((sum, b) => sum + parseFloat(b.available_quantity || 0), 0);
    // 本次可分配总量上限 = 批次现有量合计 - 其他订单已预留量
    let allocatableTotal = Math.max(0, totalOnHand - reservedByOthers);

    // 计算FIFO分配
    const allocatedBatches = [];
    let remainingQuantity = requiredQuantity;

    for (const batch of batches) {
      if (remainingQuantity <= 0 || allocatableTotal <= 0) break;

      const batchAvailable = parseFloat(batch.available_quantity || 0);
      // 单批次分配量同时受批次现有量、剩余需求、剩余可分配总量约束
      const allocatedQuantity = Math.min(batchAvailable, remainingQuantity, allocatableTotal);
      if (allocatedQuantity <= 0) continue;

      allocatedBatches.push({
        ...batch,
        allocated_quantity: allocatedQuantity,
        remaining_in_batch: batchAvailable - allocatedQuantity,
      });

      remainingQuantity -= allocatedQuantity;
      allocatableTotal -= allocatedQuantity;
    }

    return {
      allocated_batches: allocatedBatches,
      total_allocated: requiredQuantity - remainingQuantity,
      shortage: remainingQuantity > 0 ? remainingQuantity : 0,
    };
  }

  /**
   * 执行FIFO出库
   * @param {Object} outboundData - 出库数据
   * @returns {Promise<Object>} - 出库结果
   */
  static async executeFIFOOutbound(outboundData, externalConnection = null) {
    // 支持复用外层事务连接：传入 externalConnection 时不自管事务，由调用方统一提交/回滚，
    // 避免多物料出库时各自独立提交导致"部分成功、无法整体回滚"
    const connection = externalConnection || (await db.pool.getConnection());
    const ownTransaction = !externalConnection;

    try {
      if (ownTransaction) await connection.beginTransaction();

      const {
        material_id,
        required_quantity,
      } = outboundData;

      // 在进入 FIFO 视图前，强制对该物料的台账加悲观锁，防止并发分配相同的老批次库存
      await connection.query(
        'SELECT material_id FROM inventory_ledger WHERE material_id = ? FOR UPDATE',
        [material_id]
      );

      // 1. 获取FIFO出库批次（销售出库排除本订单自身的预留，避免被自己的预留挡住）
      const excludeReservationOrderId =
        outboundData.reference_type === 'sales_outbound' ? outboundData.reference_id : null;
      const fifoResult = await this.getFIFOOutboundBatches(
        material_id,
        required_quantity,
        excludeReservationOrderId
      );

      if (fifoResult.shortage > 0) {
        throw new Error(`库存不足，缺少 ${fifoResult.shortage} 单位`);
      }

      const outboundRecords = [];

      // 2. 逐批次执行出库
      for (const batch of fifoResult.allocated_batches) {
        // ✅ 使用 InventoryService 更新库存 (Single Table Truth)
        await InventoryService.updateStock(
          {
            materialId: material_id,
            locationId: batch.location_id,
            quantity: -batch.allocated_quantity, // 负数表示出库
            transactionType: outboundData.reference_type || 'fifo_outbound',
            referenceNo: outboundData.reference_no || '',
            referenceType: outboundData.reference_type || 'fifo_outbound',
            operator: outboundData.operator || 'system',
            remark: `FIFO出库: 批次 ${batch.batch_number}, 数量 ${batch.allocated_quantity}${outboundData.remarks ? ' - ' + outboundData.remarks : ''}`,
            batchNumber: batch.batch_number,
            unitCost: batch.unit_cost || 0,
          },
          connection
        );

        outboundRecords.push({
          batch_number: batch.batch_number,
          allocated_quantity: batch.allocated_quantity,
          unit_cost: batch.unit_cost,
          total_cost: batch.allocated_quantity * (batch.unit_cost || 0),
        });
      }

      if (ownTransaction) await connection.commit();

      return {
        success: true,
        total_quantity: fifoResult.total_allocated,
        outbound_records: outboundRecords,
        total_cost: outboundRecords.reduce((sum, record) => sum + record.total_cost, 0),
      };
    } catch (error) {
      if (ownTransaction) await connection.rollback();
      logger.error('FIFO出库失败:', error);
      throw error;
    } finally {
      if (ownTransaction) connection.release();
    }
  }

  /**
   * 获取物料库存汇总 (单表架构版本)
   * @param {number} materialId - 物料ID
   * @returns {Promise<Object>} - 库存汇总
   */
  static async getMaterialInventorySummary(materialId) {
    // ✅ 从 v_batch_stock 视图获取汇总
    const query = `
      SELECT
        vbs.material_id,
        m.code as material_code,
        m.name as material_name,
        COUNT(DISTINCT vbs.batch_number) as batch_count,
        SUM(vbs.current_quantity) as total_quantity,
        SUM(vbs.current_quantity) as available_quantity,
        0 as reserved_quantity,
        MIN(vbs.receipt_date) as earliest_receipt_date,
        MAX(vbs.receipt_date) as latest_receipt_date,
        AVG(vbs.unit_cost) as avg_unit_cost,
        SUM(vbs.current_quantity * COALESCE(vbs.unit_cost, 0)) as total_cost,
        u.name as unit
      FROM v_batch_stock vbs
      LEFT JOIN materials m ON vbs.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE vbs.material_id = ? AND vbs.current_quantity > 0
      GROUP BY vbs.material_id, m.code, m.name, u.name
    `;

    const result = await db.query(query, [materialId]);
    return result.rows && result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * 获取批次流转历史 (单表架构版本)
   * @param {string} batchNumber - 批次号
   * @returns {Promise<Array>} - 流转历史
   */
  static async getBatchTransactionHistory(batchNumber) {
    // ✅ 从 inventory_ledger 获取流转历史
    const query = `
      SELECT
        il.*,
        DATE_FORMAT(il.created_at, '%Y-%m-%d %H:%i:%s') as formatted_date
      FROM inventory_ledger il
      WHERE il.batch_number = ?
      ORDER BY il.created_at DESC, il.id DESC
    `;

    const result = await db.query(query, [batchNumber]);
    return result.rows || [];
  }

  /**
   * 批次预留 (单表架构版本)
   * @param {Object} reserveData - 预留数据
   * @returns {Promise<Object>} - 预留结果
   */
  static async reserveBatch(reserveData) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        material_id,
        required_quantity,
        reference_type,
        reference_id,
        reference_no,
        operator,
        remarks,
      } = reserveData;

      // 在进入 FIFO 视图前，强制对该物料的台账加悲观锁
      await connection.query(
        'SELECT material_id FROM inventory_ledger WHERE material_id = ? FOR UPDATE',
        [material_id]
      );

      // 获取FIFO批次 (从 v_batch_stock 视图)
      const fifoResult = await this.getFIFOOutboundBatches(material_id, required_quantity);

      if (fifoResult.shortage > 0) {
        throw new Error(`库存不足，无法预留 ${fifoResult.shortage} 单位`);
      }

      const reserveRecords = [];

      // 逐批次执行预留 - 写入 inventory_reservations 表
      for (const batch of fifoResult.allocated_batches) {
        // ✅ 单表架构: 写入预留记录到 inventory_reservations 表
        await connection.execute(
          `
          INSERT INTO inventory_reservations (
            material_id, location_id, batch_number, reserved_quantity,
            reference_type, reference_id, reference_no, operator, remarks, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `,
          [
            material_id,
            batch.location_id,
            batch.batch_number,
            batch.allocated_quantity,
            reference_type,
            reference_id,
            reference_no,
            operator,
            remarks || '批次预留',
          ]
        );


        reserveRecords.push({
          batch_number: batch.batch_number,
          reserved_quantity: batch.allocated_quantity,
        });
      }

      await connection.commit();

      return {
        success: true,
        total_reserved: fifoResult.total_allocated,
        reserve_records: reserveRecords,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('批次预留失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = BatchManagementService;
