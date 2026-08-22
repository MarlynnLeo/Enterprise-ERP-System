/**
 * 业务资源授权策略注册表（SSOT）
 *
 * 每个资源声明：
 * - table：对象存在性 / 行级范围校验目标表
 * - ownerColumn / departmentColumn / locationColumn：DataScope 行级过滤字段
 * - deletedAtColumn：软删字段；false 表示无软删
 * - sharedRead：列表/详情读路径共享（写仍按 DataScope）
 * - financeShared：财务共享中心（FINANCE_DATA_SCOPE_POLICY=all 时跳过行级）
 *
 * 约定：
 * - 创建时必须 stampOwner 写入 ownerColumn，禁止信任 body.created_by
 * - operator 等展示字段不参与授权
 */

const RESOURCE_POLICIES = Object.freeze({
  sales_order: Object.freeze({
    key: 'sales_order',
    table: 'sales_orders',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    // 销售订单是销售部门共享的业务台账。
    // created_by 只保留审计/追责用途，不能限制销售人员查看订单。
    sharedRead: true,
  }),
  sales_outbound: Object.freeze({
    key: 'sales_outbound',
    table: 'sales_outbound',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
  }),
  sales_return: Object.freeze({
    key: 'sales_return',
    table: 'sales_returns',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
  }),
  sales_quotation: Object.freeze({
    key: 'sales_quotation',
    table: 'sales_quotations',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
  }),
  sales_exchange: Object.freeze({
    key: 'sales_exchange',
    table: 'sales_exchanges',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
  }),
  purchase_order: Object.freeze({
    key: 'purchase_order',
    table: 'purchase_orders',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
  }),
  purchase_requisition: Object.freeze({
    key: 'purchase_requisition',
    table: 'purchase_requisitions',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
  }),
  purchase_receipt: Object.freeze({
    key: 'purchase_receipt',
    table: 'purchase_receipts',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
  }),
  purchase_return: Object.freeze({
    key: 'purchase_return',
    table: 'purchase_returns',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
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
    // A custom warehouse scope must include both ends of a transfer. Allowing
    // either end would expose or mutate inventory in an unauthorized location.
    locationColumns: ['from_location_id', 'to_location_id'],
    requireAllLocations: true,
    deletedAtColumn: 'deleted_at',
  }),
  production_plan: Object.freeze({
    key: 'production_plan',
    table: 'production_plans',
    ownerColumn: 'created_by',
    departmentColumn: 'department_id',
    deletedAtColumn: 'deleted_at',
  }),
  production_task: Object.freeze({
    key: 'production_task',
    table: 'production_tasks',
    ownerColumn: 'created_by',
    deletedAtColumn: 'deleted_at',
    sharedRead: true,
  }),
  ecn: Object.freeze({
    key: 'ecn',
    table: 'ecn_orders',
    ownerColumn: 'requested_by',
    departmentColumn: 'department_id',
    deletedAtColumn: 'deleted_at',
  }),
  contract: Object.freeze({
    key: 'contract',
    table: 'contracts',
    ownerColumn: 'created_by',
    departmentColumn: 'department_id',
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
  // financeShared 仅保留为历史元数据；财务资源与其它业务资源一样按功能权限共享。
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
