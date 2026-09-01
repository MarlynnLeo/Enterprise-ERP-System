const db = require('../../config/db');
const SystemConfigService = require('../system/SystemConfigService');
const arModel = require('../../models/ar');
const apModel = require('../../models/ap');
const financeModel = require('../../models/finance');
const taxModel = require('../../models/tax');
const { financeConfig } = require('../../config/financeConfig');
const { resolveActorUserId } = require('../../utils/userUtils');
const DocumentLinkService = require('../business/DocumentLinkService');
const InventoryPostingService = require('../InventoryPostingService');
const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');
const { logger } = require('../../utils/logger');
const {
  DOCUMENT_TYPES,
  TAX_RELATED_DOCUMENT_TYPES,
  taxRelatedDocumentTypeMatchList,
} = require('../../constants/financeConstants');
const {
  normalizeTaxRate,
  roundMoney,
  taxAmount: calculateTaxAmount,
} = require('../../utils/money');
const {
  resolveUnitPrice,
  resolveTaxRate,
  sqlUnitPriceExpr,
  sqlTaxRateExpr,
  sqlNonZeroUnitPrice,
} = require('../../utils/unitPriceFields');
const {
  addDaysToDateString,
  currentDateString,
  toLocalDateString,
} = require('../../utils/dateUtils');

// 表级单价列（SQL 只允许用这些表达式，禁止在 purchase_* 上写 unit_price）
// 采购订单/入库: price；销售订单: unit_price；销售出库: price

class FinanceIntegrationService {
  static async requireApprovedInventoryPosting(connection, sourceType, sourceNo) {
    return InventoryPostingService.requireApprovedForTransaction(connection, {
      reference_type: sourceType,
      reference_no: sourceNo,
    });
  }

  static formatMaterialLabel(item, idField = 'material_id') {
    const code = item.material_code || item.product_code || '';
    const name = item.material_name || item.product_name || '';
    const specs = item.specs || item.specification || '';
    const fallbackId = item[idField] || item.material_id || item.product_id;
    const label = [code, name, specs].filter(Boolean).join(' ');
    return label || (fallbackId ? `material#${fallbackId}` : 'unknown item');
  }

  static resolveTaxAmount(baseAmount, explicitTaxAmount, taxRate) {
    if (explicitTaxAmount !== null && explicitTaxAmount !== undefined && explicitTaxAmount !== '') {
      return roundMoney(explicitTaxAmount);
    }
    return calculateTaxAmount(baseAmount, normalizeTaxRate(taxRate, 0));
  }

  /**
   * 解析付款/收款账期（天）
   * 优先级：显式覆盖 > 往来单位 payment_term_days > 订单 payment_terms 文本 > 系统默认
   */
  static parsePaymentTermDays(raw, fallback = 30) {
    if (raw === null || raw === undefined || raw === '') return fallback;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
      return Math.min(3650, Math.floor(raw));
    }
    const text = String(raw).trim();
    if (/^\d+$/.test(text)) {
      return Math.min(3650, parseInt(text, 10));
    }
    // 常见写法：30天 / 月结30天 / Net 30 / 货到30天付款
    const m = text.match(/(\d+)\s*天/) || text.match(/net\s*(\d+)/i) || text.match(/(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 0) return Math.min(3650, n);
    }
    // fallback 显式为 null 时表示「无法解析」
    return fallback;
  }

  static async resolvePartyPaymentTermDays(
    connection,
    { supplierId = null, customerId = null, orderTerms = null } = {}
  ) {
    const fallback = financeConfig.get('invoice.defaultPaymentTermDays', 30);
    // 订单级账期优先（数字天或文本条款）
    if (orderTerms !== null && orderTerms !== undefined && orderTerms !== '') {
      const fromOrder = this.parsePaymentTermDays(orderTerms, null);
      // parse 失败时 fallback 会返回默认；仅当能解析出有效值时采用订单
      if (fromOrder != null && Number.isFinite(fromOrder)) {
        // 若 orderTerms 是纯文本且无法解析，parse 会返回 fallback；用显式检测区分
        if (
          typeof orderTerms === 'number' ||
          /^\d+$/.test(String(orderTerms).trim()) ||
          /(\d+)\s*天|net\s*\d+/i.test(String(orderTerms))
        ) {
          return fromOrder;
        }
      }
    }
    try {
      if (supplierId) {
        const [rows] = await connection.execute(
          'SELECT payment_term_days FROM suppliers WHERE id = ? LIMIT 1',
          [supplierId]
        );
        if (rows[0]?.payment_term_days != null && rows[0].payment_term_days !== '') {
          return this.parsePaymentTermDays(rows[0].payment_term_days, fallback);
        }
      }
      if (customerId) {
        const [rows] = await connection.execute(
          'SELECT payment_term_days FROM customers WHERE id = ? LIMIT 1',
          [customerId]
        );
        if (rows[0]?.payment_term_days != null && rows[0].payment_term_days !== '') {
          return this.parsePaymentTermDays(rows[0].payment_term_days, fallback);
        }
      }
    } catch (e) {
      // 列未迁移时降级，不阻断开票
      if (e.code !== 'ER_BAD_FIELD_ERROR') {
        logger.warn('[FinanceIntegration] 读取往来账期失败', { message: e.message });
      }
    }
    if (orderTerms) {
      return this.parsePaymentTermDays(orderTerms, fallback);
    }
    return this.parsePaymentTermDays(fallback, 30);
  }

  static formatPaymentTermsText(days) {
    const n = this.parsePaymentTermDays(days, 30);
    if (n === 0) return '货到付款';
    return `${n}天付款`;
  }

  static assertMoneyMatches(actual, expected, label) {
    const actualCents = Math.round((parseFloat(actual) || 0) * 100);
    const expectedCents = Math.round((parseFloat(expected) || 0) * 100);
    if (Math.abs(actualCents - expectedCents) > 1) {
      throw new Error(
        `${label}金额不一致: 已存在=${(actualCents / 100).toFixed(2)}, 应生成=${(expectedCents / 100).toFixed(2)}`
      );
    }
  }

  /**
   * 批量解析会计科目ID（1次查询替代 N+1）
   * @param {string[]} keys - 科目配置键名数组，如 ['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']
   * @returns {Object} key → accountId 的映射，例如 { ACCOUNTS_RECEIVABLE: 12, SALES_REVENUE: 15 }
   * @throws {Error} 如果任何科目缺少配置或不存在
   */
  static async resolveAccountIds(keys) {
    const { accountingConfig } = require('../../config/accountingConfig');
    // 0. 确保从数据库加载最新科目配置
    try {
      await accountingConfig.loadFromDatabase(db);
    } catch {
      // 保持后备配置继续
    }

    // 1. 从配置中解析出所有科目编码
    const keyToCode = {};
    for (const key of keys) {
      const code = accountingConfig.getAccountCode(key);
      if (!code) {
        throw new Error(`缺少必需的财务配置: ${key}，请先在财务设置中配置`);
      }
      keyToCode[key] = code;
    }

    // 2. 批量查询所有科目ID（优先匹配启用状态 is_active = 1）
    const uniqueCodes = [...new Set(Object.values(keyToCode))];
    const placeholders = uniqueCodes.map(() => '?').join(',');
    const [rows] = await db.pool.execute(
      `SELECT id, account_code, is_active FROM gl_accounts WHERE account_code IN (${placeholders}) ORDER BY is_active DESC, id ASC`,
      uniqueCodes
    );

    // 3. 构建编码→ID映射（优先选用激活科目）
    const codeToId = {};
    for (const row of rows) {
      if (row.is_active || !codeToId[row.account_code]) {
        codeToId[row.account_code] = row.id;
      }
    }

    // 4. 对未命中或未激活的科目，尝试从 gl_account_mappings 智能回退
    const missingKeys = keys.filter((k) => !codeToId[keyToCode[k]]);
    if (missingKeys.length > 0) {
      try {
        const [mappingRows] = await db.pool.execute(
          `SELECT gam.mapping_key, gam.account_id, ga.is_active, ga.account_code
           FROM gl_account_mappings gam
           JOIN gl_accounts ga ON gam.account_id = ga.id
           WHERE ga.is_active = 1`
        );
        const keyAliases = {
          COST_OF_GOODS_SOLD: ['COST_OF_SALES', 'SALES_COST', 'COST_OF_GOODS_SOLD'],
          SALES_COST: ['COST_OF_SALES', 'SALES_COST', 'COST_OF_GOODS_SOLD'],
          INVENTORY: ['FINISHED_GOODS', 'INVENTORY_FINISHED', 'INVENTORY_GOODS', 'INVENTORY'],
          FINISHED_GOODS: ['FINISHED_GOODS', 'INVENTORY_FINISHED', 'INVENTORY_GOODS'],
          RAW_MATERIALS: ['RAW_MATERIALS', 'INVENTORY_RAW'],
          ACCOUNTS_RECEIVABLE: ['ACCOUNTS_RECEIVABLE'],
          ACCOUNTS_PAYABLE: ['ACCOUNTS_PAYABLE'],
          SALES_REVENUE: ['SALES_REVENUE'],
          PRODUCTION_COST: ['PRODUCTION_COST', 'WIP_ACCOUNT', 'MATERIAL_COST'],
        };
        for (const k of missingKeys) {
          const aliases = keyAliases[k] || [k];
          const matched = mappingRows.find((m) => aliases.includes(m.mapping_key));
          if (matched) {
            codeToId[keyToCode[k]] = matched.account_id;
          }
        }
      } catch (fallbackError) {
        logger.warn(
          '[FinanceIntegrationService] gl_account_mappings fallback failed:',
          fallbackError.message
        );
      }
    }

    // 5. 校验并构建返回结果
    const result = {};
    for (const key of keys) {
      const code = keyToCode[key];
      if (!codeToId[code]) {
        throw new Error(`相关的财务科目不存在或未启用: ${code}，请前往会计科目页面配置后再试！`);
      }
      result[key] = codeToId[code];
    }

    return result;
  }

  /**
   * 验证必需的财务配置（委托给 resolveAccountIds）
   */
  static async validateRequiredConfigs(keys) {
    await this.resolveAccountIds(keys);
  }

  /**
   * 获取会计科目ID（单个查询，保留兼容性）
   */
  static async getAccountIdByKey(key) {
    try {
      const result = await this.resolveAccountIds([key]);
      return result[key] || null;
    } catch {
      return null;
    }
  }

  /**
   * 获取当前打开的会计期间
   */
  static async getCurrentPeriod(connection, date = null) {
    const targetDate = date ? toLocalDateString(date) : currentDateString();
    const [periods] = await connection.execute(
      'SELECT id FROM gl_periods WHERE is_closed = 0 AND start_date <= ? AND end_date >= ?',
      [targetDate, targetDate]
    );

    if (periods.length === 0) {
      throw new Error(`找不到包含日期 ${targetDate} 的已打开会计期间`);
    }

    return periods[0];
  }

  /**
   * 加载系统配置到内存
   */
  static async loadConfigurations() {
    await financeConfig.loadFromDatabase(db);
  }

  /**
   * 生成业务单据编号
   */
  static async generateInvoiceNumber(prefix, connection) {
    const CodeGeneratorService = require('../business/CodeGeneratorService');
    const businessType = prefix === 'AR' ? 'ar_invoice' : 'ap_invoice';
    return await CodeGeneratorService.nextCode(businessType, connection);
  }

  /**
   * 税务发票编号（编码规则 tax_invoice，禁止业务侧硬编码「待补录-」）
   * 真票号可在认证后通过 updateTaxInvoiceNumber 回写
   */
  static async generateTaxInvoiceNumber(connection) {
    const CodeGeneratorService = require('../business/CodeGeneratorService');
    return await CodeGeneratorService.nextCode('tax_invoice', connection);
  }

  /**
   * 来源单据幂等查询：
   * - 仅「有效」发票阻止重生（已取消/作废不算）
   * - 配合 UNIQUE(source_type,source_id)：取消时应释放 source（见 releaseSourceOnCancel）
   * @param {object} [options]
   * @param {boolean} [options.includeInactive=false] 为 true 时含作废（仅诊断用）
   */
  static async findExistingInvoiceBySource(
    connection,
    tableName,
    sourceType,
    sourceId,
    options = {}
  ) {
    if (!sourceId) return null;
    const allowedTables = {
      ar_invoices: 'invoice_number',
      ap_invoices: 'invoice_number',
    };
    const invoiceNumberColumn = allowedTables[tableName];
    if (!invoiceNumberColumn) {
      throw new Error(`不支持的发票幂等表: ${tableName}`);
    }

    const { INACTIVE_INVOICE_STATUSES } = require('../../constants/financeConstants');
    const includeInactive = options.includeInactive === true;
    const inactiveList = [...INACTIVE_INVOICE_STATUSES];
    const inactivePh = inactiveList.map(() => '?').join(', ');

    const sql = includeInactive
      ? `SELECT id, ${invoiceNumberColumn} AS invoice_number, total_amount, status
         FROM ${tableName}
         WHERE source_type = ? AND source_id = ?
         ORDER BY id DESC LIMIT 1 FOR UPDATE`
      : `SELECT id, ${invoiceNumberColumn} AS invoice_number, total_amount, status
         FROM ${tableName}
         WHERE source_type = ? AND source_id = ?
           AND status NOT IN (${inactivePh})
         ORDER BY id DESC LIMIT 1 FOR UPDATE`;

    const params = includeInactive
      ? [sourceType, sourceId]
      : [sourceType, sourceId, ...inactiveList];

    const [rows] = await connection.execute(sql, params);
    return rows[0] || null;
  }

  /**
   * 发票取消/作废后释放来源唯一键，允许同业务单据重新生成
   */
  static async releaseInvoiceSourceOnCancel(connection, tableName, invoiceId) {
    const allowed = new Set(['ar_invoices', 'ap_invoices']);
    if (!allowed.has(tableName) || !invoiceId) return;
    await connection.execute(
      `UPDATE ${tableName}
       SET source_id = NULL,
           notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE ' | ' END,
             '[source released on cancel ', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i'), ']'),
           updated_at = NOW()
       WHERE id = ?
         AND source_id IS NOT NULL`,
      [invoiceId]
    );
  }

  /**
   * 生成前清理：已取消/作废票仍占用 source_id 时释放 uq_source，避免
   * Duplicate entry 'purchase_receipt-xxx' for key 'uq_source'
   * （手工改 status 或旧数据未走 release 时会出现）
   */
  static async releaseStaleInactiveSource(connection, tableName, sourceType, sourceId) {
    if (!sourceId || !tableName) return 0;
    const stale = await this.findExistingInvoiceBySource(
      connection,
      tableName,
      sourceType,
      sourceId,
      { includeInactive: true }
    );
    if (!stale) return 0;

    const { INACTIVE_INVOICE_STATUSES } = require('../../constants/financeConstants');
    const status = String(stale.status || '');
    const inactive = INACTIVE_INVOICE_STATUSES.some(
      (s) => String(s).toLowerCase() === status.toLowerCase()
    );
    // 仅释放无效票；有效票由调用方走 skipped 分支
    if (!inactive) return 0;

    await this.releaseInvoiceSourceOnCancel(connection, tableName, stale.id);

    // 同步来源单据开票状态，避免列表被 invoice_status=invoiced 挡住
    if (sourceType === 'purchase_receipt') {
      await connection.execute(
        `UPDATE purchase_receipts
         SET invoice_status = 'uninvoiced', updated_at = NOW()
         WHERE id = ? AND deleted_at IS NULL`,
        [sourceId]
      );
    } else if (sourceType === 'sales_outbound') {
      // 出库表未必有 invoice_status；忽略失败
      try {
        await connection.execute(
          `UPDATE sales_outbound SET updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
          [sourceId]
        );
      } catch {
        /* optional column */
      }
    }

    logger.info('[FinanceIntegration] 已释放作废票占用的来源唯一键', {
      tableName,
      sourceType,
      sourceId,
      invoiceId: stale.id,
      invoiceNumber: stale.invoice_number,
      status: stale.status,
    });
    return 1;
  }

  static async findExistingTaxInvoice(connection, relatedDocumentType, relatedDocumentId) {
    if (!relatedDocumentId) return null;
    const types = taxRelatedDocumentTypeMatchList(relatedDocumentType);
    if (types.length === 0) return null;
    const placeholders = types.map(() => '?').join(', ');
    const [rows] = await connection.execute(
      `SELECT id, invoice_number, total_amount, status
       FROM tax_invoices
       WHERE related_document_type IN (${placeholders})
         AND related_document_id = ?
       LIMIT 1
       FOR UPDATE`,
      [...types, relatedDocumentId]
    );
    return rows[0] || null;
  }

  /**
   * 锁定业务来源单据，序列化集成生成（无来源行时唯一索引仍兜底）
   */
  static async lockSourceDocument(connection, tableName, sourceId) {
    const allowed = new Set([
      'sales_orders',
      'purchase_orders',
      'purchase_receipts',
      'sales_outbound', // 表名单数，与 baseline 一致
      'sales_returns',
      'purchase_returns',
    ]);
    if (!allowed.has(tableName) || !sourceId) return;
    await connection.execute(`SELECT id FROM ${tableName} WHERE id = ? FOR UPDATE`, [sourceId]);
  }

  static async findExistingActiveGlEntry(connection, documentType, documentNumber) {
    if (!documentNumber) return null;
    const [rows] = await connection.execute(
      `SELECT ge.id, ge.entry_number,
              ROUND(COALESCE(SUM(gei.debit_amount), 0), 2) AS total_debit,
              ROUND(COALESCE(SUM(gei.credit_amount), 0), 2) AS total_credit
       FROM gl_entries ge
       LEFT JOIN gl_entry_items gei ON gei.entry_id = ge.id
       WHERE ge.document_type = ?
         AND ge.document_number = ?
         AND COALESCE(ge.is_reversed, 0) = 0
       GROUP BY ge.id, ge.entry_number
       LIMIT 1
       FOR UPDATE`,
      [documentType, documentNumber]
    );
    return rows[0] || null;
  }

  static async getMaterialCostById(connection, materialIds) {
    const ids = [
      ...new Set(
        (materialIds || [])
          .map((id) => Number.parseInt(id, 10))
          .filter((id) => Number.isInteger(id) && id > 0)
      ),
    ];
    if (ids.length === 0) return new Map();

    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.query(
      `SELECT id, COALESCE(NULLIF(cost_price, 0), NULLIF(price, 0), 0) AS unit_cost
       FROM materials
       WHERE id IN (${placeholders})
       FOR UPDATE`,
      ids
    );

    return new Map(rows.map((row) => [Number(row.id), Number.parseFloat(row.unit_cost || 0)]));
  }

  /**
   * 读取外委发料实际发生的库存成本。
   *
   * 委外发料会先由 InventoryService 按 FIFO 拆批写入 inventory_ledger，
   * 因此这里应以出库台账的 unit_cost 为准，而不是只读取 materials.cost_price。
   * 后者在历史导入物料上可能为 0，但台账仍然保存了可用成本。
   */
  static async getOutsourcedIssueCost(connection, processingNo) {
    if (!processingNo) {
      return { totalCost: 0, ledgerLines: 0, invalidCostLines: 0 };
    }

    const [rows] = await connection.execute(
      `SELECT ROUND(COALESCE(SUM(ABS(quantity) * unit_cost), 0), 2) AS total_cost,
              SUM(CASE WHEN COALESCE(unit_cost, 0) <= 0 THEN 1 ELSE 0 END) AS invalid_cost_lines,
              COUNT(*) AS ledger_lines
         FROM inventory_ledger
        WHERE reference_no = ?
          AND transaction_type = 'outsourced_outbound'
          AND quantity < 0`,
      [processingNo]
    );

    return {
      totalCost: roundMoney(rows[0]?.total_cost || 0),
      ledgerLines: Number(rows[0]?.ledger_lines || 0),
      invalidCostLines: Number(rows[0]?.invalid_cost_lines || 0),
    };
  }

  /**
   * 计算委外入库本次应结转的材料成本和逐行入库成本。
   *
   * 材料成本在所有成品足量入库后只应结转一次，因此分批入库按
   * 本次累计实收数量相对计划总数量的增量进行分摊。加工费则按
   * 入库明细的加工单价直接计入成品成本。
   */
  static async getOutsourcedReceiptCostAllocation(connection, receipt, items) {
    const processingId = Number(receipt?.processing_id || 0);
    const receiptId = Number(receipt?.id || receipt?.receipt_id || 0);
    const normalizedItems = Array.isArray(items) ? items : [];
    const currentQuantity = normalizedItems.reduce(
      (sum, item) => sum + Math.max(Number(item.actual_quantity || 0), 0),
      0
    );

    if (!processingId || currentQuantity <= 0) {
      throw new Error('委外入库缺少有效加工单或实收数量');
    }

    const [productRows] = await connection.execute(
      `SELECT product_id, quantity
         FROM outsourced_processing_products
        WHERE processing_id = ?`,
      [processingId]
    );
    const plannedQuantity = productRows.reduce(
      (sum, row) => sum + Math.max(Number(row.quantity || 0), 0),
      0
    );
    if (plannedQuantity <= 0) {
      throw new Error(`委外加工单 ${receipt.processing_no || processingId} 没有有效成品计划数量`);
    }

    const priorParams = [processingId];
    let receiptExclusion = '';
    if (receiptId > 0) {
      receiptExclusion = ' AND opr.id <> ?';
      priorParams.push(receiptId);
    }
    const [priorRows] = await connection.execute(
      `SELECT COALESCE(SUM(opri.actual_quantity), 0) AS received_quantity
         FROM outsourced_processing_receipt_items opri
         INNER JOIN outsourced_processing_receipts opr
           ON opr.id = opri.receipt_id
        WHERE opr.processing_id = ?
          AND opr.status IN ('confirmed', 'completed')
          ${receiptExclusion}`,
      priorParams
    );
    const priorQuantity = Math.max(Number(priorRows[0]?.received_quantity || 0), 0);

    let materialCost = 0;
    const issueCost = await this.getOutsourcedIssueCost(connection, receipt.processing_no);
    if (issueCost.ledgerLines > 0) {
      if (issueCost.invalidCostLines > 0) {
        throw new Error(
          `委外加工单 ${receipt.processing_no || processingId} 存在零成本发料台账，不能生成委外入库凭证`
        );
      }
      materialCost = issueCost.totalCost;
    }

    if (materialCost <= 0) {
      const [materialRows] = await connection.execute(
        `SELECT material_id, quantity
           FROM outsourced_processing_materials
          WHERE processing_id = ?`,
        [processingId]
      );
      const materialCostById = await this.getMaterialCostById(
        connection,
        materialRows.map((item) => item.material_id)
      );
      materialCost = materialRows.reduce(
        (sum, item) =>
          sum + Number(item.quantity || 0) * (materialCostById.get(Number(item.material_id)) || 0),
        0
      );
    }
    materialCost = roundMoney(materialCost);

    const previousRatio = Math.min(priorQuantity / plannedQuantity, 1);
    const currentRatio = Math.min((priorQuantity + currentQuantity) / plannedQuantity, 1);
    const allocatedMaterialCost = roundMoney(
      roundMoney(materialCost * currentRatio) - roundMoney(materialCost * previousRatio)
    );
    const processingFee = roundMoney(
      normalizedItems.reduce(
        (sum, item) => sum + Number(item.actual_quantity || 0) * Number(item.unit_price || 0),
        0
      )
    );

    const materialUnitCost = materialCost / plannedQuantity;
    const materialCostByItemId = new Map();
    for (const item of normalizedItems) {
      const quantity = Math.max(Number(item.actual_quantity || 0), 0);
      const itemMaterialCost = Number((materialUnitCost * quantity).toFixed(6));
      const unitCost =
        quantity > 0 ? Number((materialUnitCost + Number(item.unit_price || 0)).toFixed(6)) : 0;
      materialCostByItemId.set(Number(item.id), {
        materialCost: itemMaterialCost,
        unitCost,
      });
    }

    return {
      materialCost,
      allocatedMaterialCost,
      processingFee,
      totalInventoryValue: roundMoney(allocatedMaterialCost + processingFee),
      materialCostByItemId,
    };
  }

  // ==================== 销售模块集成 ====================

  /**
   * 刷新销售订单开票状态（按已确认 AR 金额 vs 订单金额）
   */
  static async refreshSalesOrderInvoiceStatus(connection, orderId) {
    if (!orderId) return;
    // 明细：unit_price + tax_percent；表头：tax_rate / tax_amount / total_amount
    const itemPriceCol = sqlUnitPriceExpr(null, 'sales_order_items'); // unit_price
    const itemTaxCol = sqlTaxRateExpr(null, 'sales_order_items'); // tax_percent
    const [orderRows] = await connection.execute(
      `SELECT ROUND(COALESCE(SUM(quantity * ${itemPriceCol}), 0), 2) AS subtotal,
              MAX(${itemTaxCol}) AS tax_percent
       FROM sales_order_items
       WHERE order_id = ?`,
      [orderId]
    );
    const [taxRows] = await connection.execute(
      `SELECT tax_rate, tax_amount, total_amount, subtotal
       FROM sales_orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    const subtotal = roundMoney(orderRows[0]?.subtotal || taxRows[0]?.subtotal || 0);
    const taxAmount = this.resolveTaxAmount(
      subtotal,
      taxRows[0]?.tax_amount,
      resolveTaxRate(taxRows[0], resolveTaxRate(orderRows[0], 0))
    );
    // 优先用表头 total_amount（已含税），否则 subtotal+税
    const headerTotal = roundMoney(taxRows[0]?.total_amount || 0);
    const orderTotal = headerTotal > 0 ? headerTotal : roundMoney(subtotal + taxAmount);

    const [arRows] = await connection.execute(
      `SELECT ROUND(COALESCE(SUM(total_amount), 0), 2) AS invoiced
       FROM ar_invoices
       WHERE (
         (source_type = 'sales_order' AND source_id = ?)
         OR (
           source_type = 'sales_outbound'
           AND source_id IN (
             SELECT id FROM sales_outbound
             WHERE deleted_at IS NULL
               AND (order_id = ? OR id IN (
                 SELECT outbound_id FROM sales_outbound_items WHERE source_order_id = ?
               ))
           )
         )
       )
       AND status NOT IN ('cancelled', '已取消', 'void', '作废')`,
      [orderId, orderId, orderId]
    );
    const invoiced = roundMoney(arRows[0]?.invoiced || 0);
    let invoiceStatus = 'not_invoiced';
    if (invoiced > 0.01 && orderTotal > 0 && invoiced + 0.01 < orderTotal) {
      invoiceStatus = 'partial';
    } else if (invoiced + 0.01 >= orderTotal && orderTotal > 0) {
      invoiceStatus = 'invoiced';
    } else if (invoiced > 0.01) {
      invoiceStatus = 'invoiced';
    }
    await connection.execute(
      `UPDATE sales_orders SET invoice_status = ?, updated_at = NOW() WHERE id = ?`,
      [invoiceStatus, orderId]
    );
  }

  /**
   * 从销售出库单按交货量生成应收发票（专业 ERP：invoice what you ship）
   * 幂等键：source_type=sales_outbound + source_id=outboundId
   */
  static async generateARInvoiceFromSalesOutbound(
    outboundData,
    salesOrders = [],
    userId = null,
    options = {}
  ) {
    // 默认关闭自动生成；手工接口传 force:true 可绕过开关
    const autoGenerate =
      options.force === true || (await SystemConfigService.get('auto_generate_ar_invoice', false));
    if (!autoGenerate) {
      return {
        skipped: true,
        message: '自动生成应收发票已关闭，请在会计凭证中选择「销售出库单」手工生成',
      };
    }

    const outboundId = outboundData?.id;
    if (!outboundId) {
      throw new Error('出库单 ID 缺失，不能生成应收发票');
    }

    // options.connection：合并生成等外层事务；由外层 commit/rollback
    const isExternalConn = !!options.connection;
    const connection = options.connection || (await db.pool.getConnection());
    try {
      if (!isExternalConn) await connection.beginTransaction();
      await this.requireApprovedInventoryPosting(
        connection,
        'sales_outbound',
        outboundData.outbound_no
      );
      await this.lockSourceDocument(connection, 'sales_outbound', outboundId);

      const existingInvoice = await this.findExistingInvoiceBySource(
        connection,
        'ar_invoices',
        'sales_outbound',
        outboundId
      );
      if (existingInvoice) {
        if (!isExternalConn) await connection.commit();
        return {
          skipped: true,
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          amount: existingInvoice.total_amount,
          message: '出库应收发票已存在',
        };
      }

      // 已取消应收仍占 uq_source 时先释放
      await this.releaseStaleInactiveSource(
        connection,
        'ar_invoices',
        'sales_outbound',
        outboundId
      );

      // 若仍存在按整单 SO 开的旧票（历史路径），跳过自动按出库开票，避免双重应收
      const orderList = Array.isArray(salesOrders) ? salesOrders.filter((o) => o?.id) : [];
      for (const order of orderList) {
        const legacy = await this.findExistingInvoiceBySource(
          connection,
          'ar_invoices',
          'sales_order',
          order.id
        );
        if (
          legacy &&
          !['cancelled', '已取消', 'void', '作废'].includes(String(legacy.status || ''))
        ) {
          if (!isExternalConn) await connection.commit();
          return {
            skipped: true,
            invoiceId: legacy.id,
            invoiceNumber: legacy.invoice_number,
            amount: legacy.total_amount,
            message:
              `订单 ${order.order_no || order.id} 已有历史订单级应收（${legacy.invoice_number}），` +
              `为避免双重应收已跳过出库开票。专业路径应按出库量开票：请将旧票作废/红冲后，` +
              `再在「会计凭证→销售出库单」生成出库级应收。`,
            legacySource: 'sales_order',
            legacyInvoiceId: legacy.id,
          };
        }
      }

      const [itemRows] = await connection.execute(
        `SELECT sobi.product_id AS material_id,
                sobi.quantity,
                sobi.source_order_id,
                sob.order_id AS header_order_id,
                m.name AS material_name,
                m.code AS material_code,
                m.specs AS specs
         FROM sales_outbound_items sobi
         JOIN sales_outbound sob ON sob.id = sobi.outbound_id
         LEFT JOIN materials m ON m.id = sobi.product_id
         WHERE sobi.outbound_id = ?`,
        [outboundId]
      );

      if (!itemRows.length) {
        await connection.rollback();
        throw new Error(`出库单 ${outboundData.outbound_no || outboundId} 无明细，不能生成应收`);
      }

      // 单价取自对应销售订单明细
      const orderIds = [
        ...new Set(
          itemRows
            .map((r) => Number(r.source_order_id || r.header_order_id))
            .filter((id) => Number.isInteger(id) && id > 0)
        ),
      ];
      if (orderIds.length === 0 && orderList.length) {
        orderList.forEach((o) => orderIds.push(Number(o.id)));
      }

      const priceMap = new Map(); // `${orderId}:${materialId}` -> unit_price
      let taxRate = 0;
      if (orderIds.length) {
        const ph = orderIds.map(() => '?').join(',');
        const [priceRows] = await connection.execute(
          `SELECT order_id, material_id, unit_price
           FROM sales_order_items
           WHERE order_id IN (${ph})`,
          orderIds
        );
        priceRows.forEach((row) => {
          priceMap.set(`${row.order_id}:${row.material_id}`, parseFloat(row.unit_price) || 0);
        });
        const [taxInfo] = await connection.execute(
          `SELECT tax_rate FROM sales_orders WHERE id IN (${ph}) LIMIT 1`,
          orderIds
        );
        taxRate = normalizeTaxRate(taxInfo[0]?.tax_rate, 0);
      }

      const invoiceItems = [];
      let subtotalCents = 0;
      for (const row of itemRows) {
        const orderId = Number(row.source_order_id || row.header_order_id) || orderIds[0] || null;
        const qty = parseFloat(row.quantity) || 0;
        if (qty <= 0) continue;
        let unitPrice = priceMap.get(`${orderId}:${row.material_id}`);
        if (unitPrice === undefined || unitPrice === null) {
          // 回退：任意订单同物料价
          for (const oid of orderIds) {
            const p = priceMap.get(`${oid}:${row.material_id}`);
            if (p !== undefined) {
              unitPrice = p;
              break;
            }
          }
        }
        unitPrice = parseFloat(unitPrice) || 0;
        if (unitPrice <= 0) {
          await connection.rollback();
          throw new Error(
            `出库单 ${outboundData.outbound_no || outboundId} 物料 ${row.material_code || row.material_id} 缺少有效单价`
          );
        }
        const lineCents = Math.round(qty * unitPrice * 100);
        subtotalCents += lineCents;
        invoiceItems.push({
          product_id: row.material_id,
          product_name: row.material_name || row.material_code || `material#${row.material_id}`,
          description: `销售出库 ${outboundData.outbound_no || outboundId} ${row.material_name || row.material_code || ''}`,
          quantity: qty,
          unit_price: unitPrice,
          amount: lineCents / 100,
        });
      }

      if (!invoiceItems.length) {
        await connection.rollback();
        throw new Error(`出库单 ${outboundData.outbound_no || outboundId} 无可开票数量`);
      }

      // 预览确认覆盖（仅认 camelCase：items / taxRate / taxAmount / invoiceDate / notes / accounts）
      const overrides =
        options.overrides && typeof options.overrides === 'object' ? options.overrides : null;
      if (Array.isArray(overrides?.items) && overrides.items.length) {
        invoiceItems.length = 0;
        subtotalCents = 0;
        for (const raw of overrides.items) {
          const qty = parseFloat(raw.quantity) || 0;
          const unitPrice = parseFloat(raw.unit_price ?? raw.price) || 0;
          if (qty <= 0 || unitPrice < 0) continue;
          const lineCents = Math.round(qty * unitPrice * 100);
          subtotalCents += lineCents;
          const materialId = raw.product_id || raw.material_id || null;
          invoiceItems.push({
            product_id: materialId,
            product_name:
              raw.product_name ||
              raw.material_name ||
              raw.material_code ||
              (materialId ? `material#${materialId}` : '手工调整行'),
            description: raw.description || `销售出库 ${outboundData.outbound_no || outboundId}`,
            quantity: qty,
            unit_price: unitPrice,
            amount: lineCents / 100,
          });
        }
        if (!invoiceItems.length) {
          await connection.rollback();
          throw new Error(
            `出库单 ${outboundData.outbound_no || outboundId} 覆盖明细无效，不能生成应收`
          );
        }
      }
      if (overrides?.taxRate != null && overrides.taxRate !== '') {
        taxRate = normalizeTaxRate(overrides.taxRate, taxRate);
      }

      const subtotalAmount = subtotalCents / 100;
      const taxAmount = this.resolveTaxAmount(
        subtotalAmount,
        overrides?.taxAmount ?? null,
        taxRate
      );
      const totalAmount = roundMoney(subtotalAmount + taxAmount);

      const accountIds = await this.resolveAccountIds(['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']);
      await this.loadConfigurations();
      const invoiceNumber = await this.generateInvoiceNumber('AR', connection);

      const invoiceDateStr = overrides?.invoiceDate
        ? toLocalDateString(overrides.invoiceDate)
        : currentDateString();
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);
      const primaryOrder = orderList[0] || null;
      const createdBy = await resolveActorUserId(
        connection,
        userId,
        outboundData.created_by,
        primaryOrder?.created_by,
        financeConfig.get('system.defaultCreator', null)
      );

      const customerId = outboundData.customer_id || primaryOrder?.customer_id || null;
      const customerName = outboundData.customer_name || primaryOrder?.customer_name || null;
      const paymentTermDays = await this.resolvePartyPaymentTermDays(connection, {
        customerId,
        orderTerms: primaryOrder?.payment_terms || null,
      });
      const dueDateStr = addDaysToDateString(invoiceDateStr, paymentTermDays);

      // 销项税科目：覆盖 > 配置明细（222102），禁止静默落到总类
      let outputTaxAccountId = overrides?.accounts?.taxAccountId || null;
      if (!outputTaxAccountId) {
        try {
          const taxIds = await this.resolveAccountIds(['VAT_OUTPUT_TAX']);
          outputTaxAccountId = taxIds.VAT_OUTPUT_TAX;
        } catch {
          outputTaxAccountId = null;
        }
      }

      const orderNos = orderList
        .map((o) => o.order_no)
        .filter(Boolean)
        .join(',');
      const defaultNotes = `由销售出库 ${outboundData.outbound_no || outboundId}${orderNos ? ` (订单 ${orderNos})` : ''} 按交货量自动生成`;
      const invoiceData = {
        invoice_number: invoiceNumber,
        customer_id: customerId,
        invoice_date: invoiceDateStr,
        due_date: dueDateStr,
        total_amount: totalAmount,
        amount_excluding_tax: subtotalAmount,
        subtotal: subtotalAmount,
        tax_amount: taxAmount,
        tax_rate: taxRate,
        currency_code:
          primaryOrder?.currency || financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate:
          primaryOrder?.exchange_rate || financeConfig.get('invoice.defaultExchangeRate', 1.0),
        status: '已确认',
        terms: this.formatPaymentTermsText(paymentTermDays),
        notes: overrides?.notes || overrides?.description || defaultNotes,
        source_type: DocType.SALES_OUTBOUND,
        source_id: outboundId,
        customer_name: customerName,
        created_by: createdBy,
        // 合并凭证：发票仍创建，跳过单票总账，由上层写一张合并分录
        skip_gl_entry: options.skipGlEntry === true,
        gl_entry: {
          period_id: currentPeriod?.id ?? null,
          receivable_account_id:
            overrides?.accounts?.receivableAccountId || accountIds.ACCOUNTS_RECEIVABLE,
          income_account_id: overrides?.accounts?.incomeAccountId || accountIds.SALES_REVENUE,
          output_tax_account_id: outputTaxAccountId,
          created_by: createdBy,
        },
        items: invoiceItems,
      };

      const invoiceId = await arModel.createInvoice(invoiceData, connection);
      await DocumentLinkService.tryAutoLink(
        DocType.SALES_OUTBOUND,
        outboundId,
        outboundData.outbound_no,
        DocType.AR_INVOICE,
        invoiceId,
        invoiceNumber,
        createdBy,
        connection
      );

      for (const oid of orderIds) {
        await this.refreshSalesOrderInvoiceStatus(connection, oid);
      }

      if (!isExternalConn) await connection.commit();
      return { invoiceId, invoiceNumber, amount: totalAmount, source: 'sales_outbound' };
    } catch (error) {
      if (!isExternalConn) await connection.rollback();
      throw error;
    } finally {
      if (!isExternalConn) connection.release();
    }
  }

  /**
   * 从销售订单自动生成应收发票（例外路径）
   * 专业主路径应为出库开票；若该订单已有出库级有效 AR，禁止再开订单级票，防双重应收。
   */
  static async generateARInvoiceFromSalesOrder(salesOrder, userId = null, options = {}) {
    // 默认关闭自动生成；手工接口传 force:true 可绕过开关
    const autoGenerate =
      options.force === true || (await SystemConfigService.get('auto_generate_ar_invoice', false));
    if (!autoGenerate) {
      return {
        skipped: true,
        message: '自动生成应收发票已关闭，请在会计凭证中选择「销售出库单」手工生成',
      };
    }

    // 例外路径需显式 allowOrderLevel=true（或配置 enable_order_level_ar_invoice）
    const allowOrderLevel =
      options.allowOrderLevel === true ||
      (await SystemConfigService.get('enable_order_level_ar_invoice', false));
    if (!allowOrderLevel) {
      return {
        skipped: true,
        message:
          '订单级应收已禁用（专业路径：请按销售出库单开票）。如需例外请设置 enable_order_level_ar_invoice 或传 allowOrderLevel',
      };
    }

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.lockSourceDocument(connection, 'sales_orders', salesOrder.id);

      // 若订单关联出库已有有效 AR，禁止订单级开票
      const { INACTIVE_INVOICE_STATUSES } = require('../../constants/financeConstants');
      const inactivePh = INACTIVE_INVOICE_STATUSES.map(() => '?').join(', ');
      const [outboundAr] = await connection.execute(
        `SELECT ar.id, ar.invoice_number, so.outbound_no
         FROM sales_outbound so
         JOIN ar_invoices ar
           ON ar.source_type = 'sales_outbound' AND ar.source_id = so.id
          AND ar.status NOT IN (${inactivePh})
         WHERE so.deleted_at IS NULL
           AND (so.order_id = ? OR so.id IN (
             SELECT outbound_id FROM sales_outbound_items WHERE source_order_id = ?
           ))
         LIMIT 1`,
        [...INACTIVE_INVOICE_STATUSES, salesOrder.id, salesOrder.id]
      );
      if (outboundAr.length) {
        await connection.rollback();
        throw new Error(
          `订单 ${salesOrder.order_no || salesOrder.id} 关联出库 ${outboundAr[0].outbound_no} ` +
            `已有出库级应收 ${outboundAr[0].invoice_number}，禁止再开订单级应收（防双重确认收入）`
        );
      }

      const [orderAmountRows] = await connection.execute(
        `SELECT ROUND(COALESCE(SUM(quantity * unit_price), 0), 2) AS subtotal
         FROM sales_order_items
         WHERE order_id = ?`,
        [salesOrder.id]
      );
      const expectedSubtotalAmount = roundMoney(orderAmountRows[0]?.subtotal || 0);
      const expectedTaxAmount = this.resolveTaxAmount(
        expectedSubtotalAmount,
        salesOrder.tax_amount,
        salesOrder.tax_rate
      );
      const expectedTotalAmount = roundMoney(expectedSubtotalAmount + expectedTaxAmount);

      const existingInvoice = await this.findExistingInvoiceBySource(
        connection,
        'ar_invoices',
        'sales_order',
        salesOrder.id
      );
      if (existingInvoice) {
        this.assertMoneyMatches(existingInvoice.total_amount, expectedTotalAmount, '应收发票');
        await DocumentLinkService.tryAutoLink(
          DocType.SALES_ORDER,
          salesOrder.id,
          salesOrder.order_no,
          DocType.AR_INVOICE,
          existingInvoice.id,
          existingInvoice.invoice_number,
          null,
          connection
        );
        await this.refreshSalesOrderInvoiceStatus(connection, salesOrder.id);
        const [existingGl] = await connection.execute(
          `SELECT id, entry_number FROM gl_entries
           WHERE document_number = ? AND COALESCE(is_reversed, 0) = 0
           ORDER BY id DESC LIMIT 1`,
          [existingInvoice.invoice_number]
        );
        await connection.commit();
        return {
          skipped: true,
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          amount: existingInvoice.total_amount,
          entryId: existingGl?.[0]?.id || null,
          entryNumber: existingGl?.[0]?.entry_number || null,
          message: '应收发票已存在',
        };
      }

      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']);
      const receivableAccountId = accountIds.ACCOUNTS_RECEIVABLE;
      const incomeAccountId = accountIds.SALES_REVENUE;

      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AR', connection);

      const [orderItems] = await connection.execute(
        `SELECT soi.material_id, soi.quantity, soi.unit_price,
                m.name as material_name, m.code as material_code, m.specs as specs
         FROM sales_order_items soi
         LEFT JOIN materials m ON soi.material_id = m.id
         WHERE soi.order_id = ?`,
        [salesOrder.id]
      );

      if (orderItems.length === 0) {
        await connection.rollback();
        throw new Error(
          `销售订单 ${salesOrder.order_no || salesOrder.id} 没有明细，不能生成应收发票`
        );
      }

      // ✅ 精度修复：使用整数运算避免浮点累加误差（与 GLService 对齐）
      const subtotalAmount =
        orderItems.reduce((sum, item) => {
          return sum + Math.round(parseFloat(item.quantity || 0) * resolveUnitPrice(item) * 100);
        }, 0) / 100;
      const taxAmount = this.resolveTaxAmount(
        subtotalAmount,
        salesOrder.tax_amount,
        salesOrder.tax_rate
      );
      const totalAmount = roundMoney(subtotalAmount + taxAmount);

      const invoiceDateStr = currentDateString();
      const paymentTermDays = await this.resolvePartyPaymentTermDays(connection, {
        customerId: salesOrder.customer_id || null,
        orderTerms: salesOrder.payment_terms || null,
      });
      const dueDateStr = addDaysToDateString(invoiceDateStr, paymentTermDays);
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);
      const createdBy = await resolveActorUserId(
        connection,
        userId,
        salesOrder.created_by,
        financeConfig.get('system.defaultCreator', null)
      );

      const invoiceData = {
        invoice_number: invoiceNumber,
        customer_id: salesOrder.customer_id || null,
        invoice_date: invoiceDateStr,
        due_date: dueDateStr,
        total_amount: totalAmount,
        amount_excluding_tax: subtotalAmount,
        subtotal: subtotalAmount,
        tax_amount: taxAmount,
        tax_rate: salesOrder.tax_rate ?? null,
        currency_code: salesOrder.currency || financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate:
          salesOrder.exchange_rate || financeConfig.get('invoice.defaultExchangeRate', 1.0),
        status: '已确认',
        terms: this.formatPaymentTermsText(paymentTermDays),
        notes: options.force
          ? `由销售订单 ${salesOrder.order_no} 手工生成`
          : `由销售订单 ${salesOrder.order_no} 自动生成`,
        source_type: DocType.SALES_ORDER,
        source_id: salesOrder.id || null,
        customer_name: salesOrder.customer_name || null,
        created_by: createdBy,
        gl_entry: {
          period_id: currentPeriod?.id ?? null,
          receivable_account_id: receivableAccountId,
          income_account_id: incomeAccountId,
          created_by: createdBy,
        },
      };

      const invoiceItems = orderItems.map((item) => {
        const unitPrice = resolveUnitPrice(item);
        const qty = parseFloat(item.quantity || 0);
        return {
          product_id: item.material_id,
          product_name: item.material_name || item.material_code || `material#${item.material_id}`,
          description: `销售商品 ${item.material_name || item.material_code}`,
          quantity: qty,
          price: unitPrice,
          unit_price: unitPrice,
          amount: Math.round(qty * unitPrice * 100) / 100,
        };
      });

      invoiceData.items = invoiceItems;
      const invoiceId = await arModel.createInvoice(invoiceData, connection);
      await DocumentLinkService.tryAutoLink(
        DocType.SALES_ORDER,
        salesOrder.id,
        salesOrder.order_no,
        DocType.AR_INVOICE,
        invoiceId,
        invoiceNumber,
        createdBy,
        connection
      );
      await this.refreshSalesOrderInvoiceStatus(connection, salesOrder.id);

      // 查询同步生成的会计凭证，便于前端展示（提交前查，连接仍可用）
      const [glRows] = await connection.execute(
        `SELECT id, entry_number FROM gl_entries
         WHERE document_number = ? AND COALESCE(is_reversed, 0) = 0
         ORDER BY id DESC LIMIT 1`,
        [invoiceNumber]
      );

      await connection.commit();

      return {
        invoiceId,
        invoiceNumber,
        amount: totalAmount,
        entryId: glRows?.[0]?.id || null,
        entryNumber: glRows?.[0]?.entry_number || null,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成销售红字发票
   */
  static async generateARCreditNoteFromSalesReturn(salesReturn) {
    const autoGenerate = await SystemConfigService.get('auto_generate_ar_credit_note', false);
    if (!autoGenerate) return { skipped: true, message: '自动生成红字应收已关闭' };

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.requireApprovedInventoryPosting(connection, 'sales_return', salesReturn.return_no);
      await this.lockSourceDocument(connection, 'sales_returns', salesReturn.id);

      const existingInvoice = await this.findExistingInvoiceBySource(
        connection,
        'ar_invoices',
        'sales_return',
        salesReturn.id
      );
      if (existingInvoice) {
        await DocumentLinkService.tryAutoLink(
          DocType.SALES_RETURN,
          salesReturn.id,
          salesReturn.return_no,
          DocType.AR_INVOICE,
          existingInvoice.id,
          existingInvoice.invoice_number,
          salesReturn.created_by || null,
          connection
        );
        await connection.commit();
        return {
          skipped: true,
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          amount: existingInvoice.total_amount,
          message: '销售红字发票已存在',
        };
      }

      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']);
      const receivableAccountId = accountIds.ACCOUNTS_RECEIVABLE;
      const incomeAccountId = accountIds.SALES_REVENUE;

      let customerId = salesReturn.customer_id;
      let customerName = salesReturn.customer_name;
      if (!customerId && salesReturn.order_id) {
        const [orderRows] = await connection.execute(
          `SELECT so.customer_id, c.name AS customer_name
           FROM sales_orders so
           LEFT JOIN customers c ON so.customer_id = c.id
           WHERE so.id = ?`,
          [salesReturn.order_id]
        );
        if (orderRows.length > 0) {
          customerId = orderRows[0].customer_id;
          customerName = orderRows[0].customer_name || customerName;
        }
      }
      if (!customerId) {
        await connection.rollback();
        throw new Error(
          `销售退货单 ${salesReturn.return_no || salesReturn.id} 缺少客户信息，不能生成红字应收发票`
        );
      }

      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AR', connection);

      const [returnItems] = await connection.execute(
        `SELECT sri.product_id as material_id, m.name as material_name, m.code as material_code,
                m.specs as specs, sri.quantity as return_quantity,
                COALESCE(soi.unit_price, m.price, 0) AS unit_price
         FROM sales_return_items sri
         LEFT JOIN materials m ON sri.product_id = m.id
         LEFT JOIN sales_returns sr ON sri.return_id = sr.id
         LEFT JOIN sales_orders so ON sr.order_id = so.id
         LEFT JOIN sales_order_items soi ON so.id = soi.order_id AND sri.product_id = soi.material_id
         WHERE sri.return_id = ?`,
        [salesReturn.id]
      );

      if (returnItems.length === 0) {
        await connection.rollback();
        throw new Error(
          `销售退货单 ${salesReturn.return_no || salesReturn.id} 没有物料明细，不能生成红字应收发票`
        );
      }

      // ✅ 精度修复：整数运算
      const totalAmount =
        returnItems.reduce(
          (sum, item) =>
            sum +
            Math.round(
              parseFloat(item.return_quantity || 0) * parseFloat(item.unit_price || 0) * 100
            ),
          0
        ) / 100;
      const creditNoteAmount = -Math.abs(totalAmount);
      if (totalAmount === 0) {
        await connection.rollback();
        throw new Error(
          `销售退货单 ${salesReturn.return_no || salesReturn.id} 退货金额为0，不能生成红字应收发票`
        );
      }

      const invoiceDateStr = toLocalDateString(salesReturn.return_date || currentDateString());
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);
      const createdBy = await resolveActorUserId(
        connection,
        salesReturn.created_by,
        financeConfig.get('system.defaultCreator', null)
      );

      const invoiceData = {
        invoice_number: invoiceNumber,
        customer_id: customerId || null,
        invoice_date: invoiceDateStr,
        due_date: invoiceDateStr,
        total_amount: creditNoteAmount,
        currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate: 1.0,
        status: '已确认',
        notes: `【红字发票】销售退货单 ${salesReturn.return_no} 冲减`,
        source_type: DocType.SALES_RETURN,
        source_id: salesReturn.id || null,
        customer_name: customerName || null,
        created_by: createdBy,
        gl_entry: {
          period_id: currentPeriod?.id ?? null,
          receivable_account_id: receivableAccountId,
          income_account_id: incomeAccountId,
          created_by: createdBy,
        },
        items: returnItems.map((item) => ({
          product_id: item.material_id,
          product_name: item.material_name || item.material_code || `material#${item.material_id}`,
          description: `退货冲减 ${item.material_name || item.material_code}`,
          quantity: -parseFloat(item.return_quantity || 0),
          unit_price: parseFloat(item.unit_price || 0),
          amount:
            -Math.round(
              parseFloat(item.return_quantity || 0) * parseFloat(item.unit_price || 0) * 100
            ) / 100,
        })),
      };

      const invoiceId = await arModel.createInvoice(invoiceData, connection);
      await DocumentLinkService.tryAutoLink(
        DocType.SALES_RETURN,
        salesReturn.id,
        salesReturn.return_no,
        DocType.AR_INVOICE,
        invoiceId,
        invoiceNumber,
        salesReturn.created_by || 0,
        connection
      );
      await connection.commit();
      return { invoiceId, invoiceNumber, amount: creditNoteAmount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== 采购模块集成 ====================

  /**
   * 生成应付发票
   */
  static async generateAPInvoiceFromPurchaseReceipt(purchaseReceipt, userId = null, options = {}) {
    // 默认关闭自动生成；手工接口传 force:true 可绕过开关
    const autoGenerate =
      options.force === true || (await SystemConfigService.get('auto_generate_ap_invoice', false));
    if (!autoGenerate) {
      return {
        skipped: true,
        message: '自动生成应付发票已关闭，请在会计凭证中选择「采购入库单」手工生成',
      };
    }

    const isExternalConn = !!options.connection;
    const connection = options.connection || (await db.pool.getConnection());
    try {
      if (!isExternalConn) await connection.beginTransaction();
      await this.requireApprovedInventoryPosting(connection, 'inbound', purchaseReceipt.receipt_no);
      await this.lockSourceDocument(connection, 'purchase_receipts', purchaseReceipt.id);

      const [receiptAmountRows] = await connection.execute(
        `SELECT ROUND(COALESCE(SUM(pri.qualified_quantity * COALESCE(
            NULLIF(${sqlUnitPriceExpr('pri', 'purchase_receipt_items')}, 0),
            NULLIF(${sqlUnitPriceExpr('poi', 'purchase_order_items')}, 0),
            NULLIF(m.cost_price, 0),
            0
          )), 0), 2) AS subtotal
         FROM purchase_receipt_items pri
         LEFT JOIN purchase_receipts pr ON pri.receipt_id = pr.id
         LEFT JOIN purchase_orders po ON pr.order_id = po.id
         LEFT JOIN purchase_order_items poi ON po.id = poi.order_id AND pri.material_id = poi.material_id
         LEFT JOIN materials m ON pri.material_id = m.id
         WHERE pri.receipt_id = ?`,
        [purchaseReceipt.id]
      );
      const expectedSubtotalAmount = roundMoney(receiptAmountRows[0]?.subtotal || 0);
      const expectedTaxAmount = this.resolveTaxAmount(
        expectedSubtotalAmount,
        purchaseReceipt.total_tax_amount,
        purchaseReceipt.tax_rate
      );
      const expectedTotalAmount = roundMoney(expectedSubtotalAmount + expectedTaxAmount);

      const existingInvoice = await this.findExistingInvoiceBySource(
        connection,
        'ap_invoices',
        'inbound',
        purchaseReceipt.id
      );
      if (existingInvoice) {
        this.assertMoneyMatches(existingInvoice.total_amount, expectedTotalAmount, '应付发票');
        await DocumentLinkService.tryAutoLink(
          DocType.PURCHASE_RECEIPT,
          purchaseReceipt.id,
          purchaseReceipt.receipt_no,
          DocType.AP_INVOICE,
          existingInvoice.id,
          existingInvoice.invoice_number,
          userId || null,
          connection
        );
        await connection.execute(
          "UPDATE purchase_receipts SET invoice_status = 'invoiced', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL",
          [purchaseReceipt.id]
        );
        if (!isExternalConn) await connection.commit();
        return {
          skipped: true,
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          amount: existingInvoice.total_amount,
          message: '应付发票已存在',
        };
      }

      // 已取消票仍占 uq_source 时先释放，否则 INSERT 会 Duplicate entry
      await this.releaseStaleInactiveSource(
        connection,
        'ap_invoices',
        'purchase_receipt',
        purchaseReceipt.id
      );

      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_PAYABLE', 'GR_IR']);
      const payableAccountId = accountIds.ACCOUNTS_PAYABLE;
      const purchaseCostAccountId = accountIds.GR_IR;
      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AP', connection);

      let [receiptItems] = await connection.execute(
        `SELECT pri.material_id, pri.qualified_quantity as quantity,
                COALESCE(
                  NULLIF(${sqlUnitPriceExpr('pri', 'purchase_receipt_items')}, 0),
                  NULLIF(${sqlUnitPriceExpr('poi', 'purchase_order_items')}, 0),
                  NULLIF(m.cost_price, 0),
                  0
                ) AS price,
                COALESCE(
                  NULLIF(${sqlUnitPriceExpr('pri', 'purchase_receipt_items')}, 0),
                  NULLIF(${sqlUnitPriceExpr('poi', 'purchase_order_items')}, 0),
                  NULLIF(m.cost_price, 0),
                  0
                ) AS unit_price,
                m.name as material_name, m.code as material_code, m.specs as specs
         FROM purchase_receipt_items pri
         LEFT JOIN purchase_receipts pr ON pri.receipt_id = pr.id
         LEFT JOIN purchase_orders po ON pr.order_id = po.id
         LEFT JOIN purchase_order_items poi ON po.id = poi.order_id AND pri.material_id = poi.material_id
         LEFT JOIN materials m ON pri.material_id = m.id
         WHERE pri.receipt_id = ?`,
        [purchaseReceipt.id]
      );

      if (receiptItems.length === 0) {
        await connection.rollback();
        throw new Error(
          `采购入库单 ${purchaseReceipt.receipt_no || purchaseReceipt.id} 没有明细，不能生成应付发票`
        );
      }

      // 预览确认覆盖（仅认 camelCase）
      const overrides =
        options.overrides && typeof options.overrides === 'object' ? options.overrides : null;
      if (Array.isArray(overrides?.items) && overrides.items.length) {
        receiptItems = overrides.items.map((raw) => {
          const unitPrice = parseFloat(raw.unit_price ?? raw.price) || 0;
          const qty = parseFloat(raw.quantity) || 0;
          return {
            material_id: raw.material_id || raw.product_id || null,
            quantity: qty,
            price: unitPrice,
            unit_price: unitPrice,
            material_name: raw.material_name || raw.product_name || raw.material_code || null,
            material_code: raw.material_code || null,
            specs: raw.specs || null,
            description: raw.description || null,
          };
        });
      }

      // 精度：整数分运算
      const subtotalAmount =
        receiptItems.reduce(
          (sum, item) =>
            sum +
            Math.round(
              (parseFloat(item.quantity) || 0) *
                (parseFloat(item.price || item.unit_price) || 0) *
                100
            ),
          0
        ) / 100;
      let taxRate = purchaseReceipt.tax_rate;
      if (overrides?.taxRate != null && overrides.taxRate !== '') {
        taxRate = normalizeTaxRate(overrides.taxRate, taxRate);
      }
      const taxAmount = this.resolveTaxAmount(
        subtotalAmount,
        overrides?.taxAmount ?? purchaseReceipt.total_tax_amount,
        taxRate
      );
      const totalAmount = roundMoney(subtotalAmount + taxAmount);
      if (subtotalAmount <= 0) {
        await connection.rollback();
        throw new Error(
          `采购入库单 ${purchaseReceipt.receipt_no || purchaseReceipt.id} 物料金额为0，不能生成应付发票`
        );
      }
      const invoiceDateStr = toLocalDateString(
        overrides?.invoiceDate || purchaseReceipt.receipt_date || currentDateString()
      );
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);
      const createdBy = await resolveActorUserId(
        connection,
        userId,
        purchaseReceipt.created_by,
        financeConfig.get('system.defaultCreator', null)
      );

      const paymentTermDays = await this.resolvePartyPaymentTermDays(connection, {
        supplierId: purchaseReceipt.supplier_id || null,
      });
      const dueDateStr = addDaysToDateString(invoiceDateStr, paymentTermDays);

      // 进项税科目：覆盖 > 配置明细（222101），禁止静默落到总类
      let inputTaxAccountId = overrides?.accounts?.taxAccountId || null;
      if (!inputTaxAccountId) {
        try {
          const taxIds = await this.resolveAccountIds(['VAT_INPUT_TAX']);
          inputTaxAccountId = taxIds.VAT_INPUT_TAX;
        } catch {
          inputTaxAccountId = null;
        }
      }

      const invoiceData = {
        invoice_number: invoiceNumber,
        supplier_id: purchaseReceipt.supplier_id || null,
        invoice_date: invoiceDateStr,
        due_date: dueDateStr,
        total_amount: totalAmount,
        amount_excluding_tax: subtotalAmount,
        subtotal: subtotalAmount,
        tax_amount: taxAmount,
        tax_rate: taxRate,
        currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate: 1.0,
        status: '已确认',
        terms: this.formatPaymentTermsText(paymentTermDays),
        notes:
          overrides?.notes ||
          overrides?.description ||
          `由采购入库单 ${purchaseReceipt.receipt_no} 自动生成`,
        source_type: DocType.PURCHASE_RECEIPT,
        source_id: purchaseReceipt.id || null,
        supplier_name: purchaseReceipt.supplier_name || null,
        created_by: createdBy,
        skip_gl_entry: options.skipGlEntry === true,
        gl_entry: {
          period_id: currentPeriod?.id ?? null,
          payable_account_id: overrides?.accounts?.payableAccountId || payableAccountId,
          purchase_cost_account_id: overrides?.accounts?.costAccountId || purchaseCostAccountId,
          input_tax_account_id: inputTaxAccountId,
          created_by: createdBy,
        },
        items: receiptItems.map((item) => {
          const unitPrice = resolveUnitPrice(item);
          const qty = parseFloat(item.quantity || 0);
          return {
            material_id: item.material_id,
            material_name:
              item.material_name || item.material_code || `material#${item.material_id}`,
            description: item.description || `采购物资 ${item.material_name || item.material_code}`,
            quantity: qty,
            price: unitPrice,
            unit_price: unitPrice,
            amount: Math.round(qty * unitPrice * 100) / 100,
          };
        }),
      };

      const invoiceId = await apModel.createInvoice(invoiceData, connection);
      await DocumentLinkService.tryAutoLink(
        DocType.PURCHASE_RECEIPT,
        purchaseReceipt.id,
        purchaseReceipt.receipt_no,
        DocType.AP_INVOICE,
        invoiceId,
        invoiceNumber,
        createdBy,
        connection
      );
      await connection.execute(
        "UPDATE purchase_receipts SET invoice_status = 'invoiced', updated_at = NOW() WHERE id = ? AND deleted_at IS NULL",
        [purchaseReceipt.id]
      );
      if (!isExternalConn) await connection.commit();
      return { invoiceId, invoiceNumber, amount: totalAmount };
    } catch (error) {
      if (!isExternalConn) await connection.rollback();
      throw error;
    } finally {
      if (!isExternalConn) connection.release();
    }
  }

  /**
   * 从采购订单手工生成应付发票 + 会计凭证
   * 幂等键：source_type=purchase_order + source_id=orderId
   * @param {Object} purchaseOrder - 采购订单主表行
   * @param {number|null} userId
   * @param {Object} options - { force: true } 绕过 auto_generate 开关（手工入口必传）
   */
  static async generateAPInvoiceFromPurchaseOrder(purchaseOrder, userId = null, options = {}) {
    const autoGenerate =
      options.force === true || (await SystemConfigService.get('auto_generate_ap_invoice', false));
    if (!autoGenerate) {
      return { skipped: true, message: '自动生成应付发票已关闭，请在会计凭证中手工选择入库单生成' };
    }

    // 例外路径：默认关闭订单级应付（专业路径=入库）
    const allowOrderLevel =
      options.allowOrderLevel === true ||
      (await SystemConfigService.get('enable_order_level_ap_invoice', false));
    if (!allowOrderLevel) {
      return {
        skipped: true,
        message:
          '订单级应付已禁用（专业路径：请按采购入库单开票）。例外请设置 enable_order_level_ap_invoice 或 allowOrderLevel',
      };
    }

    if (!purchaseOrder?.id) {
      throw new Error('采购订单 ID 缺失，不能生成应付发票');
    }

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.lockSourceDocument(connection, 'purchase_orders', purchaseOrder.id);

      const { INACTIVE_INVOICE_STATUSES } = require('../../constants/financeConstants');
      const inactivePh = INACTIVE_INVOICE_STATUSES.map(() => '?').join(', ');
      const [receiptAp] = await connection.execute(
        `SELECT ap.id, ap.invoice_number, pr.receipt_no
         FROM purchase_receipts pr
         JOIN ap_invoices ap
           ON ap.source_type = 'purchase_receipt' AND ap.source_id = pr.id
          AND ap.status NOT IN (${inactivePh})
         WHERE pr.deleted_at IS NULL AND pr.order_id = ?
         LIMIT 1`,
        [...INACTIVE_INVOICE_STATUSES, purchaseOrder.id]
      );
      if (receiptAp.length) {
        await connection.rollback();
        throw new Error(
          `订单 ${purchaseOrder.order_no || purchaseOrder.id} 关联入库 ${receiptAp[0].receipt_no} ` +
            `已有入库级应付 ${receiptAp[0].invoice_number}，禁止再开订单级应付`
        );
      }

      // purchase_order_items 权威列 = price（见 unitPriceFields）
      const [orderAmountRows] = await connection.execute(
        `SELECT ROUND(COALESCE(SUM(quantity * COALESCE(NULLIF(price, 0), 0)), 0), 2) AS subtotal
         FROM purchase_order_items
         WHERE order_id = ?`,
        [purchaseOrder.id]
      );
      const expectedSubtotalAmount = roundMoney(orderAmountRows[0]?.subtotal || 0);
      const expectedTaxAmount = this.resolveTaxAmount(
        expectedSubtotalAmount,
        purchaseOrder.tax_amount,
        purchaseOrder.tax_rate
      );
      const expectedTotalAmount = roundMoney(expectedSubtotalAmount + expectedTaxAmount);

      const existingInvoice = await this.findExistingInvoiceBySource(
        connection,
        'ap_invoices',
        'purchase_order',
        purchaseOrder.id
      );
      if (existingInvoice) {
        this.assertMoneyMatches(existingInvoice.total_amount, expectedTotalAmount, '应付发票');
        await DocumentLinkService.tryAutoLink(
          DocType.PURCHASE_ORDER,
          purchaseOrder.id,
          purchaseOrder.order_no,
          DocType.AP_INVOICE,
          existingInvoice.id,
          existingInvoice.invoice_number,
          userId || null,
          connection
        );

        const [existingGl] = await connection.execute(
          `SELECT id, entry_number FROM gl_entries
           WHERE document_number = ? AND COALESCE(is_reversed, 0) = 0
           ORDER BY id DESC LIMIT 1`,
          [existingInvoice.invoice_number]
        );
        await connection.commit();
        return {
          skipped: true,
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          amount: existingInvoice.total_amount,
          entryId: existingGl?.[0]?.id || null,
          entryNumber: existingGl?.[0]?.entry_number || null,
          message: '应付发票已存在',
        };
      }

      // 采购订单级手工开票：借采购成本 / 贷应付账款（与确认应付发票凭证一致）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_PAYABLE', 'PURCHASE_COST']);
      const payableAccountId = accountIds.ACCOUNTS_PAYABLE;
      const purchaseCostAccountId = accountIds.PURCHASE_COST;
      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AP', connection);

      const [orderItems] = await connection.execute(
        `SELECT poi.material_id,
                poi.quantity,
                ${sqlNonZeroUnitPrice('poi', 'purchase_order_items', 0)} AS price,
                ${sqlNonZeroUnitPrice('poi', 'purchase_order_items', 0)} AS unit_price,
                poi.tax_rate,
                m.name AS material_name,
                m.code AS material_code,
                m.specs AS specs
         FROM purchase_order_items poi
         LEFT JOIN materials m ON poi.material_id = m.id
         WHERE poi.order_id = ?`,
        [purchaseOrder.id]
      );

      if (orderItems.length === 0) {
        await connection.rollback();
        throw new Error(
          `采购订单 ${purchaseOrder.order_no || purchaseOrder.id} 没有明细，不能生成应付发票`
        );
      }

      const subtotalAmount =
        orderItems.reduce(
          (sum, item) =>
            sum + Math.round(parseFloat(item.quantity || 0) * resolveUnitPrice(item) * 100),
          0
        ) / 100;
      const taxRate = purchaseOrder.tax_rate ?? orderItems[0]?.tax_rate ?? 0;
      const taxAmount = this.resolveTaxAmount(subtotalAmount, purchaseOrder.tax_amount, taxRate);
      const totalAmount = roundMoney(subtotalAmount + taxAmount);

      if (subtotalAmount <= 0) {
        await connection.rollback();
        throw new Error(
          `采购订单 ${purchaseOrder.order_no || purchaseOrder.id} 物料金额为0，不能生成应付发票`
        );
      }

      const invoiceDateStr = toLocalDateString(
        purchaseOrder.order_date || purchaseOrder.delivery_date || currentDateString()
      );
      const paymentTermDays = await this.resolvePartyPaymentTermDays(connection, {
        supplierId: purchaseOrder.supplier_id || null,
        // PO 优先用自身 payment_term_days；无则回落供应商主数据/系统默认
        orderTerms:
          purchaseOrder.payment_term_days != null && purchaseOrder.payment_term_days !== ''
            ? purchaseOrder.payment_term_days
            : purchaseOrder.payment_terms || null,
      });
      const dueDateStr = addDaysToDateString(invoiceDateStr, paymentTermDays);
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);
      const createdBy = await resolveActorUserId(
        connection,
        userId,
        purchaseOrder.created_by,
        purchaseOrder.creator,
        financeConfig.get('system.defaultCreator', null)
      );

      let supplierName = purchaseOrder.supplier_name || null;
      if (!supplierName && purchaseOrder.supplier_id) {
        const [supplierRows] = await connection.execute(
          'SELECT name FROM suppliers WHERE id = ? LIMIT 1',
          [purchaseOrder.supplier_id]
        );
        supplierName = supplierRows[0]?.name || null;
      }

      let inputTaxAccountId = null;
      try {
        const taxIds = await this.resolveAccountIds(['VAT_INPUT_TAX']);
        inputTaxAccountId = taxIds.VAT_INPUT_TAX;
      } catch {
        inputTaxAccountId = null;
      }

      const invoiceData = {
        invoice_number: invoiceNumber,
        supplier_id: purchaseOrder.supplier_id || null,
        invoice_date: invoiceDateStr,
        due_date: dueDateStr,
        total_amount: totalAmount,
        amount_excluding_tax: subtotalAmount,
        subtotal: subtotalAmount,
        tax_amount: taxAmount,
        tax_rate: taxRate,
        currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate: 1.0,
        status: '已确认',
        terms: this.formatPaymentTermsText(paymentTermDays),
        notes: options.force
          ? `由采购订单 ${purchaseOrder.order_no} 手工生成`
          : `由采购订单 ${purchaseOrder.order_no} 自动生成`,
        source_type: DocType.PURCHASE_ORDER,
        source_id: purchaseOrder.id || null,
        supplier_name: supplierName,
        created_by: createdBy,
        gl_entry: {
          period_id: currentPeriod?.id ?? null,
          payable_account_id: payableAccountId,
          purchase_cost_account_id: purchaseCostAccountId,
          input_tax_account_id: inputTaxAccountId,
          created_by: createdBy,
        },
        items: orderItems.map((item) => {
          const unitPrice = resolveUnitPrice(item);
          const qty = parseFloat(item.quantity || 0);
          return {
            material_id: item.material_id,
            material_name:
              item.material_name || item.material_code || `material#${item.material_id}`,
            description: `采购物资 ${item.material_name || item.material_code}`,
            quantity: qty,
            price: unitPrice,
            unit_price: unitPrice,
            amount: Math.round(qty * unitPrice * 100) / 100,
          };
        }),
      };

      const invoiceId = await apModel.createInvoice(invoiceData, connection);
      await DocumentLinkService.tryAutoLink(
        DocType.PURCHASE_ORDER,
        purchaseOrder.id,
        purchaseOrder.order_no,
        DocType.AP_INVOICE,
        invoiceId,
        invoiceNumber,
        createdBy,
        connection
      );

      const [glRows] = await connection.execute(
        `SELECT id, entry_number FROM gl_entries
         WHERE document_number = ? AND COALESCE(is_reversed, 0) = 0
         ORDER BY id DESC LIMIT 1`,
        [invoiceNumber]
      );

      await connection.commit();
      return {
        invoiceId,
        invoiceNumber,
        amount: totalAmount,
        entryId: glRows?.[0]?.id || null,
        entryNumber: glRows?.[0]?.entry_number || null,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成采购红字发票
   */
  static async generateAPCreditNoteFromPurchaseReturn(purchaseReturn, externalConn = null) {
    const autoGenerate = await SystemConfigService.get('auto_generate_ap_credit_note', false);
    if (!autoGenerate) return { skipped: true, message: '自动生成红字应付已关闭' };

    const isExternalConn = !!externalConn;
    const connection = externalConn || (await db.pool.getConnection());
    try {
      if (!isExternalConn) await connection.beginTransaction();
      await this.requireApprovedInventoryPosting(
        connection,
        'purchase_return',
        purchaseReturn.return_no
      );
      await this.lockSourceDocument(connection, 'purchase_returns', purchaseReturn.id);

      const existingInvoice = await this.findExistingInvoiceBySource(
        connection,
        'ap_invoices',
        'purchase_return',
        purchaseReturn.id
      );
      if (existingInvoice) {
        await DocumentLinkService.tryAutoLink(
          DocType.PURCHASE_RETURN,
          purchaseReturn.id,
          purchaseReturn.return_no,
          DocType.AP_INVOICE,
          existingInvoice.id,
          existingInvoice.invoice_number,
          purchaseReturn.created_by || null,
          connection
        );
        if (!isExternalConn) await connection.commit();
        return {
          skipped: true,
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          amount: existingInvoice.total_amount,
          message: '采购红字发票已存在',
        };
      }

      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_PAYABLE', 'GR_IR']);
      const payableAccountId = accountIds.ACCOUNTS_PAYABLE;
      const purchaseCostAccountId = accountIds.GR_IR;
      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AP', connection);

      const [returnItems] = await connection.execute(
        `SELECT pri.material_id,
                COALESCE(pri.material_name, m.name) AS material_name,
                COALESCE(pri.material_code, m.code) AS material_code,
                m.specs as specs,
                pri.return_quantity,
                COALESCE(
                  NULLIF(${sqlUnitPriceExpr('pri', 'purchase_return_items')}, 0),
                  NULLIF(${sqlUnitPriceExpr('poi', 'purchase_order_items')}, 0),
                  NULLIF(m.cost_price, 0),
                  0
                ) AS price,
                COALESCE(
                  NULLIF(${sqlUnitPriceExpr('pri', 'purchase_return_items')}, 0),
                  NULLIF(${sqlUnitPriceExpr('poi', 'purchase_order_items')}, 0),
                  NULLIF(m.cost_price, 0),
                  0
                ) AS unit_price
         FROM purchase_return_items pri
         LEFT JOIN purchase_returns pr ON pri.return_id = pr.id
         LEFT JOIN purchase_receipts prec ON pr.receipt_id = prec.id
         LEFT JOIN purchase_orders po ON prec.order_id = po.id
         LEFT JOIN purchase_order_items poi ON po.id = poi.order_id AND pri.material_id = poi.material_id
         LEFT JOIN materials m ON pri.material_id = m.id
         WHERE pri.return_id = ?`,
        [purchaseReturn.id]
      );

      if (returnItems.length === 0) {
        if (!isExternalConn) await connection.rollback();
        throw new Error(
          `采购退货单 ${purchaseReturn.return_no || purchaseReturn.id} 没有明细，不能生成红字应付发票`
        );
      }

      // ✅ 精度修复：整数运算
      const totalAmount =
        returnItems.reduce(
          (sum, item) =>
            sum + Math.round(parseFloat(item.return_quantity || 0) * resolveUnitPrice(item) * 100),
          0
        ) / 100;
      const creditNoteAmount = -Math.abs(totalAmount);
      if (totalAmount === 0) {
        if (!isExternalConn) await connection.rollback();
        throw new Error(
          `采购退货单 ${purchaseReturn.return_no || purchaseReturn.id} 金额为0，不能生成红字应付发票`
        );
      }

      const invoiceDateStr = toLocalDateString(purchaseReturn.return_date || currentDateString());
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);
      const createdBy = await resolveActorUserId(
        connection,
        purchaseReturn.created_by,
        financeConfig.get('system.defaultCreator', null)
      );

      const invoiceData = {
        invoice_number: invoiceNumber,
        supplier_id: purchaseReturn.supplier_id || null,
        invoice_date: invoiceDateStr,
        due_date: invoiceDateStr,
        total_amount: creditNoteAmount,
        currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate: 1.0,
        status: '已确认',
        notes: `【红字发票】采购退货单 ${purchaseReturn.return_no} 冲减`,
        source_type: DocType.PURCHASE_RETURN,
        source_id: purchaseReturn.id || null,
        supplier_name: purchaseReturn.supplier_name || null,
        created_by: createdBy,
        gl_entry: {
          period_id: currentPeriod?.id ?? null,
          payable_account_id: payableAccountId,
          purchase_cost_account_id: purchaseCostAccountId,
          created_by: createdBy,
        },
        items: returnItems.map((item) => {
          const unitPrice = resolveUnitPrice(item);
          const qty = parseFloat(item.return_quantity || 0);
          return {
            material_id: item.material_id,
            material_name:
              item.material_name || item.material_code || `material#${item.material_id}`,
            description: `退货冲减 ${item.material_name || item.material_code}`,
            quantity: -qty,
            price: unitPrice,
            unit_price: unitPrice,
            amount: -Math.round(qty * unitPrice * 100) / 100,
          };
        }),
      };

      const invoiceId = await apModel.createInvoice(invoiceData, connection);
      await DocumentLinkService.tryAutoLink(
        DocType.PURCHASE_RETURN,
        purchaseReturn.id,
        purchaseReturn.return_no,
        DocType.AP_INVOICE,
        invoiceId,
        invoiceNumber,
        purchaseReturn.created_by || 0,
        connection
      );
      if (!isExternalConn) await connection.commit();
      return { invoiceId, invoiceNumber, amount: creditNoteAmount };
    } catch (error) {
      if (!isExternalConn) await connection.rollback();
      throw error;
    } finally {
      if (!isExternalConn) connection.release();
    }
  }

  // ==================== 销售成本分录生成 ====================

  /**
   * 生成销售成本结转分录
   */
  static async generateCostEntryFromSalesOutbound(salesOutbound, _userId = null, options = {}) {
    // 合并应收凭证时可选跳过成本分录（成本与应收确认独立）
    if (options.skipCostEntry === true) {
      return { skipped: true, message: '已跳过销售成本凭证（合并应收路径）' };
    }
    // 默认关闭自动生成销售成本凭证
    const autoGenerate =
      options.force === true ||
      (await SystemConfigService.get('auto_generate_sales_cost_entry', false));
    if (!autoGenerate) return { skipped: true, message: '自动生成销售成本凭证已关闭' };

    const isExternalConn = !!options.connection;
    const connection = options.connection || (await db.pool.getConnection());
    try {
      if (!isExternalConn) await connection.beginTransaction();
      await this.requireApprovedInventoryPosting(
        connection,
        'sales_outbound',
        salesOutbound.outbound_no
      );
      await this.lockSourceDocument(connection, 'sales_outbound', salesOutbound.id);

      // 优先库存流水成本；无流水时回退出库明细 × 物料成本价（保证手工闭环可测）
      const [expectedCostRows] = await connection.execute(
        `SELECT ROUND(COALESCE(SUM(ABS(il.quantity) * il.unit_cost), 0), 2) AS total_cost,
                SUM(CASE WHEN COALESCE(il.unit_cost, 0) <= 0 THEN 1 ELSE 0 END) AS invalid_cost_lines,
                COUNT(*) AS ledger_lines
           FROM inventory_ledger il
          WHERE il.reference_no = ?
            AND il.transaction_type = 'sales_outbound'
            AND il.quantity < 0`,
        [salesOutbound.outbound_no]
      );
      let expectedTotalCost = roundMoney(expectedCostRows[0]?.total_cost || 0);
      const ledgerLines = Number(expectedCostRows[0]?.ledger_lines || 0);
      if (
        ledgerLines > 0 &&
        Number(expectedCostRows[0]?.invalid_cost_lines || 0) > 0 &&
        expectedTotalCost <= 0
      ) {
        throw new Error(
          `销售出库单 ${salesOutbound.outbound_no || salesOutbound.id} 存在零成本库存流水，不能生成销售成本凭证`
        );
      }
      if (expectedTotalCost <= 0) {
        const [fallbackRows] = await connection.execute(
          `SELECT ROUND(COALESCE(SUM(
              COALESCE(soi.quantity, 0) * COALESCE(NULLIF(m.cost_price, 0), NULLIF(m.price, 0), 0)
            ), 0), 2) AS total_cost
           FROM sales_outbound_items soi
           LEFT JOIN materials m ON m.id = soi.product_id
           WHERE soi.outbound_id = ?`,
          [salesOutbound.id]
        );
        expectedTotalCost = roundMoney(fallbackRows[0]?.total_cost || 0);
      }

      const existingEntry = await this.findExistingActiveGlEntry(
        connection,
        'sales_outbound',
        salesOutbound.outbound_no
      );
      if (existingEntry) {
        this.assertMoneyMatches(
          existingEntry.total_debit,
          expectedTotalCost,
          '销售出库成本凭证借方'
        );
        this.assertMoneyMatches(
          existingEntry.total_credit,
          expectedTotalCost,
          '销售出库成本凭证贷方'
        );
        await DocumentLinkService.tryAutoLink(
          DocType.SALES_OUTBOUND,
          salesOutbound.id,
          salesOutbound.outbound_no,
          DocType.FINANCE_VOUCHER,
          existingEntry.id,
          existingEntry.entry_number,
          salesOutbound.created_by || null,
          connection
        );
        if (!isExternalConn) await connection.commit();
        return {
          skipped: true,
          entryId: existingEntry.id,
          entryNumber: existingEntry.entry_number,
          message: '销售成本凭证已存在',
        };
      }

      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['COST_OF_GOODS_SOLD', 'INVENTORY']);
      const cogsAccountId = accountIds.COST_OF_GOODS_SOLD;
      const inventoryAccountId = accountIds.INVENTORY;

      const [outboundItems] = await connection.execute(
        `SELECT soi.product_id, soi.quantity, m.name as material_name
         FROM sales_outbound_items soi
         LEFT JOIN materials m ON soi.product_id = m.id
         WHERE soi.outbound_id = ?`,
        [salesOutbound.id]
      );

      if (outboundItems.length === 0) {
        await connection.rollback();
        throw new Error(
          `销售出库单 ${salesOutbound.outbound_no || salesOutbound.id} 没有明细，不能生成销售成本凭证`
        );
      }

      // ✅ 精度修复：整数运算
      const totalCost = expectedTotalCost;
      if (totalCost <= 0) {
        await connection.rollback();
        throw new Error(
          `销售出库单 ${salesOutbound.outbound_no || salesOutbound.id} 成本为0，不能生成销售成本凭证`
        );
      }

      const outboundDate =
        salesOutbound.delivery_date ||
        salesOutbound.outbound_date ||
        salesOutbound.transaction_date ||
        currentDateString();
      const outboundDateStr = toLocalDateString(outboundDate);
      const currentPeriod = await this.getCurrentPeriod(connection, outboundDateStr);
      const createdBy = await resolveActorUserId(connection, salesOutbound.created_by);

      const entryData = {
        period_id: currentPeriod.id || null,
        entry_date: outboundDateStr,
        posting_date: outboundDateStr,
        document_type: DOCUMENT_TYPES.SALES_OUTBOUND,
        document_number: salesOutbound.outbound_no || null,
        description: `销售成本结转 - 销售出库单 ${salesOutbound.outbound_no}`,
        created_by: createdBy || null,
        status: 'posted',
        is_posted: 1,
        posting_method: 'automatic',
      };

      const entryItems = [
        {
          account_id: cogsAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          description: `销售成本 - ${salesOutbound.outbound_no}`,
        },
        {
          account_id: inventoryAccountId,
          debit_amount: 0,
          credit_amount: totalCost,
          description: `库存减少 - ${salesOutbound.outbound_no}`,
        },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);
      const [entries] = await connection.execute(
        'SELECT entry_number FROM gl_entries WHERE id = ?',
        [entryId]
      );
      const entryNumber = entries.length > 0 ? entries[0].entry_number : null;
      await DocumentLinkService.tryAutoLink(
        DocType.SALES_OUTBOUND,
        salesOutbound.id,
        salesOutbound.outbound_no,
        DocType.FINANCE_VOUCHER,
        entryId,
        entryNumber,
        createdBy,
        connection
      );

      if (!isExternalConn) await connection.commit();

      return { entryId, entryNumber, amount: totalCost };
    } catch (error) {
      if (!isExternalConn) await connection.rollback();
      throw error;
    } finally {
      if (!isExternalConn) connection.release();
    }
  }

  // ==================== 税务发票生成 ====================

  /**
   * 生成销项发票
   */
  static async generateOutputTaxInvoiceFromSalesOutbound(
    salesOutbound,
    userId = null,
    options = {}
  ) {
    const autoGenerate =
      options.force === true ||
      (await SystemConfigService.get('auto_generate_output_tax_invoice', false));
    if (!autoGenerate) return { skipped: true, message: '自动生成销项发票已关闭' };

    const isExternalConn = !!options.connection;
    const connection = options.connection || (await db.pool.getConnection());
    try {
      if (!isExternalConn) await connection.beginTransaction();
      await this.requireApprovedInventoryPosting(
        connection,
        'sales_outbound',
        salesOutbound.outbound_no
      );
      await this.lockSourceDocument(connection, 'sales_outbound', salesOutbound.id);

      const existingInvoice = await this.findExistingTaxInvoice(
        connection,
        TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND,
        salesOutbound.id
      );
      if (existingInvoice) {
        await DocumentLinkService.tryAutoLink(
          DocType.SALES_OUTBOUND,
          salesOutbound.id,
          salesOutbound.outbound_no,
          DocType.TAX_INVOICE,
          existingInvoice.id,
          existingInvoice.invoice_number,
          userId || salesOutbound.created_by || null,
          connection
        );
        if (!isExternalConn) await connection.commit();
        return {
          skipped: true,
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          totalAmount: existingInvoice.total_amount,
          message: '销项税票已存在',
        };
      }

      const invoiceNumber = await this.generateTaxInvoiceNumber(connection);

      // 出库明细库列=price；售价回退销售订单 unit_price、物料 price
      const [outboundItems] = await connection.execute(
        `SELECT soi.quantity,
                COALESCE(
                  NULLIF(${sqlUnitPriceExpr('soi', 'sales_outbound_items')}, 0),
                  NULLIF(${sqlUnitPriceExpr('soitm', 'sales_order_items')}, 0),
                  NULLIF(m.price, 0),
                  0
                ) AS price,
                COALESCE(
                  NULLIF(${sqlUnitPriceExpr('soi', 'sales_outbound_items')}, 0),
                  NULLIF(${sqlUnitPriceExpr('soitm', 'sales_order_items')}, 0),
                  NULLIF(m.price, 0),
                  0
                ) AS unit_price
         FROM sales_outbound_items soi
         LEFT JOIN sales_outbound so ON soi.outbound_id = so.id
         LEFT JOIN sales_order_items soitm
           ON COALESCE(soi.source_order_id, so.order_id) = soitm.order_id
          AND soi.product_id = soitm.material_id
         LEFT JOIN materials m ON soi.product_id = m.id
         WHERE soi.outbound_id = ?`,
        [salesOutbound.id]
      );

      // ✅ 精度修复：整数运算
      const amountExcludingTax =
        outboundItems.reduce(
          (sum, item) =>
            sum + Math.round(parseFloat(item.quantity || 0) * resolveUnitPrice(item) * 100),
          0
        ) / 100;
      // 从财务设置获取税率（前端设置的小数格式，如 0.13 = 13%）
      await this.loadConfigurations();
      const taxRate = normalizeTaxRate(financeConfig.get('tax.defaultVATRate', 0.13), 0.13);
      const taxRatePercent = roundMoney(taxRate * 100); // 税务发票表使用百分比制
      const taxAmount = calculateTaxAmount(amountExcludingTax, taxRate);
      const totalAmount = roundMoney(amountExcludingTax + taxAmount);
      if (totalAmount <= 0) {
        await connection.rollback();
        throw new Error(
          `销售出库单 ${salesOutbound.outbound_no || salesOutbound.id} 金额为0，不能生成销项税务发票`
        );
      }

      const invoiceData = {
        invoice_type: '销项',
        invoice_number: invoiceNumber,
        invoice_code: null,
        invoice_date: toLocalDateString(salesOutbound.outbound_date || currentDateString()),
        customer_id: salesOutbound.customer_id || null,
        supplier_id: null,
        supplier_or_customer_name: salesOutbound.customer_name || null,
        supplier_tax_number: null,
        amount_excluding_tax: amountExcludingTax.toFixed(2),
        tax_rate: taxRatePercent,
        tax_amount: taxAmount.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        status: '未认证',
        related_document_type: TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND,
        related_document_id: salesOutbound.id,
        remark: `自动生成 - 销售出库单: ${salesOutbound.outbound_no}`,
        created_by: await resolveActorUserId(connection, userId, salesOutbound.created_by),
      };

      const invoiceId = await taxModel.createTaxInvoice(invoiceData, connection);
      await DocumentLinkService.tryAutoLink(
        DocType.SALES_OUTBOUND,
        salesOutbound.id,
        salesOutbound.outbound_no,
        DocType.TAX_INVOICE,
        invoiceId,
        invoiceNumber,
        invoiceData.created_by,
        connection
      );
      if (!isExternalConn) await connection.commit();
      return { invoiceId, invoiceNumber, totalAmount: totalAmount.toFixed(2) };
    } catch (error) {
      if (!isExternalConn) await connection.rollback();
      throw error;
    } finally {
      if (!isExternalConn) connection.release();
    }
  }

  /**
   * 生成进项发票
   */
  static async generateInputTaxInvoiceFromPurchaseReceipt(
    purchaseReceipt,
    userId = null,
    options = {}
  ) {
    const autoGenerate =
      options.force === true ||
      (await SystemConfigService.get('auto_generate_input_tax_invoice', false));
    if (!autoGenerate) return { skipped: true, message: '自动生成进项发票已关闭' };

    const isExternalConn = !!options.connection;
    const connection = options.connection || (await db.pool.getConnection());
    try {
      if (!isExternalConn) await connection.beginTransaction();
      await this.requireApprovedInventoryPosting(connection, 'inbound', purchaseReceipt.receipt_no);
      await this.lockSourceDocument(connection, 'purchase_receipts', purchaseReceipt.id);

      const existingInvoice = await this.findExistingTaxInvoice(
        connection,
        TAX_RELATED_DOCUMENT_TYPES.PURCHASE_RECEIPT,
        purchaseReceipt.id
      );
      if (existingInvoice) {
        await DocumentLinkService.tryAutoLink(
          DocType.PURCHASE_RECEIPT,
          purchaseReceipt.id,
          purchaseReceipt.receipt_no,
          DocType.TAX_INVOICE,
          existingInvoice.id,
          existingInvoice.invoice_number,
          userId || purchaseReceipt.created_by || null,
          connection
        );
        if (!isExternalConn) await connection.commit();
        return {
          skipped: true,
          invoiceId: existingInvoice.id,
          invoiceNumber: existingInvoice.invoice_number,
          totalAmount: existingInvoice.total_amount,
          message: '进项税票已存在',
        };
      }

      const invoiceNumber = await this.generateTaxInvoiceNumber(connection);

      const [receiptItems] = await connection.execute(
        `SELECT pri.qualified_quantity,
                COALESCE(
                  NULLIF(${sqlUnitPriceExpr('pri', 'purchase_receipt_items')}, 0),
                  NULLIF(${sqlUnitPriceExpr('poi', 'purchase_order_items')}, 0),
                  NULLIF(m.cost_price, 0),
                  0
                ) AS price,
                COALESCE(
                  NULLIF(${sqlUnitPriceExpr('pri', 'purchase_receipt_items')}, 0),
                  NULLIF(${sqlUnitPriceExpr('poi', 'purchase_order_items')}, 0),
                  NULLIF(m.cost_price, 0),
                  0
                ) AS unit_price
         FROM purchase_receipt_items pri
         JOIN purchase_receipts pr ON pri.receipt_id = pr.id
         LEFT JOIN purchase_orders po ON pr.order_id = po.id
         LEFT JOIN purchase_order_items poi ON po.id = poi.order_id AND pri.material_id = poi.material_id
         LEFT JOIN materials m ON pri.material_id = m.id
         WHERE pri.receipt_id = ?`,
        [purchaseReceipt.id]
      );

      // ✅ 精度修复：整数运算
      const amountExcludingTax =
        receiptItems.reduce(
          (sum, item) =>
            sum +
            Math.round(parseFloat(item.qualified_quantity || 0) * resolveUnitPrice(item) * 100),
          0
        ) / 100;
      // 从财务设置获取税率（前端设置的小数格式，如 0.13 = 13%）
      await this.loadConfigurations();
      const taxRate = normalizeTaxRate(financeConfig.get('tax.defaultVATRate', 0.13), 0.13);
      const taxRatePercent = roundMoney(taxRate * 100); // 税务发票表使用百分比制
      const taxAmount = calculateTaxAmount(amountExcludingTax, taxRate);
      const totalAmount = roundMoney(amountExcludingTax + taxAmount);
      if (totalAmount <= 0) {
        await connection.rollback();
        throw new Error(
          `采购入库单 ${purchaseReceipt.receipt_no || purchaseReceipt.id} 金额为0，不能生成进项税务发票`
        );
      }

      const invoiceData = {
        invoice_type: '进项',
        invoice_number: invoiceNumber,
        invoice_code: null,
        invoice_date: toLocalDateString(purchaseReceipt.receipt_date || currentDateString()),
        supplier_id: purchaseReceipt.supplier_id || null,
        customer_id: null,
        supplier_or_customer_name: purchaseReceipt.supplier_name || null,
        supplier_tax_number: null,
        amount_excluding_tax: amountExcludingTax.toFixed(2),
        tax_rate: taxRatePercent,
        tax_amount: taxAmount.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        status: '未认证',
        related_document_type: TAX_RELATED_DOCUMENT_TYPES.PURCHASE_RECEIPT,
        related_document_id: purchaseReceipt.id,
        remark: `自动生成 - 采购入库单: ${purchaseReceipt.receipt_no}`,
        created_by: await resolveActorUserId(connection, userId, purchaseReceipt.created_by),
      };

      const invoiceId = await taxModel.createTaxInvoice(invoiceData, connection);
      await DocumentLinkService.tryAutoLink(
        DocType.PURCHASE_RECEIPT,
        purchaseReceipt.id,
        purchaseReceipt.receipt_no,
        DocType.TAX_INVOICE,
        invoiceId,
        invoiceNumber,
        invoiceData.created_by,
        connection
      );
      if (!isExternalConn) await connection.commit();
      return { invoiceId, invoiceNumber, totalAmount: totalAmount.toFixed(2) };
    } catch (error) {
      if (!isExternalConn) await connection.rollback();
      throw error;
    } finally {
      if (!isExternalConn) connection.release();
    }
  }

  // ==================== 委外加工分录生成 ====================
  // (外委发料分录在这一版本被精简或与当前无需防重复的核心功能保持一致)

  // ==================== 销售换货差价分录生成 ====================
  /**
   * 根据换货单生成差价财务分录
   * - 差价 = 0：等值换货，不生成凭证
   * - 差价 > 0（换出更贵）：借 应收账款，贷 销售收入
   * - 差价 < 0（退回更贵）：借 销售收入，贷 应收账款
   */
  static async generateExchangeDifferenceEntry(salesExchange) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const exchangeNo = salesExchange.exchange_no;
      const existingEntry = await this.findExistingActiveGlEntry(
        connection,
        'sales_exchange',
        exchangeNo
      );
      if (existingEntry) {
        await DocumentLinkService.tryAutoLink(
          DocType.SALES_EXCHANGE,
          salesExchange.id,
          exchangeNo,
          DocType.FINANCE_VOUCHER,
          existingEntry.id,
          existingEntry.entry_number,
          salesExchange.created_by || null,
          connection
        );
        await connection.commit();
        return {
          skipped: true,
          entryId: existingEntry.id,
          entryNumber: existingEntry.entry_number,
          message: 'Exchange difference voucher already exists',
        };
      }

      // 查询差价金额（从主表获取）
      const differenceAmount = parseFloat(salesExchange.difference_amount || 0);

      // 等值换货无需生成凭证
      if (differenceAmount === 0) {
        logger.info(`换货单 ${exchangeNo} 为等值换货（差价=0），无需生成财务分录`);
        await connection.rollback();
        return null;
      }

      const absDiff = Math.abs(differenceAmount);

      // 批量解析科目ID（1次查询替代2次）
      let description;
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']);
      let debitAccountId, creditAccountId;

      if (differenceAmount > 0) {
        // 换出更贵 → 客户应补差价
        debitAccountId = accountIds.ACCOUNTS_RECEIVABLE;
        creditAccountId = accountIds.SALES_REVENUE;
        description = `销售换货补差价 - 换货单: ${exchangeNo}`;
      } else {
        // 退回更贵 → 应退客户差价
        debitAccountId = accountIds.SALES_REVENUE;
        creditAccountId = accountIds.ACCOUNTS_RECEIVABLE;
        description = `销售换货退差价 - 换货单: ${exchangeNo}`;
      }

      // 获取会计期间
      const now = toLocalDateString(salesExchange.exchange_date || currentDateString());
      const currentPeriod = await this.getCurrentPeriod(connection, now);

      const createdBy = salesExchange.created_by || 0;

      // 使用标准的 GL 分录模式（头表 + 明细表）
      const entryData = {
        period_id: currentPeriod?.id ?? null,
        entry_date: now,
        document_type: 'sales_exchange',
        document_number: exchangeNo,
        description: description,
        created_by: createdBy,
        status: 'posted',
        is_posted: 1,
        posting_method: 'automatic',
      };

      const entryItems = [
        {
          account_id: debitAccountId,
          debit_amount: absDiff,
          credit_amount: 0,
          description: `借方 - ${description}`,
        },
        {
          account_id: creditAccountId,
          debit_amount: 0,
          credit_amount: absDiff,
          description: `贷方 - ${description}`,
        },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);
      const [entries] = await connection.execute(
        'SELECT entry_number FROM gl_entries WHERE id = ?',
        [entryId]
      );
      const entryNumber = entries.length > 0 ? entries[0].entry_number : null;
      await DocumentLinkService.tryAutoLink(
        DocType.SALES_EXCHANGE,
        salesExchange.id,
        exchangeNo,
        DocType.FINANCE_VOUCHER,
        entryId,
        entryNumber,
        createdBy,
        connection
      );

      await connection.commit();
      logger.info(
        `Sales exchange difference entry generated: exchangeNo=${exchangeNo}, type=${differenceAmount > 0 ? 'supplement' : 'refund'}, amount=${absDiff}`
      );
      return {
        entryId,
        exchangeNo,
        differenceAmount,
        type: differenceAmount > 0 ? 'supplement' : 'refund',
      };
    } catch (error) {
      await connection.rollback();
      logger.error(`换货差价分录生成失败 - ${salesExchange.exchange_no}:`, error.message);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== 委外加工模块集成 ====================

  /**
   * 外委发料自动生成会计分录
   * 借：委托加工物资 (OUTSOURCED_MATERIALS)
   * 贷：原材料 (RAW_MATERIALS)
   *
   * @param {Object} processing - 加工单数据（含 processing_no, id 等）
   * @param {Array} materials - 物料明细（含 material_id, material_name, quantity, unit_price 等）
   * @returns {Object} { success, entryId } 或 { skipped, message }
   */
  static async generateOutsourcedIssueEntry(
    processing,
    materials,
    externalConnection = null,
    options = {}
  ) {
    if (options.deferUntilInventoryApproval === true) {
      return { success: true, deferred: true, message: '库存过账待财务审核后生成委外发料凭证' };
    }
    const connection = externalConnection || (await db.pool.getConnection());
    const shouldManageTransaction = !externalConnection;
    try {
      if (shouldManageTransaction) {
        await connection.beginTransaction();
      }
      await this.requireApprovedInventoryPosting(connection, 'outsourced_processing_material', processing.processing_no);

      const existingEntry = await this.findExistingActiveGlEntry(
        connection,
        'outsourced_issue',
        processing.processing_no
      );
      if (existingEntry) {
        await DocumentLinkService.tryAutoLink(
          DocType.OUTSOURCED_PROCESSING,
          processing.id,
          processing.processing_no,
          DocType.FINANCE_VOUCHER,
          existingEntry.id,
          existingEntry.entry_number,
          processing.created_by || null,
          connection
        );
        if (shouldManageTransaction) {
          await connection.commit();
        }
        return {
          success: true,
          skipped: true,
          entryId: existingEntry.id,
          entryNumber: existingEntry.entry_number,
          message: '外委发料凭证已存在',
        };
      }

      // 批量解析科目ID（1次查询）
      const accountIds = await this.resolveAccountIds(['OUTSOURCED_MATERIALS', 'RAW_MATERIALS']);
      const outsourcedAccountId = accountIds.OUTSOURCED_MATERIALS;
      const rawMaterialAccountId = accountIds.RAW_MATERIALS;

      const materialCostById = await this.getMaterialCostById(
        connection,
        (materials || []).map((item) => item.material_id)
      );

      // 发料后优先使用实际 FIFO 出库台账成本，避免基础资料成本价为 0 时凭证金额错误。
      const issueCost = await this.getOutsourcedIssueCost(connection, processing.processing_no);
      let totalAmount;
      if (issueCost.ledgerLines > 0) {
        if (issueCost.invalidCostLines > 0) {
          throw new Error(
            `委外加工单 ${processing.processing_no || processing.id} 存在零成本发料台账，不能生成外委发料凭证`
          );
        }
        totalAmount = issueCost.totalCost;
      } else {
        // 保留无库存台账调用场景的兼容回退；正常确认流程会命中上面的台账成本。
        totalAmount =
          (materials || []).reduce((sum, item) => {
            const unitCost =
              resolveUnitPrice(item) || materialCostById.get(Number(item.material_id)) || 0;
            return sum + Math.round(parseFloat(item.quantity || 0) * unitCost * 100);
          }, 0) / 100;
      }

      if (totalAmount <= 0) {
        if (shouldManageTransaction) {
          await connection.rollback();
        }
        throw new Error(
          `委外加工单 ${processing.processing_no || processing.id} 发料金额为0，不能生成外委发料凭证`
        );
      }

      // 获取会计期间
      const now = toLocalDateString(
        processing.issue_date || processing.processing_date || currentDateString()
      );
      const currentPeriod = await this.getCurrentPeriod(connection, now);
      const createdBy = processing.created_by || 0;

      // 构建 GL 分录
      const entryData = {
        period_id: currentPeriod.id || null,
        entry_date: now,
        posting_date: now,
        document_type: 'outsourced_issue',
        document_number: processing.processing_no,
        description: `外委发料 - 加工单: ${processing.processing_no}`,
        status: 'posted',
        is_posted: 1,
        created_by: createdBy,
      };

      const entryItems = [
        {
          account_id: outsourcedAccountId,
          debit_amount: totalAmount,
          credit_amount: 0,
          description: `委托加工物资增加 - ${processing.processing_no}`,
        },
        {
          account_id: rawMaterialAccountId,
          debit_amount: 0,
          credit_amount: totalAmount,
          description: `原材料减少（外委发料） - ${processing.processing_no}`,
        },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);
      const [entries] = await connection.execute(
        'SELECT entry_number FROM gl_entries WHERE id = ?',
        [entryId]
      );
      const entryNumber = entries[0]?.entry_number || null;
      await DocumentLinkService.tryAutoLink(
        DocType.OUTSOURCED_PROCESSING,
        processing.id,
        processing.processing_no,
        DocType.FINANCE_VOUCHER,
        entryId,
        entryNumber,
        createdBy,
        connection
      );
      if (shouldManageTransaction) {
        await connection.commit();
      }

      logger.info(
        `Outsourced issue GL entry generated: processingNo=${processing.processing_no}, amount=${totalAmount}`
      );
      return { success: true, entryId, entryNumber, amount: totalAmount };
    } catch (error) {
      if (shouldManageTransaction) {
        await connection.rollback();
      }
      logger.error(`外委发料分录生成失败 - ${processing.processing_no}:`, error.message);
      throw error;
    } finally {
      if (shouldManageTransaction) {
        connection.release();
      }
    }
  }

  /**
   * 外委收货入库自动生成会计分录
   * 借：库存商品 (INVENTORY_GOODS)  — 物料成本 + 加工费
   * 贷：委托加工物资 (OUTSOURCED_MATERIALS)  — 原物料成本
   * 贷：应付账款 (ACCOUNTS_PAYABLE)  — 加工费部分
   *
   * @param {Object} receipt - 入库单数据（含 receipt_no, processing_id 等）
   * @param {Array} items - 入库明细（含 product_id, actual_quantity, unit_price, total_price 等）
   * @returns {Object} { success, entryId } 或 { skipped, message }
   */
  static async generateOutsourcedReceiptEntry(
    receipt,
    items,
    externalConnection = null,
    options = {}
  ) {
    if (options.deferUntilInventoryApproval === true) {
      return { success: true, deferred: true, message: '库存过账待财务审核后生成委外入库凭证' };
    }
    const connection = externalConnection || (await db.pool.getConnection());
    const shouldManageTransaction = !externalConnection;
    try {
      if (shouldManageTransaction) {
        await connection.beginTransaction();
      }
      await this.requireApprovedInventoryPosting(connection, 'outsourced_processing_receipt', receipt.receipt_no);

      // 批量解析科目ID（1次查询）
      const accountIds = await this.resolveAccountIds([
        'INVENTORY_GOODS',
        'OUTSOURCED_MATERIALS',
        'ACCOUNTS_PAYABLE',
      ]);
      const inventoryAccountId = accountIds.INVENTORY_GOODS;
      const outsourcedAccountId = accountIds.OUTSOURCED_MATERIALS;
      const payableAccountId = accountIds.ACCOUNTS_PAYABLE;

      const receiptNo = receipt.receipt_no || `OPR-${receipt.processing_id}`;
      const receiptId = receipt.id || receipt.receipt_id || null;
      const createdBy = await resolveActorUserId(
        connection,
        receipt.created_by,
        receipt.operator,
        financeConfig.get('system.defaultCreator', null)
      );

      const existingEntry = await this.findExistingActiveGlEntry(
        connection,
        'outsourced_receipt',
        receiptNo
      );
      if (existingEntry) {
        await DocumentLinkService.tryAutoLink(
          DocType.OUTSOURCED_RECEIPT,
          receiptId,
          receiptNo,
          DocType.FINANCE_VOUCHER,
          existingEntry.id,
          existingEntry.entry_number,
          createdBy,
          connection
        );
        if (shouldManageTransaction) {
          await connection.commit();
        }
        return {
          success: true,
          skipped: true,
          entryId: existingEntry.id,
          entryNumber: existingEntry.entry_number,
          message: '委外入库凭证已存在',
        };
      }

      const costAllocation = await this.getOutsourcedReceiptCostAllocation(
        connection,
        receipt,
        items
      );
      const materialCost = costAllocation.allocatedMaterialCost;
      const totalProcessingFee = costAllocation.processingFee;
      const totalInventoryValue = costAllocation.totalInventoryValue;

      if (totalInventoryValue <= 0) {
        if (shouldManageTransaction) {
          await connection.rollback();
        }
        throw new Error(`委外入库单 ${receiptNo} 入库价值为0，不能生成委外入库凭证`);
      }

      // 获取会计期间
      const now = toLocalDateString(
        receipt.receipt_date || receipt.created_at || currentDateString()
      );
      const currentPeriod = await this.getCurrentPeriod(connection, now);

      // 构建 GL 分录
      const entryData = {
        period_id: currentPeriod.id || null,
        entry_date: now,
        posting_date: now,
        document_type: 'outsourced_receipt',
        document_number: receiptNo,
        description: `外委收货入库 - 入库单: ${receiptNo}`,
        status: 'posted',
        is_posted: 1,
        created_by: createdBy,
      };

      const entryItems = [
        // 借：库存商品（物料成本 + 加工费）
        {
          account_id: inventoryAccountId,
          debit_amount: totalInventoryValue,
          credit_amount: 0,
          description: `库存商品增加（委外入库） - ${receiptNo}`,
        },
      ];

      // 贷：委托加工物资（物料成本部分）
      if (materialCost > 0) {
        entryItems.push({
          account_id: outsourcedAccountId,
          debit_amount: 0,
          credit_amount: materialCost,
          description: `委托加工物资减少 - ${receiptNo}`,
        });
      }

      // 贷：应付账款（加工费部分）
      if (totalProcessingFee > 0) {
        entryItems.push({
          account_id: payableAccountId,
          debit_amount: 0,
          credit_amount: totalProcessingFee,
          description: `应付加工费 - ${receiptNo}`,
        });
      }

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);
      const [entries] = await connection.execute(
        'SELECT entry_number FROM gl_entries WHERE id = ?',
        [entryId]
      );
      const entryNumber = entries[0]?.entry_number || null;
      await DocumentLinkService.tryAutoLink(
        DocType.OUTSOURCED_RECEIPT,
        receiptId,
        receiptNo,
        DocType.FINANCE_VOUCHER,
        entryId,
        entryNumber,
        createdBy,
        connection
      );
      if (shouldManageTransaction) {
        await connection.commit();
      }

      logger.info(
        `Outsourced receipt GL entry generated: receiptNo=${receiptNo}, materialCost=${materialCost}, processingFee=${totalProcessingFee}`
      );
      return {
        success: true,
        entryId,
        entryNumber,
        materialCost,
        processingFee: totalProcessingFee,
        totalValue: totalInventoryValue,
      };
    } catch (error) {
      if (shouldManageTransaction) {
        await connection.rollback();
      }
      logger.error(`委外入库分录生成失败 - ${receipt.receipt_no}:`, error.message);
      throw error;
    } finally {
      if (shouldManageTransaction) {
        connection.release();
      }
    }
  }
}

module.exports = FinanceIntegrationService;
