/**
 * PendingPurchaseCoverageService
 * 统一「在途请购覆盖量」计算，供低库存预警 / 出库缺料自动请购去重共用。
 *
 * 覆盖来源：
 * 1) 请购单明细（draft / submitted / approved / completed，排除 cancelled/rejected）
 * 2) 缺料记录已挂 requisition_id 且仍 pending/processing 的数量（防双计：若已挂请购只算请购）
 */

const { logger } = require('../../utils/logger');

/** 算作在途覆盖的请购状态 */
const COVERING_PR_STATUSES = ['draft', 'pending', 'submitted', 'approved', 'completed'];

/**
 * 兼容 mysql2 connection.execute 与 knex.raw
 */
async function runQuery(connection, sql, params = []) {
  if (!connection) throw new Error('connection required');
  if (typeof connection.execute === 'function') {
    return connection.execute(sql, params);
  }
  if (typeof connection.raw === 'function') {
    const result = await connection.raw(sql, params);
    // knex mysql: [rows, fields]
    return Array.isArray(result) ? result : [result];
  }
  if (typeof connection.query === 'function') {
    return connection.query(sql, params);
  }
  throw new Error('unsupported connection type');
}

/**
 * @param {import('mysql2/promise').PoolConnection|import('mysql2/promise').Pool|import('knex').Knex} connection
 * @param {number[]} materialIds
 * @returns {Promise<Map<number, number>>} materialId → pendingQty
 */
async function getPendingRequisitionQtyByMaterial(connection, materialIds = []) {
  const map = new Map();
  const ids = [...new Set((materialIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return map;

  const placeholders = ids.map(() => '?').join(',');
  const statusPlaceholders = COVERING_PR_STATUSES.map(() => '?').join(',');

  try {
    const [rows] = await runQuery(
      connection,
      `SELECT pri.material_id, SUM(pri.quantity) AS pending_quantity
       FROM purchase_requisition_items pri
       INNER JOIN purchase_requisitions pr ON pr.id = pri.requisition_id
       WHERE pr.deleted_at IS NULL
         AND pr.status IN (${statusPlaceholders})
         AND pri.material_id IN (${placeholders})
       GROUP BY pri.material_id`,
      [...COVERING_PR_STATUSES, ...ids]
    );
    for (const row of rows || []) {
      map.set(Number(row.material_id), parseFloat(row.pending_quantity) || 0);
    }
  } catch (e) {
    logger.warn('[PendingPurchaseCoverage] 汇总请购覆盖失败:', e.message);
  }

  return map;
}

/**
 * 对缺口列表做精确覆盖扣减
 * @param {Array<{material_id:number, shortage_quantity:number}>} items
 * @param {Map<number, number>} pendingMap
 * @returns {{ covered: Array, uncovered: Array }}
 */
function splitByCoverage(items, pendingMap) {
  const covered = [];
  const uncovered = [];
  for (const item of items || []) {
    const mid = Number(item.material_id);
    const shortage = Number(item.shortage_quantity) || 0;
    const pending = pendingMap.get(mid) || 0;
    if (pending >= shortage) {
      covered.push({ ...item, pending_quantity: pending, adjusted_shortage: 0 });
    } else {
      const adjusted = Math.max(0, shortage - pending);
      uncovered.push({
        ...item,
        pending_quantity: pending,
        shortage_quantity: adjusted,
        original_shortage: shortage,
        adjusted_shortage: adjusted,
      });
    }
  }
  return { covered, uncovered };
}

module.exports = {
  COVERING_PR_STATUSES,
  getPendingRequisitionQtyByMaterial,
  splitByCoverage,
};
