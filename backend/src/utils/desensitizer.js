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

const PRICE_VIEW_PERMISSIONS = [
  'finance:price:view',
  'finance:pricing:view',
  'finance:cost:view',
  'purchase:price:view',
  'sales:price:view',
  'inventory:value:view',
];

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

function desensitizeData(data, hasPermission) {
  if (hasPermission || !data) return data;

  if (Array.isArray(data)) {
    data.forEach((item) => desensitizeData(item, hasPermission));
    return data;
  }

  if (typeof data !== 'object') return data;

  const objectKeys = Object.keys(data);
  const hasMonetaryContext = objectKeys.some((key) => MONETARY_CONTEXT_FIELDS.has(key));
  const hasSensitiveDescriptor = hasSensitiveFieldDescriptor(data);

  objectKeys.forEach((key) => {
    if (
      isSensitiveFieldName(key) ||
      (CONTEXTUAL_TOTAL_FIELDS.has(key) && hasMonetaryContext) ||
      (hasSensitiveDescriptor && CONTEXTUAL_FIELD_VALUE_KEYS.has(key))
    ) {
      data[key] = null;
      return;
    }

    if (data[key] && typeof data[key] === 'object') {
      desensitizeData(data[key], hasPermission);
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

async function desensitizeDataForUser(data, user, action = 'view', existingPermissions = null) {
  const allowed = await hasPricePermission(user, action, existingPermissions);
  return desensitizeData(data, allowed);
}

async function hasFinancePermission(user) {
  return hasPricePermission(user, 'view');
}

module.exports = {
  SENSITIVE_FIELDS,
  PRICE_VIEW_PERMISSIONS,
  PRICE_UPDATE_PERMISSIONS,
  PRICE_EXPORT_PERMISSIONS,
  isSensitiveFieldName,
  desensitizeData,
  desensitizeDataForUser,
  getPricePermissions,
  hasPricePermission,
  hasPricePermissionFromPermissions,
  hasFinancePermission,
};
