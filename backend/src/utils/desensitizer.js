const { logger } = require('./logger');
const PermissionService = require('../services/PermissionService');
const { PermissionUtils } = require('./authUtils');

const SENSITIVE_FIELDS = [
  'price',
  'unit_price',
  'unitPrice',
  'cost_price',
  'costPrice',
  'purchase_price',
  'purchasePrice',
  'estimated_price',
  'estimatedPrice',
  'latest_price',
  'latestPrice',
  'latest_cost',
  'latestCost',
  'sale_price',
  'salePrice',
  'sales_price',
  'salesPrice',
  'selling_price',
  'sellingPrice',
  'standard_price',
  'standardPrice',
  'suggested_price',
  'suggestedPrice',
  'original_price',
  'originalPrice',
  'adjusted_price',
  'adjustedPrice',
  'effective_price',
  'effectivePrice',
  'current_price',
  'currentPrice',
  'order_price',
  'orderPrice',
  'material_price',
  'materialPrice',
  'average_price',
  'averagePrice',
  'average_cost',
  'averageCost',
  'amount',
  'total_spent',
  'totalSpent',
  'total_price',
  'totalPrice',
  'subtotal',
  'total_amount',
  'totalAmount',
  'tax_amount',
  'taxAmount',
  'total_tax_amount',
  'totalTaxAmount',
  'sales_output_tax',
  'salesOutputTax',
  'purchase_input_tax',
  'purchaseInputTax',
  'input_tax_deduction',
  'inputTaxDeduction',
  'tax_payable',
  'taxPayable',
  'income_tax_payable',
  'incomeTaxPayable',
  'taxable_income',
  'taxableIncome',
  'total_revenue',
  'totalRevenue',
  'total_expense',
  'totalExpense',
  'amount_excluding_tax',
  'amountExcludingTax',
  'paid_amount',
  'paidAmount',
  'balance_amount',
  'balanceAmount',
  'balance',
  'current_balance',
  'currentBalance',
  'opening_balance',
  'openingBalance',
  'beginning_balance',
  'beginningBalance',
  'ending_balance',
  'endingBalance',
  'current_amount',
  'currentAmount',
  'debit_amount',
  'debitAmount',
  'credit_amount',
  'creditAmount',
  'debit_total',
  'debitTotal',
  'credit_total',
  'creditTotal',
  'total_debit',
  'totalDebit',
  'total_credit',
  'totalCredit',
  'credit_limit',
  'creditLimit',
  'received_amount',
  'receivedAmount',
  'payment_amount',
  'paymentAmount',
  'return_amount',
  'returnAmount',
  'returns_amount',
  'returnsAmount',
  'new_amount',
  'newAmount',
  'difference_amount',
  'differenceAmount',
  'sales',
  'total_sales',
  'totalSales',
  'sales_amount',
  'salesAmount',
  'monthly_sales',
  'monthlySales',
  'avg_order_amount',
  'avgOrderAmount',
  'collected_amount',
  'collectedAmount',
  'pending_amount',
  'pendingAmount',
  'monthly_amount',
  'monthlyAmount',
  'daily_amount',
  'dailyAmount',
  'purchase_amount',
  'purchaseAmount',
  'total_cost',
  'totalCost',
  'unit_cost',
  'unitCost',
  'material_cost',
  'materialCost',
  'labor_cost',
  'laborCost',
  'overhead_cost',
  'overheadCost',
  'actual_cost',
  'actualCost',
  'standard_cost',
  'standardCost',
  'standard_total_cost',
  'standardTotalCost',
  'actual_total_cost',
  'actualTotalCost',
  'cost_pool',
  'costPool',
  'cost_impact',
  'costImpact',
  'total_variance',
  'totalVariance',
  'material_variance',
  'materialVariance',
  'labor_variance',
  'laborVariance',
  'overhead_variance',
  'overheadVariance',
  'gross_profit',
  'grossProfit',
  'net_profit',
  'netProfit',
  'profit',
  'profit_margin',
  'profitMargin',
  'gross_margin',
  'grossMargin',
  'field_value',
  'fieldValue',
  'budget_amount',
  'budgetAmount',
  'used_amount',
  'usedAmount',
  'remaining_amount',
  'remainingAmount',
  'actual_amount',
  'actualAmount',
  'planned_amount',
  'plannedAmount',
  'variance_amount',
  'varianceAmount',
  'estimated_fee',
  'estimatedFee',
  'total_value',
  'totalValue',
  'balance_value',
  'balanceValue',
  'inbound_value',
  'inboundValue',
  'outbound_value',
  'outboundValue',
  'opening_value',
  'openingValue',
  'closing_value',
  'closingValue',
  'beginning_value',
  'beginningValue',
  'ending_value',
  'endingValue',
  'acquisition_cost',
  'acquisitionCost',
  'original_value',
  'originalValue',
  'net_value',
  'netValue',
  'salvage_value',
  'salvageValue',
  'residual_value',
  'residualValue',
  'depreciation_amount',
  'depreciationAmount',
  'accumulated_depreciation',
  'accumulatedDepreciation',
  'impairment_amount',
  'impairmentAmount',
  'tax_rate',
  'taxRate',
  'tax_percent',
  'taxPercent',
];

const SENSITIVE_FIELD_SET = new Set(SENSITIVE_FIELDS);
const SENSITIVE_FIELD_DESCRIPTORS = new Set([
  'field',
  'fieldName',
  'field_name',
  'fieldKey',
  'field_key',
  'column',
  'columnName',
  'column_name',
  'key',
]);
const CONTEXTUAL_FIELD_VALUE_KEYS = new Set([
  'value',
  'old_value',
  'oldValue',
  'new_value',
  'newValue',
  'field_value',
  'fieldValue',
]);
const CONTEXTUAL_TOTAL_FIELDS = new Set(['total']);
const MONETARY_CONTEXT_FIELDS = new Set([
  'price',
  'unit_price',
  'unitPrice',
  'tax_rate',
  'taxRate',
  'tax_amount',
  'taxAmount',
  'material_id',
  'materialId',
  'product_id',
  'productId',
]);

function normalizeFieldName(fieldName) {
  if (fieldName === null || fieldName === undefined) return '';
  return String(fieldName).trim();
}

function toSnakeCase(fieldName) {
  return normalizeFieldName(fieldName)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s.-]+/g, '_')
    .toLowerCase();
}

function isSensitiveFieldName(fieldName) {
  const normalized = normalizeFieldName(fieldName);
  if (!normalized) return false;

  if (SENSITIVE_FIELD_SET.has(normalized)) return true;

  const snakeName = toSnakeCase(normalized);
  if (SENSITIVE_FIELD_SET.has(snakeName)) return true;

  return /(^|_)(price|cost|amount|balance|tax_rate|tax_amount|tax_percent|profit|margin|sales|revenue|expense|debit|credit)($|_)/.test(snakeName);
}

function hasSensitiveFieldDescriptor(data) {
  return Object.keys(data).some((key) =>
    SENSITIVE_FIELD_DESCRIPTORS.has(key) && isSensitiveFieldName(data[key])
  );
}

// 任一即可视为「能看金额类敏感字段」的总开关（兼容旧逻辑 / mutation 检查）
const PRICE_VIEW_PERMISSIONS = [
  'finance:price:view',
  'finance:pricing:view',
  'finance:cost:view',
  'purchase:price:view',
  'sales:price:view',
  'inventory:value:view',
  // 物料主文件专用（系统权限设置中的「查看价格/查看成本」按钮）
  'basedata:materials:view_price',
  'basedata:materials:view_cost',
];

/** 物料销售价/采购价：仅财务、采购、销售权限组可见 */
const BUSINESS_PRICE_VIEW_PERMISSIONS = [
  'finance:price:view',
  'finance:pricing:view',
  'finance:cost:view',
  'purchase:price:view',
  'sales:price:view',
  'basedata:materials:view_price',
  'basedata:materials:view_cost',
];

const SALES_PRICE_VIEW_PERMISSIONS = BUSINESS_PRICE_VIEW_PERMISSIONS;
const PURCHASE_COST_VIEW_PERMISSIONS = BUSINESS_PRICE_VIEW_PERMISSIONS;
const MASKED_PRICE_PLACEHOLDER = '***';

const PRICE_UPDATE_PERMISSIONS = [
  'finance:price:update',
  'finance:pricing:update',
  'finance:cost:update',
  'purchase:price:update',
  'sales:price:update',
  'inventory:value:update',
];

const PRICE_EXPORT_PERMISSIONS = [
  'finance:price:export',
  'finance:pricing:export',
  'finance:cost:export',
  'purchase:price:export',
  'sales:price:export',
  'inventory:value:export',
];

const PRICE_PERMISSION_GROUPS = {
  view: PRICE_VIEW_PERMISSIONS,
  update: PRICE_UPDATE_PERMISSIONS,
  export: PRICE_EXPORT_PERMISSIONS,
};

/** 明确归类为销售价的字段（物料.price 等） */
const SALES_PRICE_FIELDS = new Set([
  'price',
  'sale_price',
  'salePrice',
  'sales_price',
  'salesPrice',
  'selling_price',
  'sellingPrice',
  'standard_price',
  'standardPrice',
  'suggested_price',
  'suggestedPrice',
]);

/** 明确归类为采购价/成本的字段（物料.costPrice 等） */
const PURCHASE_COST_FIELDS = new Set([
  'cost_price',
  'costPrice',
  'purchase_price',
  'purchasePrice',
  'latest_cost',
  'latestCost',
  'average_cost',
  'averageCost',
  'unit_cost',
  'unitCost',
  'material_cost',
  'materialCost',
  'labor_cost',
  'laborCost',
  'overhead_cost',
  'overheadCost',
  'actual_cost',
  'actualCost',
  'standard_cost',
  'standardCost',
  'total_cost',
  'totalCost',
  'acquisition_cost',
  'acquisitionCost',
]);

/**
 * 字段敏感类别：sales | purchase | general | null
 * - sales：销售价
 * - purchase：采购价/成本
 * - general：金额/税额/余额等通用敏感字段
 */
function classifySensitiveField(fieldName) {
  const normalized = normalizeFieldName(fieldName);
  if (!normalized) return null;

  if (SALES_PRICE_FIELDS.has(normalized) || SALES_PRICE_FIELDS.has(toSnakeCase(normalized))) {
    return 'sales';
  }
  if (PURCHASE_COST_FIELDS.has(normalized) || PURCHASE_COST_FIELDS.has(toSnakeCase(normalized))) {
    return 'purchase';
  }

  const snake = toSnakeCase(normalized);
  if (/(^|_)(sale|selling)(_|$)/.test(snake) && /price/.test(snake)) {
    return 'sales';
  }
  if (
    /(^|_)(purchase_price|cost_price|unit_cost|material_cost|labor_cost|overhead_cost|actual_cost|standard_cost|latest_cost|average_cost|total_cost|acquisition_cost)($|_)/.test(
      snake
    ) ||
    /(^|_)cost($|_)/.test(snake)
  ) {
    return 'purchase';
  }

  if (isSensitiveFieldName(fieldName)) {
    return 'general';
  }
  return null;
}

/**
 * 解析用户价格查看能力（字段级）
 * @returns {{ all: boolean, sales: boolean, purchase: boolean, general: boolean }}
 */
function resolvePriceViewCapabilities(permissions) {
  if (!Array.isArray(permissions)) {
    return { all: false, sales: false, purchase: false, general: false };
  }
  if (permissions.includes('*')) {
    return { all: true, sales: true, purchase: true, general: true };
  }

  const sales = PermissionUtils.hasAnyPermission(permissions, SALES_PRICE_VIEW_PERMISSIONS);
  const purchase = PermissionUtils.hasAnyPermission(permissions, PURCHASE_COST_VIEW_PERMISSIONS);
  const general = PermissionUtils.hasAnyPermission(permissions, PRICE_VIEW_PERMISSIONS);

  return {
    all: sales && purchase && general,
    sales,
    purchase,
    general,
  };
}

function canViewFieldCategory(caps, category) {
  if (!caps) return false;
  if (caps.all) return true;
  if (category === 'sales') return Boolean(caps.sales);
  if (category === 'purchase') return Boolean(caps.purchase);
  if (category === 'general') return Boolean(caps.general);
  return true;
}

/**
 * 脱敏数据
 * @param {*} data
 * @param {boolean|{all?:boolean,sales?:boolean,purchase?:boolean,general?:boolean}} hasPermissionOrCaps
 *   - true：保留全部
 *   - false：剥离全部敏感字段
 *   - caps 对象：按销售价/采购价/通用金额字段级剥离
 */
function desensitizeData(data, hasPermissionOrCaps) {
  if (!data) return data;

  let caps;
  if (hasPermissionOrCaps === true) {
    return data;
  }
  if (hasPermissionOrCaps === false || hasPermissionOrCaps == null) {
    caps = { all: false, sales: false, purchase: false, general: false };
  } else if (typeof hasPermissionOrCaps === 'object') {
    caps = {
      all: Boolean(hasPermissionOrCaps.all),
      sales: Boolean(hasPermissionOrCaps.sales ?? hasPermissionOrCaps.all),
      purchase: Boolean(hasPermissionOrCaps.purchase ?? hasPermissionOrCaps.all),
      general: Boolean(hasPermissionOrCaps.general ?? hasPermissionOrCaps.all),
    };
    if (caps.all || (caps.sales && caps.purchase && caps.general)) {
      return data;
    }
  } else {
    caps = { all: false, sales: false, purchase: false, general: false };
  }

  if (Array.isArray(data)) {
    data.forEach((item) => desensitizeData(item, caps));
    return data;
  }

  if (typeof data !== 'object') return data;

  const objectKeys = Object.keys(data);
  const hasMonetaryContext = objectKeys.some((key) => MONETARY_CONTEXT_FIELDS.has(key));
  const hasSensitiveDescriptor = hasSensitiveFieldDescriptor(data);

  objectKeys.forEach((key) => {
    const category = classifySensitiveField(key);
    const isContextualTotal = CONTEXTUAL_TOTAL_FIELDS.has(key) && hasMonetaryContext;
    const isContextualValue = hasSensitiveDescriptor && CONTEXTUAL_FIELD_VALUE_KEYS.has(key);

    if (category || isContextualTotal || isContextualValue) {
      const effectiveCategory = category || 'general';
      if (!canViewFieldCategory(caps, effectiveCategory)) {
        data[key] = MASKED_PRICE_PLACEHOLDER;
        return;
      }
    }

    if (data[key] && typeof data[key] === 'object') {
      desensitizeData(data[key], caps);
    }
  });

  return data;
}

function getPricePermissions(action = 'view') {
  return PRICE_PERMISSION_GROUPS[action] || PRICE_VIEW_PERMISSIONS;
}

function hasPricePermissionFromPermissions(permissions, action = 'view') {
  if (!Array.isArray(permissions)) return false;
  return PermissionUtils.hasAnyPermission(permissions, getPricePermissions(action));
}

async function getUserPermissions(user, existingPermissions = null) {
  if (Array.isArray(existingPermissions)) return existingPermissions;
  if (!user || !user.id) return [];
  return PermissionService.getUserPermissions(user.id);
}

async function hasPricePermission(user, action = 'view', existingPermissions = null) {
  try {
    const permissions = await getUserPermissions(user, existingPermissions);
    return hasPricePermissionFromPermissions(permissions, action);
  } catch (error) {
    logger.error('[desensitizer] price permission check failed:', error.message);
    return false;
  }
}

async function resolveUserPriceViewCapabilities(user, existingPermissions = null) {
  try {
    const permissions = await getUserPermissions(user, existingPermissions);
    return resolvePriceViewCapabilities(permissions);
  } catch (error) {
    logger.error('[desensitizer] resolve price capabilities failed:', error.message);
    return { all: false, sales: false, purchase: false, general: false };
  }
}

async function desensitizeDataForUser(data, user, action = 'view', existingPermissions = null) {
  // update/export 仍用「任一权限」总开关（mutation 侧有独立检查）
  if (action !== 'view') {
    const allowed = await hasPricePermission(user, action, existingPermissions);
    return desensitizeData(data, allowed);
  }
  const caps = await resolveUserPriceViewCapabilities(user, existingPermissions);
  return desensitizeData(data, caps);
}

async function hasFinancePermission(user) {
  return hasPricePermission(user, 'view');
}

module.exports = {
  SENSITIVE_FIELDS,
  SALES_PRICE_FIELDS,
  PURCHASE_COST_FIELDS,
  PRICE_VIEW_PERMISSIONS,
  BUSINESS_PRICE_VIEW_PERMISSIONS,
  MASKED_PRICE_PLACEHOLDER,
  SALES_PRICE_VIEW_PERMISSIONS,
  PURCHASE_COST_VIEW_PERMISSIONS,
  PRICE_UPDATE_PERMISSIONS,
  PRICE_EXPORT_PERMISSIONS,
  isSensitiveFieldName,
  classifySensitiveField,
  resolvePriceViewCapabilities,
  desensitizeData,
  desensitizeDataForUser,
  getPricePermissions,
  hasPricePermission,
  hasPricePermissionFromPermissions,
  hasFinancePermission,
  resolveUserPriceViewCapabilities,
};
