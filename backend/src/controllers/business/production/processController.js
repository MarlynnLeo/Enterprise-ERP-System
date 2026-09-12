/**
 * processController.js
 * @description 生产工序控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const businessConfig = require('../../../config/businessConfig');
const { PRODUCTION_STATUS_KEYS } = require('../../../constants/systemConstants');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { parsePagination } = require('../../../utils/safePagination');
const ScopeGuard = require('../../../authorization/ScopeGuard');
const ProductProcessExecutionService = require('../../../services/business/ProductProcessExecutionService');

// 状态常量统一引用 businessConfig，避免硬编码。
const TASK_STATUS = businessConfig.status.productionTask;
const PROC_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

/**
 * 获取生产工序列表
 */
exports.getProcesses = async (req, res) => {
  try {
    const { taskId, status, page = 1, pageSize = 10 } = req.query;
    const { page: safePage, pageSize: safePageSize, offset: safeOffset } = parsePagination(page, pageSize);

    const conditions = ['pt.deleted_at IS NULL'];
    const params = [];

    if (taskId) {
      if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', taskId, { accessMode: 'read' }))) {
        return ResponseHandler.forbidden(res, '无权访问该生产任务');
      }
      conditions.push('pp.task_id = ?');
      params.push(taskId);
    }

    if (status) {
      conditions.push('pp.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [total] = await pool.query(
      `SELECT COUNT(*) as count
       FROM production_processes pp
       JOIN production_tasks pt ON pp.task_id = pt.id
       ${whereClause}`,
      params
    );

    const query = `
      SELECT pp.*, pt.code as task_code, pt.product_id, m.name as product_name
      FROM production_processes pp
      JOIN production_tasks pt ON pp.task_id = pt.id
      LEFT JOIN materials m ON pt.product_id = m.id
      ${whereClause}
      ORDER BY pp.task_id, pp.sequence
      LIMIT ${safePageSize} OFFSET ${safeOffset}
    `;

    const [processes] = await pool.query(query, params);

    return ResponseHandler.paginated(res, processes, total[0].count, safePage, safePageSize, undefined, {
      items: processes,
    });
  } catch (error) {
    logger.error('获取生产工序列表失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取工序详情
 */
exports.getProcessById = async (req, res) => {
  try {
    const { id } = req.params;

    const [processes] = await pool.query(
      `
      SELECT pp.*, pt.code as task_code, pt.product_id, m.name as product_name
      FROM production_processes pp
      JOIN production_tasks pt ON pp.task_id = pt.id AND pt.deleted_at IS NULL
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE pp.id = ?
    `,
      [id]
    );

    if (processes.length === 0) {
      return ResponseHandler.error(res, 'Production process not found', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.assertAccess(pool, req, 'production_task', processes[0].task_id, { accessMode: 'read' }))) {
      return ResponseHandler.forbidden(res, '无权访问该生产任务');
    }

    return ResponseHandler.success(res, processes[0]);
  } catch (error) {
    logger.error('获取工序详情失败:', error);
    handleError(res, error);
  }
};

/**
 * 创建生产工序
 */
exports.createProcess = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { task_id, process_name, sequence, quantity, description, remarks } = mapKeysToSnake(req.body || {});

    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', task_id, '无权修改该生产任务'))) {
      await connection.rollback();
      return;
    }

    const [taskCheck] = await connection.query('SELECT id, status, process_template_id FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [
      task_id,
    ]);

    if (taskCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Production task not found', 'NOT_FOUND', 404);
    }

    if (taskCheck[0].process_template_id || ![TASK_STATUS.PENDING, TASK_STATUS.ALLOCATED, TASK_STATUS.PREPARING].includes(taskCheck[0].status)) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Production task status does not allow process creation', 'INVALID_STATUS', 400);
    }

    const [result] = await connection.query(
      `
      INSERT INTO production_processes
      (task_id, process_name, sequence, quantity, progress, status, description, remarks)
      VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)
    `,
      [task_id, process_name, sequence || 1, quantity, description || '', remarks || '']
    );

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id: result.insertId,
        message: '生产工序创建成功',
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建生产工序失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新生产工序
 */
exports.updateProcess = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT task_id FROM production_processes WHERE id = ?', [req.params.id]);
    if (!rows.length) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产工序不存在', 'NOT_FOUND', 404);
    }
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', rows[0].task_id, '无权修改该生产任务'))) {
      await connection.rollback();
      return;
    }
    const result = await ProductProcessExecutionService.update(connection, req.params.id, mapKeysToSnake(req.body || {}), {
      operatorId: getAuthenticatedUserId(req), operatorName: await getCurrentUserName(req),
    });
    await connection.commit();
    return ResponseHandler.success(res, result, result.warnings?.length ? '工序已更新，请完成质量检验' : '生产工序更新成功');
  } catch (error) {
    await connection.rollback();
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除生产工序
 */
exports.deleteProcess = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [processCheck] = await connection.query(
      `SELECT pp.id, pp.task_id, pp.status, pt.process_template_id, pt.status AS task_status
       FROM production_processes pp
       JOIN production_tasks pt ON pp.task_id = pt.id AND pt.deleted_at IS NULL
       WHERE pp.id = ?
       FOR UPDATE`,
      [id]
    );

    if (processCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Production process not found', 'NOT_FOUND', 404);
    }

    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', processCheck[0].task_id, '无权删除该生产工序'))) {
      await connection.rollback();
      return;
    }

    if (processCheck[0].process_template_id || processCheck[0].status !== PROC_STATUS.PENDING || !['pending', 'allocated', 'preparing'].includes(processCheck[0].task_status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '只能删除尚未执行且未绑定工艺版本的手工工序', 'VALIDATION_ERROR', 400);
    }

    await connection.query('DELETE FROM production_processes WHERE id = ?', [id]);

    await connection.commit();

    return ResponseHandler.success(res, null, '生产工序删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除生产工序失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取工序完成率（用于仪表盘）
 */
exports.getProcessCompletionRates = async (req, res) => {
  try {
    const query = `
      SELECT
        pp.process_name as processName,
        COUNT(*) as total,
        SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
        ROUND(IFNULL(SUM(CASE WHEN pp.status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 0), 2) as completionRate
      FROM production_processes pp
      JOIN production_tasks pt ON pp.task_id = pt.id AND pt.deleted_at IS NULL
      GROUP BY pp.process_name
      ORDER BY total DESC
      LIMIT 10
    `;

    const [rates] = await pool.query(query);
    ResponseHandler.success(res, rates, 'Process completion rates loaded');
  } catch (error) {
    logger.error('Failed to get process completion rates', error);
    ResponseHandler.error(res, 'Failed to get process completion rates', 'SERVER_ERROR', 500, error);
  }
};
