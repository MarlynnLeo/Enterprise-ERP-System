/**
 * InventoryService.js
 * @description 服务层文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const db = require('../config/db');
const cacheService = require('./cacheService'); // ✅ 新增：缓存服务

/**
 * 统一的库存管理服务 - 单表架构版本
 *
 * 核心设计理念：
 * 1. 单一数据源：inventory_ledger 表记录所有库存变动
 * 2. 当前库存通过 SUM(quantity) 计算得出
 * 3. 天然数据一致性，无需同步机制
 * 4. 简化的查询和更新逻辑
 * 5. ✅ 新增：支持缓存层，提高查询性能
 *
 * 数据模型：
 * - inventory_ledger: 统一的库存台账表（正数入库，负数出库）
 * - v_current_stock: 当前库存视图（自动计算）
 */
class InventoryService {
  /**
   * 获取物料在指定库位的当前库存数量
   *
   * 单表架构版本：直接从 inventory_ledger 表计算当前库存
   * ✅ 新增：支持缓存，减少数据库查询
   * 优势：天然数据一致性，无需复杂的验证和修复逻辑
   *
   * @param {number} materialId - 物料ID
   * @param {number} locationId - 库位ID
   * @param {Object} connection - 数据库连接（可选，用于事务）
   * @param {boolean} withLock - 是否使用行级锁（默认false）
   * @param {boolean} useCache - 是否使用缓存（默认true）
   * @returns {Promise<number>} 当前库存数量
   */
  static async getCurrentStock(
    materialId,
    locationId,
    connection = null,
    withLock = false,
    useCache = true
  ) {
    const conn = connection || db.pool;

    try {
      // 参数验证
      if (!materialId || !locationId) {
        throw new Error(`无效的参数: materialId=${materialId}, locationId=${locationId}`);
      }

      // ✅ 新增：检查缓存
      const cacheKey = `inventory_${materialId}_${locationId}`;
      if (useCache && !withLock) {
        // 使用锁时不使用缓存
        const cached = cacheService.get(cacheKey);
        if (cached !== undefined) {
          logger.info(`[缓存命中] 库存查询: ${cacheKey}`);
          return cached;
        }
      }

      const lockSql = withLock ? ' FOR UPDATE' : '';

      // 直接从 inventory_ledger 表计算当前库存
      const [result] = await conn.execute(
        `SELECT COALESCE(SUM(quantity), 0) as current_stock
         FROM inventory_ledger
         WHERE material_id = ? AND location_id = ?${lockSql}`,
        [materialId, locationId]
      );

      const quantity = parseFloat(result[0].current_stock);

      // ✅ 新增：缓存结果（5分钟过期）
      if (useCache && !withLock) {
        cacheService.set(cacheKey, quantity, 300);
        logger.info(`[缓存设置] 库存查询: ${cacheKey}, 值: ${quantity}`);
      }

      return quantity;
    } catch (error) {
      logger.error(`获取库存失败 [materialId=${materialId}, locationId=${locationId}]:`, error);
      throw new Error(`获取库存失败: ${error.message}`);
    }
  }

  /**
   * 批量获取多个物料的库存信息
   *
   * 单表架构版本：直接从 inventory_ledger 表聚合计算
   *
   * @param {Array} materialLocationPairs - [{material_id, location_id}, ...]
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Array>} 库存信息数组
   */
  static async getBatchStock(materialLocationPairs, connection = null) {
    const conn = connection || db.pool;

    if (!materialLocationPairs || materialLocationPairs.length === 0) {
      return [];
    }

    try {
      // 构建批量查询条件
      const conditions = materialLocationPairs
        .map(() => '(material_id = ? AND location_id = ?)')
        .join(' OR ');
      const params = materialLocationPairs.flatMap((pair) => [pair.material_id, pair.location_id]);

      // 一次性查询所有库存
      const [results] = await conn.execute(
        `SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity
         FROM inventory_ledger
         WHERE ${conditions}
         GROUP BY material_id, location_id`,
        params
      );

      // 补充没有记录的物料-库位组合
      const resultMap = new Map();
      results.forEach((row) => {
        const key = `${row.material_id}-${row.location_id}`;
        resultMap.set(key, parseFloat(row.quantity));
      });

      return materialLocationPairs.map(({ material_id, location_id }) => {
        const key = `${material_id}-${location_id}`;
        return {
          material_id,
          location_id,
          quantity: resultMap.get(key) || 0,
        };
      });
    } catch (error) {
      throw new Error(`批量获取库存失败: ${error.message}`);
    }
  }

  /**
   * 更新库存数量
   *
   * 单表架构版本：只需要插入一条记录到 inventory_ledger 表
   * 优势：操作简单，天然原子性，无需复杂的同步逻辑
   *
   * @param {Object} params - 更新参数
   * @param {number} params.materialId - 物料ID
   * @param {number} params.locationId - 库位ID
   * @param {number} params.quantity - 变动数量（正数为增加，负数为减少）
   * @param {string} params.transactionType - 事务类型
   * @param {string} params.referenceNo - 参考单号
   * @param {string} params.referenceType - 参考类型
   * @param {string} params.operator - 操作员
   * @param {string} params.remark - 备注
   * @param {number} params.unitId - 单位ID
   * @param {string} params.batchNumber - 批次号
   * @param {Object} connection - 数据库连接（必须在事务中调用）
   * @returns {Promise<Object>} 更新结果
   */
  static async updateStock(
    {
      materialId,
      locationId,
      quantity,
      transactionType,
      referenceNo,
      referenceType,
      operator,
      remark = '',
      unitId = null,
      batchNumber = null,
      supplierId = null,
      supplierName = null,
      productionDate = null,
      expiryDate = null,
      warehouseName = null,
      issue_reason = null,
      is_excess = 0,
      bom_required_qty = null,
      total_issued_qty = null,
      allowNegativeStock = false,
      unitCost = null, // 新增参数：入库时传入的实际成本单价
      purchaseOrderId = null, // 原生批次身份证属性
      purchaseOrderNo = null, // 原生批次身份证属性
      receiptId = null, // 原生批次身份证属性
      receiptNo = null, // 原生批次身份证属性
    },
    connection
  ) {
    // 1. 前置验证
    if (!connection) {
      throw new Error('updateStock必须在数据库事务中调用');
    }

    if (!materialId || !locationId) {
      throw new Error(`无效的参数: materialId=${materialId}, locationId=${locationId}`);
    }

    if (isNaN(quantity) || quantity === 0) {
      throw new Error(`无效的数量: ${quantity}`);
    }

    if (!transactionType || !referenceNo || !operator) {
      throw new Error(
        `缺少必要参数: transactionType=${transactionType}, referenceNo=${referenceNo}, operator=${operator}`
      );
    }

    // ✅ 入库时强制要求批次号：若调用方未传，则按业务规则自动生成，确保台账中永远没有空批次
    const isInboundOperation = parseFloat(quantity) > 0;
    if (isInboundOperation && !batchNumber) {
      // 生成规则：{入库类型前缀}-{单据号}-{物料ID}
      const typePrefix = (transactionType || 'in').toUpperCase().replace(/_/g, '-');
      batchNumber = `${typePrefix}-${referenceNo}-${materialId}`;
      logger.warn(`[批次号自动生成] 入库操作未提供批次号，已自动生成: ${batchNumber}，来源: transactionType=${transactionType}, referenceNo=${referenceNo}`);
    }

    const startTime = Date.now();

    try {
      // 2. 使用行级锁获取当前库存
      const beforeQuantity = await this.getCurrentStock(materialId, locationId, connection, true);

      // 3. 计算变动数量（统一为正数入库，负数出库）
      let changeQuantity = parseFloat(quantity);
      if (
        ['outbound', 'transfer_out', 'purchase_return'].includes(transactionType) &&
        changeQuantity > 0
      ) {
        changeQuantity = -changeQuantity;
      }

      // 4. 计算变动后数量
      const afterQuantity = beforeQuantity + changeQuantity;

      // 5. 业务规则验证
      // 排除调整类型和撤销出库类型的库存不足检查
      // outbound_cancel 是增加库存的操作，应该被允许即使库存是负数
      if (
        afterQuantity < 0 &&
        !allowNegativeStock &&
        !['adjustment', 'correction', 'outbound_cancel'].includes(transactionType)
      ) {
        throw new Error(
          `库存不足: 当前库存 ${beforeQuantity}, 需要 ${Math.abs(changeQuantity)}, 差额 ${Math.abs(afterQuantity)}`
        );
      }
      // 如果允许负库存并且真实发生负库存，打印警告
      if (afterQuantity < 0 && allowNegativeStock && changeQuantity < 0) {
        logger.warn(`[库存警告] 允许负库存出库: 物料${materialId} @ ${locationId}, 当前${beforeQuantity}, 出库${Math.abs(changeQuantity)}, 变动后${afterQuantity}`);
      }

      // 6. 验证物料和库位是否存在
      await this._validateMaterialAndLocation(materialId, locationId, connection);

      // 6.5 记录交易单价 (不再反写物料主数据的 cost_price，遵照标准成本法)
      let actualUnitCost = unitCost !== null ? parseFloat(unitCost) : 0;

      // FIFO批次处理：如果是扣减库存且没有提供批次号，则自动按FIFO拆分批次
      let finalBatchNumbers = [];
      if (changeQuantity < 0 && !batchNumber) {
        const outboundQuantity = Math.abs(changeQuantity);
        const [batchRecords] = await connection.query(
          `SELECT batch_number, SUM(quantity) as batch_quantity
           FROM inventory_ledger
           WHERE material_id = ? AND location_id = ?
             AND batch_number IS NOT NULL AND batch_number != ''
           GROUP BY batch_number
           HAVING batch_quantity > 0
           ORDER BY MIN(created_at) ASC`,
          [materialId, locationId]
        );

        let remainingQuantity = outboundQuantity;
        const tempBatchMap = new Map();

        for (const batch of batchRecords) {
          if (remainingQuantity <= 0) break;
          const deductQty = Math.min(parseFloat(batch.batch_quantity), remainingQuantity);
          
          if (tempBatchMap.has(batch.batch_number)) {
            tempBatchMap.set(batch.batch_number, tempBatchMap.get(batch.batch_number) + deductQty);
          } else {
            tempBatchMap.set(batch.batch_number, deductQty);
          }
          
          remainingQuantity -= deductQty;
        }

        // 收集聚合后的批次和扣减量
        for (const [bNum, bQty] of tempBatchMap.entries()) {
          finalBatchNumbers.push({
            batchNumber: bNum,
            quantity: bQty,
          });
        }

        // ✅ 根本修复：FIFO 批次库存不足时，不再写入 null 批次
        // 而是将余量追加到最后一个有库存记录的批次（允许该批次透支）
        // 这样台账中永远不会出现空批次记录，保证批次追溯的完整性
        if (remainingQuantity > 0) {
          if (finalBatchNumbers.length > 0) {
            // 将余量追加到 FIFO 中最后分配的批次
            finalBatchNumbers[finalBatchNumbers.length - 1].quantity += remainingQuantity;
            logger.warn(
              `[FIFO警告] 物料${materialId}@仓库${locationId} 批次库存不足，` +
              `余量${remainingQuantity}已追加至批次 ${finalBatchNumbers[finalBatchNumbers.length - 1].batchNumber}（允许透支）。` +
              `请检查库存数据是否存在未登记的入库记录。`
            );
          } else {
            // 连一个有效批次都没有（库存全部都是空批次历史遗留）
            // 此时生成一个兜底批次号，避免写入空批次
            const fallbackBatch = `FIFO-FALLBACK-${referenceNo}-${materialId}`;
            finalBatchNumbers.push({ batchNumber: fallbackBatch, quantity: remainingQuantity });
            logger.error(
              `[FIFO严重警告] 物料${materialId}@仓库${locationId} 没有任何有效批次可供 FIFO 分配，` +
              `已使用兜底批次号 ${fallbackBatch}。这通常意味着存在历史空批次库存，请检查数据。`
            );
          }
        }
      } else {
        // 如果是入库，或者出库但明确指定了批次号
        // ✅ 根本修复：防止因上游遗漏或特殊情况传入 batchNumber = null 导致出现 [无批次] 负库存
        let safeBatchNumber = batchNumber;
        if (!safeBatchNumber && changeQuantity < 0) {
          safeBatchNumber = `OUT-DEFAULT-${referenceNo}-${materialId}`;
          logger.error(
            `[批次遗漏警告] 物料${materialId}@仓库${locationId} 出库时未通过 FIFO 分配且未指定批次号，` +
            `这会导致账本出现 [无批次] 的负库存！已强制分配兜底批次号 ${safeBatchNumber}。`
          );
        }
        finalBatchNumbers = [{ batchNumber: safeBatchNumber, quantity: Math.abs(changeQuantity) }];
      }

      // 7. 插入库存台账记录（如果按FIFO拆分，会有多条记录，累积计算 before/after）
      let currentBefore = beforeQuantity;

      for (const batchInfo of finalBatchNumbers) {
        // 还原当前批次的实际变动量（正负号）
        const batchChangeQty = changeQuantity < 0 ? -batchInfo.quantity : batchInfo.quantity;
        const currentAfter = currentBefore + batchChangeQty;
        
        // 计算流水账总金额
        const currentTotalValue = (actualUnitCost || 0) * Math.abs(batchChangeQty);

        await connection.execute(
          `INSERT INTO inventory_ledger (
            material_id, location_id, transaction_type, transaction_no, reference_no, reference_type,
            quantity, before_quantity, after_quantity, unit_id, 
            batch_number, supplier_id, supplier_name, production_date, expiry_date, warehouse_name,
            operator, remark, issue_reason, is_excess, bom_required_qty, total_issued_qty, created_at,
            unit_cost, total_value, purchase_order_id, purchase_order_no, receipt_id, receipt_no
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)`,
          [
            materialId,
            locationId,
            transactionType,
            referenceNo, // transaction_no 保持跟 referenceNo 一致
            referenceNo,
            referenceType,
            batchChangeQty,
            currentBefore,
            currentAfter,
            unitId,
            batchInfo.batchNumber,
            supplierId,
            supplierName,
            productionDate,
            expiryDate,
            warehouseName,
            operator,
            remark,
            issue_reason,
            is_excess,
            bom_required_qty,
            total_issued_qty,
            actualUnitCost || 0,
            currentTotalValue,
            purchaseOrderId,
            purchaseOrderNo,
            receiptId,
            receiptNo
          ]
        );
        currentBefore = currentAfter;
      }

      const duration = Date.now() - startTime;

      // ✅ 清除库存缓存，确保下次查询获取最新数据
      this.clearStockCache(materialId, locationId);

      // ✅ 新增：库存变动后检查预警（异步执行，不阻塞主流程）
      setImmediate(async () => {
        try {
          const InventoryAlertService = require('./business/InventoryAlertService');
          await InventoryAlertService.checkStockAfterChange(materialId, afterQuantity);
        } catch (alertError) {
          logger.warn('库存预警检查失败（不影响主流程）:', alertError.message);
        }

        // ✅ 新增：如果是增加库存（入库/退库等），触发待发货销售订单的自动库存满足检查
        if (changeQuantity > 0) {
          try {
            const SalesOrderStatusService = require('./business/SalesOrderStatusService');
            // 使用异步独立新连接验证
            await SalesOrderStatusService.checkAndReleasePendingOrders();
          } catch (salesOrderError) {
            logger.warn('流转待发货销售订单状态检查失败（不影响主流程）:', salesOrderError.message);
          }
        }
      });

      return {
        success: true,
        beforeQuantity,
        afterQuantity,
        changeQuantity,
        // 由于可能拆分为多条FIFO记录，这里不再返回单一的 transactionId
        // 如果调用方确实需要，可以在调用方通过其他方式查询，或者这里返回最后一笔的 ID（目前业务不需要这个具体的 insertId）
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`库存更新失败 [${materialId}-${locationId}]: ${error.message} (${duration}ms)`);
      throw error;
    }
  }

  /**
   * 验证物料和库位是否存在
   */
  static async _validateMaterialAndLocation(materialId, locationId, connection) {
    // 验证物料是否存在（不再强制要求 status = 1，因为停用的物料依然需要被允许出库销账）
    const [materialResult] = await connection.execute(
      'SELECT id FROM materials WHERE id = ?',
      [materialId]
    );

    if (materialResult.length === 0) {
      throw new Error(`物料不存在: ${materialId}`);
    }

    // 验证库位是否存在
    const [locationResult] = await connection.execute(
      'SELECT id FROM locations WHERE id = ? AND deleted_at IS NULL',
      [locationId]
    );

    if (locationResult.length === 0) {
      throw new Error(`库位不存在: ${locationId}`);
    }
  }

  /**
   * 库存转移（调拨）
   * 原子操作，确保源库位减少和目标库位增加同时成功或失败
   *
   * @param {Object} params - 转移参数
   * @param {Object} connection - 数据库连接（必须在事务中调用）
   * @returns {Promise<Object>} 转移结果
   */
  static async transferStock(
    {
      materialId,
      fromLocationId,
      toLocationId,
      quantity,
      referenceNo,
      referenceType,
      operator,
      remark = '',
      unitId = null,
      batchNumber = null, // 调用方可明确指定批次；否则自动从 FIFO 溯源
    },
    connection
  ) {
    if (!connection) {
      throw new Error('transferStock必须在数据库事务中调用');
    }

    try {
      // 1. 从源库位按 FIFO 扣减库存（未指定批次时由 updateStock 自动拆批）
      const sourceResult = await this.updateStock(
        {
          materialId,
          locationId: fromLocationId,
          quantity: -Math.abs(quantity), // 确保是负数
          transactionType: 'transfer_out',
          referenceNo,
          referenceType,
          operator,
          remark: `${remark} (转出)`,
          unitId,
          batchNumber, // 如果调用方指定了批次则直接使用
        },
        connection
      );

      // 2. 查询刚才 transfer_out 写入的台账，取回被 FIFO 拆分的各批次
      //    用于向目标库位写入完全对应的批次，保证批次追溯双向一致
      const [outLedger] = await connection.execute(
        `SELECT batch_number, ABS(quantity) as qty
         FROM inventory_ledger
         WHERE material_id = ? AND location_id = ? 
           AND reference_no = ? AND transaction_type = 'transfer_out'
           AND batch_number IS NOT NULL AND batch_number != ''
         ORDER BY id ASC`,
        [materialId, fromLocationId, referenceNo]
      );

      if (outLedger.length > 0) {
        // 按 FIFO 批次逐一写入目标库位，完整继承批次信息
        for (const row of outLedger) {
          await this.updateStock(
            {
              materialId,
              locationId: toLocationId,
              quantity: row.qty, // 正数
              transactionType: 'transfer_in',
              referenceNo,
              referenceType,
              operator,
              remark: `${remark} (转入)`,
              unitId,
              batchNumber: row.batch_number, // ✅ 继承原批次
            },
            connection
          );
        }
      } else {
        // 兜底：批次信息查不到（如手动调整的旧数据），整体一笔写入
        // updateStock 会自动生成批次号，不会产生空批次
        await this.updateStock(
          {
            materialId,
            locationId: toLocationId,
            quantity: Math.abs(quantity),
            transactionType: 'transfer_in',
            referenceNo,
            referenceType,
            operator,
            remark: `${remark} (转入)`,
            unitId,
            batchNumber,
          },
          connection
        );
      }

      return {
        success: true,
        sourceResult,
      };
    } catch (error) {
      throw error;
    }
  }


  /**
   * 验证库存是否充足
   *
   * @param {number} materialId - 物料ID
   * @param {number} locationId - 库位ID
   * @param {number} requiredQuantity - 需要的数量
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<Object>} 验证结果
   */
  static async validateStock(materialId, locationId, requiredQuantity, connection = null) {
    const currentStock = await this.getCurrentStock(materialId, locationId, connection);
    const isEnough = currentStock >= requiredQuantity;

    return {
      isEnough,
      currentStock,
      requiredQuantity,
      shortage: isEnough ? 0 : requiredQuantity - currentStock,
    };
  }

  /**
   * 获取单个物料的总库存（汇总所有库位）
   * @param {number} materialId 物料ID
   * @param {Object} connection 数据库连接（可选）
   * @returns {Promise<number>} 总库存数量
   */
  static async getMaterialTotalStock(materialId, connection = null) {
    const conn = connection || db.pool;

    try {
      const [rows] = await conn.execute(
        `
        SELECT COALESCE(SUM(il.quantity), 0) as total_stock
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE il.material_id = ?
          AND (mat.location_id IS NULL OR il.location_id = mat.location_id)
      `,
        [materialId]
      );

      return parseFloat(rows[0].total_stock) || 0;
    } catch (error) {
      logger.error(`获取物料${materialId}总库存失败:`, error);
      return 0;
    }
  }

  /**
   * 批量获取多个物料的总库存
   * @param {number[]} materialIds 物料ID数组
   * @param {Object} connection 数据库连接（可选）
   * @returns {Promise<Object>} 物料ID到库存数量的映射
   */
  static async getBatchMaterialTotalStock(materialIds, connection = null) {
    if (!materialIds || materialIds.length === 0) {
      return {};
    }

    const conn = connection || db.pool;

    try {
      const placeholders = materialIds.map(() => '?').join(',');
      const [rows] = await conn.execute(
        `
        SELECT
          il.material_id,
          COALESCE(SUM(il.quantity), 0) as total_stock
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE il.material_id IN (${placeholders})
          AND (mat.location_id IS NULL OR il.location_id = mat.location_id)
        GROUP BY il.material_id
      `,
        materialIds
      );

      // 转换为映射对象
      const stockMap = {};
      materialIds.forEach((id) => {
        stockMap[id] = 0; // 默认为0
      });

      rows.forEach((row) => {
        stockMap[row.material_id] = parseFloat(row.total_stock) || 0;
      });

      return stockMap;
    } catch (error) {
      logger.error('批量获取物料库存失败:', error);
      return {};
    }
  }

  /**
   * 检查物料库存是否充足（用于销售订单等场景）
   * @param {Array} requirements 需求数组 [{materialId, quantity, materialCode, materialName}]
   * @param {Object} connection 数据库连接（可选）
   * @returns {Promise<Array>} 库存不足的物料数组
   */
  static async checkStockSufficiency(requirements, connection = null) {
    if (!requirements || requirements.length === 0) {
      return [];
    }

    const conn = connection || db.pool;

    try {
      const materialIds = requirements.map((req) => req.materialId);
      const stockMap = await this.getBatchMaterialTotalStock(materialIds, conn);

      const insufficientItems = [];

      for (const req of requirements) {
        const currentStock = stockMap[req.materialId] || 0;
        const requiredQuantity = parseFloat(req.quantity) || 0;

        if (currentStock < requiredQuantity) {
          insufficientItems.push({
            materialId: req.materialId,
            materialCode: req.materialCode || req.material_code || '',
            materialName: req.materialName || req.material_name || '未知物料',
            quantity: requiredQuantity,
            currentStock,
            shortfall: requiredQuantity - currentStock,
          });
        }
      }

      return insufficientItems;
    } catch (error) {
      logger.error('检查库存充足性失败:', error);
      throw new Error(`检查库存充足性失败: ${error.message}`);
    }
  }

  // ✅ 新增：获取可用库存（考虑预留数量）
  static async getAvailableStock(materialId, locationId, connection = null) {
    try {
      const totalStock = await this.getCurrentStock(materialId, locationId, connection);
      const reserved = await this.getReservedQuantity(materialId, locationId, connection);
      const available = totalStock - reserved;

      logger.info(
        `[库存计算] materialId=${materialId}, totalStock=${totalStock}, reserved=${reserved}, available=${available}`
      );

      return Math.max(0, available); // 确保不为负数
    } catch (error) {
      logger.error('获取可用库存失败:', error);
      throw error;
    }
  }

  // ✅ 新增：获取预留数量
  static async getReservedQuantity(materialId, locationId, connection = null) {
    const conn = connection || db.pool;

    try {
      const [result] = await conn.execute(
        `SELECT COALESCE(SUM(reserved_quantity), 0) as reserved 
         FROM inventory_reservations 
         WHERE material_id = ? AND location_id = ?`,
        [materialId, locationId]
      );

      return parseFloat(result[0].reserved) || 0;
    } catch (error) {
      logger.warn('获取预留数量失败，返回0:', error);
      return 0;
    }
  }

  // ✅ 新增：清除库存缓存
  static clearStockCache(materialId, locationId = null) {
    if (!materialId) return;

    if (locationId) {
      // 清除指定物料和库位的缓存
      const cacheKey = `inventory_${materialId}_${locationId}`;
      cacheService.delete(cacheKey);
      logger.info(`[缓存清理] 已清除: ${cacheKey}`);
    } else {
      // 清除该物料的所有缓存
      cacheService.deleteByPrefix(`inventory_${materialId}_`);
      logger.info(`[缓存清理] 已清除所有库存缓存: inventory_${materialId}_*`);
    }
  }
  /**
   * 获取物料的默认存放仓库ID（从 materials 表读取）
   *
   * 统一入口：所有业务逻辑在需要获取物料归属仓库时，
   * 必须通过此方法获取，严禁在业务代码中硬编码仓库ID。
   *
   * @param {number} materialId - 物料ID
   * @param {Object} connection - 数据库连接（可选，用于事务）
   * @returns {Promise<number>} 仓库ID
   * @throws {Error} 物料不存在或未配置默认仓库时抛出
   */
  static async getMaterialLocation(materialId, connection = null) {
    const conn = connection || db.pool;

    if (!materialId) {
      throw new Error('getMaterialLocation: materialId 不能为空');
    }

    const [rows] = await conn.execute(
      'SELECT location_id FROM materials WHERE id = ?',
      [materialId]
    );

    if (rows.length === 0) {
      throw new Error(`物料 ${materialId} 不存在，请检查物料基础数据`);
    }

    const locationId = rows[0].location_id;
    if (!locationId) {
      throw new Error(
        `物料 ${materialId} 未配置默认仓库，请在【物料管理】中设置存放仓库后再操作`
      );
    }

    return locationId;
  }

  /**
   * 获取物料的完整基础信息（仓库、单位等）
   *
   * 统一入口：在创建出入库单、批次操作等场景下，
   * 需要同时获取物料的默认单位和仓库时使用此方法。
   * 避免各处重复写 SELECT + 校验 + throw 的补丁代码。
   *
   * @param {number} materialId - 物料ID
   * @param {Object} connection - 数据库连接（可选）
   * @returns {Promise<{locationId: number, unitId: number|null, materialCode: string, materialName: string}>}
   * @throws {Error} 物料不存在或未配置默认仓库时抛出
   */
  static async getMaterialInfo(materialId, connection = null) {
    const conn = connection || db.pool;

    if (!materialId) {
      throw new Error('getMaterialInfo: materialId 不能为空');
    }

    const [rows] = await conn.execute(
      'SELECT id, code, name, location_id, unit_id FROM materials WHERE id = ?',
      [materialId]
    );

    if (rows.length === 0) {
      throw new Error(`物料 ${materialId} 不存在，请检查物料基础数据`);
    }

    const mat = rows[0];
    if (!mat.location_id) {
      throw new Error(
        `物料 ${mat.code || materialId} 未配置默认仓库，请在【物料管理】中设置存放仓库后再操作`
      );
    }

    return {
      locationId: mat.location_id,
      unitId: mat.unit_id || null,
      materialCode: mat.code || '',
      materialName: mat.name || '',
    };
  }

  /**
   * 批量获取多个物料的基础信息（仓库、单位等）
   *
   * getMaterialInfo 的批量版本，用于出入库单批量处理场景。
   * 一次查询获取所有物料信息，避免 N+1 查询问题。
   *
   * @param {number[]} materialIds - 物料ID数组
   * @param {Object} connection - 数据库连接（可选，用于事务）
   * @returns {Promise<Map<number, {locationId: number, unitId: number|null, code: string, name: string}>>}
   * @throws {Error} 任何物料不存在或未配置默认仓库时抛出
   */
  static async getBatchMaterialInfo(materialIds, connection = null) {
    if (!materialIds || materialIds.length === 0) {
      return new Map();
    }

    const conn = connection || db.pool;
    const uniqueIds = [...new Set(materialIds)];
    const placeholders = uniqueIds.map(() => '?').join(',');

    const [rows] = await conn.execute(
      `SELECT id, code, name, location_id, unit_id, price, COALESCE(cost_price, 0) as cost_price FROM materials WHERE id IN (${placeholders})`,
      uniqueIds
    );

    const infoMap = new Map();
    for (const row of rows) {
      if (!row.location_id) {
        throw new Error(
          `物料 ${row.code || row.id} 未配置默认仓库，请在【物料管理】中设置存放仓库后再操作`
        );
      }
      infoMap.set(row.id, {
        locationId: row.location_id,
        unitId: row.unit_id || null,
        code: row.code || '',
        name: row.name || '',
        price: parseFloat(row.price) || 0,
        costPrice: parseFloat(row.cost_price) || 0,
      });
    }

    // 检查是否所有请求的物料都找到了
    for (const id of uniqueIds) {
      if (!infoMap.has(id)) {
        throw new Error(`物料 ${id} 不存在，请检查物料基础数据`);
      }
    }

    return infoMap;
  }
}

module.exports = InventoryService;
