/**
 * ManualVoucherService
 *
 * 专业 ERP 手工凭证主路径（非事件自动）：
 * - 采购应付：采购入库单 purchase_receipt（按入库/合格量，invoice what you receive）
 * - 销售应收：销售出库单 sales_outbound（按交货量，invoice what you ship）
 *
 * 订单级（sales_order / purchase_order）仅作例外补录 API 保留，不作为主业务入口。
 *
 * 约定：
 * - force=true 调用 FinanceIntegrationService，忽略 auto_generate 开关
 * - 幂等：已有有效发票则 skipped
 */

const db = require('../../config/db');
const FinanceIntegrationService = require('../external/FinanceIntegrationService');
const InventoryPostingService = require('../InventoryPostingService');
const SalesOutboundValuationService = require('../business/SalesOutboundValuationService');
const {
  pickLineMetadata,
  pickCommonLineMetadata,
  resolveCommonLineMetadata,
  singleMaterialMetadata,
} = require('./voucherLineMetadata');
const {
  resolveSameVoucherCurrency,
  convertInvoiceCurrencyLines,
} = require('./invoiceVoucherLines');
const { parsePagination } = require('../../utils/safePagination');
const { logger } = require('../../utils/logger');
const { normalizeTaxRate, taxAmount: calcTaxAmount } = require('../../utils/money');
const { resolveUnitPrice, sqlUnitPriceExpr } = require('../../utils/unitPriceFields');
const { currentDateString, toLocalDateString } = require('../../utils/dateUtils');
const { accountingConfig } = require('../../config/accountingConfig');
const { financeConfig } = require('../../config/financeConfig');
const {
  ENTRY_ROLES,
  money,
  parseMergeFlag,
  normalizeOverridesMap,
  resolveMergedPayload,
  mergeDraftsIntoVoucher,
  assertEntryLinesMatchTotals,
  syncEntryLinesToAmounts,
  sumBy,
} = require('./manualVoucherHelpers');
const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');
const { RECEIPT_STATUS } = require('../../constants/purchaseConstants');

/** 默认增值税率：财务配置 > 环境 > 0（禁止魔法 0.13 写死业务） */
function defaultVatRate() {
  try {
    return normalizeTaxRate(financeConfig.get('tax.defaultVATRate', 0), 0);
  } catch {
    return 0;
  }
}

const INACTIVE_INVOICE_STATUSES = Object.freeze(['cancelled', '已取消', 'void', '作废']);

const BLOCKED_DOC_STATUSES = Object.freeze(['draft', 'cancelled', 'pending', 'reversed']);

const BUSINESS_TYPES = Object.freeze({
  PURCHASE_RECEIPT: 'purchase_receipt',
  SALES_OUTBOUND: 'sales_outbound',
  SALES_ORDER: 'sales_order',
  PURCHASE_ORDER: 'purchase_order',
});

const PRIMARY_BUSINESS_TYPES = Object.freeze([
  BUSINESS_TYPES.PURCHASE_RECEIPT,
  BUSINESS_TYPES.SALES_OUTBOUND,
]);

const SUPPORTED_BUSINESS_TYPES = Object.freeze(Object.values(BUSINESS_TYPES));
const BATCH_MAX_IDS = 50;

const SQL_INACTIVE_STATUS_IN = INACTIVE_INVOICE_STATUSES.map(() => '?').join(',');
const SQL_BLOCKED_STATUS_IN = BLOCKED_DOC_STATUSES.map(() => '?').join(',');

function isBlockedStatus(status) {
  return BLOCKED_DOC_STATUSES.includes(String(status || '').toLowerCase());
}

function normalizeIds(rawIds) {
  if (!Array.isArray(rawIds)) return [];
  return [
    ...new Set(
      rawIds.map((id) => Number.parseInt(id, 10)).filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
}

function businessError(message, code = 'BAD_REQUEST', statusCode = 400) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

function buildResultItem(id, docNo, result, fallbackSkipMessage) {
  if (result?.skipped) {
    return {
      id,
      orderNo: docNo,
      docNo,
      success: true,
      skipped: true,
      invoiceId: result.invoiceId || null,
      invoiceNumber: result.invoiceNumber || null,
      entryId: result.entryId || null,
      entryNumber: result.entryNumber || null,
      amount: result.amount,
      message: result.message || fallbackSkipMessage,
    };
  }
  return {
    id,
    orderNo: docNo,
    docNo,
    success: true,
    skipped: false,
    invoiceId: result.invoiceId || null,
    invoiceNumber: result.invoiceNumber || null,
    entryId: result.entryId || null,
    entryNumber: result.entryNumber || null,
    amount: result.amount,
    message: '生成成功',
  };
}

/** 解析科目元信息；required=false 时缺科目返回 null */
async function resolveAccountMeta(keys, options = {}) {
  const required = options.required !== false;
  const keyToCode = {};
  for (const key of keys) {
    const code = accountingConfig.getAccountCode(key);
    if (!code) {
      if (required) {
        throw businessError(`缺少必需的财务配置: ${key}，请先在财务设置中配置`);
      }
      keyToCode[key] = null;
      continue;
    }
    keyToCode[key] = code;
  }

  const uniqueCodes = [...new Set(Object.values(keyToCode).filter(Boolean))];
  const codeToRow = {};
  if (uniqueCodes.length) {
    const placeholders = uniqueCodes.map(() => '?').join(',');
    const [rows] = await db.pool.execute(
      `SELECT id, account_code, account_name
       FROM gl_accounts
       WHERE account_code IN (${placeholders})`,
      uniqueCodes
    );
    for (const row of rows) codeToRow[row.account_code] = row;
  }

  const result = {};
  for (const key of keys) {
    const code = keyToCode[key];
    if (!code) {
      result[key] = null;
      continue;
    }
    const row = codeToRow[code];
    if (!row) {
      if (required) {
        throw businessError(`相关的财务科目不存在: ${code}，请前往会计科目页面配置后再试`);
      }
      result[key] = null;
      continue;
    }
    result[key] = {
      id: row.id,
      code: row.account_code,
      name: row.account_name,
      label: `${row.account_code} ${row.account_name}`,
    };
  }
  return result;
}

function buildEntryLine(account, debit, credit, description, role, dims = {}) {
  return {
    role: role || null,
    account_id: account?.id || null,
    account_code: account?.code || null,
    account_name: account?.name || null,
    account_label: account?.label || null,
    debit_amount: money(debit || 0),
    credit_amount: money(credit || 0),
    description: description || '',
    supplier_id: dims.supplier_id || null,
    customer_id: dims.customer_id || null,
    ...pickLineMetadata(dims),
    editable: true,
  };
}

function requireAccounts(accounts, keys) {
  const missing = keys.filter((k) => !accounts[k]);
  if (missing.length) {
    throw businessError(`缺少会计科目配置: ${missing.join(', ')}，请前往会计科目/财务设置配置`);
  }
}

class ManualVoucherService {
  static get BUSINESS_TYPES() {
    return BUSINESS_TYPES;
  }

  static get PRIMARY_BUSINESS_TYPES() {
    return PRIMARY_BUSINESS_TYPES;
  }

  static get SUPPORTED_BUSINESS_TYPES() {
    return SUPPORTED_BUSINESS_TYPES;
  }

  static get INACTIVE_INVOICE_STATUSES() {
    return INACTIVE_INVOICE_STATUSES;
  }

  static get BATCH_MAX_IDS() {
    return BATCH_MAX_IDS;
  }

  // ==================== 主路径列表 ====================

  /**
   * 采购入库单 → 应付（专业主路径）
   */
  static async listEligiblePurchaseReceipts(query = {}) {
    const { page, pageSize, limit, offset } = parsePagination(query.page, query.pageSize, {
      defaultPageSize: 10,
    });
    const keyword = String(query.keyword || '').trim();

    // 可生成 = 无「有效」应付；已取消票不挡列表（生成时会释放其 source_id）
    // invoice_status 仅作辅助：若仍有有效 AP 则已由 NOT EXISTS 排除
    const where = [
      'pr.deleted_at IS NULL',
      `pr.status NOT IN (${SQL_BLOCKED_STATUS_IN})`,
      'pr.status = ?',
      `EXISTS (
         SELECT 1
           FROM inventory_posting_documents ipd
           JOIN inventory_posting_lines ipl ON ipl.posting_document_id = ipd.id
          WHERE ipl.reference_no = pr.receipt_no
            AND ipd.finance_status = 'approved'
            AND ipd.locked = 1
            AND ipd.posting_kind = 'movement'
        )`,
      `NOT EXISTS (
         SELECT 1 FROM ap_invoices ap
         WHERE ap.source_type IN (?, 'inbound')
           AND ap.source_id = pr.id
           AND ap.status NOT IN (${SQL_INACTIVE_STATUS_IN})
       )`,
    ];
    const params = [
      ...BLOCKED_DOC_STATUSES,
      RECEIPT_STATUS.COMPLETED,
      BUSINESS_TYPES.PURCHASE_RECEIPT,
      ...INACTIVE_INVOICE_STATUSES,
    ];

    if (keyword) {
      where.push(
        '(pr.receipt_no LIKE ? OR pr.order_no LIKE ? OR COALESCE(pr.supplier_name, s.name) LIKE ?)'
      );
      const like = `%${keyword}%`;
      params.push(like, like, like);
    }

    const whereSql = where.join(' AND ');

    const [countRows] = await db.pool.execute(
      `SELECT COUNT(*) AS total
       FROM purchase_receipts pr
       LEFT JOIN suppliers s ON pr.supplier_id = s.id
       WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [list] = await db.pool.execute(
      `SELECT pr.id, pr.receipt_no, pr.receipt_no AS doc_no, pr.receipt_no AS order_no,
              pr.order_id, pr.order_no AS source_order_no,
              pr.supplier_id,
              COALESCE(pr.supplier_name, s.name) AS supplier_name,
              COALESCE(pr.supplier_name, s.name) AS party_name,
              pr.total_amount, pr.total_tax_amount, pr.status, pr.invoice_status,
              pr.receipt_date AS doc_date, pr.receipt_date AS order_date,
              pr.created_at
       FROM purchase_receipts pr
       LEFT JOIN suppliers s ON pr.supplier_id = s.id
       WHERE ${whereSql}
       ORDER BY pr.id DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );

    return { list, total, page, pageSize };
  }

  /**
   * 销售出库单 → 应收（专业主路径：按交货量）
   */
  static async listEligibleSalesOutbounds(query = {}) {
    const { page, pageSize, limit, offset } = parsePagination(query.page, query.pageSize, {
      defaultPageSize: 10,
    });
    const keyword = String(query.keyword || '').trim();

    const where = [
      'sob.deleted_at IS NULL',
      "sob.status = 'completed'",
      `EXISTS (
         SELECT 1
           FROM inventory_posting_documents ipd
           JOIN inventory_posting_lines ipl ON ipl.posting_document_id = ipd.id
          WHERE ipl.reference_no = sob.outbound_no
            AND ipl.transaction_type = 'sales_outbound'
            AND ipd.finance_status = 'approved'
            AND ipd.locked = 1
            AND ipd.posting_kind = 'movement'
        )`,
      // 已有出库级应收 → 不展示
      `NOT EXISTS (
         SELECT 1 FROM ar_invoices ar
         WHERE ar.source_type = ?
           AND ar.source_id = sob.id
           AND ar.status NOT IN (${SQL_INACTIVE_STATUS_IN})
       )`,
      // 已有历史订单级应收 → 不展示（与生成逻辑防双记一致，避免列表可选却生成被跳过）
      `NOT EXISTS (
         SELECT 1 FROM ar_invoices ar2
         WHERE ar2.source_type = 'sales_order'
           AND ar2.source_id = sob.order_id
           AND sob.order_id IS NOT NULL
           AND ar2.status NOT IN (${SQL_INACTIVE_STATUS_IN})
       )`,
      // 明细关联订单上也无活跃订单级票
      `NOT EXISTS (
         SELECT 1
         FROM sales_outbound_items sobi
         JOIN ar_invoices ar3
           ON ar3.source_type = 'sales_order'
          AND ar3.source_id = sobi.source_order_id
          AND ar3.status NOT IN (${SQL_INACTIVE_STATUS_IN})
         WHERE sobi.outbound_id = sob.id
           AND sobi.source_order_id IS NOT NULL
       )`,
    ];
    const params = [
      BUSINESS_TYPES.SALES_OUTBOUND,
      ...INACTIVE_INVOICE_STATUSES,
      ...INACTIVE_INVOICE_STATUSES,
      ...INACTIVE_INVOICE_STATUSES,
    ];

    if (keyword) {
      where.push(
        `(sob.outbound_no LIKE ? OR ord.order_no LIKE ? OR c.name LIKE ?
          OR sob.related_orders LIKE ? OR EXISTS (
            SELECT 1 FROM sales_outbound_items related_item
            JOIN sales_orders related_order ON related_order.id = related_item.source_order_id
            LEFT JOIN customers related_customer ON related_customer.id = related_order.customer_id
            WHERE related_item.outbound_id = sob.id
              AND (related_order.order_no LIKE ? OR related_customer.name LIKE ?)
          ))`
      );
      const like = `%${keyword}%`;
      params.push(like, like, like, like, like, like);
    }

    const whereSql = where.join(' AND ');

    const [countRows] = await db.pool.execute(
      `SELECT COUNT(*) AS total
       FROM sales_outbound sob
       LEFT JOIN sales_orders ord ON sob.order_id = ord.id
       LEFT JOIN customers c ON ord.customer_id = c.id
       WHERE ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    const [list] = await db.pool.execute(
      `SELECT sob.id, sob.outbound_no, sob.outbound_no AS doc_no, sob.outbound_no AS order_no,
              sob.order_id, COALESCE(ord.order_no, source_parties.order_nos) AS source_order_no,
              COALESCE(ord.customer_id, source_parties.customer_id) AS customer_id,
              COALESCE(c.name, source_parties.customer_names) AS customer_name,
              COALESCE(c.name, source_parties.customer_names) AS party_name,
              sob.total_amount, sob.status, sob.delivery_date AS doc_date,
              sob.delivery_date AS order_date, sob.is_multi_order, sob.related_orders,
              sob.created_at
       FROM sales_outbound sob
       LEFT JOIN sales_orders ord ON sob.order_id = ord.id
       LEFT JOIN customers c ON ord.customer_id = c.id
       LEFT JOIN (
         SELECT related_item.outbound_id,
                GROUP_CONCAT(DISTINCT related_order.order_no ORDER BY related_order.order_no SEPARATOR '、') AS order_nos,
                CASE WHEN COUNT(DISTINCT related_order.customer_id) = 1 THEN MIN(related_order.customer_id) END AS customer_id,
                GROUP_CONCAT(DISTINCT related_customer.name ORDER BY related_customer.name SEPARATOR '、') AS customer_names
         FROM sales_outbound_items related_item
         JOIN sales_orders related_order ON related_order.id = related_item.source_order_id AND related_order.deleted_at IS NULL
         LEFT JOIN customers related_customer ON related_customer.id = related_order.customer_id
         GROUP BY related_item.outbound_id
       ) source_parties ON source_parties.outbound_id = sob.id
       WHERE ${whereSql}
       ORDER BY sob.id DESC
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      params
    );

    return { list, total, page, pageSize };
  }

  // ==================== 历史接口兼容（订单级已全面停用） ====================

  /**
   * @deprecated 订单级应收已全面停用。根据企业会计准则，凭证必须基于实际发货的销售出库单生成。
   * 接口保留以兼容旧版前端调用，直接返回标准空列表，避免无谓的数据库连接与查询开销。
   */
  static async listEligibleSalesOrders(query = {}) {
    const { page, pageSize } = parsePagination(query.page, query.pageSize, { defaultPageSize: 10 });
    return { list: [], total: 0, page, pageSize };
  }

  /**
   * @deprecated 订单级应付已全面停用。根据企业会计准则，凭证必须基于实际验收入库的采购入库单生成。
   * 接口保留以兼容旧版前端调用，直接返回标准空列表，避免无谓的数据库连接与查询开销。
   */
  static async listEligiblePurchaseOrders(query = {}) {
    const { page, pageSize } = parsePagination(query.page, query.pageSize, { defaultPageSize: 10 });
    return { list: [], total: 0, page, pageSize };
  }

  // ==================== 加载 ====================

  static async loadPurchaseReceipt(receiptId) {
    const [rows] = await db.pool.execute(
      `SELECT pr.*, COALESCE(pr.supplier_name, s.name) AS supplier_name
       FROM purchase_receipts pr
       LEFT JOIN suppliers s ON pr.supplier_id = s.id
       WHERE pr.id = ? AND pr.deleted_at IS NULL`,
      [receiptId]
    );
    return rows[0] || null;
  }

  static async loadSalesOutbound(outboundId) {
    const [rows] = await db.pool.execute(
      `SELECT sob.*,
              sob.delivery_date AS outbound_date,
              ord.customer_id,
              c.name AS customer_name,
              ord.order_no
       FROM sales_outbound sob
       LEFT JOIN sales_orders ord ON sob.order_id = ord.id
       LEFT JOIN customers c ON ord.customer_id = c.id
       WHERE sob.id = ? AND sob.deleted_at IS NULL`,
      [outboundId]
    );
    return rows[0] || null;
  }

  static async loadSalesOrdersForOutbound(outboundId, headerOrderId = null) {
    const [fromItems] = await db.pool.execute(
      `SELECT DISTINCT so.*, c.name AS customer_name
       FROM sales_outbound_items sobi
       JOIN sales_orders so ON so.id = sobi.source_order_id AND so.deleted_at IS NULL
       LEFT JOIN customers c ON so.customer_id = c.id
       WHERE sobi.outbound_id = ?`,
      [outboundId]
    );
    if (fromItems.length) return fromItems;

    if (headerOrderId) {
      const [header] = await db.pool.execute(
        `SELECT so.*, c.name AS customer_name
         FROM sales_orders so
         LEFT JOIN customers c ON so.customer_id = c.id
         WHERE so.id = ? AND so.deleted_at IS NULL`,
        [headerOrderId]
      );
      return header;
    }
    return [];
  }

  static async loadSalesOrder(orderId) {
    const [rows] = await db.pool.execute(
      `SELECT so.*, c.name AS customer_name
       FROM sales_orders so
       LEFT JOIN customers c ON so.customer_id = c.id
       WHERE so.id = ? AND so.deleted_at IS NULL`,
      [orderId]
    );
    return rows[0] || null;
  }

  static async loadPurchaseOrder(orderId) {
    const [rows] = await db.pool.execute(
      `SELECT po.*, COALESCE(po.supplier_name, s.name) AS supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.id = ? AND po.deleted_at IS NULL`,
      [orderId]
    );
    return rows[0] || null;
  }

  // ==================== 预览（不写库，一单一凭证草稿） ====================

  /**
   * 预览：采购入库 → 应付凭证草稿
   * 用户可改明细单价/数量/税额/科目后再确认生成
   */
  static async previewPurchaseReceipt(receiptId) {
    const receipt = await this.loadPurchaseReceipt(receiptId);
    if (!receipt) throw businessError('采购入库单不存在', 'NOT_FOUND', 404);
    if (isBlockedStatus(receipt.status)) {
      throw businessError(
        `采购入库单 ${receipt.receipt_no} 状态为 ${receipt.status}，不能生成凭证`
      );
    }
    if (receipt.status !== 'completed') {
      throw businessError(
        `采购入库单 ${receipt.receipt_no} 未完成，不能生成凭证（当前：${receipt.status}）`
      );
    }

    // 幂等检查：已有有效 AP 则标记 skipped
    const [existing] = await db.pool.execute(
      `SELECT id, invoice_number, total_amount, status
       FROM ap_invoices
       WHERE source_type IN (?, 'inbound') AND source_id = ?
         AND status NOT IN (${SQL_INACTIVE_STATUS_IN})
       LIMIT 1`,
      [BUSINESS_TYPES.PURCHASE_RECEIPT, receiptId, ...INACTIVE_INVOICE_STATUSES]
    );
    if (existing[0]) {
      return {
        id: receipt.id,
        businessType: BUSINESS_TYPES.PURCHASE_RECEIPT,
        docNo: receipt.receipt_no,
        sourceOrderNo: receipt.order_no || null,
        partyName: receipt.supplier_name || null,
        partyId: receipt.supplier_id || null,
        entryDate: toLocalDateString(receipt.receipt_date || currentDateString()),
        description: `供应商 ${receipt.supplier_name || '未知'} 应付账款（入库 ${receipt.receipt_no}）`,
        skipped: true,
        skipMessage: `应付发票已存在（${existing[0].invoice_number}）`,
        subtotal: null,
        taxAmount: null,
        taxRate: null,
        totalAmount: Number(existing[0].total_amount) || 0,
        items: [],
        entryLines: [],
        accounts: {},
      };
    }

    const [receiptItems] = await db.pool.execute(
      `SELECT pri.material_id, pri.qualified_quantity AS quantity,
              COALESCE(
                NULLIF(${sqlUnitPriceExpr('pri', 'purchase_receipt_items')}, 0),
                NULLIF(${sqlUnitPriceExpr('poi', 'purchase_order_items')}, 0),
                NULLIF(m.cost_price, 0),
                0
              ) AS unit_price,
              m.name AS material_name, m.code AS material_code, m.specs AS specs, u.name AS unit_name,
              pri.tax_rate AS item_tax_rate
       FROM purchase_receipt_items pri
       LEFT JOIN purchase_receipts pr ON pri.receipt_id = pr.id
       LEFT JOIN purchase_orders po ON pr.order_id = po.id
       LEFT JOIN purchase_order_items poi ON poi.id = pri.order_item_id AND po.id = poi.order_id
       LEFT JOIN materials m ON pri.material_id = m.id
       LEFT JOIN units u ON u.id = pri.unit_id
       WHERE pri.receipt_id = ?`,
      [receiptId]
    );
    if (!receiptItems.length) {
      throw businessError(`采购入库单 ${receipt.receipt_no} 没有明细，不能生成应付发票`);
    }

    const items = receiptItems.map((row) => {
      const qty = Number(row.quantity) || 0;
      const unitPrice = resolveUnitPrice(row);
      return {
        material_id: row.material_id,
        material_code: row.material_code || null,
        material_name: row.material_name || row.material_code || '未命名物料',
        description: `采购物资 ${row.material_name || row.material_code || ''}`.trim(),
        quantity: qty,
        unit_name: row.unit_name || null,
        unit_price: unitPrice,
        amount: money(qty * unitPrice),
      };
    });

    const subtotal = money(items.reduce((s, it) => s + it.amount, 0));
    if (subtotal <= 0) {
      throw businessError(`采购入库单 ${receipt.receipt_no} 物料金额为0，不能生成应付发票`);
    }
    const taxRate = normalizeTaxRate(receipt.tax_rate, defaultVatRate());
    // 优先用入库单头税额；否则按税率重算
    const taxAmount =
      receipt.total_tax_amount !== null &&
      receipt.total_tax_amount !== undefined &&
      receipt.total_tax_amount !== ''
        ? money(receipt.total_tax_amount)
        : calcTaxAmount(subtotal, taxRate);
    const totalAmount = money(subtotal + taxAmount);

    const accounts = await resolveAccountMeta(['GR_IR', 'ACCOUNTS_PAYABLE', 'VAT_INPUT_TAX'], {
      required: false,
    });
    requireAccounts(accounts, ['GR_IR', 'ACCOUNTS_PAYABLE']);
    const costAcc = accounts.GR_IR;
    const payableAcc = accounts.ACCOUNTS_PAYABLE;
    const taxAcc = accounts.VAT_INPUT_TAX;
    const splitTax = taxAmount > 0.0001 && taxAcc;
    const docLabel = receipt.receipt_no;
    const supplierDim = receipt.supplier_id ? { supplier_id: Number(receipt.supplier_id) } : {};

    const entryLines = splitTax
      ? [
          buildEntryLine(
            costAcc,
            subtotal,
            0,
            `采购/GR-IR(未税) - 入库 ${docLabel}`,
            ENTRY_ROLES.COST,
            supplierDim
          ),
          buildEntryLine(taxAcc, taxAmount, 0, `进项税额 - 入库 ${docLabel}`, ENTRY_ROLES.TAX),
          buildEntryLine(
            payableAcc,
            0,
            totalAmount,
            `应付账款(价税合计) - 入库 ${docLabel}`,
            ENTRY_ROLES.PAYABLE,
            supplierDim
          ),
        ]
      : [
          buildEntryLine(
            costAcc,
            totalAmount,
            0,
            `采购/GR-IR - 入库 ${docLabel}`,
            ENTRY_ROLES.COST,
            supplierDim
          ),
          buildEntryLine(
            payableAcc,
            0,
            totalAmount,
            `应付账款 - 入库 ${docLabel}`,
            ENTRY_ROLES.PAYABLE,
            supplierDim
          ),
        ];

    return {
      id: receipt.id,
      businessType: BUSINESS_TYPES.PURCHASE_RECEIPT,
      docNo: receipt.receipt_no,
      sourceOrderNo: receipt.order_no || null,
      partyName: receipt.supplier_name || null,
      partyId: receipt.supplier_id || null,
      entryDate: toLocalDateString(receipt.receipt_date || currentDateString()),
      description: `供应商 ${receipt.supplier_name || '未知'} 应付账款`,
      skipped: false,
      skipMessage: null,
      subtotal,
      taxAmount,
      taxRate,
      totalAmount,
      currencyCode: 'CNY',
      exchangeRate: 1,
      items,
      entryLines: entryLines.map((line) => ({
        ...pickCommonLineMetadata(receipt),
        ...line,
        ...(line.role === ENTRY_ROLES.COST ? singleMaterialMetadata(items) : {}),
      })),
      accounts: {
        costAccountId: costAcc.id,
        payableAccountId: payableAcc.id,
        taxAccountId: taxAcc?.id || null,
      },
      totals: {
        debit: sumBy(entryLines, 'debit_amount'),
        credit: sumBy(entryLines, 'credit_amount'),
      },
    };
  }

  /**
   * 预览：销售出库 → 应收凭证草稿
   */
  static async previewSalesOutbound(outboundId) {
    const outbound = await this.loadSalesOutbound(outboundId);
    if (!outbound) throw businessError('销售出库单不存在', 'NOT_FOUND', 404);
    if (String(outbound.status) !== 'completed') {
      throw businessError(
        `销售出库单 ${outbound.outbound_no} 状态为 ${outbound.status}，仅已完成出库可生成应收`
      );
    }

    const [existing] = await db.pool.execute(
      `SELECT id, invoice_number, total_amount, status
       FROM ar_invoices
       WHERE source_type = ? AND source_id = ?
         AND status NOT IN (${SQL_INACTIVE_STATUS_IN})
       LIMIT 1`,
      [BUSINESS_TYPES.SALES_OUTBOUND, outboundId, ...INACTIVE_INVOICE_STATUSES]
    );
    if (existing[0]) {
      return {
        id: outbound.id,
        businessType: BUSINESS_TYPES.SALES_OUTBOUND,
        docNo: outbound.outbound_no,
        sourceOrderNo: outbound.order_no || null,
        partyName: outbound.customer_name || null,
        partyId: outbound.customer_id || null,
        entryDate: toLocalDateString(outbound.outbound_date || currentDateString()),
        description: `客户 ${outbound.customer_name || '未知'} 应收账款（出库 ${outbound.outbound_no}）`,
        skipped: true,
        skipMessage: `应收发票已存在（${existing[0].invoice_number}）`,
        subtotal: null,
        taxAmount: null,
        taxRate: null,
        totalAmount: Number(existing[0].total_amount) || 0,
        items: [],
        entryLines: [],
        accounts: {},
      };
    }

    const itemRows = await SalesOutboundValuationService.getItems(db.pool, [outboundId]);
    if (!itemRows.length) {
      throw businessError('销售出库单没有明细，不能生成应收');
    }
    const orders = await this.loadSalesOrdersForOutbound(outboundId, outbound.order_id);
    const expectedOrderIds = [
      ...new Set(
        itemRows.map((row) => Number(row.source_order_id || row.header_order_id)).filter(Boolean)
      ),
    ];
    if (
      !orders.length ||
      expectedOrderIds.some((id) => !orders.some((order) => Number(order.id) === id))
    ) {
      throw businessError('销售出库的来源订单不完整，不能确定客户、币种和汇率');
    }
    const currency = resolveSameVoucherCurrency(orders);
    const commonMetadata = resolveCommonLineMetadata(orders);
    const customerIds = [
      ...new Set(orders.map((order) => Number(order.customer_id)).filter(Boolean)),
    ];
    if (customerIds.length > 1) throw businessError('同一出库单存在不同客户，请按客户分别生成应收');
    if (!customerIds.length || orders.some((order) => !Number(order.customer_id))) {
      throw businessError('销售来源订单缺少客户信息，不能生成应收凭证');
    }
    const customerId = customerIds[0] || outbound.customer_id || null;
    const customerName =
      orders.find((order) => Number(order.customer_id) === Number(customerId))?.customer_name ||
      outbound.customer_name;
    const valued = SalesOutboundValuationService.summarize(itemRows);
    const items = valued.items
      .filter((row) => Number(row.quantity) > 0)
      .map((row) => {
        const unitPrice = Number(row.unit_price) || 0;
        if (unitPrice <= 0) throw businessError('销售出库明细缺少有效成交价，请补齐出库单价格');
        return {
          material_id: row.material_id,
          product_id: row.material_id,
          material_code: row.material_code || null,
          material_name: row.material_name || row.material_code || '未命名物料',
          product_name: row.material_name || row.material_code || '未命名物料',
          description: row.material_name || row.material_code || '',
          quantity: Number(row.quantity),
          unit_price: unitPrice,
          unit_name: row.unit_name || null,
          amount: money(Number(row.quantity) * unitPrice),
        };
      });
    if (!items.length) throw businessError('销售出库单没有可开票数量');
    const subtotal = valued.subtotal;
    const taxAmount = valued.taxAmount;
    const taxRate = subtotal > 0 ? normalizeTaxRate(taxAmount / subtotal) : 0;
    const totalAmount = valued.totalAmount;

    const accounts = await resolveAccountMeta(
      ['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE', 'VAT_OUTPUT_TAX'],
      { required: false }
    );
    requireAccounts(accounts, ['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']);
    const arAcc = accounts.ACCOUNTS_RECEIVABLE;
    const revAcc = accounts.SALES_REVENUE;
    const taxAcc = accounts.VAT_OUTPUT_TAX;
    const splitTax = taxAmount > 0.0001 && taxAcc;
    const docLabel = outbound.outbound_no;
    const customerDim = customerId ? { customer_id: Number(customerId) } : {};

    const entryLines = splitTax
      ? [
          buildEntryLine(
            arAcc,
            totalAmount,
            0,
            `应收账款(价税合计) - 出库 ${docLabel}`,
            ENTRY_ROLES.RECEIVABLE,
            customerDim
          ),
          buildEntryLine(
            revAcc,
            0,
            subtotal,
            `销售收入(未税) - 出库 ${docLabel}`,
            ENTRY_ROLES.INCOME
          ),
          buildEntryLine(taxAcc, 0, taxAmount, `销项税额 - 出库 ${docLabel}`, ENTRY_ROLES.TAX),
        ]
      : [
          buildEntryLine(
            arAcc,
            totalAmount,
            0,
            `应收账款 - 出库 ${docLabel}`,
            ENTRY_ROLES.RECEIVABLE,
            customerDim
          ),
          buildEntryLine(revAcc, 0, totalAmount, `销售收入 - 出库 ${docLabel}`, ENTRY_ROLES.INCOME),
        ];

    return {
      id: outbound.id,
      businessType: BUSINESS_TYPES.SALES_OUTBOUND,
      docNo: outbound.outbound_no,
      sourceOrderNo: outbound.order_no || null,
      partyName: customerName || null,
      partyId: customerId,
      currencyCode: currency.currency_code,
      exchangeRate: currency.exchange_rate,
      entryDate: toLocalDateString(outbound.outbound_date || currentDateString()),
      description: `客户 ${customerName || '未知'} 应收账款`,
      skipped: false,
      skipMessage: null,
      subtotal,
      taxAmount,
      taxRate,
      totalAmount,
      items,
      entryLines: entryLines.map((line) => ({
        ...commonMetadata,
        ...line,
        ...(line.role === ENTRY_ROLES.INCOME ? singleMaterialMetadata(items) : {}),
      })),
      accounts: {
        receivableAccountId: arAcc.id,
        incomeAccountId: revAcc.id,
        taxAccountId: taxAcc?.id || null,
      },
      totals: {
        debit: sumBy(entryLines, 'debit_amount'),
        credit: sumBy(entryLines, 'credit_amount'),
      },
    };
  }

  /**
   * 批量预览（默认合并）：多选 → 1 张凭证草稿
   * options.merge=false 时一单一证
   */
  static async batchPreview(businessType, rawIds, options = {}) {
    const ids = normalizeIds(rawIds);
    if (ids.length === 0) throw businessError('请至少选择一张业务单据');
    if (ids.length > BATCH_MAX_IDS) {
      throw businessError(`单次最多选择 ${BATCH_MAX_IDS} 张单据`);
    }

    const merge = parseMergeFlag(options, true);
    const previewOne = this.resolvePreviewer(businessType);
    if (!previewOne) {
      throw businessError(`预览仅支持专业主路径：${PRIMARY_BUSINESS_TYPES.join(' / ')}`);
    }

    const drafts = [];
    let skippedCount = 0;
    let failedCount = 0;

    for (const id of ids) {
      try {
        const draft = await previewOne.call(this, id);
        drafts.push(draft);
        if (draft.skipped) skippedCount += 1;
      } catch (err) {
        failedCount += 1;
        drafts.push({
          id,
          businessType,
          docNo: null,
          skipped: false,
          error: true,
          skipMessage: err.message || '预览失败',
          items: [],
          entryLines: [],
          totalAmount: 0,
        });
        logger.warn('[ManualVoucher] 预览单条失败', {
          businessType,
          id,
          error: err.message,
        });
      }
    }

    const readyDrafts = drafts.filter((d) => !d.skipped && !d.error);
    const skippedDrafts = drafts.filter((d) => d.skipped || d.error);

    if (!merge) {
      return {
        businessType,
        total: ids.length,
        readyCount: readyDrafts.length,
        skippedCount,
        failedCount,
        merge: false,
        message: `将生成 ${readyDrafts.length} 张独立凭证（每张业务单据各一张）`,
        vouchers: drafts,
      };
    }

    const isAp = businessType === BUSINESS_TYPES.PURCHASE_RECEIPT;
    const merged = mergeDraftsIntoVoucher(businessType, readyDrafts, isAp);
    if (merged && !merged.entryDate) {
      merged.entryDate = currentDateString();
    }
    const vouchers = merged ? [merged, ...skippedDrafts] : [...skippedDrafts];
    const readyCount = merged ? 1 : 0;
    const message = merged
      ? readyDrafts.length > 1
        ? `已将 ${readyDrafts.length} 张业务单据合并为 1 张凭证预览`
        : '将生成 1 张凭证'
      : `无可生成单据（已存在 ${skippedCount}，失败 ${failedCount}）`;

    return {
      businessType,
      total: ids.length,
      sourceCount: ids.length,
      readySourceCount: readyDrafts.length,
      readyCount,
      skippedCount,
      failedCount,
      merge: true,
      message,
      vouchers,
    };
  }

  // ==================== 单条生成 ====================

  /**
   * 主路径：入库 → 应付 + 进项税票（force）
   * 专业闭环：税票与应付同属一次业财确认，任一侧失败向上抛出（fail-closed）
   * @param {Object|null} overrides 预览确认后的金额/科目覆盖
   * @param {Object} options { skipGlEntry } 合并凭证时跳过单票总账
   */
  static async generateFromPurchaseReceipt(
    receiptId,
    userId = null,
    overrides = null,
    options = {}
  ) {
    const receipt = await this.loadPurchaseReceipt(receiptId);
    if (!receipt) throw businessError('采购入库单不存在', 'NOT_FOUND', 404);
    if (isBlockedStatus(receipt.status)) {
      throw businessError(
        `采购入库单 ${receipt.receipt_no} 状态为 ${receipt.status}，不能生成凭证`
      );
    }
    if (receipt.status !== 'completed') {
      throw businessError(
        `采购入库单 ${receipt.receipt_no} 未完成，不能生成凭证（当前：${receipt.status}）`
      );
    }
    await FinanceIntegrationService.requireApprovedInventoryPosting(
      options.connection || db.pool,
      'purchase_receipt',
      receipt.receipt_no,
      receipt.id
    );

    const shared = {
      force: true,
      overrides: overrides || undefined,
      skipGlEntry: options.skipGlEntry === true,
      connection: options.connection || undefined,
    };

    const result = await FinanceIntegrationService.generateAPInvoiceFromPurchaseReceipt(
      receipt,
      userId,
      shared
    );

    const tax = await FinanceIntegrationService.generateInputTaxInvoiceFromPurchaseReceipt(
      receipt,
      userId,
      { force: true, connection: options.connection || undefined }
    );
    if (tax && tax.success === false) {
      throw businessError(tax.message || '进项税票生成失败', 'TAX_GENERATE_FAILED', 400);
    }

    const sideEffects = { tax };
    const item = buildResultItem(receipt.id, receipt.receipt_no, result, '应付发票已存在');
    item.sideEffects = sideEffects;
    item.taxAmount = result?.taxAmount;
    return {
      order: receipt,
      result: { ...result, sideEffects },
      item,
    };
  }

  /**
   * 主路径：出库 → 应收 + 销项税票 + 销售成本凭证（force）
   * @param {Object} options { skipGlEntry, skipCostEntry, connection }
   *   合并应收时 skipGlEntry=true；销售成本仍按各出库单独立结转。
   */
  static async generateFromSalesOutbound(
    outboundId,
    userId = null,
    overrides = null,
    options = {}
  ) {
    const outbound = await this.loadSalesOutbound(outboundId);
    if (!outbound) throw businessError('销售出库单不存在', 'NOT_FOUND', 404);
    if (String(outbound.status) !== 'completed') {
      throw businessError(
        `销售出库单 ${outbound.outbound_no} 状态为 ${outbound.status}，仅已完成出库可生成应收`
      );
    }
    await InventoryPostingService.requireApprovedForTransaction(db.pool, {
      reference_type: 'sales_outbound',
      reference_no: outbound.outbound_no,
    });

    const salesOrders = await this.loadSalesOrdersForOutbound(
      outboundId,
      outbound.order_id || null
    );

    const sharedConn = options.connection || undefined;
    const result = await FinanceIntegrationService.generateARInvoiceFromSalesOutbound(
      outbound,
      salesOrders,
      userId,
      {
        force: true,
        overrides: overrides || undefined,
        skipGlEntry: options.skipGlEntry === true,
        connection: sharedConn,
      }
    );

    const tax = await FinanceIntegrationService.generateOutputTaxInvoiceFromSalesOutbound(
      outbound,
      userId,
      { force: true, connection: sharedConn }
    );
    if (tax && tax.success === false) {
      throw businessError(tax.message || '销项税票生成失败', 'TAX_GENERATE_FAILED', 400);
    }

    // 合并只改变应收凭证的张数，不能省略已交货商品的成本结转。
    const skipCost = options.skipCostEntry === true;
    const cost = await FinanceIntegrationService.generateCostEntryFromSalesOutbound(
      outbound,
      userId,
      { force: true, skipCostEntry: skipCost, connection: sharedConn }
    );
    if (cost && cost.success === false) {
      throw businessError(cost.message || '销售成本凭证生成失败', 'COST_GENERATE_FAILED', 400);
    }

    const sideEffects = { tax, cost };
    const item = buildResultItem(outbound.id, outbound.outbound_no, result, '应收发票已存在');
    item.sideEffects = sideEffects;
    return {
      order: outbound,
      result: { ...result, sideEffects },
      item,
    };
  }

  /** 例外：整单销售订单（已停用） */
  static async generateFromSalesOrder(_orderId, _userId = null) {
    throw businessError(
      '订单级应收已全面停用；根据企业会计准则，凭证必须源自财务审核通过的销售出库单',
      'ORDER_LEVEL_VOUCHER_DISABLED',
      409
    );
  }

  /** 例外：整单采购订单（已停用） */
  static async generateFromPurchaseOrder(_orderId, _userId = null) {
    throw businessError(
      '订单级应付已全面停用；根据企业会计准则，凭证必须源自财务审核通过的采购入库单',
      'ORDER_LEVEL_VOUCHER_DISABLED',
      409
    );
  }

  // ==================== 批量 ====================

  static resolvePreviewer(businessType) {
    switch (businessType) {
      case BUSINESS_TYPES.PURCHASE_RECEIPT:
        return (id) => this.previewPurchaseReceipt(id);
      case BUSINESS_TYPES.SALES_OUTBOUND:
        return (id) => this.previewSalesOutbound(id);
      default:
        return null;
    }
  }

  static resolveGenerator(businessType) {
    switch (businessType) {
      case BUSINESS_TYPES.PURCHASE_RECEIPT:
        return (id, userId, overrides, options) =>
          this.generateFromPurchaseReceipt(id, userId, overrides, options);
      case BUSINESS_TYPES.SALES_OUTBOUND:
        return (id, userId, overrides, options) =>
          this.generateFromSalesOutbound(id, userId, overrides, options);
      case BUSINESS_TYPES.SALES_ORDER:
        return (id, userId) => this.generateFromSalesOrder(id, userId);
      case BUSINESS_TYPES.PURCHASE_ORDER:
        return (id, userId) => this.generateFromPurchaseOrder(id, userId);
      default:
        return null;
    }
  }

  static isPrimaryType(businessType) {
    return PRIMARY_BUSINESS_TYPES.includes(businessType);
  }

  /**
   * 合并凭证 document_number：短、稳定、≤50（gl_entries 限制）
   * 格式：MV{YYYYMMDD}{业务首字母}{sourceId排序后短哈希}
   */
  static buildMergeDocumentNumber(businessType, sourceIds = [], invoiceLinks = []) {
    const day = currentDateString().replace(/-/g, '');
    const tag = businessType === BUSINESS_TYPES.PURCHASE_RECEIPT ? 'P' : 'S';
    const ids = (sourceIds.length ? sourceIds : invoiceLinks.map((x) => x.sourceId).filter(Boolean))
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b);
    // 简单稳定短哈希（不引入 crypto 依赖行为差异）
    let hash = 0;
    const raw = ids.join(',');
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    const doc = `MV${day}${tag}${hash.toString(36).toUpperCase()}`;
    return doc.slice(0, 50);
  }

  /**
   * 创建合并总账凭证，并关联到各发票
   * @param {object} args.connection 外层事务连接（合并路径必传）
   */
  static async createMergedGlEntry({
    businessType,
    entryDate,
    description,
    entryLines,
    invoiceLinks = [],
    sourceIds = [],
    userId = null,
    connection = null,
    partyId = null,
  }) {
    const financeModel = require('../../models/finance');
    const DocumentLinkService = require('../business/DocumentLinkService');
    const { DOCUMENT_TYPE_MAPPING } = require('../../constants/financeConstants');
    const GLService = require('./GLService');
    const isApPreview = businessType === BUSINESS_TYPES.PURCHASE_RECEIPT;
    const sourceCurrency = resolveSameVoucherCurrency(invoiceLinks);
    if (sourceCurrency.currency_code === 'USD' && invoiceLinks.length > 1) {
      throw businessError('美元来源请逐单生成凭证，以保留原单核销金额');
    }
    const actualSources = invoiceLinks.map((link) => link.voucherSource).filter(Boolean);
    const commonMetadata = resolveCommonLineMetadata(
      actualSources.map((source) => source.commonMetadata || {})
    );
    const actualPartyIds = [
      ...new Set(actualSources.map((source) => Number(source.partyId)).filter(Boolean)),
    ];
    if (actualPartyIds.length > 1)
      throw businessError('不同往来单位的业务单据请分别生成凭证，避免辅助账串户');
    if (actualPartyIds.length === 1) partyId = actualPartyIds[0];
    const hasActualItems =
      actualSources.length === invoiceLinks.length &&
      actualSources.every((source) => Array.isArray(source.items));
    const actualQuantity = hasActualItems
      ? singleMaterialMetadata(actualSources.flatMap((source) => source.items))
      : null;

    const lines = (entryLines || [])
      .map((line) => {
        const role = String(line.role || '').toLowerCase();
        const base = {
          ...commonMetadata,
          role: role || null,
          account_id: Number.parseInt(line.account_id, 10),
          description: line.description || description || '',
          debit_amount: money(line.debit_amount || 0),
          credit_amount: money(line.credit_amount || 0),
          supplier_id: line.supplier_id ? Number(line.supplier_id) : null,
          customer_id: line.customer_id ? Number(line.customer_id) : null,
          ...pickLineMetadata(line),
        };
        // 合并路径兜底：预览未带辅助核算时，按角色 + 统一往来单位写入
        if (partyId) {
          if (isApPreview && (role === ENTRY_ROLES.PAYABLE || role === ENTRY_ROLES.COST)) {
            base.supplier_id = Number(partyId);
          }
          if (!isApPreview && role === ENTRY_ROLES.RECEIVABLE) {
            base.customer_id = Number(partyId);
          }
        }
        if (actualQuantity && (role === ENTRY_ROLES.COST || role === ENTRY_ROLES.INCOME)) {
          delete base.quantity;
          delete base.unit_name;
          delete base.unit_price;
          Object.assign(base, actualQuantity);
        }
        return base;
      })
      .filter(
        (l) =>
          Number.isInteger(l.account_id) &&
          l.account_id > 0 &&
          (l.debit_amount > 0 || l.credit_amount > 0)
      );

    if (lines.length < 2) {
      throw businessError('合并凭证明细不足，无法生成总账');
    }

    // 最终以发票合计为准对齐分录（开票后金额可能与预览有 0.01 级差异）
    const invoiceTotal = money(invoiceLinks.reduce((s, x) => s + money(x.amount || 0), 0));
    let finalLines = lines;
    if (invoiceTotal > 0) {
      // 按发票合计重算：保持税/未税比例
      const previewTotal = sumBy(lines, 'debit_amount') || invoiceTotal;
      const taxLine = lines.find((l) => l.role === ENTRY_ROLES.TAX);
      const previewTax = taxLine
        ? money((taxLine.debit_amount || 0) + (taxLine.credit_amount || 0))
        : 0;
      const ratio = previewTotal > 0 ? previewTax / previewTotal : 0;
      const taxAmount =
        taxLine && actualSources.length === invoiceLinks.length
          ? money(actualSources.reduce((sum, source) => sum + money(source.taxAmount || 0), 0))
          : money(invoiceTotal * ratio);
      const subtotal = money(invoiceTotal - taxAmount);
      finalLines = syncEntryLinesToAmounts(businessType, lines, {
        subtotal,
        taxAmount,
        totalAmount: invoiceTotal,
      });
      assertEntryLinesMatchTotals(finalLines, invoiceTotal, '合并凭证');
    } else {
      const debit = sumBy(finalLines, 'debit_amount');
      const credit = sumBy(finalLines, 'credit_amount');
      if (Math.abs(debit - credit) > 0.01 || debit <= 0) {
        throw businessError(`合并凭证借贷不平：借 ${debit} / 贷 ${credit}`);
      }
    }

    finalLines = convertInvoiceCurrencyLines(
      finalLines.map((line) => ({
        ...line,
        invoice_number: invoiceLinks.length === 1 ? invoiceLinks[0].invoiceNumber : null,
      })),
      sourceCurrency
    );
    const debit = sumBy(finalLines, 'debit_amount');
    const credit = sumBy(finalLines, 'credit_amount');
    const dateStr = toLocalDateString(entryDate || currentDateString());

    // 期间解析：有外层 connection 时在同一连接上查，避免另起连接抢锁
    let periodId;
    if (connection) {
      const [periods] = await connection.execute(
        `SELECT id FROM gl_periods
         WHERE start_date <= ? AND end_date >= ? AND is_closed = 0
         ORDER BY start_date DESC LIMIT 1`,
        [dateStr, dateStr]
      );
      periodId = periods[0]?.id || null;
    } else {
      periodId = await GLService.getPeriodIdByDate(dateStr);
    }
    if (!periodId) {
      throw businessError(`日期 ${dateStr} 没有可用的开放会计期间`);
    }

    const isAp = businessType === BUSINESS_TYPES.PURCHASE_RECEIPT;
    const documentNumber = this.buildMergeDocumentNumber(businessType, sourceIds, invoiceLinks);

    const entryId = await financeModel.createEntry(
      {
        entry_date: dateStr,
        posting_date: dateStr,
        document_type: isAp
          ? DOCUMENT_TYPE_MAPPING.PURCHASE_INVOICE
          : DOCUMENT_TYPE_MAPPING.SALES_INVOICE,
        document_number: documentNumber,
        period_id: periodId,
        description:
          description ||
          (isAp
            ? `合并应付确认（${invoiceLinks.length} 张发票）`
            : `合并应收确认（${invoiceLinks.length} 张发票）`),
        created_by: userId,
        status: 'posted',
        is_posted: 1,
        posting_method: 'automatic',
      },
      finalLines,
      connection || undefined,
      { allowFxRoundingAdjustment: true }
    );

    const invoiceType = isAp ? 'ap_invoice' : 'ar_invoice';
    let entryNumber = null;
    const q = connection || db.pool;
    try {
      const [rows] = await q.execute('SELECT entry_number FROM gl_entries WHERE id = ? LIMIT 1', [
        entryId,
      ]);
      entryNumber = rows[0]?.entry_number || null;
    } catch {
      /* ignore */
    }

    for (const link of invoiceLinks) {
      if (!link?.invoiceId) continue;
      await DocumentLinkService.tryAutoLink(
        invoiceType,
        link.invoiceId,
        link.invoiceNumber || String(link.invoiceId),
        DocType.FINANCE_VOUCHER,
        entryId,
        entryNumber,
        userId,
        connection || null
      );
    }

    return { entryId, entryNumber, documentNumber, debit, credit };
  }

  static async runSeparateGenerate(generateOne, businessType, ids, userId, rawOverrides) {
    const overridesMap = normalizeOverridesMap(rawOverrides);
    const results = [];
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const id of ids) {
      try {
        const { item } = await generateOne.call(this, id, userId, overridesMap.get(id) || null, {});
        results.push(item);
        if (item.skipped) skippedCount += 1;
        else successCount += 1;
      } catch (itemError) {
        failedCount += 1;
        results.push({
          id,
          success: false,
          skipped: false,
          message: itemError.message || '生成失败',
        });
        logger.warn('[ManualVoucher] 批量单条失败', {
          businessType,
          id,
          error: itemError.message,
        });
      }
    }

    return {
      businessType,
      total: ids.length,
      successCount,
      skippedCount,
      failedCount,
      merge: false,
      results,
    };
  }

  /** 根据真实发票关联补齐既有凭证身份；同一张合并凭证可被多张发票复用。 */
  static async attachRecognitionEntries(results, businessType, connection = db.pool) {
    const pending = results.filter((item) => item.invoiceId && !item.entryId);
    if (!pending.length) return;
    const invoiceIds = [...new Set(pending.map((item) => item.invoiceId))];
    const placeholders = invoiceIds.map(() => '?').join(',');
    const invoiceType =
      businessType === BUSINESS_TYPES.PURCHASE_RECEIPT ? DocType.AP_INVOICE : DocType.AR_INVOICE;
    const [links] = await connection.execute(
      `SELECT d.source_id AS invoice_id, e.id AS entry_id, e.entry_number
       FROM document_links d JOIN gl_entries e ON e.id = d.target_id
       WHERE d.source_type = ? AND d.target_type = ? AND d.source_id IN (${placeholders})
         AND COALESCE(e.is_reversed, 0) = 0
       UNION ALL
       SELECT d.target_id AS invoice_id, e.id AS entry_id, e.entry_number
       FROM document_links d JOIN gl_entries e ON e.id = d.source_id
       WHERE d.target_type = ? AND d.source_type = ? AND d.target_id IN (${placeholders})
         AND COALESCE(e.is_reversed, 0) = 0
       ORDER BY entry_id DESC`,
      [
        invoiceType,
        DocType.FINANCE_VOUCHER,
        ...invoiceIds,
        invoiceType,
        DocType.FINANCE_VOUCHER,
        ...invoiceIds,
      ]
    );
    const byInvoice = new Map();
    for (const link of links) {
      if (!byInvoice.has(String(link.invoice_id))) byInvoice.set(String(link.invoice_id), link);
    }
    for (const item of pending) {
      const link = byInvoice.get(String(item.invoiceId));
      if (link) {
        item.entryId = link.entry_id;
        item.entryNumber = link.entry_number;
      }
    }
  }

  /** 合并生成：各单开票、独立成本与一张确认凭证在同一事务内完成，失败整批回滚。 */
  static async runMergedGenerate(generateOne, businessType, ids, userId, rawOverrides) {
    const { perDocOverrides, mergedMeta } = resolveMergedPayload(rawOverrides, ids);

    // 无预览覆盖时先预览拿分录，避免事务内再查一长串
    let entryLines = mergedMeta?.entryLines || [];
    let entryDate = mergedMeta?.entryDate || null;
    let description = mergedMeta?.description || null;
    let expectedTotal = mergedMeta?.totalAmount ?? null;
    let expectedSubtotal = mergedMeta?.subtotal;
    let expectedTax = mergedMeta?.taxAmount;
    let partyId = mergedMeta?.partyId || null;

    if (!entryLines.length) {
      const preview = await this.batchPreview(businessType, ids, { merge: true });
      const draft = (preview.vouchers || []).find((v) => !v.skipped && !v.error);
      if (!draft) {
        throw businessError('没有可合并生成的业务单据');
      }
      entryLines = draft.entryLines || [];
      entryDate = entryDate || draft.entryDate;
      description = description || draft.description;
      expectedTotal = expectedTotal ?? draft.totalAmount;
      expectedSubtotal = expectedSubtotal ?? draft.subtotal;
      expectedTax = expectedTax ?? draft.taxAmount;
      partyId = partyId || draft.partyId || null;
    }

    if (!entryLines.length) {
      throw businessError('合并凭证明细为空，无法生成');
    }

    // 生成前按业务金额强制对齐分录（避免预览手改导致 400）
    if (expectedTotal != null) {
      entryLines = syncEntryLinesToAmounts(businessType, entryLines, {
        subtotal: expectedSubtotal,
        taxAmount: expectedTax,
        totalAmount: expectedTotal,
      });
      assertEntryLinesMatchTotals(entryLines, expectedTotal, '合并凭证');
    } else {
      const debit = sumBy(entryLines, 'debit_amount');
      const credit = sumBy(entryLines, 'credit_amount');
      if (Math.abs(debit - credit) > 0.01 || debit <= 0) {
        throw businessError(`合并凭证借贷不平：借 ${debit} / 贷 ${credit}`);
      }
    }

    const connection = await db.pool.getConnection();
    const results = [];
    const invoiceLinks = [];
    const costEntries = new Map();
    let successCount = 0;
    let skippedCount = 0;
    const failedCount = 0;
    let mergedEntry;

    try {
      await connection.beginTransaction();

      for (const id of ids) {
        const { item, result } = await generateOne.call(
          this,
          id,
          userId,
          perDocOverrides.get(id) || null,
          {
            skipGlEntry: true,
            // 各出库成本保留独立来源身份，并与本批应收在同一事务完成。
            skipCostEntry: false,
            connection,
          }
        );
        results.push(item);
        const cost = result?.sideEffects?.cost;
        if (cost?.entryId) {
          costEntries.set(Number(cost.entryId), {
            sourceId: id,
            entryId: cost.entryId,
            entryNumber: cost.entryNumber,
            existing: cost.skipped === true,
          });
        }
        if (item.skipped) {
          skippedCount += 1;
        } else {
          successCount += 1;
          if (result?.invoiceId) {
            invoiceLinks.push({
              sourceId: id,
              invoiceId: result.invoiceId,
              invoiceNumber: result.invoiceNumber || item.invoiceNumber,
              amount: result.amount || item.amount,
              currencyCode: result.currencyCode,
              exchangeRate: result.exchangeRate,
              voucherSource: result.voucherSource || null,
            });
          }
        }
      }

      if (invoiceLinks.length < 1) {
        await this.attachRecognitionEntries(results, businessType, connection);
        // 全部 skipped：无新发票，不写合并凭证，提交空操作
        await connection.commit();
        return {
          businessType,
          total: ids.length,
          successCount,
          skippedCount,
          failedCount,
          merge: true,
          mergedEntry: null,
          recognitionVoucherCount: 0,
          costVoucherCount: [...costEntries.values()].filter((entry) => !entry.existing).length,
          voucherCount: [...costEntries.values()].filter((entry) => !entry.existing).length,
          costEntries: [...costEntries.values()],
          invoiceCount: 0,
          results,
        };
      }

      mergedEntry = await this.createMergedGlEntry({
        businessType,
        entryDate,
        description,
        entryLines,
        invoiceLinks,
        sourceIds: ids,
        userId,
        connection,
        partyId,
      });

      for (const item of results) {
        if (item.success && !item.skipped) {
          item.entryId = mergedEntry.entryId;
          item.entryNumber = mergedEntry.entryNumber;
          item.message = `生成成功（合并凭证 ${mergedEntry.entryNumber || mergedEntry.entryId}）`;
        }
      }
      await this.attachRecognitionEntries(results, businessType, connection);

      await connection.commit();
    } catch (e) {
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
      logger.error('[ManualVoucher] 合并生成失败已回滚', e);
      // 整批失败：不留下部分发票
      throw businessError(
        e.message || '合并生成失败',
        e.code || 'MERGE_GENERATE_FAILED',
        e.statusCode || 400
      );
    } finally {
      connection.release();
    }

    return {
      businessType,
      total: ids.length,
      successCount,
      skippedCount,
      failedCount,
      merge: true,
      mergedEntry,
      recognitionVoucherCount: mergedEntry ? 1 : 0,
      costVoucherCount: [...costEntries.values()].filter((entry) => !entry.existing).length,
      voucherCount:
        (mergedEntry ? 1 : 0) + [...costEntries.values()].filter((entry) => !entry.existing).length,
      costEntries: [...costEntries.values()],
      invoiceCount: invoiceLinks.length,
      results,
    };
  }

  /**
   * 批量生成
   * 默认 merge=true（主路径）：各开发票 + 1 张合并总账
   * merge=false 或非主路径：一单一证
   */
  static async batchGenerate(
    businessType,
    rawIds,
    userId = null,
    rawOverrides = null,
    options = {}
  ) {
    const generateOne = this.resolveGenerator(businessType);
    if (!generateOne) {
      throw businessError(
        `业务类型无效，专业主路径：${PRIMARY_BUSINESS_TYPES.join(' / ')}；例外：sales_order / purchase_order`
      );
    }

    const ids = normalizeIds(rawIds);
    if (ids.length === 0) throw businessError('请至少选择一张业务单据');
    if (ids.length > BATCH_MAX_IDS) {
      throw businessError(`单次最多选择 ${BATCH_MAX_IDS} 张单据`);
    }

    const merge =
      this.isPrimaryType(businessType) && parseMergeFlag(options, true) && ids.length > 1;

    if (!merge) {
      return this.runSeparateGenerate(generateOne, businessType, ids, userId, rawOverrides);
    }
    return this.runMergedGenerate(generateOne, businessType, ids, userId, rawOverrides);
  }
}

module.exports = ManualVoucherService;
