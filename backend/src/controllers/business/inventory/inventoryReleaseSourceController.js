'use strict';
const db = require('../../../config/db');
const ScopeGuard = require('../../../authorization/ScopeGuard');
const BusinessError = require('../../../utils/BusinessError');
const { ResponseHandler } = require('../../../utils/responseHandler');

// Warehouse users need release identity/capacity, not access to full quality records.
async function getTaskReleaseSources(req, res) {
  let connection;
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isSafeInteger(taskId) || taskId <= 0) throw new BusinessError('生产任务ID无效');
    connection = await db.pool.getConnection();
    if (
      !(await ScopeGuard.denyUnlessAccess(
        res,
        connection,
        req,
        'production_task',
        taskId,
        '无权访问该生产任务'
      ))
    )
      return;
    const [rows] = await connection.query(
      `SELECT qi.id, qi.inspection_no, qi.batch_no, qi.status, qi.product_id,
              qi.qualified_quantity,
              COALESCE(qi.qualified_quantity, 0) +
                (SELECT COALESCE(SUM(LEAST(ncp.quantity, COALESCE(ncp.handled_quantity, 0))), 0)
                   FROM nonconforming_products ncp WHERE ncp.inspection_id = qi.id
                    AND ncp.deleted_at IS NULL AND ncp.disposition = 'use_as_is'
                    AND ncp.concession_status = 'approved' AND ncp.status IN ('processing', 'completed', 'closed')) -
                (SELECT COALESCE(SUM(ii.quantity), 0) FROM inventory_inbound ib
                   JOIN inventory_inbound_items ii ON ii.inbound_id = ib.id
                  WHERE (ib.inspection_id = qi.id OR ib.inspection_no = qi.inspection_no COLLATE utf8mb4_unicode_ci)
                    AND COALESCE(ib.is_deleted, 0) = 0 AND ib.deleted_at IS NULL
                    AND ib.status NOT IN ('cancelled', 'reversed')) AS available_quantity
         FROM quality_inspections qi
        WHERE COALESCE(qi.task_id, qi.reference_id) = ? AND qi.inspection_type = 'final'
          AND qi.deleted_at IS NULL AND qi.status IN ('passed', 'partial', 'completed', 'failed')
        ORDER BY qi.id DESC`,
      [taskId]
    );
    const sources = rows
      .filter((row) => Number(row.available_quantity) > 0)
      .map((row) => ({
        id: row.id,
        inspectionNo: row.inspection_no,
        batchNo: row.batch_no,
        status: row.status,
        referenceId: taskId,
        productId: row.product_id,
        qualifiedQuantity: Number(row.qualified_quantity),
        availableQuantity: Number(row.available_quantity),
      }));
    return ResponseHandler.success(res, sources, '获取终检可用放行依据成功');
  } catch (error) {
    return BusinessError.handleError(res, error, '获取终检放行依据失败', ResponseHandler);
  } finally {
    if (connection) connection.release();
  }
}
module.exports = { getTaskReleaseSources };
