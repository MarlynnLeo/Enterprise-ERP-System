/**
 * 来料/收货数量 SSOT
 * PurchaseOrderStatusService 与 DataConsistencyRules 共用，避免口径分叉。
 */

/** 计入「已收货」的来料检验终态（不含 pending/draft） */
const INCOMING_INSPECTION_COUNTED_STATUSES = Object.freeze([
  'passed',
  'completed',
  'qualified',
  'accepted',
]);

/** 计入「已收货」的采购收货单状态 */
const PURCHASE_RECEIPT_COUNTED_STATUSES = Object.freeze(['confirmed', 'completed']);

function sqlStringList(values) {
  return values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');
}

module.exports = {
  INCOMING_INSPECTION_COUNTED_STATUSES,
  PURCHASE_RECEIPT_COUNTED_STATUSES,
  sqlStringList,
};
