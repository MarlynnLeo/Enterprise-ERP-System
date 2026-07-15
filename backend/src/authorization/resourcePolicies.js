/**
 * 业务资源授权策略注册表（SSOT）
 *
 * 每个资源声明：
 * - table / ownerColumn：行级 DataScope 依据（owner 必须是 users.id）
 * - locationColumn：可选库位维度（CUSTOM 范围）
 * - deletedAtColumn：软删字段；false 表示无软删
 * - softDeleteColumn / softDeleteValue：兼容 is_deleted 风格
 *
 * 约定：
 * - operator / manager 等字符串仅作展示，不作为授权依据
 * - 创建时必须 stampOwner 写入 ownerColumn，禁止信任 body.created_by
 */

const RESOURCE_POLICIES = Object.freeze({
  sales_order: Object.freeze({
    key: 'sales_order',
    table: 'sales_orders',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  sales_outbound: Object.freeze({
    key: 'sales_outbound',
    table: 'sales_outbound',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  sales_return: Object.freeze({
    key: 'sales_return',
    table: 'sales_returns',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  sales_quotation: Object.freeze({
    key: 'sales_quotation',
    table: 'sales_quotations',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  sales_exchange: Object.freeze({
    key: 'sales_exchange',
    table: 'sales_exchanges',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  purchase_order: Object.freeze({
    key: 'purchase_order',
    table: 'purchase_orders',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  purchase_requisition: Object.freeze({
    key: 'purchase_requisition',
    table: 'purchase_requisitions',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  purchase_receipt: Object.freeze({
    key: 'purchase_receipt',
    table: 'purchase_receipts',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  purchase_return: Object.freeze({
    key: 'purchase_return',
    table: 'purchase_returns',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  inventory_outbound: Object.freeze({
    key: 'inventory_outbound',
    table: 'inventory_outbound',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  inventory_inbound: Object.freeze({
    key: 'inventory_inbound',
    table: 'inventory_inbound',
    ownerColumn: 'created_by',
    locationColumn: 'location_id',
    deletedAtColumn: 'deleted_at',
    // 兼容 is_deleted
    extraSoftDelete: { column: 'is_deleted', value: 0 },
  }),
  inventory_check: Object.freeze({
    key: 'inventory_check',
    table: 'inventory_checks',
    ownerColumn: 'created_by',
    locationColumn: 'location_id',
    deletedAtColumn: 'deleted_at',
  }),
  inventory_transfer: Object.freeze({
    key: 'inventory_transfer',
    table: 'inventory_transfers',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  production_task: Object.freeze({
    key: 'production_task',
    table: 'production_tasks',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
  }),
  quality_inspection: Object.freeze({
    key: 'quality_inspection',
    table: 'quality_inspections',
    // 质检以 inspector_id 为业务 owner（创建时同步写入）
    ownerColumn: 'inspector_id',
    deletedAtColumn: 'deleted_at',
  }),

  // —— 财务域 ——
  // financeShared: 可与 FINANCE_DATA_SCOPE_POLICY 配合（all=共享财务中心；role/owner=按角色 DataScope）
  // 多数财务表无 soft-delete，deletedAtColumn=false
  ar_invoice: Object.freeze({
    key: 'ar_invoice',
    table: 'ar_invoices',
    ownerColumn: 'created_by',
    deletedAtColumn: false,
    financeShared: true,
  }),
  ap_invoice: Object.freeze({
    key: 'ap_invoice',
    table: 'ap_invoices',
    ownerColumn: 'created_by',
    deletedAtColumn: false,
    financeShared: true,
  }),
  ar_receipt: Object.freeze({
    key: 'ar_receipt',
    table: 'ar_receipts',
    ownerColumn: 'created_by',
    deletedAtColumn: false,
    financeShared: true,
  }),
  ap_payment: Object.freeze({
    key: 'ap_payment',
    table: 'ap_payments',
    ownerColumn: 'created_by',
    deletedAtColumn: false,
    financeShared: true,
  }),
  gl_entry: Object.freeze({
    key: 'gl_entry',
    table: 'gl_entries',
    ownerColumn: 'created_by',
    deletedAtColumn: false,
    financeShared: true,
  }),
  expense: Object.freeze({
    key: 'expense',
    table: 'expenses',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    financeShared: true,
  }),
  bank_transaction: Object.freeze({
    key: 'bank_transaction',
    table: 'bank_transactions',
    ownerColumn: 'created_by',
    deletedAtColumn: false,
    financeShared: true,
  }),
  cash_transaction: Object.freeze({
    key: 'cash_transaction',
    table: 'cash_transactions',
    ownerColumn: 'created_by',
    deletedAtColumn: false,
    financeShared: true,
  }),
});

/**
 * @param {string} key
 * @returns {object}
 */
function getResourcePolicy(key) {
  const policy = RESOURCE_POLICIES[key];
  if (!policy) {
    const error = new Error(`Unknown resource policy: ${key}`);
    error.code = 'UNKNOWN_RESOURCE_POLICY';
    throw error;
  }
  return policy;
}

function listResourcePolicyKeys() {
  return Object.keys(RESOURCE_POLICIES);
}

module.exports = {
  RESOURCE_POLICIES,
  getResourcePolicy,
  listResourcePolicyKeys,
};
