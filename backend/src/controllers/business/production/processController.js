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
const { parsePagination } = require('../../../utils/safePagination');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const {
  promoteTaskToInspection,
  promoteTaskToInProgress,
} = require('../../../services/business/TaskLifecycleService');
const NotificationService = require('../../../services/NotificationService');
const ScopeGuard = require('../../../authorization/ScopeGuard');

// 状态常量统一引用 businessConfig，避免硬编码。
const TASK_STATUS = businessConfig.status.productionTask;
const PROC_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const PROCESS_STATE_MACHINE = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function validateProcessTransition(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) {
    return { valid: true, message: '' };
  }

  const allowed = PROCESS_STATE_MACHINE[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    return {
      valid: false,
      message: `工序状态不允许从 [${currentStatus}] 转为 [${targetStatus}]`,
    };
  }

  return { valid: true, message: '' };
}

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

    const [taskCheck] = await connection.query('SELECT id, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [
      task_id,
    ]);

    if (taskCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, 'Production task not found', 'NOT_FOUND', 404);
    }

    if ([TASK_STATUS.INSPECTION, TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED].includes(taskCheck[0].status)) {
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

    const { id } = req.params;
    const {
      process_name,
      sequence,
      quantity,
      progress,
      status,
      description,
      remarks,
      actual_start_date,
      actual_end_date,
      actual_start_time,
      actual_end_time,
    } = mapKeysToSnake(req.body || {});

    // mapKeysToSnake 后统一为 snake；兼容 start/end date 别名
    const startTimeResult =
      actual_start_time !== undefined ? actual_start_time : actual_start_date;
    const endTimeResult =
      actual_end_time !== undefined ? actual_end_time : actual_end_date;

    const [processCheck] = await connection.query(
      `SELECT pp.id, pp.task_id, pp.status,
              pt.status as task_status,
              pt.plan_id,
              pt.code as task_code
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

    const processRow = processCheck[0];
    const taskId = processRow.task_id;
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', taskId, '无权修改该生产任务'))) {
      await connection.rollback();
      return;
    }
    if (status !== undefined) {
      const validProcessStatuses = Object.values(PROC_STATUS);
      if (!validProcessStatuses.includes(status)) {
        await connection.rollback();
        return ResponseHandler.error(res, `无效的工序状态: ${status}`, 'VALIDATION_ERROR', 400);
      }

      const transitionCheck = validateProcessTransition(processRow.status, status);
      if (!transitionCheck.valid) {
        await connection.rollback();
        return ResponseHandler.error(res, transitionCheck.message, 'INVALID_TRANSITION', 400);
      }

      const startableTaskStatuses = new Set([
        TASK_STATUS.MATERIAL_ISSUED,
        TASK_STATUS.MATERIAL_PARTIAL_ISSUED,
        TASK_STATUS.IN_PROGRESS,
      ]);

      if (status === PROC_STATUS.IN_PROGRESS && !startableTaskStatuses.has(processRow.task_status)) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `任务 ${processRow.task_code || taskId} 当前状态不允许开始工序（需先完成发料）`,
          'INVALID_STATUS',
          400
        );
      }

      if (status === PROC_STATUS.COMPLETED && processRow.task_status !== TASK_STATUS.IN_PROGRESS) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `任务 ${processRow.task_code || taskId} 未处于「生产中」，不能完成工序`,
          'INVALID_STATUS',
          400
        );
      }
    }

    // 动态构建更新语句，只更新传入字段。
    const updateFields = [];
    const updateParams = [];

    if (process_name !== undefined) {
      updateFields.push('process_name = ?');
      updateParams.push(process_name);
    }
    if (sequence !== undefined) {
      updateFields.push('sequence = ?');
      updateParams.push(sequence);
    }
    if (quantity !== undefined) {
      updateFields.push('quantity = ?');
      updateParams.push(quantity);
    }
    if (progress !== undefined) {
      updateFields.push('progress = ?');
      updateParams.push(progress);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateParams.push(status);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateParams.push(description);
    }
    if (remarks !== undefined) {
      updateFields.push('remarks = ?');
      updateParams.push(remarks);
    }
    // 将时间字段合并到同一条 UPDATE，避免多次写入。
    if (startTimeResult !== undefined) {
      updateFields.push('actual_start_time = ?');
      updateParams.push(startTimeResult || null);
    }
    if (endTimeResult !== undefined) {
      updateFields.push('actual_end_time = ?');
      updateParams.push(endTimeResult || null);
    }

    if (updateFields.length > 0) {
      updateParams.push(id);
      await connection.query(
        `UPDATE production_processes SET ${updateFields.join(', ')} WHERE id = ?`,
        updateParams
      );
    }

    // 工序开始时，经生命周期服务进入生产中（走状态机，禁止裸 UPDATE）
    if (status === PROC_STATUS.IN_PROGRESS) {
      await promoteTaskToInProgress(connection, taskId);
    }

    const warnings = [];

    // 工序完成时检查是否所有有效工序都已完成。
    if (status === PROC_STATUS.COMPLETED) {
      // 统计该任务下所有工序状态。
      const [allProcesses] = await connection.query(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.CANCELLED}' THEN 1 ELSE 0 END) as cancelled
        FROM production_processes
        WHERE task_id = ?
      `,
        [taskId]
      );

      const { total, completed, cancelled } = allProcesses[0];
      const activeProcessesCompleted = completed === total - cancelled;

      // 所有有效工序（非取消）都完成时，尝试推进任务到待检验。
      // 工序本身允许先完成；首件/过程检未关时只告警，不回滚工序完成（避免 400 卡死）。
      if (activeProcessesCompleted && total > 0) {
        let taskPromotedToInspection = false;

        try {
          const promoteResult = await promoteTaskToInspection(connection, taskId, {
            setCompletedQuantityToPlan: true,
            requireOpenInspectionClear: true,
          });
          taskPromotedToInspection =
            !!promoteResult?.promoted || promoteResult?.status === 'inspection';
          logger.info(
            `Task ${taskId} processes completed (${completed}/${total}); promote=${JSON.stringify(promoteResult)}`
          );
        } catch (promoteErr) {
          if (promoteErr.code === 'OPEN_INSPECTIONS') {
            const openList = promoteErr.openInspections || [];
            const typeLabel = (type) => {
              if (type === 'first_article') return '首件检验';
              if (type === 'process') return '工序检验';
              return type || '检验';
            };
            const detail = openList.length
              ? openList
                  .map((row) => `${row.inspection_no || '#' + row.id}（${typeLabel(row.inspection_type)}）`)
                  .join('、')
              : '';
            warnings.push(
              `工序已全部完成，但任务暂未进入「待检验」：仍有未关闭的首件/工序检验${detail ? '：' + detail : ''}。请先在质量管理完成检验。`
            );
            logger.warn(
              `Task ${taskId} processes completed but blocked from inspection: ${promoteErr.message}`
            );
          } else {
            throw promoteErr;
          }
        }

        // 仅任务成功进入待检后，再建终检/补报工
        if (taskPromotedToInspection) {
          try {
            const FinalInspectionService = require('../../../services/business/FinalInspectionService');
            const ensure = await FinalInspectionService.ensureForTask(connection, taskId, {
              note: '工序全部完成后自动创建',
            });
            if (ensure.created) {
              logger.info(`任务 ${taskId} 工序完成，自动创建检验单成功`);
            } else {
              logger.info(`Task ${taskId} already has a final inspection; skip creating`);
            }
          } catch (inspectionError) {
            logger.error(`任务 ${taskId} 自动创建检验单失败:`, inspectionError);
            warnings.push(`自动创建终检单失败：${inspectionError.message || '未知错误'}，请手工创建`);
          }

          const [existingReports] = await connection.query(
            'SELECT COUNT(*) as count FROM production_reports WHERE task_id = ?',
            [taskId]
          );

          if (existingReports[0].count === 0) {
            const [processHours] = await connection.query(
              'SELECT COALESCE(SUM(standard_hours), 0) as total_hours FROM production_processes WHERE task_id = ?',
              [taskId]
            );
            const hoursPerUnit = parseFloat(processHours[0]?.total_hours) || 0;

            if (hoursPerUnit <= 0) {
              warnings.push(
                '工序标准工时未配置，已跳过自动报工。请在【基础数据-工序管理】配置工时后手工报工。'
              );
            } else {
              const reportNo = await CodeGenerators.generateReportCode(connection);
              const [taskInfoForHook] = await connection.query(
                'SELECT manager, quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
                [taskId]
              );
              const operatorName = taskInfoForHook[0]?.manager || (await getCurrentUserName(req));
              const finalQuantity = taskInfoForHook[0]?.quantity || 0;
              const estimatedHours = hoursPerUnit * finalQuantity;

              await connection.query(
                `INSERT INTO production_reports
                (report_no, task_id, operator_id, operator_name, report_time, report_quantity,
                 completed_quantity, qualified_quantity, defective_quantity, scrap_quantity,
                 work_hours, remarks, created_at)
                VALUES (?, ?, 0, ?, NOW(), ?, ?, ?, 0, 0, ?, ?, NOW())`,
                [
                  reportNo,
                  taskId,
                  operatorName,
                  finalQuantity,
                  finalQuantity,
                  finalQuantity,
                  estimatedHours,
                  'Auto generated after process completion',
                ]
              );
              logger.info(
                `任务 ${taskId} 工序完成附加处理：自动创建报工记录，工时: ${estimatedHours}h (单件${hoursPerUnit}h × ${finalQuantity})`
              );
            }
          }
        }

        // 成本/成品入库仍由 completeTask 路径之外的入库确认负责
      } else {
        logger.info(`任务 ${taskId} 还有未完成的工序 (${completed}/${total - cancelled})`);
      }
    }

    await connection.commit();

    // 如有警告，异步发送管理员通知（不阻断响应）
    if (warnings.length > 0) {
      setImmediate(async () => {
        try {
          await NotificationService.notifyByPermissions(
            ['production:process:update'],
            {
              type: 'warning',
              title: '工序完成时发现数据缺失',
              content: `任务ID: ${taskId}\n${warnings.join('\n')}`,
              link: '/basedata/processes',
              priority: 1,
              sourceType: 'production_process_warning',
              sourceId: taskId,
            }
          );
        } catch (notifyErr) {
          logger.warn(`发送管理员通知失败: ${notifyErr.message}`);
        }
      });
    }

    const responseData = warnings.length > 0 ? { warnings } : null;
    const message = warnings.length > 0
      ? '工序更新成功，但有注意事项需要处理'
      : '生产工序更新成功';
    return ResponseHandler.success(res, responseData, message);
  } catch (error) {
    await connection.rollback();
    logger.error('更新生产工序失败:', error);
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
      `SELECT pp.id, pp.task_id, pp.status
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

    if (processCheck[0].status !== PROC_STATUS.PENDING) {
      await connection.rollback();
      return ResponseHandler.error(res, '只能删除待处理状态的工序', 'VALIDATION_ERROR', 400);
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
