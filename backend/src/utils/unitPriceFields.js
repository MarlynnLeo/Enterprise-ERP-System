/**
 * 业务单据「单价」字段统一约定
 *
 * 历史原因：采购侧库字段多为 `price`，销售订单/发票侧多为 `unit_price`，
 * 出库明细又是 `price`。SQL 里写错列名会直接 500（如 unit_price on purchase_order_items）。
 *
 * 规则：
 * 1. SQL 读写必须用本模块给出的「库列名」，禁止凭感觉混用。
 * 2. JS 入参兼容 price / unit_price / unitPrice。
 * 3. API 出参尽量同时带 price 与 unit_price（值相同），降低前端分支。
 */

const { toNumber } = require('./money');

/** 各业务表在数据库中的权威单价列 */
const UNIT_PRICE_DB_COLUMN = Object.freeze({
  // 采购
  purchase_order_items: 'price',
  purchase_receipt_items: 'price',
  purchase_return_items: 'price',
  // 销售
  sales_order_items: 'unit_price',
  sales_quotation_items: 'unit_price',
  sales_outbound_items: 'price',
  sales_return_items: null, // 常从订单回退，无独立单价列时用 resolve
  // 财务发票
  ap_invoice_items: 'unit_price',
  ar_invoice_items: 'unit_price',
  // 其它
  contract_items: 'unit_price',
  outsourced_processing_products: 'unit_price',
  outsourced_processing_receipt_items: 'unit_price',
  materials_sale: 'price',
  materials_cost: 'cost_price',
});

/**
 * 各业务表权威税率列（与单价类似，列名不统一）
 * - 销售订单明细：tax_percent
 * - 采购订单/入库明细、销售/采购表头：tax_rate
 */
const TAX_RATE_DB_COLUMN = Object.freeze({
  sales_orders: 'tax_rate',
  sales_order_items: 'tax_percent',
  sales_quotations: 'tax_rate',
  purchase_orders: 'tax_rate',
  purchase_order_items: 'tax_rate',
  purchase_receipts: null, // 仅有 total_tax_amount，无 tax_rate
  purchase_receipt_items: 'tax_rate',
  purchase_return_items: null,
});

const ALLOWED_SQL_ALIASES = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertTable(table) {
  if (!Object.prototype.hasOwnProperty.call(UNIT_PRICE_DB_COLUMN, table)) {
    throw new Error(`[unitPriceFields] 未登记的单价表: ${table}`);
  }
  return UNIT_PRICE_DB_COLUMN[table];
}

function assertAlias(alias) {
  if (alias && !ALLOWED_SQL_ALIASES.test(alias)) {
    throw new Error(`[unitPriceFields] 非法 SQL 别名: ${alias}`);
  }
  return alias;
}

/**
 * 取某业务表在 DB 中的单价列名
 * @param {keyof typeof UNIT_PRICE_DB_COLUMN} table
 * @returns {string|null}
 */
function getUnitPriceColumn(table) {
  return assertTable(table);
}

/**
 * 从任意业务对象解析单价（入参兼容）
 * 优先级：显式候选 → unit_price → unitPrice → price → cost_price → sale_price
 * @param {object|number|string|null|undefined} source
 * @param {object} [options]
 * @param {string[]} [options.prefer] 额外优先字段
 * @param {number} [options.fallback=0]
 * @returns {number}
 */
function resolveUnitPrice(source, options = {}) {
  const fallback = options.fallback !== undefined ? options.fallback : 0;
  if (source === null || source === undefined || source === '') {
    return fallback;
  }
  if (typeof source !== 'object') {
    return toNumber(source, fallback);
  }

  const prefer = Array.isArray(options.prefer) ? options.prefer : [];
  const keys = [
    ...prefer,
    'unit_price',
    'unitPrice',
    'price',
    'cost_price',
    'costPrice',
    'sale_price',
    'salePrice',
    'order_price',
    'orderPrice',
  ];

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      const n = toNumber(source[key], Number.NaN);
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

/**
 * SQL 表达式：读取某表别名上的单价列
 * @example sqlUnitPriceExpr('poi', 'purchase_order_items') => 'poi.price'
 */
function sqlUnitPriceExpr(tableAlias, table) {
  const col = getUnitPriceColumn(table);
  if (!col) {
    throw new Error(`[unitPriceFields] 表 ${table} 无固定单价列，请手写 COALESCE 回退`);
  }
  const alias = assertAlias(tableAlias);
  return alias ? `${alias}.${col}` : col;
}

/**
 * SQL：COALESCE 非零单价（常用于回退链）
 * @param {string} tableAlias
 * @param {keyof typeof UNIT_PRICE_DB_COLUMN} table
 * @param {string|number} [fallbackSql=0]
 */
function sqlNonZeroUnitPrice(tableAlias, table, fallbackSql = 0) {
  const expr = sqlUnitPriceExpr(tableAlias, table);
  return `COALESCE(NULLIF(${expr}, 0), ${fallbackSql})`;
}

/**
 * SQL 片段：在 SELECT 中同时输出权威列 + unit_price 别名（API 双写）
 * @example sqlSelectUnitPricePair('poi', 'purchase_order_items')
 *   => 'poi.price AS price, poi.price AS unit_price'
 */
function sqlSelectUnitPricePair(tableAlias, table, options = {}) {
  const expr = sqlUnitPriceExpr(tableAlias, table);
  const priceAs = options.priceAs || 'price';
  const unitPriceAs = options.unitPriceAs || 'unit_price';
  return `${expr} AS ${priceAs}, ${expr} AS ${unitPriceAs}`;
}

/**
 * 规范化明细行：保证 price 与 unit_price 同值（API 出参/入参中间层）
 * @param {object} item
 * @param {object} [options]
 * @returns {object}
 */
function normalizeItemUnitPrice(item, options = {}) {
  if (!item || typeof item !== 'object') return item;
  const price = resolveUnitPrice(item, options);
  return {
    ...item,
    price,
    unit_price: price,
    unitPrice: price,
  };
}

/**
 * 批量规范化
 * @param {Array<object>} items
 * @param {object} [options]
 */
function normalizeItemsUnitPrice(items, options = {}) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizeItemUnitPrice(item, options));
}

/**
 * 写入前：按目标表取出应落库的单价字段名与值
 * @param {keyof typeof UNIT_PRICE_DB_COLUMN} table
 * @param {object} item
 * @returns {{ column: string, value: number }}
 */
function toDbUnitPrice(table, item) {
  const column = getUnitPriceColumn(table);
  if (!column) {
    throw new Error(`[unitPriceFields] 表 ${table} 不支持 toDbUnitPrice`);
  }
  return {
    column,
    value: resolveUnitPrice(item),
  };
}

/**
 * 取某业务表在 DB 中的税率列名
 * @param {keyof typeof TAX_RATE_DB_COLUMN} table
 * @returns {string|null}
 */
function getTaxRateColumn(table) {
  if (!Object.prototype.hasOwnProperty.call(TAX_RATE_DB_COLUMN, table)) {
    throw new Error(`[unitPriceFields] 未登记的税率表: ${table}`);
  }
  return TAX_RATE_DB_COLUMN[table];
}

/**
 * SQL 表达式：读取税率列
 * @example sqlTaxRateExpr('soi', 'sales_order_items') => 'soi.tax_percent'
 */
function sqlTaxRateExpr(tableAlias, table) {
  const col = getTaxRateColumn(table);
  if (!col) {
    throw new Error(`[unitPriceFields] 表 ${table} 无固定税率列`);
  }
  const alias = assertAlias(tableAlias);
  return alias ? `${alias}.${col}` : col;
}

/**
 * 从对象解析税率（兼容 tax_rate / tax_percent / taxRate / taxPercent）
 */
function resolveTaxRate(source, fallback = 0) {
  if (source === null || source === undefined || source === '') return fallback;
  if (typeof source !== 'object') return toNumber(source, fallback);
  const raw =
    source.tax_rate ??
    source.taxRate ??
    source.tax_percent ??
    source.taxPercent;
  if (raw === null || raw === undefined || raw === '') return fallback;
  return toNumber(raw, fallback);
}

module.exports = {
  UNIT_PRICE_DB_COLUMN,
  TAX_RATE_DB_COLUMN,
  getUnitPriceColumn,
  getTaxRateColumn,
  resolveUnitPrice,
  resolveTaxRate,
  sqlUnitPriceExpr,
  sqlTaxRateExpr,
  sqlNonZeroUnitPrice,
  sqlSelectUnitPricePair,
  normalizeItemUnitPrice,
  normalizeItemsUnitPrice,
  toDbUnitPrice,
};
