/**
 * 应收/应付发票字段契约（SSOT）
 *
 * 边界约定（禁止在业务层双写/双读）：
 * - 数据库列、模型内部、SQL：一律 snake_case
 * - HTTP API 请求/响应：一律 camelCase
 * - 转换只发生在 Controller 入参 / Model 出参 两处
 *
 * 金额语义：
 * - totalAmount = 价税合计（库列 total_amount）
 * - amountExcludingTax = 未税（库列 amount_excluding_tax）
 * - taxAmount = 税额（库列 tax_amount）
 * - balanceAmount = 未结余额（库列 balance_amount）
 * - 禁止再用模糊的 amount / balance 作为对外契约主键
 */

const { resolveUnitPrice } = require('../unitPriceFields');
const { toNumber, roundMoney } = require('../money');

/** API(camel) → DB(snake) 主表字段 */
const INVOICE_HEADER_API_TO_DB = Object.freeze({
  id: 'id',
  invoiceNumber: 'invoice_number',
  supplierInvoiceNumber: 'supplier_invoice_number',
  customerInvoiceNumber: 'customer_invoice_number',
  supplierId: 'supplier_id',
  customerId: 'customer_id',
  invoiceDate: 'invoice_date',
  dueDate: 'due_date',
  totalAmount: 'total_amount',
  amountExcludingTax: 'amount_excluding_tax',
  taxAmount: 'tax_amount',
  taxRate: 'tax_rate',
  paidAmount: 'paid_amount',
  balanceAmount: 'balance_amount',
  currencyCode: 'currency_code',
  exchangeRate: 'exchange_rate',
  status: 'status',
  terms: 'terms',
  notes: 'notes',
  sourceType: 'source_type',
  sourceId: 'source_id',
  createdBy: 'created_by',
  updatedBy: 'updated_by',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  // 流程标志（非表列，仅内存）
  skipGlEntry: 'skip_gl_entry',
});

const INVOICE_HEADER_DB_TO_API = Object.freeze(
  Object.fromEntries(Object.entries(INVOICE_HEADER_API_TO_DB).map(([a, b]) => [b, a]))
);

/**
 * 从请求体取规范 API 值（只认 camelCase；缺字段返回 undefined）
 */
function pickApi(body, camelKey) {
  if (!body || typeof body !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(body, camelKey)) return body[camelKey];
  return undefined;
}

/**
 * HTTP 入参 → 模型/DB 行（snake_case）
 * @param {object} body
 * @param {'ap'|'ar'} kind
 */
function fromInvoiceApi(body = {}, kind = 'ap') {
  const totalRaw = pickApi(body, 'totalAmount');
  const taxRateRaw = pickApi(body, 'taxRate');
  const taxAmountRaw = pickApi(body, 'taxAmount');
  const exclRaw = pickApi(body, 'amountExcludingTax');

  const row = {
    id: pickApi(body, 'id'),
    invoice_number: pickApi(body, 'invoiceNumber'),
    invoice_date: pickApi(body, 'invoiceDate'),
    due_date: pickApi(body, 'dueDate'),
    total_amount: totalRaw !== undefined ? toNumber(totalRaw, 0) : undefined,
    amount_excluding_tax: exclRaw !== undefined ? toNumber(exclRaw, 0) : undefined,
    tax_amount: taxAmountRaw !== undefined && taxAmountRaw !== null && taxAmountRaw !== ''
      ? toNumber(taxAmountRaw, 0)
      : taxAmountRaw === null
        ? null
        : undefined,
    tax_rate: taxRateRaw !== undefined ? taxRateRaw : undefined,
    currency_code: pickApi(body, 'currencyCode'),
    exchange_rate: pickApi(body, 'exchangeRate'),
    status: pickApi(body, 'status'),
    terms: pickApi(body, 'terms'),
    notes: pickApi(body, 'notes'),
    source_type: pickApi(body, 'sourceType'),
    source_id: pickApi(body, 'sourceId'),
    created_by: pickApi(body, 'createdBy'),
    updated_by: pickApi(body, 'updatedBy'),
    skip_gl_entry: pickApi(body, 'skipGlEntry') === true,
  };

  if (kind === 'ap') {
    row.supplier_id = pickApi(body, 'supplierId');
    row.supplier_invoice_number = pickApi(body, 'supplierInvoiceNumber');
  } else {
    row.customer_id = pickApi(body, 'customerId');
    row.customer_invoice_number = pickApi(body, 'customerInvoiceNumber');
  }

  if (Array.isArray(body.items)) {
    row.items = body.items.map((it) => fromInvoiceItemApi(it, kind));
  }

  // 去掉 undefined，避免覆盖更新时误写
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

/**
 * 明细：API → DB
 * AP 物料键 materialId；AR 产品键 productId（表结构历史差异，契约层显式映射，不在业务里 if 兼容）
 */
function fromInvoiceItemApi(item = {}, kind = 'ap') {
  const unitPrice = resolveUnitPrice(item);
  const quantity = toNumber(item.quantity, 0);
  const amount =
    item.amount != null && item.amount !== ''
      ? roundMoney(item.amount)
      : roundMoney(quantity * unitPrice);

  const base = {
    id: item.id,
    description: item.description ?? item.materialName ?? item.productName ?? null,
    quantity,
    unit_price: unitPrice,
    amount,
  };

  if (kind === 'ap') {
    base.material_id = item.materialId ?? item.material_id ?? null;
  } else {
    base.product_id = item.productId ?? item.product_id ?? item.materialId ?? null;
  }
  return base;
}

/**
 * DB 行 → API（camelCase）
 * @param {object} row 含 snake 列；可含 supplier_name / customer_name / items
 * @param {'ap'|'ar'} kind
 */
function toInvoiceApi(row, kind = 'ap') {
  if (!row) return null;

  const api = {
    id: row.id,
    invoiceNumber: row.invoice_number ?? row.invoiceNumber ?? null,
    invoiceDate: formatDate(row.invoice_date ?? row.invoiceDate),
    dueDate: formatDate(row.due_date ?? row.dueDate),
    totalAmount: toNumber(row.total_amount ?? row.totalAmount, 0),
    amountExcludingTax:
      row.amount_excluding_tax != null || row.amountExcludingTax != null
        ? toNumber(row.amount_excluding_tax ?? row.amountExcludingTax, 0)
        : null,
    taxAmount:
      row.tax_amount != null || row.taxAmount != null
        ? toNumber(row.tax_amount ?? row.taxAmount, 0)
        : null,
    taxRate:
      row.tax_rate != null || row.taxRate != null
        ? toNumber(row.tax_rate ?? row.taxRate, 0)
        : null,
    paidAmount: toNumber(row.paid_amount ?? row.paidAmount, 0),
    balanceAmount: toNumber(
      row.balance_amount ?? row.balanceAmount ?? row.balance,
      0
    ),
    currencyCode: row.currency_code ?? row.currencyCode ?? null,
    exchangeRate:
      row.exchange_rate != null || row.exchangeRate != null
        ? toNumber(row.exchange_rate ?? row.exchangeRate, 1)
        : null,
    status: row.status ?? null,
    terms: row.terms ?? null,
    notes: row.notes ?? null,
    sourceType: row.source_type ?? row.sourceType ?? null,
    sourceId: row.source_id ?? row.sourceId ?? null,
    createdBy: row.created_by ?? row.createdBy ?? null,
    updatedBy: row.updated_by ?? row.updatedBy ?? null,
    createdAt: formatDate(row.created_at ?? row.createdAt),
    updatedAt: formatDate(row.updated_at ?? row.updatedAt),
  };

  if (kind === 'ap') {
    api.supplierId = row.supplier_id ?? row.supplierId ?? null;
    api.supplierName = row.supplier_name ?? row.supplierName ?? null;
    api.supplierInvoiceNumber =
      row.supplier_invoice_number ?? row.supplierInvoiceNumber ?? null;
  } else {
    api.customerId = row.customer_id ?? row.customerId ?? null;
    api.customerName = row.customer_name ?? row.customerName ?? null;
    api.customerInvoiceNumber =
      row.customer_invoice_number ?? row.customerInvoiceNumber ?? null;
  }

  if (Array.isArray(row.items)) {
    api.items = row.items.map((it) => toInvoiceItemApi(it, kind));
  }

  return api;
}

function toInvoiceItemApi(item = {}, kind = 'ap') {
  const unitPrice = resolveUnitPrice(item);
  const quantity = toNumber(item.quantity, 0);
  const amount =
    item.amount != null ? roundMoney(item.amount) : roundMoney(quantity * unitPrice);

  const api = {
    id: item.id ?? null,
    description: item.description ?? null,
    quantity,
    unitPrice,
    amount,
  };

  if (kind === 'ap') {
    api.materialId = item.material_id ?? item.materialId ?? null;
    api.materialCode = item.material_code ?? item.materialCode ?? null;
    api.materialName = item.material_name ?? item.materialName ?? null;
    api.specification = item.specification ?? item.specs ?? null;
  } else {
    api.productId = item.product_id ?? item.productId ?? null;
    api.productCode = item.product_code ?? item.productCode ?? item.material_code ?? null;
    api.productName = item.product_name ?? item.productName ?? item.material_name ?? null;
    api.specification = item.specification ?? item.specs ?? null;
  }
  return api;
}

function formatDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * 列表过滤：HTTP query(camel) → 模型 filters(snake)
 */
function fromInvoiceListQuery(query = {}, kind = 'ap') {
  const filters = {};
  const invoiceNumber = query.invoiceNumber ?? query.invoice_number;
  if (invoiceNumber) filters.invoice_number = invoiceNumber;
  if (query.status) filters.status = query.status;
  if (query.startDate) filters.start_date = query.startDate;
  if (query.endDate) filters.end_date = query.endDate;

  if (kind === 'ap') {
    if (query.supplierId) filters.supplier_id = query.supplierId;
    if (query.supplierName) filters.supplier_name = query.supplierName;
    if (query.supplierInvoiceNumber) {
      filters.supplier_invoice_number = query.supplierInvoiceNumber;
    }
  } else {
    if (query.customerId) filters.customer_id = query.customerId;
    if (query.customerName) filters.customer_name = query.customerName;
    if (query.customerInvoiceNumber) {
      filters.customer_invoice_number = query.customerInvoiceNumber;
    }
  }
  return filters;
}

module.exports = {
  INVOICE_HEADER_API_TO_DB,
  INVOICE_HEADER_DB_TO_API,
  fromInvoiceApi,
  toInvoiceApi,
  fromInvoiceItemApi,
  toInvoiceItemApi,
  fromInvoiceListQuery,
  formatDate,
};
