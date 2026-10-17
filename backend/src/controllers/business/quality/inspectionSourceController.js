const { pool } = require('../../../config/db');
const ScopeGuard = require('../../../authorization/ScopeGuard');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');
const { normalizeTaskBatchNo } = require('../../../services/business/TaskLifecycleService');

// Deliberately return only inspection source identity/quantity, never task costing or controls.
async function getProductionSources(req, res) {
  try {
    const type = req.query.inspectionType;
    if (!['final', 'process'].includes(type)) {
      return ResponseHandler.error(res, '检验类型必须为 final 或 process', 'VALIDATION_ERROR', 400);
    }
    const pagination = parsePagination(req.query.page, req.query.pageSize, {
      defaultPageSize: 50,
      maxPageSize: 100,
    });
    const scope = await ScopeGuard.applyListScope(req, 'production_task', {
      tableAlias: 'pt',
      accessMode: 'read',
      ownerAlias: 'quality_source_owner_scope',
    });
    const statuses = type === 'final' ? ['inspection', 'completed'] : ['in_progress'];
    const where = `pt.deleted_at IS NULL AND pt.status IN (?)${scope.where || ''}`;
    const args = [statuses, ...(scope.params || [])];
    const [counts] = await pool.query(
      `SELECT COUNT(*) AS total FROM production_tasks pt
      ${scope.join || ''} WHERE ${where}`,
      args
    );
    const [rows] = await pool.query(
      appendPaginationSQL(
        `SELECT pt.id, pt.code,
      pt.product_id, m.name AS product_name, m.code AS product_code, u.name AS unit,
      pt.quantity, pt.completed_quantity,
      (SELECT qi.batch_no FROM quality_inspections qi WHERE qi.reference_id = pt.id AND qi.inspection_type IN ('first_article', 'process', 'final')
        AND qi.batch_no IS NOT NULL AND qi.batch_no <> '' ORDER BY qi.id ASC LIMIT 1) AS batch_no
      FROM production_tasks pt
      LEFT JOIN materials m ON m.id = pt.product_id
      LEFT JOIN units u ON u.id = m.unit_id
      ${scope.join || ''} WHERE ${where} ORDER BY pt.id DESC`,
        pagination.limit,
        pagination.offset
      ),
      args
    );
    const sources = rows.map((row) => ({
      id: row.id,
      code: row.code,
      taskNo: row.code,
      productId: row.product_id,
      materialId: row.product_id,
      productName: row.product_name,
      productCode: row.product_code,
      batchNo: normalizeTaskBatchNo(
        row.batch_no?.startsWith('BATCH') ? null : row.batch_no,
        row.code
      ),
      unit: row.unit,
      quantity: Number(row.quantity),
      completedQuantity: Number(row.completed_quantity || 0),
    }));
    return ResponseHandler.paginated(
      res,
      sources,
      Number(counts[0].total),
      pagination.page,
      pagination.pageSize
    );
  } catch (error) {
    return ResponseHandler.error(res, '获取检验来源失败', 'SERVER_ERROR', 500, error);
  }
}

module.exports = { getProductionSources };
