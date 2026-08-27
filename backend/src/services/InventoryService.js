/**
 * InventoryService.js
 * @description 服务层文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const db = require('../config/db');
const cacheService = require('./cache/CacheManager'); // ✅ 新增：缓存服务
const Precision = require('../utils/precision');

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
  static LOCATION_LOCK_BATCH = '__LOCATION_LOCK__';

  static balanceTableAvailable = null;

  /**
   * 批次键 SSOT：与余额表 / 一致性规则对齐。
   * - null / undefined / 纯空白 → ''（空批次键）
   * - 其余 trim 后的字符串
   * 入库禁止空键；出库空键表示走 FIFO 自动拆批。
   */
  static _normalizeBatchNumber(batchNumber) {
    if (batchNumber === null || batchNumber === undefined) return '';
    return String(batchNumber).trim();
  }

  static _isMissingBalanceTableError(error) {
    return (
      error &&
      (error.code === 'ER_NO_SUCH_TABLE' || /inventory_stock_balances/i.test(error.message || ''))
    );
  }

  static async _lockStockLocation(materialId, locationId, connection) {
    if (this.balanceTableAvailable === false) {
      return false;
    }

    try {
      await connection.execute(
        `INSERT INTO inventory_stock_balances (material_id, location_id, batch_number, quantity, created_at, updated_at)
         VALUES (?, ?, ?, 0, NOW(), NOW())
         ON DUPLICATE KEY UPDATE updated_at = updated_at`,
        [materialId, locationId, this.LOCATION_LOCK_BATCH]
      );

      await connection.execute(
        `SELECT id
           FROM inventory_stock_balances
          WHERE material_id = ? AND location_id = ? AND batch_number = ?
          FOR UPDATE`,
        [materialId, locationId, this.LOCATION_LOCK_BATCH]
      );

      this.balanceTableAvailable = true;
      return true;
    } catch (error) {
      if (this._isMissingBalanceTableError(error)) {
        this.balanceTableAvailable = false;
        logger.warn(
          'inventory_stock_balances table is not available; using ledger-only stock checks'
        );
        return false;
      }
      throw error;
    }
  }

  static async _adjustStockBalance(
    {
      materialId,
      locationId,
      batchNumber,
      quantity,
      unitCost = null,
      totalValue = null,
      ledgerId = null,
    },
    connection
  ) {
    if (this.balanceTableAvailable === false) {
      return;
    }

    const normalizedBatch = this._normalizeBatchNumber(batchNumber);
    if (normalizedBatch === this.LOCATION_LOCK_BATCH) {
      return;
    }
    const signedTotalValue =
      totalValue === null || totalValue === undefined
        ? null
        : (Number(quantity) < 0 ? -1 : 1) * Math.abs(Number(totalValue) || 0);

    try {
      await connection.execute(
        `INSERT INTO inventory_stock_balances (
          material_id, location_id, batch_number, quantity, unit_cost, total_value,
          version, last_ledger_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          quantity = quantity + VALUES(quantity),
          unit_cost = COALESCE(VALUES(unit_cost), unit_cost),
          total_value = COALESCE(total_value, 0) + COALESCE(VALUES(total_value), 0),
          version = version + 1,
          last_ledger_id = COALESCE(VALUES(last_ledger_id), last_ledger_id),
          updated_at = NOW()`,
        [materialId, locationId, normalizedBatch, quantity, unitCost, signedTotalValue, ledgerId]
      );
      this.balanceTableAvailable = true;
    } catch (error) {
      if (this._isMissingBalanceTableError(error)) {
        this.balanceTableAvailable = false;
        logger.warn(
          'inventory_stock_balances table is not available; skipped stock balance maintenance'
        );
        return;
      }
      throw error;
    }
  }

  static async rebuildStockBalancesForMaterial(materialId, connection) {
    if (!connection) {
      throw new Error('rebuildStockBalancesForMaterial必须在数据库事务中调用');
    }
    if (!materialId) {
      throw new Error(`无效的物料ID: ${materialId}`);
    }
    if (this.balanceTableAvailable === false) {
      return false;
    }

    try {
      await connection.execute(
        `INSERT INTO inventory_stock_balances (
          material_id, location_id, batch_number, quantity, unit_cost, total_value,
          version, last_ledger_id, created_at, updated_at
        )
        SELECT
          material_id,
          location_id,
          batch_key AS batch_number,
          SUM(COALESCE(quantity, 0)) AS quantity,
          CASE
            WHEN ABS(SUM(COALESCE(quantity, 0))) > 0.000001
              THEN ABS(SUM(signed_total_value) / SUM(COALESCE(quantity, 0)))
            ELSE NULL
          END AS unit_cost,
          SUM(signed_total_value) AS total_value,
          1 AS version,
          MAX(id) AS last_ledger_id,
          NOW(),
          NOW()
        FROM (
          SELECT id,
                 material_id,
                 location_id,
                 COALESCE(NULLIF(batch_number, ''), '') COLLATE utf8mb4_unicode_ci AS batch_key,
                 quantity,
                 CASE
                   WHEN COALESCE(quantity, 0) < 0 THEN -ABS(COALESCE(total_value, 0))
                   ELSE ABS(COALESCE(total_value, 0))
                 END AS signed_total_value
          FROM inventory_ledger
          WHERE material_id = ?
            AND location_id IS NOT NULL
        ) ledger_source
        GROUP BY material_id, location_id, batch_key
        ON DUPLICATE KEY UPDATE
          quantity = VALUES(quantity),
          unit_cost = VALUES(unit_cost),
          total_value = VALUES(total_value),
          version = version + 1,
          last_ledger_id = VALUES(last_ledger_id),
          updated_at = NOW()`,
        [materialId]
      );

      await connection.execute(
        `UPDATE inventory_stock_balances b
         LEFT JOIN (
           SELECT material_id,
                  location_id,
                  batch_key
           FROM (
             SELECT material_id,
                    location_id,
                    COALESCE(NULLIF(batch_number, ''), '') COLLATE utf8mb4_unicode_ci AS batch_key
             FROM inventory_ledger
             WHERE material_id = ?
               AND location_id IS NOT NULL
           ) ledger_source
           GROUP BY material_id, location_id, batch_key
         ) l
           ON l.material_id = b.material_id
          AND l.location_id = b.location_id
          AND l.batch_key = b.batch_number COLLATE utf8mb4_unicode_ci
            SET b.quantity = 0,
                b.unit_cost = NULL,
                b.total_value = 0,
                b.version = b.version + 1,
                b.last_ledger_id = NULL,
                b.updated_at = NOW()
          WHERE b.material_id = ?
            AND b.batch_number <> ?
            AND l.material_id IS NULL
            AND (
              ABS(COALESCE(b.quantity, 0)) > 0.000001
              OR ABS(COALESCE(b.total_value, 0)) > 0.05
              OR b.unit_cost IS NOT NULL
              OR b.last_ledger_id IS NOT NULL
            )`,
        [materialId, materialId, this.LOCATION_LOCK_BATCH]
      );

      this.balanceTableAvailable = true;
      await this.clearStockCache(materialId);
      return true;
    } catch (error) {
      if (this._isMissingBalanceTableError(error)) {
        this.balanceTableAvailable = false;
        logger.warn(
          'inventory_stock_balances table is not available; skipped stock balance rebuild'
        );
        return false;
      }
      throw error;
    }
  }

  static async _findLedgerByIdempotencyKey(idempotencyKey, connection) {
    if (!idempotencyKey) return null;

    try {
      const [rows] = await connection.execute(
        `SELECT id, before_quantity, after_quantity, quantity
           FROM inventory_ledger
          WHERE idempotency_key = ? OR idempotency_key LIKE ?
          ORDER BY id ASC
          FOR UPDATE`,
        [idempotencyKey, `${idempotencyKey}:%`]
      );
      if (!rows.length) return null;

      return {
        id: rows[0].id,
        before_quantity: rows[0].before_quantity,
        after_quantity: rows[rows.length - 1].after_quantity,
        quantity: rows.reduce((sum, row) => Precision.add(sum, row.quantity), 0),
      };
    } catch (error) {
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        return null;
      }
      throw error;
    }
  }

  static _positiveNumber(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const numberValue = Number(value);
      if (Number.isFinite(numberValue) && numberValue > 0) return numberValue;
    }
    return 0;
  }

  static async _getMaterialCost(materialId, connection) {
    const [rows] = await connection.execute(
      `SELECT m.cost_price,
              CASE
                WHEN ms.type = 'external' OR m.material_type = 'raw' THEN m.price
                ELSE NULL
              END AS external_reference_price,
              (
                SELECT sc.standard_price
                FROM standard_costs sc
                WHERE (sc.material_id = m.id OR sc.product_id = m.id)
                  AND sc.status = 'active'
                  AND sc.is_active = 1
                  AND sc.standard_price > 0
                  AND sc.effective_date <= CURDATE()
                  AND (sc.expiry_date IS NULL OR sc.expiry_date >= CURDATE())
                ORDER BY sc.effective_date DESC, sc.id DESC
                LIMIT 1
              ) AS active_standard_cost
       FROM materials m
       LEFT JOIN material_sources ms ON ms.id = m.material_source_id
       WHERE m.id = ? AND m.deleted_at IS NULL`,
      [materialId]
    );
    return this._positiveNumber(
      rows[0]?.cost_price,
      rows[0]?.active_standard_cost,
      rows[0]?.external_reference_price
    );
  }

  static async _getBatchUnitCost({ materialId, locationId, batchNumber }, connection) {
    if (!batchNumber) return 0;
    const [rows] = await connection.execute(
      `SELECT
         SUM(CASE WHEN quantity > 0 THEN quantity * COALESCE(NULLIF(unit_cost, 0), NULLIF(total_value / NULLIF(quantity, 0), 0), 0) ELSE 0 END)
           / NULLIF(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0) AS unit_cost
       FROM inventory_ledger
       WHERE material_id = ?
         AND location_id = ?
         AND batch_number = ?`,
      [materialId, locationId, batchNumber]
    );
    return this._positiveNumber(rows[0]?.unit_cost);
  }

  static async _getReferenceUnitCost({ materialId, referenceNo, referenceType }, connection) {
    const refType = String(referenceType || '').toLowerCase();
    const refNo = referenceNo || null;
    if (!refNo) return 0;

    if (refType === 'purchase_receipt' || refType === 'inbound') {
      const [rows] = await connection.execute(
        `SELECT pri.price AS receipt_price, poi.price AS order_price
         FROM purchase_receipts pr
         LEFT JOIN purchase_receipt_items pri
           ON pri.receipt_id = pr.id AND pri.material_id = ?
         LEFT JOIN purchase_order_items poi
           ON poi.order_id = pr.order_id AND poi.material_id = ?
         WHERE pr.receipt_no = ? OR pr.receipt_no = (
           SELECT receipt_no FROM inventory_ledger
           WHERE reference_no = ? AND material_id = ? AND receipt_no IS NOT NULL
           LIMIT 1
         )
         LIMIT 1`,
        [materialId, materialId, refNo, refNo, materialId]
      );
      return this._positiveNumber(rows[0]?.receipt_price, rows[0]?.order_price);
    }

    // 销售出库价格和销售订单单价是售价，绝不能作为库存成本来源。
    if (refType === 'sales_outbound') return 0;

    return 0;
  }

  static async _resolveUnitCost(
    { materialId, locationId, batchNumber, referenceNo, referenceType, unitCost },
    connection
  ) {
    return this._positiveNumber(
      unitCost,
      await this._getBatchUnitCost({ materialId, locationId, batchNumber }, connection),
      await this._getReferenceUnitCost({ materialId, referenceNo, referenceType }, connection),
      await this._getMaterialCost(materialId, connection)
    );
  }

  static normalizeTransactionDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new Error(`无效的库存交易日期: ${value}`);
    }
    return date.toISOString().slice(0, 10);
  }

  static async resolveTransactionDate({ transactionDate, referenceType, referenceNo }, connection) {
    if (transactionDate) {
      return this.normalizeTransactionDate(transactionDate);
    }

    const refType = String(referenceType || '').toLowerCase();
    const refNo = referenceNo || null;
    if (!refNo) {
      return this.normalizeTransactionDate();
    }

    const sourceMap = {
      inbound: { table: 'inventory_inbound', noColumn: 'inbound_no', dateColumn: 'inbound_date' },
      outbound: {
        table: 'inventory_outbound',
        noColumn: 'outbound_no',
        dateColumn: 'outbound_date',
      },
      transfer: {
        table: 'inventory_transfers',
        noColumn: 'transfer_no',
        dateColumn: 'transfer_date',
      },
      inventory_check: {
        table: 'inventory_checks',
        noColumn: 'check_no',
        dateColumn: 'check_date',
      },
      check: { table: 'inventory_checks', noColumn: 'check_no', dateColumn: 'check_date' },
      purchase_receipt: {
        table: 'purchase_receipts',
        noColumn: 'receipt_no',
        dateColumn: 'receipt_date',
      },
      purchase_return: {
        table: 'purchase_returns',
        noColumn: 'return_no',
        dateColumn: 'return_date',
      },
      sales_outbound: {
        table: 'sales_outbound',
        noColumn: 'outbound_no',
        dateColumn: 'delivery_date',
      },
      sales_return: { table: 'sales_returns', noColumn: 'return_no', dateColumn: 'return_date' },
      sales_exchange: {
        table: 'sales_exchanges',
        noColumn: 'exchange_no',
        dateColumn: 'exchange_date',
      },
      scrap_record: { table: 'scrap_records', noColumn: 'scrap_no', dateColumn: 'scrap_date' },
    };
    const source = sourceMap[refType];
    if (!source) {
      return this.normalizeTransactionDate();
    }

    try {
      const [rows] = await connection.execute(
        `SELECT ${source.dateColumn} as transaction_date
         FROM ${source.table}
         WHERE ${source.noColumn} = ?
         LIMIT 1`,
        [refNo]
      );
      return this.normalizeTransactionDate(rows[0]?.transaction_date);
    } catch (error) {
      logger.warn(`库存交易日期推断失败，使用当前日期: ${refType}/${refNo}`, error.message);
      return this.normalizeTransactionDate();
    }
  }

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

      // 在事务中（传入 connection）时自动禁用缓存，避免读到过时数据
      const effectiveUseCache = useCache && !withLock && !connection;
      const cacheKey = `inventory_${materialId}_${locationId}`;
      if (effectiveUseCache) {
        const cached = await cacheService.get(cacheKey);
        if (cached !== null) {
          return cached;
        }
      }

      if (withLock && connection) {
        await this._lockStockLocation(materialId, locationId, connection);
      }

      // 优先读 balance 表（写路径已维护）；缺失表或异常时回退 ledger SUM
      let quantity = null;
      if (this.balanceTableAvailable !== false) {
        try {
          const [balRows] = await conn.execute(
            `SELECT COALESCE(SUM(quantity), 0) as current_stock
             FROM inventory_stock_balances
             WHERE material_id = ? AND location_id = ?
               AND batch_number <> ?`,
            [materialId, locationId, this.LOCATION_LOCK_BATCH]
          );
          quantity = parseFloat(balRows[0].current_stock);
          this.balanceTableAvailable = true;
        } catch (error) {
          if (this._isMissingBalanceTableError(error)) {
            this.balanceTableAvailable = false;
          } else {
            throw error;
          }
        }
      }

      if (quantity === null) {
        const lockSql = withLock ? ' FOR UPDATE' : '';
        const [result] = await conn.execute(
          `SELECT COALESCE(SUM(quantity), 0) as current_stock
           FROM inventory_ledger
           WHERE material_id = ? AND location_id = ?${lockSql}`,
          [materialId, locationId]
        );
        quantity = parseFloat(result[0].current_stock);
      }

      // 缓存结果（5分钟过期），仅在非事务模式下缓存
      if (effectiveUseCache) {
        await cacheService.set(cacheKey, quantity, 300);
      }

      return quantity;
    } catch (error) {
      logger.error(`获取库存失败 [materialId=${materialId}, locationId=${locationId}]:`, error);
      throw new Error(`获取库存失败: ${error.message}`, { cause: error });
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
      const conditions = materialLocationPairs
        .map(() => '(material_id = ? AND location_id = ?)')
        .join(' OR ');
      const params = materialLocationPairs.flatMap((pair) => [pair.material_id, pair.location_id]);

      let results = [];
      if (this.balanceTableAvailable !== false) {
        try {
          const balParams = [...params, this.LOCATION_LOCK_BATCH];
          const [balRows] = await conn.execute(
            `SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity
             FROM inventory_stock_balances
             WHERE (${conditions}) AND batch_number <> ?
             GROUP BY material_id, location_id`,
            balParams
          );
          results = balRows;
          this.balanceTableAvailable = true;
        } catch (error) {
          if (this._isMissingBalanceTableError(error)) {
            this.balanceTableAvailable = false;
          } else {
            throw error;
          }
        }
      }

      if (this.balanceTableAvailable === false || results.length === 0) {
        // 回退台账，或 balance 无行时补 ledger（无行也可能真是 0 库存）
        const [ledgerRows] = await conn.execute(
          `SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity
           FROM inventory_ledger
           WHERE ${conditions}
           GROUP BY material_id, location_id`,
          params
        );
        if (this.balanceTableAvailable === false) {
          results = ledgerRows;
        } else {
          // balance 可用但部分键无行：用 ledger 补全
          const map = new Map(
            results.map((r) => [`${r.material_id}-${r.location_id}`, parseFloat(r.quantity)])
          );
          ledgerRows.forEach((r) => {
            const key = `${r.material_id}-${r.location_id}`;
            if (!map.has(key)) map.set(key, parseFloat(r.quantity));
          });
          results = [...map.entries()].map(([key, quantity]) => {
            const [material_id, location_id] = key.split('-').map(Number);
            return { material_id, location_id, quantity };
          });
        }
      }

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
      throw new Error(`批量获取库存失败: ${error.message}`, { cause: error });
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
      /** 仅 adjustment/reconciliation/correction 允许空批次对账调整 */
      allowEmptyBatch = false,
      transactionDate = null,
      unitCost = null, // 新增参数：入库时传入的实际成本单价
      purchaseOrderId = null, // 原生批次身份证属性
      purchaseOrderNo = null, // 原生批次身份证属性
      receiptId = null, // 原生批次身份证属性
      receiptNo = null, // 原生批次身份证属性
      idempotencyKey = null,
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

    // 批次键入口归一：后续 FIFO / 台账 / 幂等键统一使用
    const normalizedBatchInput = this._normalizeBatchNumber(batchNumber);

    // 入库批次必须来自上游业务单据或显式录入；对账调整类可显式允许空批次键。
    const isInboundOperation = parseFloat(quantity) > 0;
    const emptyBatchAllowed =
      allowEmptyBatch &&
      ['adjustment', 'reconciliation', 'correction'].includes(String(transactionType));
    if (isInboundOperation && !normalizedBatchInput && !emptyBatchAllowed) {
      throw new Error(
        `入库必须提供可追溯批次号: materialId=${materialId}, referenceNo=${referenceNo}, transactionType=${transactionType}`
      );
    }

    const startTime = Date.now();

    try {
      const existingLedger = await this._findLedgerByIdempotencyKey(idempotencyKey, connection);
      if (existingLedger) {
        return {
          success: true,
          idempotent: true,
          beforeQuantity: parseFloat(existingLedger.before_quantity) || 0,
          afterQuantity: parseFloat(existingLedger.after_quantity) || 0,
          changeQuantity: parseFloat(existingLedger.quantity) || 0,
          duration: Date.now() - startTime,
        };
      }

      const resolvedTransactionDate = await this.resolveTransactionDate(
        { transactionDate, referenceType, referenceNo },
        connection
      );
      const PeriodValidationService = require('./business/PeriodValidationService');
      const inventoryCheck =
        await PeriodValidationService.validateInventoryTransaction(resolvedTransactionDate, connection);
      if (!inventoryCheck.allowed) {
        throw new Error(inventoryCheck.message);
      }

      await this._lockStockLocation(materialId, locationId, connection);

      // 2. 使用行级锁获取当前库存
      const beforeQuantity = await this.getCurrentStock(materialId, locationId, connection, true);

      // 3. 计算变动数量（统一为正数入库，负数出库）
      // 防御性取反：当调用方不慎传了正数的出库类型时，自动修正为负数
      // 仅「业务方向为减少库存」的类型在误传正数时取反。
      // 冲销类需注意方向：
      //   outbound_cancel / transfer_cancel_out → 加回库存（不要取反）
      //   inbound_cancel / transfer_cancel_in   → 扣回库存
      const OUTBOUND_TYPES = [
        'outbound',
        'transfer_out',
        'purchase_return',
        'manual_out',
        'sales_outbound',
        'production_outbound',
        'outsourced_outbound',
        'sales_exchange_out',
        'adjustment_out',
        'other_outbound',
        'inbound_cancel',
        'transfer_cancel_in',
      ];
      let changeQuantity = parseFloat(quantity);
      if (OUTBOUND_TYPES.includes(transactionType) && changeQuantity > 0) {
        changeQuantity = -changeQuantity;
      }

      // 4. 计算变动后数量
      const afterQuantity = Precision.add(beforeQuantity, changeQuantity);

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
        logger.warn(
          `[库存警告] 允许负库存出库: 物料${materialId} @ ${locationId}, 当前${beforeQuantity}, 出库${Math.abs(changeQuantity)}, 变动后${afterQuantity}`
        );
      }

      // 6. 验证物料和库位是否存在
      await this._validateMaterialAndLocation(materialId, locationId, connection);

      // FIFO：出库且未指定有效批次 → 按台账先进先出拆批
      let finalBatchNumbers = [];
      if (changeQuantity < 0 && !normalizedBatchInput) {
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
          const batchKey = this._normalizeBatchNumber(batch.batch_number);
          if (!batchKey) continue;

          if (tempBatchMap.has(batchKey)) {
            tempBatchMap.set(batchKey, tempBatchMap.get(batchKey) + deductQty);
          } else {
            tempBatchMap.set(batchKey, deductQty);
          }

          remainingQuantity -= deductQty;
        }

        for (const [bNum, bQty] of tempBatchMap.entries()) {
          finalBatchNumbers.push({
            batchNumber: bNum,
            quantity: bQty,
          });
        }

        if (remainingQuantity > 0) {
          throw new Error(
            `FIFO批次库存不足: materialId=${materialId}, locationId=${locationId}, referenceNo=${referenceNo}, missing=${remainingQuantity}`
          );
        }
      } else {
        // 入库或出库明确指定批次（已归一化）
        if (!normalizedBatchInput && changeQuantity < 0) {
          throw new Error(
            `出库必须提供批次号或可通过FIFO分配批次: materialId=${materialId}, locationId=${locationId}, referenceNo=${referenceNo}`
          );
        }
        finalBatchNumbers = [
          { batchNumber: normalizedBatchInput, quantity: Math.abs(changeQuantity) },
        ];
      }

      // 7. 插入库存台账记录（如果按FIFO拆分，会有多条记录，累积计算 before/after）
      let currentBefore = beforeQuantity;
      let lastLedgerId = null;

      for (const batchInfo of finalBatchNumbers) {
        // 还原当前批次的实际变动量（正负号）
        const batchChangeQty = changeQuantity < 0 ? -batchInfo.quantity : batchInfo.quantity;
        const currentAfter = Precision.add(currentBefore, batchChangeQty);
        const ledgerBatchNumber = this._normalizeBatchNumber(batchInfo.batchNumber);
        const ledgerIdempotencyKey =
          idempotencyKey && finalBatchNumbers.length > 1
            ? `${idempotencyKey}:${ledgerBatchNumber || 'EMPTY'}`
            : idempotencyKey;
        const actualUnitCost = await this._resolveUnitCost(
          {
            materialId,
            locationId,
            batchNumber: ledgerBatchNumber,
            referenceNo,
            referenceType,
            unitCost,
          },
          connection
        );

        if (!(Number(actualUnitCost) > 0)) {
          throw new Error(
            `库存变动缺少有效成本：materialId=${materialId}, referenceNo=${referenceNo}, ` +
              `transactionType=${transactionType}, batch=${ledgerBatchNumber || ''}`
          );
        }

        // 计算流水账总金额
        const currentTotalValue = Precision.round(
          Precision.mul(actualUnitCost || 0, Math.abs(batchChangeQty)),
          6
        );

        const [ledgerResult] = await connection.execute(
          `INSERT INTO inventory_ledger (
            material_id, location_id, transaction_type, transaction_no, reference_no, reference_type,
            quantity, before_quantity, after_quantity, unit_id,
            batch_number, supplier_id, supplier_name, production_date, expiry_date, warehouse_name,
            operator, remark, issue_reason, is_excess, bom_required_qty, total_issued_qty,
            transaction_date, created_at,
            unit_cost, total_value, purchase_order_id, purchase_order_no, receipt_id, receipt_no,
            idempotency_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)`,
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
            ledgerBatchNumber,
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
            resolvedTransactionDate,
            actualUnitCost || 0,
            currentTotalValue,
            purchaseOrderId,
            purchaseOrderNo,
            receiptId,
            receiptNo,
            ledgerIdempotencyKey,
          ]
        );
        lastLedgerId = ledgerResult.insertId || lastLedgerId;
        await this._adjustStockBalance(
          {
            materialId,
            locationId,
            batchNumber: batchInfo.batchNumber,
            quantity: batchChangeQty,
            unitCost: actualUnitCost || null,
            totalValue: currentTotalValue,
            ledgerId: ledgerResult.insertId || null,
          },
          connection
        );
        currentBefore = currentAfter;
      }

      const duration = Date.now() - startTime;

      // ✅ 清除库存缓存，确保下次查询获取最新数据
      await this.clearStockCache(materialId, locationId);

      // ✅ 新增：库存变动后检查预警（异步执行，不阻塞主流程）
      setImmediate(async () => {
        try {
          const InventoryAlertService = require('./business/InventoryAlertService');
          await InventoryAlertService.checkStockAfterChange(materialId, afterQuantity);
        } catch (alertError) {
          const DLQService = require('./business/DLQService');
          await DLQService.recordSideEffectFailure(
            'InventoryAlert:checkStockAfterChange',
            { materialId, locationId, afterQuantity },
            alertError
          );
        }
        // 注意：销售订单状态检查已统一移至 InboundTransactionService._handleSideEffects
      });

      return {
        success: true,
        beforeQuantity,
        afterQuantity,
        changeQuantity,
        // FIFO 拆分时返回最后一笔台账 id，供调整单等调用方关联财务分录
        transactionId: lastLedgerId,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`库存更新失败 [${materialId}-${locationId}]: ${error.message} (${duration}ms)`);
      throw error;
    }
  }

  /**
   * 将指定物料/库位/批次的台账数量对齐到目标余额（运维对账）。
   * 业务入库仍禁止空批次；此处仅允许 adjustment + allowEmptyBatch。
   */
  static async reconcileBatchToQuantity(
    {
      materialId,
      locationId,
      batchNumber = '',
      targetQuantity,
      operator = 1,
      remark = '库存台账对账调整',
      unitCost = null,
    },
    connection
  ) {
    if (!connection) {
      throw new Error('reconcileBatchToQuantity必须在数据库事务中调用');
    }
    const batchKey = this._normalizeBatchNumber(batchNumber);
    const [[row]] = await connection.query(
      `SELECT COALESCE(SUM(quantity), 0) AS q,
              COALESCE(SUM(CASE WHEN quantity < 0 THEN -ABS(total_value) ELSE ABS(total_value) END), 0) AS v
         FROM inventory_ledger
        WHERE material_id = ? AND location_id = ?
          AND COALESCE(NULLIF(batch_number, ''), '') = ?`,
      [materialId, locationId, batchKey]
    );
    const ledgerQty = Number(row?.q || 0);
    const target = Number(targetQuantity);
    const delta = Precision.sub(target, ledgerQty);
    if (Math.abs(delta) <= 0.000001) {
      return { adjusted: false, delta: 0, ledgerQty, targetQuantity: target };
    }

    let cost = unitCost;
    if (!(Number(cost) > 0) && Math.abs(ledgerQty) > 0.000001) {
      cost = Math.abs(Number(row?.v || 0) / ledgerQty);
    }
    if (!(Number(cost) > 0)) {
      const [[m]] = await connection.query(
        'SELECT cost_price FROM materials WHERE id = ? LIMIT 1',
        [materialId]
      );
      cost = Number(m?.cost_price || 0);
    }
    if (!(Number(cost) > 0)) {
      throw new Error(
        `对账调整缺少有效成本: materialId=${materialId}, locationId=${locationId}`
      );
    }

    const refNo = `ADJ-RECON-${materialId}-${locationId}-${Date.now()}`;
    await this.updateStock(
      {
        materialId,
        locationId,
        quantity: delta,
        transactionType: 'adjustment',
        referenceNo: refNo,
        referenceType: 'inventory_adjustment',
        operator,
        remark: `${remark} (ledger=${ledgerQty} → ${target})`,
        batchNumber: batchKey,
        allowEmptyBatch: true,
        allowNegativeStock: true,
        unitCost: cost,
        idempotencyKey: refNo,
      },
      connection
    );
    await this.rebuildStockBalancesForMaterial(materialId, connection);
    return { adjusted: true, delta, ledgerQty, targetQuantity: target, referenceNo: refNo };
  }

  /**
   * 验证物料和库位是否存在
   */
  static async _validateMaterialAndLocation(materialId, locationId, connection) {
    // 验证物料是否存在（不再强制要求 status = 1，因为停用的物料依然需要被允许出库销账）
    const [materialResult] = await connection.execute(
      'SELECT id FROM materials WHERE id = ? AND deleted_at IS NULL',
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
      `SELECT batch_number, ABS(quantity) as qty, unit_cost
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
            batchNumber: this._normalizeBatchNumber(row.batch_number) || `TR-${referenceNo}-${materialId}`,
            unitCost: row.unit_cost,
          },
          connection
        );
      }
    } else {
      // 兜底：批次信息查不到（如手动调整的旧数据），整体一笔写入
      // 入库必须有可追溯批次，禁止 null/'' 落入台账
      const transferInBatch =
        this._normalizeBatchNumber(batchNumber) || `TR-${referenceNo}-${materialId}-${toLocationId}`;
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
          batchNumber: transferInBatch,
        },
        connection
      );
    }

    return {
      success: true,
      sourceResult,
    };
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
      throw new Error(`检查库存充足性失败: ${error.message}`, { cause: error });
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
      // 仅统计 active 预留，与 InventoryReservationService 一致（已 released 不占可用量）
      const [result] = await conn.execute(
        `SELECT COALESCE(SUM(reserved_quantity), 0) as reserved
         FROM inventory_reservations
         WHERE material_id = ? AND location_id = ? AND status = 'active'`,
        [materialId, locationId]
      );

      return parseFloat(result[0].reserved) || 0;
    } catch (error) {
      logger.warn('获取预留数量失败，返回0:', error);
      return 0;
    }
  }

  // ✅ 新增：清除库存缓存
  static async clearStockCache(materialId, locationId = null) {
    if (!materialId) return;

    if (locationId) {
      // 清除指定物料和库位的缓存
      const cacheKey = `inventory_${materialId}_${locationId}`;
      await cacheService.delete(cacheKey);
      logger.debug(`Inventory cache cleared: key=${cacheKey}`);
    } else {
      // 清除该物料的所有缓存
      await cacheService.deleteByPrefix(`inventory_${materialId}_`);
      logger.debug(`Inventory caches cleared for material: materialId=${materialId}`);
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
      'SELECT location_id FROM materials WHERE id = ? AND deleted_at IS NULL',
      [materialId]
    );

    if (rows.length === 0) {
      throw new Error(`物料 ${materialId} 不存在，请检查物料基础数据`);
    }

    const locationId = rows[0].location_id;
    if (!locationId) {
      throw new Error(`物料 ${materialId} 未配置默认仓库，请在【物料管理】中设置存放仓库后再操作`);
    }

    return locationId;
  }

  /**
   * 获取物料的完整基础信息（仓库、单位等）
   *
   * 统一入口：在创建出入库单、批次操作等场景下，
   * 需要同时获取物料的默认单位和仓库时使用此方法。
   * 避免各处重复写 SELECT + 校验 + throw。
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
      'SELECT id, code, name, location_id, unit_id FROM materials WHERE id = ? AND deleted_at IS NULL',
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
      `SELECT id, code, name, location_id, unit_id, price, COALESCE(cost_price, 0) as cost_price
         FROM materials
        WHERE id IN (${placeholders})
          AND status = 1
          AND deleted_at IS NULL`,
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
