/**
 * 来料/收货数量 SSOT
 * PurchaseOrderStatusService 与 DataConsistencyRules 共用，避免口径分叉。
 */

/** 终态按合格数计入；不合格数释放补货额度。 */
const INCOMING_INSPECTION_COUNTED_STATUSES = Object.freeze(['passed', 'failed', 'partial', 'completed']);

/** 待检验到货先占用订单数量，防止另一批到货超收。 */
const INCOMING_INSPECTION_PENDING_STATUSES = Object.freeze(['pending', 'in_progress', 'conditional']);

/** 计入「已收货」的采购收货单状态 */
const PURCHASE_RECEIPT_COUNTED_STATUSES = Object.freeze(['confirmed', 'completed']);

function sqlStringList(values) {
  return values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(', ');
}

module.exports = {
  INCOMING_INSPECTION_COUNTED_STATUSES,
  INCOMING_INSPECTION_PENDING_STATUSES,
  PURCHASE_RECEIPT_COUNTED_STATUSES,
  sqlStringList,
};
