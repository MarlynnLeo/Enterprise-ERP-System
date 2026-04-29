/**
 * processController.js
 * @description 生产工序控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const businessConfig = require('../../../config/businessConfig');
const { apiStatusToDbStatus } = require('../../../utils/statusMapper');
const { PRODUCTION_STATUS_KEYS } = require('../../../constants/systemConstants');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { parsePagination } = require('../../../utils/paginationHelper');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { generateBatchNo, syncPlanStatus } = require('../../../services/business/TaskLifecycleService');
const QualityInspection = require('../../../models/qualityInspection');

// 状态常量
const STATUS = {
  PROCESS: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  PRODUCTION_TASK: businessConfig.status.productionTask,
};

/**
 * 获取生产工序列表
 */
exports.getProcesses = async (req, res) => {
  try {
    const { taskId, status, page = 1, pageSize = 10 } = req.query;
    const { safePage, safePageSize, safeOffset } = parsePagination(page, pageSize);

    const conditions = [];
    const params = [];

    if (taskId) {
      conditions.push('pp.task_id = ?');
      params.push(taskId);
    }

    if (status) {
      conditions.push('pp.status = ?');
      params.push(status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [total] = await pool.query(
      `SELECT COUNT(*) as count FROM production_processes pp ${whereClause}`,
      params
    );

    const query = `
      SELECT pp.*, pt.code as task_code, pt.product_id, m.name as product_name
      FROM production_processes pp
      LEFT JOIN production_tasks pt ON pp.task_id = pt.id
      LEFT JOIN materials m ON pt.product_id = m.id
      ${whereClause}
      ORDER BY pp.task_id, pp.sequence
      LIMIT ${safePageSize} OFFSET ${safeOffset}
    `;

    const [processes] = await pool.query(query, params);

    res.json({
      items: processes,
      total: total[0].count,
      page: safePage,
      pageSize: safePageSize,
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
      LEFT JOIN production_tasks pt ON pp.task_id = pt.id
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE pp.id = ?
    `,
      [id]
    );

    if (processes.length === 0) {
      return ResponseHandler.error(res, '生产工序不存在', 'NOT_FOUND', 404);
    }

    res.json(processes[0]);
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

    const { task_id, process_name, sequence, quantity, description, remarks } = req.body;

    const [taskCheck] = await connection.query('SELECT id FROM production_tasks WHERE id = ?', [
      task_id,
    ]);

    if (taskCheck.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
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
      actual_start_time, // 支持多种命名
      actual_end_time,
      actualStartTime, // 前端常用命名
      actualEndTime,
    } = req.body;

    // 参数归一化：兼容前端多种命名（actualStartTime / actual_start_time / actual_start_date）
    const startTimeResult = actualStartTime !== undefined ? actualStartTime : (actual_start_time !== undefined ? actual_start_time : actual_start_date);
    const endTimeResult = actualEndTime !== undefined ? actualEndTime : (actual_end_time !== undefined ? actual_end_time : actual_end_date);

    const [processCheck] = await connection.query(
      'SELECT id, task_id, status FROM production_processes WHERE id = ?',
      [id]
    );

    if (processCheck.length === 0) {
      return ResponseHandler.error(res, '生产工序不存在', 'NOT_FOUND', 404);
    }

    // 动态构建更新语句，只更新传入的字段
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
    // 将时间字段合并到同一个 UPDATE 语句中（避免双 UPDATE）
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

    const taskId = processCheck[0].task_id;

    // === 统一提前查询任务和计划信息的上下文，防止下流二次查询事务等待 ===
    const [taskInfoContext] = await connection.query(
      'SELECT plan_id FROM production_tasks WHERE id = ?',
      [taskId]
    );
    const planId = taskInfoContext.length > 0 ? taskInfoContext[0].plan_id : null;

    // 工序开始或进行中时，更新生产任务和计划状态为"生产中"
    if (status === STATUS.PROCESS.IN_PROGRESS) {
      // 1. 更新生产任务状态为生产中(只更新允许的前置状态)
      await connection.query(
        'UPDATE production_tasks SET status = "in_progress" WHERE id = ? AND status IN ("pending", "preparing", "material_issued", "material_partial_issued")',
        [taskId]
      );

      // 2. 更新关联的生产计划
      if (planId) {
        await connection.query(
          'UPDATE production_plans SET status = "in_progress" WHERE id = ? AND status IN ("draft", "preparing", "material_issued", "material_partial_issued")',
          [planId]
        );
        logger.info(`工序开始，生产计划 ${planId} 状态已更新为 in_progress`);
      }
    }

    // 工序完成时检查是否所有工序都已完成
    if (status === STATUS.PROCESS.COMPLETED) {
      // 统计该任务下的所有工序状态
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

      // 所有有效工序（非取消）都完成时，自动将任务状态更新为待检验
      if (activeProcessesCompleted && total > 0) {
        // 将API状态转换为数据库ENUM状态
        const dbStatus = apiStatusToDbStatus(STATUS.PRODUCTION_TASK.INSPECTION, 'productionTask');

        // 更新任务状态为待检验
        await connection.query(
          'UPDATE production_tasks SET status = ?, progress = 100 WHERE id = ?',
          [dbStatus, taskId]
        );

        logger.info(
          `任务 ${taskId} 的所有工序已完成 (${completed}/${total})，任务状态更新为待检验（数据库状态: ${dbStatus}）`
        );

        // 自动创建检验单
        try {
          // 获取任务详细信息
          const [taskDetail] = await connection.query(
            'SELECT id, code, product_id, quantity FROM production_tasks WHERE id = ?',
            [taskId]
          );

          if (taskDetail.length > 0) {
            const task = taskDetail[0];

            // 检查是否已经存在检验单
            const [existingInspection] = await connection.query(
              'SELECT id FROM quality_inspections WHERE inspection_type = ? AND reference_id = ?',
              ['final', taskId]
            );

            // 如果不存在检验单，则创建
            if (existingInspection.length === 0) {


              await QualityInspection.createInspection({
                inspection_type: 'final',
                reference_id: taskId,
                reference_no: task.code,
                product_id: task.product_id,
                batch_no: await generateBatchNo(task.code, connection),
                quantity: task.quantity || 0,
                unit: '个',
                planned_date: new Date(),
                status: 'pending',
                note: '工序完成时自动创建',
              });

              logger.info(`任务 ${taskId} 工序完成，自动创建检验单成功`);
            } else {
              logger.info(`任务 ${taskId} 已存在检验单，跳过创建`);
            }
          }
        } catch (inspectionError) {
          logger.error(`任务 ${taskId} 自动创建检验单失败:`, inspectionError);
          // 不影响主流程，继续执行
        }

        // ===== 工序完工的附加处理（主事务内执行，保障数据一致性）=====

        // 1. 更新 completed_quantity = quantity（全部完工）
        await connection.query(
          'UPDATE production_tasks SET completed_quantity = quantity WHERE id = ? AND (completed_quantity IS NULL OR completed_quantity < quantity)',
          [taskId]
        );

        // 2. 自动创建报工记录（如果还没有）
        const [existingReports] = await connection.query(
          'SELECT COUNT(*) as count FROM production_reports WHERE task_id = ?',
          [taskId]
        );

        if (existingReports[0].count === 0) {
          const [processHours] = await connection.query(
            'SELECT COALESCE(SUM(standard_hours), 0) as total_hours FROM production_processes WHERE task_id = ?',
            [taskId]
          );
          const estimatedHours = parseFloat(processHours[0]?.total_hours) || 0;

          if (estimatedHours > 0) {
            const reportNo = await CodeGenerators.generateReportCode(connection);
            const [taskInfoForHook] = await connection.query('SELECT manager, quantity FROM production_tasks WHERE id = ?', [taskId]);
            const operatorName = taskInfoForHook[0]?.manager || await getCurrentUserName(req);
            const finalQuantity = taskInfoForHook[0]?.quantity || 0;

            await connection.query(
              `INSERT INTO production_reports
              (report_no, task_id, operator_id, operator_name, report_time, report_quantity,
               completed_quantity, qualified_quantity, defective_quantity, unqualified_quantity,
               work_hours, remarks, created_at)
              VALUES (?, ?, 0, ?, NOW(), ?, ?, ?, 0, 0, ?, ?, NOW())`,
              [
                reportNo, taskId, operatorName, finalQuantity, finalQuantity, finalQuantity,
                estimatedHours, '工序完成后系统自动生成'
              ]
            );
            logger.info(`任务 ${taskId} 工序完成附加处理：自动创建报工记录，工时: ${estimatedHours}h`);
          }
        }

        // 3. 自动关闭未完成的首检/过程检验单
        const [updatedInspections] = await connection.query(
          `UPDATE quality_inspections
           SET status = 'passed', note = CONCAT(COALESCE(note, ''), ' | 工序全部完成时系统自动按合格跳过')
           WHERE task_id = ? AND inspection_type IN ('first_article', 'process') AND status = 'pending'`,
          [taskId]
        );
        if (updatedInspections.affectedRows > 0) {
          logger.info(`任务 ${taskId} 工序完成附加处理：自动跳过 ${updatedInspections.affectedRows} 个未执行的首检/过程检验`);
        }

        // 4. 成本核算标记（commit 后异步触发，避免读到未提交数据）
        // 由下方 commit 后的 setImmediate 统一执行
        // ==============================================================


        // ==============================================================


        // 复用外部早已查询到的 planId，同步计划状态
        if (planId) {
          await syncPlanStatus(planId, connection);
        }
      } else {
        logger.info(`任务 ${taskId} 还有未完成的工序 (${completed}/${total - cancelled})`);
      }
    }

    await connection.commit();

    // 成本核算在事务提交后异步执行
    if (status === STATUS.PROCESS.COMPLETED && taskId) {
      setImmediate(async () => {
        try {
          const CostAccountingService = require('../../../services/business/CostAccountingService');
          await CostAccountingService.calculateActualCost(parseInt(taskId));
          logger.info(`任务 ${taskId} 工序完成附加处理：成本核算触发成功`);
        } catch (costErr) {
          logger.warn(`任务 ${taskId} 工序完成路径成本核算挂起: ${costErr.message}`);
        }
      });
    }

    res.json({ message: '生产工序更新成功' });
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
      'SELECT id, status FROM production_processes WHERE id = ?',
      [id]
    );

    if (processCheck.length === 0) {
      return ResponseHandler.error(res, '生产工序不存在', 'NOT_FOUND', 404);
    }

    if (processCheck[0].status !== 'pending') {
      return ResponseHandler.error(res, '只能删除待处理状态的工序', 'BAD_REQUEST', 400);
    }

    await connection.query('DELETE FROM production_processes WHERE id = ?', [id]);

    await connection.commit();

    res.json({ message: '生产工序删除成功' });
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
        process_name as processName,
        COUNT(*) as total,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
        ROUND(IFNULL(SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0) * 100, 0), 2) as completionRate
      FROM production_processes
      GROUP BY process_name
      ORDER BY total DESC
      LIMIT 10
    `;

    const [rates] = await pool.query(query);
    ResponseHandler.success(res, rates, '获取工序完成率成功');
  } catch (error) {
    logger.error('获取工序完成率失败:', error);
    ResponseHandler.error(res, '获取工序完成率失败', 'SERVER_ERROR', 500, error);
  }
};
