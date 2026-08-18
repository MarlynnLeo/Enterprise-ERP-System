/**
 * taskController.js
 * @description 生产任务控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const BusinessError = require('../../../utils/BusinessError');
const QualityInspection = require('../../../models/qualityInspection');
const { PRODUCTION_STATUS_KEYS } = require('../../../constants/systemConstants');
const { apiStatusToDbStatus, dbStatusToApiStatus } = require('../../../utils/statusMapper');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const SchedulingService = require('../../../services/business/SchedulingService');
const BomExplosionService = require('../../../services/BomExplosionService');
const TaskRepository = require('../../../repositories/TaskRepository');
const ScopeGuard = require('../../../authorization/ScopeGuard');

// 任务生命周期相关服务统一在顶部声明，避免运行时动态 require
const {
  validateTaskTransition,
  promoteTaskToInspection,
  syncPlanStatus,
  generateBatchNo,
} = require('../../../services/business/TaskLifecycleService');
const NotificationService = require('../../../services/NotificationService');
const DomainEventService = require('../../../services/business/DomainEventService');

// 状态常量（统一引用 businessConfig，消除硬编码）
const TASK_STATUS = businessConfig.status.productionTask;
const PROC_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

async function resolveCostCenterIdForProduct(connection, productId) {
  if (!productId) return null;

  const [rows] = await connection.query(
    `
      SELECT cost_center_id
      FROM (
        SELECT cc.id AS cost_center_id, 2 AS priority
        FROM materials m
        JOIN cost_centers cc ON cc.department_id = m.production_group_id
        WHERE m.id = ?
          AND (cc.is_active = 1 OR cc.is_active IS NULL)
          AND cc.deleted_at IS NULL
        UNION ALL
        SELECT cc.id AS cost_center_id, 1 AS priority
        FROM cost_centers cc
        WHERE cc.type = 'production'
          AND (cc.is_active = 1 OR cc.is_active IS NULL)
          AND cc.deleted_at IS NULL
      ) candidates
      ORDER BY priority DESC, cost_center_id ASC
      LIMIT 1
    `,
    [productId]
  );

  return rows.length > 0 ? rows[0].cost_center_id : null;
}

async function loadActiveProcessTemplateSteps(connection, productId) {
  if (!productId) return { templateId: null, steps: [] };

  const [templates] = await connection.query(
    'SELECT id FROM process_templates WHERE product_id = ? AND status = 1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [productId]
  );
  if (templates.length === 0) {
    return { templateId: null, steps: [] };
  }

  const templateId = templates[0].id;
  const [steps] = await connection.query(
    'SELECT id, template_id, order_num, name, description, standard_hours, department, remark, created_at, updated_at, instruction_docs FROM process_template_details WHERE template_id = ? ORDER BY order_num',
    [templateId]
  );
  return { templateId, steps };
}

async function insertTaskProcessesFromSteps(connection, taskId, taskCode, taskQuantity, steps) {
  for (const step of steps) {
    await connection.query(
      `
      INSERT INTO production_processes
      (task_id, process_name, sequence, quantity, progress, status, standard_hours, description, remarks)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `,
      [
        taskId,
        step.name,
        step.order_num,
        taskQuantity,
        0,
        step.standard_hours || 0,
        step.description || '',
        step.remark || '',
      ]
    );
  }
  logger.info(`任务 ${taskCode} 已加载 ${steps.length} 道工序`);
}

async function replaceTaskProcessesForProduct(
  connection,
  taskId,
  taskCode,
  productId,
  taskQuantity
) {
  await connection.query('DELETE FROM production_processes WHERE task_id = ?', [taskId]);

  const { templateId, steps } = await loadActiveProcessTemplateSteps(connection, productId);
  if (!templateId) {
    logger.warn(`任务 ${taskCode} 产品 ${productId} 未配置激活工序模板，已清空旧工序`);
    return;
  }

  logger.info(`任务 ${taskCode} 重新关联工序模板: ${templateId}`);
  await insertTaskProcessesFromSteps(connection, taskId, taskCode, taskQuantity, steps);
}

async function syncTaskProcessQuantity(connection, taskId, taskQuantity) {
  await connection.query('UPDATE production_processes SET quantity = ? WHERE task_id = ?', [
    taskQuantity,
    taskId,
  ]);
}

/**
 * 生成任务编号
 */
exports.generateTaskCode = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const code = await CodeGenerators.generateTaskCode(connection);

    await connection.commit();
    return ResponseHandler.success(res, { code });
  } catch (error) {
    await connection.rollback();
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取生产任务负责人列表
 */
exports.getProductionTaskManagers = async (req, res) => {
  try {
    const scopeClause = await ScopeGuard.applyListScope(req, 'production_task', {
      tableAlias: 'pt',
      ownerAlias: 'production_task_manager_owner_scope',
      accessMode: 'read',
    });
    // 获取所有有负责人的生产任务的负责人列表（去重）
    const [managers] = await pool.query(`
      SELECT DISTINCT manager
      FROM production_tasks pt
      ${scopeClause.join || ''}
      WHERE pt.deleted_at IS NULL AND pt.manager IS NOT NULL AND pt.manager != ''${scopeClause.where || ''}
      ORDER BY manager ASC
    `, scopeClause.params || []);

    return ResponseHandler.success(
      res,
      managers.map((m) => m.manager)
    );
  } catch (error) {
    logger.error('获取负责人列表失败:', error);
    ResponseHandler.error(res, '获取负责人列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取生产任务列表
 */
exports.getProductionTasks = async (req, res) => {
  try {
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'production_task', {
      tableAlias: 'pt',
      ownerAlias: 'production_task_owner_scope',
      accessMode: 'read',
    });

    const { productionTaskMap } = require('../../../utils/production/productionFieldMap');
    const result = await TaskRepository.findListWithPagination(
      productionTaskMap.fromListQuery(req.query),
      {
        page: req.query.page,
        pageSize: req.query.pageSize || req.query.limit,
        scopeClause,
      }
    );

    // 出参仅 camel
    const payload = {
      ...result,
      items: Array.isArray(result?.items)
        ? result.items.map((t) => productionTaskMap.toApi(t))
        : result?.items,
    };
    return ResponseHandler.success(res, payload);
  } catch (error) {
    logger.error('获取生产任务列表失败:', error);
    handleError(res, error);
  }
};

/**
 * 创建生产任务
 */
exports.createProductionTask = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // HTTP camel → snake
    const { productionTaskMap } = require('../../../utils/production/productionFieldMap');
    const mapped = productionTaskMap.fromApi(req.body || {});
    const plan_id = mapped.plan_id;
    const product_id = mapped.product_id;
    const quantity = mapped.quantity;
    const start_date = mapped.start_date;
    const expected_end_date = mapped.expected_end_date;
    const manager = mapped.manager;
    const remarks = mapped.remarks;
    const process_template_id = mapped.process_template_id;

    const taskQuantity = Number(quantity);
    if (!product_id || !Number.isFinite(taskQuantity) || taskQuantity <= 0) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '缺少有效参数: productId, quantity',
        'VALIDATION_ERROR',
        400
      );
    }

    const code = await CodeGenerators.generateTaskCode(connection);
    let linkedPlan = null;

    if (plan_id) {
      if (!(await ScopeGuard.assertAccess(connection, req, 'production_plan', plan_id))) {
        await connection.rollback();
        return ResponseHandler.forbidden(res, '无权使用该生产计划创建任务');
      }
      linkedPlan = await TaskRepository.findPlanById(connection, plan_id);

      if (!linkedPlan) {
        await connection.rollback();
        return ResponseHandler.error(res, '生产计划不存在', 'NOT_FOUND', 404);
      }
      if (linkedPlan.product_id && Number(linkedPlan.product_id) !== Number(product_id)) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '生产任务产品必须与关联生产计划一致',
          'VALIDATION_ERROR',
          400
        );
      }

      const planQuantity = Number(linkedPlan.quantity) || 0;
      const pushedQuantity = Number(linkedPlan.pushed_quantity) || 0;
      const remainingQuantity = Math.max(0, planQuantity - pushedQuantity);
      if (taskQuantity > remainingQuantity) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `下推数量(${taskQuantity})不能超过生产计划剩余数量(${remainingQuantity})`,
          'EXCEEDED_QUANTITY',
          400
        );
      }
    }

    const costCenterId = await TaskRepository.resolveCostCenterId(connection, product_id);
    const hasManager = Boolean(manager && String(manager).trim() && String(manager).trim() !== '未分配');
    const group = hasManager
      ? { departmentName: String(manager).trim() }
      : await TaskRepository.resolveProductionGroup(connection, {
          productId: product_id,
          planId: plan_id || null,
        });

    const taskId = await TaskRepository.create(connection, {
      code,
      plan_id: plan_id || null,
      product_id,
      quantity: taskQuantity,
      start_date: start_date || null,
      expected_end_date: expected_end_date || null,
      manager: group.departmentName || '未分配',
      remarks: remarks || '',
      cost_center_id: costCenterId,
      // DataScope owner：强制当前登录用户，禁止信任 body
      created_by: getAuthenticatedUserId(req),
    });

    if (linkedPlan) {
      await TaskRepository.incrementPlanPushedQuantity(connection, plan_id, taskQuantity);
    }

    // 标准业务链：生产计划 → 生产任务（类型 SSOT）
    if (plan_id) {
      const DocumentChainService = require('../../../services/business/DocumentChainService');
      const [[planRow]] = await connection.query(
        'SELECT code FROM production_plans WHERE id = ? AND deleted_at IS NULL',
        [plan_id]
      );
      await DocumentChainService.linkProductionPlanToTask(
        {
          planId: plan_id,
          planCode: planRow?.code || null,
          taskId,
          taskCode: code,
        },
        req.user?.userId || req.user?.id,
        connection
      );
    }

    // 如果没有指定工序模板ID，尝试根据产品ID自动查找关联的工序模板
    let effectiveTemplateId = process_template_id;
    if (!effectiveTemplateId && product_id) {
      const { templateId } = await TaskRepository.findActiveProcessTemplate(connection, product_id);
      if (templateId) {
        effectiveTemplateId = templateId;
        logger.info(`任务 ${code} 自动关联工序模板: ${effectiveTemplateId}`);
      }
    }

    if (effectiveTemplateId) {
      const [templates] = await connection.query(
        'SELECT id FROM process_templates WHERE id = ? AND deleted_at IS NULL',
        [effectiveTemplateId]
      );

      if (templates.length === 0) {
        logger.warn(`指定的工序模板 ${effectiveTemplateId} 不存在`);
      } else {
        // 使用显式的 templateId 重新加载步骤（覆盖前端指定模板和自动发现模板两种场景）
        const [explicitSteps] = await connection.query(
          'SELECT id, template_id, order_num, name, description, standard_hours, department, remark, created_at, updated_at, instruction_docs FROM process_template_details WHERE template_id = ? ORDER BY order_num',
          [effectiveTemplateId]
        );
        await TaskRepository.insertProcesses(connection, taskId, taskQuantity, explicitSteps);
        logger.info(`任务 ${code} 已加载 ${explicitSteps.length} 道工序`);

        // ===== 自动排程：填充各工序的计划开始/结束时间 =====
        if (start_date) {
          try {
            // 如果前端传的是纯日期，默认从上班时间开始
            const startTime = await SchedulingService.resolveStartTime(start_date, connection);
            await SchedulingService.rescheduleTask(taskId, startTime, taskQuantity, connection);
            logger.info(`[排程] 任务 ${code} 工序计划时间已自动填充`);
          } catch (schedErr) {
            throw new Error(`任务 ${code} 工序时间填充失败: ${schedErr.message}`, {
              cause: schedErr,
            });
          }
        }
      }
    }

    if (plan_id) {
      await SchedulingService._syncScheduledPlanDates(connection, [Number(taskId)]);
    }

    // 更新关联的生产计划状态
    if (plan_id) {
      // 查询计划当前状态
      const [planInfo] = await connection.query(
        'SELECT status FROM production_plans WHERE id = ? AND deleted_at IS NULL',
        [plan_id]
      );

      if (planInfo.length > 0) {
        const currentStatus = planInfo[0].status;

        // 如果计划是草稿状态，更新为分配中
        if (currentStatus === 'draft') {
          await connection.query(
            'UPDATE production_plans SET status = "allocated" WHERE id = ? AND deleted_at IS NULL',
            [plan_id]
          );
          logger.info(`生产计划 ${plan_id} 状态已更新: draft → allocated（分配中）`);
        }
        // 如果已是分配中或更后面的状态，保持不变
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id: taskId,
        code,
        pushed_quantity: linkedPlan
          ? (Number(linkedPlan.pushed_quantity) || 0) + taskQuantity
          : undefined,
        message: '生产任务创建成功',
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建生产任务失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新生产任务
 */
exports.updateProductionTask = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const {
      plan_id,
      product_id,
      quantity,
      start_date,
      expected_end_date,
      manager,
      remarks,
      status,
    } = mapKeysToSnake(req.body || {});

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', id, '无权修改该生产任务'))) {
      return;
    }

    await connection.beginTransaction();

    const [taskCheck] = await connection.query(
      'SELECT id, code, status, plan_id, product_id, quantity, manager FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (taskCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    if (
      taskCheck[0].status === TASK_STATUS.COMPLETED ||
      taskCheck[0].status === TASK_STATUS.CANCELLED
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成或已取消的任务不能修改', 'VALIDATION_ERROR', 400);
    }

    const taskQuantity = Number(quantity);
    if (!product_id || !Number.isFinite(taskQuantity) || taskQuantity <= 0) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '缺少有效参数: product_id, quantity',
        'VALIDATION_ERROR',
        400
      );
    }

    const currentTask = taskCheck[0];
    const currentPlanId = currentTask.plan_id ? Number(currentTask.plan_id) : null;
    const nextPlanId = plan_id ? Number(plan_id) : null;
    const currentProductId = currentTask.product_id ? Number(currentTask.product_id) : null;
    const nextProductId = product_id ? Number(product_id) : null;
    const currentQuantity = Number(currentTask.quantity) || 0;
    const preStartStatuses = [TASK_STATUS.PENDING, TASK_STATUS.ALLOCATED, TASK_STATUS.PREPARING];
    const trackedFieldsChanged =
      currentPlanId !== nextPlanId ||
      currentProductId !== nextProductId ||
      currentQuantity !== taskQuantity;

    if (trackedFieldsChanged && !preStartStatuses.includes(currentTask.status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '任务已进入执行流程，不能修改计划、产品或数量',
        'VALIDATION_ERROR',
        400
      );
    }

    if (trackedFieldsChanged) {
      await SchedulingService._assertTaskSchedulable(connection, currentTask);
    }

    if (trackedFieldsChanged) {
      if (currentPlanId) {
        if (!(await ScopeGuard.assertAccess(connection, req, 'production_plan', currentPlanId))) {
          await connection.rollback();
          return ResponseHandler.forbidden(res, '无权修改原生产计划');
        }
        await connection.query(
          `UPDATE production_plans
           SET pushed_quantity = GREATEST(0, COALESCE(pushed_quantity, 0) - ?)
           WHERE id = ? AND deleted_at IS NULL`,
          [currentQuantity, currentPlanId]
        );
      }

      if (nextPlanId) {
        if (!(await ScopeGuard.assertAccess(connection, req, 'production_plan', nextPlanId))) {
          await connection.rollback();
          return ResponseHandler.forbidden(res, '无权使用该生产计划');
        }
        const [planRows] = await connection.query(
          `SELECT id, product_id, quantity, COALESCE(pushed_quantity, 0) as pushed_quantity
           FROM production_plans
           WHERE id = ? AND deleted_at IS NULL
           FOR UPDATE`,
          [nextPlanId]
        );
        if (planRows.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(res, '生产计划不存在', 'NOT_FOUND', 404);
        }

        const plan = planRows[0];
        if (plan.product_id && Number(plan.product_id) !== nextProductId) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            '生产任务产品必须与关联生产计划一致',
            'VALIDATION_ERROR',
            400
          );
        }

        const remainingQuantity = Math.max(
          0,
          (Number(plan.quantity) || 0) - (Number(plan.pushed_quantity) || 0)
        );
        if (taskQuantity > remainingQuantity) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `下推数量(${taskQuantity})不能超过生产计划剩余数量(${remainingQuantity})`,
            'EXCEEDED_QUANTITY',
            400
          );
        }

        await connection.query(
          `UPDATE production_plans
           SET pushed_quantity = COALESCE(pushed_quantity, 0) + ?
           WHERE id = ? AND deleted_at IS NULL`,
          [taskQuantity, nextPlanId]
        );
      }
    }

    // 如果有状态更新，需要转换为数据库ENUM格式（混合命名）
    let dbStatus = null;
    if (status) {
      // 使用 statusMapper 工具进行状态转换
      dbStatus = apiStatusToDbStatus(status, 'productionTask');
    }
    const nextStatus = dbStatus || currentTask.status;

    // 如果产品变更，同步更新成本中心
    const costCenterId = await resolveCostCenterIdForProduct(connection, product_id);

    await connection.query(
      `
      UPDATE production_tasks
      SET plan_id = ?, product_id = ?, quantity = ?, start_date = ?,
          expected_end_date = ?, manager = ?, remarks = ?, cost_center_id = ?, status = IFNULL(?, status)
       WHERE id = ? AND deleted_at IS NULL
    `,
      [
        plan_id || null,
        product_id,
        taskQuantity,
        start_date || null,
        expected_end_date || null,
        manager,
        remarks || '',
        costCenterId,
        dbStatus,
        id,
      ]
    );

    if (currentProductId !== nextProductId) {
      await replaceTaskProcessesForProduct(
        connection,
        id,
        currentTask.code,
        product_id,
        taskQuantity
      );
    } else if (currentQuantity !== taskQuantity) {
      await syncTaskProcessQuantity(connection, id, taskQuantity);
    }

    if (start_date && preStartStatuses.includes(nextStatus)) {
      const startTime = await SchedulingService.resolveStartTime(start_date, connection);
      await SchedulingService.rescheduleTask(id, startTime, taskQuantity, connection);
    }

    if (nextPlanId) {
      await SchedulingService._syncScheduledPlanDates(connection, [Number(id)]);
    }

    const planIdsToRefresh = [...new Set([currentPlanId, nextPlanId].filter(Boolean))];
    for (const planIdToRefresh of planIdsToRefresh) {
      const [remainingTasks] = await connection.query(
        `SELECT COUNT(*) as active_count
         FROM production_tasks
         WHERE plan_id = ? AND deleted_at IS NULL AND status != ?`,
        [planIdToRefresh, TASK_STATUS.CANCELLED]
      );

      if (Number(remainingTasks[0]?.active_count || 0) === 0) {
        await connection.query(
          `UPDATE production_plans
           SET status = 'draft'
            WHERE id = ? AND deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')`,
          [planIdToRefresh]
        );
      } else {
        await syncPlanStatus(planIdToRefresh, connection);
      }
    }

    await connection.commit();

    return ResponseHandler.success(res, null, '生产任务更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新生产任务失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除生产任务
 */
exports.deleteProductionTask = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', id, '无权删除该生产任务'))) {
      return;
    }

    await connection.beginTransaction();

    const task = await TaskRepository.findById(connection, id, true);

    if (!task) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const deletableStatuses = [TASK_STATUS.PENDING, TASK_STATUS.ALLOCATED];
    if (!deletableStatuses.includes(task.status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '只能删除未开始或已分配但尚未执行的生产任务',
        'VALIDATION_ERROR',
        400
      );
    }

    const usage = await TaskRepository.checkDownstreamDocuments(connection, id);
    if (usage.outbound_count > 0 || usage.report_count > 0 || usage.inspection_count > 0) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '任务已产生发料、报工或检验单据，不能删除，请走取消/关闭流程',
        'VALIDATION_ERROR',
        400
      );
    }

    await TaskRepository.deleteWithRelated(connection, id);

    if (task.plan_id) {
      await TaskRepository.decrementPlanPushedQuantity(
        connection,
        task.plan_id,
        Number(task.quantity) || 0
      );

      const activeCount = await TaskRepository.countActivePlanTasks(
        connection,
        task.plan_id,
        TASK_STATUS.CANCELLED
      );
      if (activeCount === 0) {
        await TaskRepository.updatePlanStatus(connection, task.plan_id, 'draft');
      } else {
        await syncPlanStatus(task.plan_id, connection);
      }
    }
    await connection.commit();

    return ResponseHandler.success(res, null, '生产任务删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除生产任务失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取生产任务详情
 */
exports.getProductionTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    const ScopeGuard = require('../../../authorization/ScopeGuard');
    if (!(await ScopeGuard.denyUnlessAccess(res, pool, req, 'production_task', id, '无权访问该生产任务', { accessMode: 'read' }))) {
      return;
    }

    const task = await TaskRepository.findByIdWithDetails(id);
    if (!task) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const processes = await TaskRepository.findProcessesByTaskId(id);
    const { productionTaskMap } = require('../../../utils/production/productionFieldMap');

    return ResponseHandler.success(
      res,
      productionTaskMap.toApi({
        ...task,
        processes,
      })
    );
  } catch (error) {
    logger.error('获取生产任务详情失败:', error);
    handleError(res, error);
  }
};

/**
 * 更新生产任务进度
 */
exports.updateProductionTaskProgress = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', id, '无权修改该生产任务'))) {
      return;
    }
    await connection.beginTransaction();
    const { progress, completed_quantity } = mapKeysToSnake(req.body || {});

    const [taskCheck] = await connection.query(
      'SELECT id, code, status, quantity, completed_quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
      [id]
    );

    if (taskCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const task = taskCheck[0];
    if (task.status !== TASK_STATUS.IN_PROGRESS) {
      await connection.rollback();
      return ResponseHandler.error(res, '只有生产中的任务可以调整进度', 'INVALID_STATUS', 400);
    }

    const numericProgress = Number(progress);
    if (!Number.isFinite(numericProgress) || numericProgress < 0 || numericProgress > 99) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '进度必须在 0 到 99 之间；完工请走报工/完工流程',
        'VALIDATION_ERROR',
        400
      );
    }

    if (
      completed_quantity !== undefined &&
      Number(completed_quantity) !== Number(task.completed_quantity || 0)
    ) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '完工数量由报工/完工流程自动维护，不能通过进度接口直接修改',
        'VALIDATION_ERROR',
        400
      );
    }

    await connection.query(
      'UPDATE production_tasks SET progress = ? WHERE id = ? AND deleted_at IS NULL',
      [numericProgress, id]
    );

    await connection.commit();

    return ResponseHandler.success(res, null, '生产任务进度更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新生产任务进度失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新生产任务状态
 */
exports.updateProductionTaskStatus = async (req, res) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    const { id } = req.params;
    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', id, '无权变更该生产任务状态'))) {
      return;
    }
    await connection.beginTransaction();
    transactionStarted = true;
    let { status } = req.body;

    // 兼容前端的驼峰命名，统一转换为下划线命名
    const originalStatus = status;
    status = dbStatusToApiStatus(status, 'productionTask');

    if (originalStatus !== status) {
      logger.info(`[状态更新] 任务ID: ${id}, 原始状态: ${originalStatus}, 转换后: ${status}`);
    }

    const validStatuses = Object.values(TASK_STATUS);
    if (!validStatuses.includes(status)) {
      await connection.rollback();
      transactionStarted = false;
      return ResponseHandler.error(
        res,
        `无效的状态值: ${req.body.status}`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 完工必须走 completeTask + 终检 + 入库，禁止 PUT 状态直达 completed
    if (status === TASK_STATUS.COMPLETED) {
      await connection.rollback();
      transactionStarted = false;
      return ResponseHandler.error(
        res,
        '禁止通过状态接口直接完工。请使用完工报工(completeTask)，终检通过后再做生产入库。',
        'INVALID_TRANSITION',
        400
      );
    }

    const [taskCheck] = await connection.query(
      `SELECT pt.*, pp.id as plan_id
       FROM production_tasks pt
       LEFT JOIN production_plans pp ON pt.plan_id = pp.id AND pp.deleted_at IS NULL
       WHERE pt.id = ? AND pt.deleted_at IS NULL
       FOR UPDATE`,
      [id]
    );

    if (taskCheck.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const dbStatus = apiStatusToDbStatus(status, 'productionTask');
    logger.info(`[状态转换] 任务ID: ${id}, API状态: ${status}, 数据库状态: ${dbStatus}`);

    const currentStatus = taskCheck[0].status;
    const transitionCheck = validateTaskTransition(currentStatus, dbStatus);
    if (!transitionCheck.valid) {
      await connection.rollback();
      transactionStarted = false;
      return ResponseHandler.error(res, transitionCheck.message, 'INVALID_TRANSITION', 400);
    }

    // 手动请求 inspection：校验工序是否完成，但不自动过检/不计成本/不入账
    if (status === TASK_STATUS.INSPECTION) {
      const [processes] = await connection.query(
        'SELECT COUNT(*) as total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as completed FROM production_processes WHERE task_id = ?',
        [PRODUCTION_STATUS_KEYS.COMPLETED, id]
      );
      const { total, completed } = processes[0];
      if (total > 0 && completed < total) {
        await connection.rollback();
        transactionStarted = false;
        return ResponseHandler.error(
          res,
          `任务还有未完成的工序（${completed}/${total}），请先完成所有工序`,
          'VALIDATION_ERROR',
          400
        );
      }
    }

    logger.info(`[执行更新] 任务ID: ${id}, 最终数据库状态: ${dbStatus}`);
    await connection.query(
      'UPDATE production_tasks SET status = ? WHERE id = ? AND deleted_at IS NULL',
      [dbStatus, id]
    );

    const taskData = taskCheck[0];
    const planId = taskData.plan_id;

    // 任务状态更新为生产中时，自动创建首检单
    if (status === TASK_STATUS.IN_PROGRESS) {
      try {
        // 检查是否已经存在首检单
        const [existingFirstArticle] = await connection.query(
          'SELECT id FROM quality_inspections WHERE inspection_type = ? AND task_id = ? AND deleted_at IS NULL',
          ['first_article', id]
        );

        if (existingFirstArticle.length === 0) {
          // 获取产品的首检规则
          const [rules] = await connection.query(
            'SELECT id, product_id, first_article_qty, full_inspection_threshold, template_id, is_mandatory, inspection_items, note, created_at, updated_at FROM first_article_rules WHERE product_id = ?',
            [taskData.product_id]
          );

          const rule = rules[0] || {
            first_article_qty: 5,
            full_inspection_threshold: 5,
            template_id: null,
          };

          // 计算首检数量
          const productionQty = taskData.quantity || 0;
          const isFullInspection = productionQty < rule.full_inspection_threshold;
          const firstArticleQty = isFullInspection ? productionQty : rule.first_article_qty;

          // 获取产品信息
          const [productInfo] = await connection.query(
            `SELECT m.code, m.name, m.unit_id, u.name AS unit_name
             FROM materials m
             LEFT JOIN units u ON m.unit_id = u.id
             WHERE m.id = ? AND m.deleted_at IS NULL`,
            [taskData.product_id]
          );
          const product = productInfo[0] || {};

          // 创建首检单，并通过统一模板解析器复制模板检验项
          const firstArticleInspection = await QualityInspection.createInspection(
            {
              inspection_type: 'first_article',
              task_id: id,
              reference_id: id,
              reference_no: taskData.code,
              product_id: taskData.product_id,
              product_code: product.code || '',
              product_name: product.name || '',
              batch_no: await generateBatchNo(taskData.code, connection),
              quantity: firstArticleQty,
              unit: product.unit_name || '个',
              unit_id: product.unit_id || null,
              planned_date: new Date(),
              status: 'pending',
              is_first_article: true,
              first_article_qty: firstArticleQty,
              is_full_inspection: isFullInspection,
              first_article_result: 'pending',
              production_can_continue: false,
              template_id: rule.template_id || null,
              note: isFullInspection
                ? 'Auto-created when production task started (full first-article inspection)'
                : 'Auto-created when production task started (sample first-article inspection)',
            },
            connection
          );

          logger.info('自动创建首检单成功', {
            taskId: id,
            inspectionNo: firstArticleInspection.inspection_no,
            firstArticleQty,
            isFullInspection,
          });
        } else {
          logger.info('首检单已存在，跳过创建', { taskId: id });
        }
      } catch (faError) {
        logger.error('自动创建首检单失败:', faError);
        throw faError;
      }

      // === 自动创建过程检验记录 ===
      try {
        // 检查是否已经存在过程检验记录
        const [existingProcessInspection] = await connection.query(
          'SELECT id FROM quality_inspections WHERE inspection_type = ? AND task_id = ? AND deleted_at IS NULL',
          ['process', id]
        );

        if (existingProcessInspection.length === 0) {
          // 获取产品的过程检验规则
          const [processRules] = await connection.query(
            'SELECT id, process_id, product_id, inspection_interval, sample_rate, punch_interval, template_id, is_enabled, note, created_at, updated_at FROM process_inspection_rules WHERE is_enabled = 1 AND (product_id = ? OR product_id IS NULL) ORDER BY product_id DESC LIMIT 1',
            [taskData.product_id]
          );

          if (processRules.length === 0) {
            throw new BusinessError('产品未配置过程检验规则，无法启动生产任务', {
              route: '/quality/process-inspection',
              buttonText: '配置过程检验规则',
            });
          }
          const processRule = processRules[0];

          // 获取生产任务的第一个工序名称
          const [firstProcess] = await connection.query(
            'SELECT id, process_name FROM production_processes WHERE task_id = ? ORDER BY sequence ASC LIMIT 1',
            [id]
          );
          const processName = firstProcess[0]?.process_name || '生产过程';

          // 创建过程检验记录
          // 获取产品信息
          const [productInfo] = await connection.query(
            `SELECT m.code, m.name, m.unit_id, u.name AS unit_name
             FROM materials m
             LEFT JOIN units u ON m.unit_id = u.id
             WHERE m.id = ? AND m.deleted_at IS NULL`,
            [taskData.product_id]
          );
          const product = productInfo[0] || {};

          // 计算抽检数量
          const sampleRate = Number(processRule.sample_rate) || 100;
          const sampleQty = Math.max(1, Math.ceil(taskData.quantity * (sampleRate / 100)));

          const processInspection = await QualityInspection.createInspection(
            {
              inspection_type: 'process',
              task_id: id,
              reference_id: id,
              reference_no: taskData.code,
              product_id: taskData.product_id,
              product_code: product.code || '',
              product_name: product.name || '',
              process_id: firstProcess[0]?.id || processRule.process_id || null,
              process_name: processName,
              batch_no: await generateBatchNo(taskData.code, connection),
              quantity: sampleQty,
              unit: product.unit_name || 'pcs',
              unit_id: product.unit_id || null,
              planned_date: new Date(),
              status: 'pending',
              template_id: processRule.template_id || null,
              note: `Auto-created when production task started (sample rate ${sampleRate}%)`,
            },
            connection
          );

          logger.info('自动创建过程检验记录成功', {
            taskId: id,
            inspectionNo: processInspection.inspection_no,
            processName,
            sampleQty,
            sampleRate,
          });
        } else {
          logger.info('过程检验记录已存在，跳过创建', { taskId: id });
        }
      } catch (processError) {
        logger.error('自动创建过程检验记录失败:', processError);
        throw processError;
      }
    }

    // 任务状态更新为待检验或完成时，在事务内创建检验单
    if (status === TASK_STATUS.INSPECTION || status === TASK_STATUS.COMPLETED) {
      try {
        // 检查是否已经存在检验单（成品检验类型，reference_id为任务ID）
        const [existingInspection] = await connection.query(
          'SELECT id FROM quality_inspections WHERE inspection_type = ? AND reference_id = ? AND deleted_at IS NULL',
          ['final', id]
        );

        // 如果不存在检验单，则创建
        if (existingInspection.length === 0) {
          // 直接使用模型创建检验单
          await QualityInspection.createInspection(
            {
              inspection_type: 'final',
              reference_id: id,
              reference_no: taskData.code,
              task_id: id,
              product_id: taskData.product_id,
              batch_no: await generateBatchNo(taskData.code, connection),
              quantity: taskData.quantity || 0,
              unit: '个',
              planned_date: new Date(),
              status: PROC_STATUS.PENDING,
              note: '生产任务完成时自动创建',
            },
            connection
          );
          logger.info('自动创建检验单成功', { taskId: id });
        } else {
          logger.info('检验单已存在，跳过创建', {
            taskId: id,
            inspectionId: existingInspection[0].id,
          });
        }
      } catch (inspError) {
        logger.error('自动创建检验单失败:', inspError);
        throw inspError;
      }
    }

    // 计划状态同步
    if (planId) {
      await syncPlanStatus(planId, connection);
    }

    // 状态 PUT 仅做生命周期流转与必要的检验单创建。
    // 禁止：自动过检、满产报工、成本核算、成品库存入账（由 completeTask / 入库确认负责）。

    await connection.commit();
    transactionStarted = false;

    return ResponseHandler.success(res, {
      message: '生产任务状态更新成功',
      status,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch {
        // ignore
      }
    }
    logger.error('更新生产任务状态失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取待办任务列表（用于仪表盘）
 */
exports.getPendingTasks = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));
    const pendingTaskStatuses = [
      PRODUCTION_STATUS_KEYS.PENDING,
      PRODUCTION_STATUS_KEYS.IN_PROGRESS,
    ];
    const scopeClause = await ScopeGuard.applyListScope(req, 'production_task', {
      tableAlias: 'pt',
      ownerAlias: 'production_pending_task_owner_scope',
      accessMode: 'read',
    });

    const query = `
      SELECT
        pt.id,
        pt.code,
        pt.status,
        pt.quantity,
        pt.start_date,
        pt.expected_end_date,
        m.name as productName
      FROM production_tasks pt
      LEFT JOIN materials m ON pt.product_id = m.id
      ${scopeClause.join || ''}
      WHERE pt.deleted_at IS NULL AND pt.status IN (?)${scopeClause.where || ''}
      ORDER BY pt.expected_end_date ASC
      LIMIT ?
    `;

    // LIMIT 使用参数化查询
    const [tasks] = await pool.query(query, [pendingTaskStatuses, ...(scopeClause.params || []), safeLimit]);
    return ResponseHandler.success(res, tasks);
  } catch (error) {
    logger.error('获取待办任务失败:', error);
    handleError(res, error);
  }
};

/**
 * 完工任务（支持部分完工）
 * @description 记录本次完工数量，累加到 completed_quantity。
 *              当 completed_quantity >= quantity 时，任务状态变为 inspection（待检验）
 */
exports.completeTask = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { quantity, remark } = req.body;

    if (!(await ScopeGuard.denyUnlessAccess(res, connection, req, 'production_task', id, '无权完工该生产任务'))) {
      return;
    }

    if (!quantity || quantity <= 0) {
      return ResponseHandler.error(res, '请输入有效的完工数量', 'VALIDATION_ERROR', 400);
    }

    await connection.beginTransaction();
    const warnings = [];

    // 第一性原理防御：获取当前任务信息并开启悲观排他锁，防并发完工超卖
    const [tasks] = await connection.query(
      `SELECT pt.id, pt.code, pt.quantity, pt.completed_quantity, pt.status, pt.plan_id
       FROM production_tasks pt
       WHERE pt.id = ? AND pt.deleted_at IS NULL FOR UPDATE`,
      [id]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '任务不存在', 'NOT_FOUND', 404);
    }

    const task = tasks[0];
    if (task.status !== TASK_STATUS.IN_PROGRESS) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '任务必须先进入生产中状态，完成首检/过程检流转后才能完工',
        'INVALID_STATUS',
        400
      );
    }

    const totalQuantity = Number(task.quantity) || 0;
    const currentCompleted = Number(task.completed_quantity) || 0;
    const remaining = totalQuantity - currentCompleted;

    if (quantity > remaining) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `完工数量不能超过剩余数量 ${remaining}`,
        'VALIDATION_ERROR',
        400
      );
    }

    const newCompletedQuantity = currentCompleted + Number(quantity);
    const isFullComplete = newCompletedQuantity >= totalQuantity;

    // 先写完工数量；满产时经生命周期服务进入待检（状态机 + 首检/过程检守卫）
    await connection.query(
      'UPDATE production_tasks SET completed_quantity = ? WHERE id = ? AND deleted_at IS NULL',
      [newCompletedQuantity, id]
    );

    if (isFullComplete) {
      try {
        await promoteTaskToInspection(connection, id, {
          setCompletedQuantityToPlan: false,
          requireOpenInspectionClear: true,
        });
      } catch (promoteErr) {
        if (promoteErr.code === 'OPEN_INSPECTIONS') {
          throw new BusinessError(promoteErr.message, {
            route: `/quality/process?taskId=${id}`,
            buttonText: '去处理检验单',
          });
        }
        throw promoteErr;
      }
    }

    // 记录完工日志（可选）
    logger.info(
      `任务 ${task.code} 完工 ${quantity} 件，累计 ${newCompletedQuantity}/${totalQuantity}，备注: ${remark || '无'}`
    );

    // 每次完工都创建成品检验单（包括部分完工）
    try {
      // 获取任务详情用于创建检验单（包含单位信息）
      const [taskDetails] = await connection.query(
        `
        SELECT pt.*, m.name as product_name, m.code as product_code, m.unit_id, u.name as unit_name
        FROM production_tasks pt
        LEFT JOIN materials m ON pt.product_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE pt.id = ? AND pt.deleted_at IS NULL
      `,
        [id]
      );

      if (taskDetails.length > 0) {
        const taskDetail = taskDetails[0];

        // 使用 QualityInspection.createInspection 创建成品检验单
        await QualityInspection.createInspection(
          {
            inspection_type: 'final', // 成品检验
            reference_no: task.code, // 关联生产任务编号
            reference_id: id, // 关联生产任务ID
            task_id: id, // 显式传入任务ID
            product_id: taskDetail.product_id,
            product_name: taskDetail.product_name,
            product_code: taskDetail.product_code,
            quantity: Number(quantity), // 本次完工数量
            unit: taskDetail.unit_name || '件', // 单位
            unit_id: taskDetail.unit_id || null, // 单位ID
            batch_no: taskDetail.batch_no || (await generateBatchNo(task.code, connection)),
            planned_date: new Date(), // 计划检验日期（当天）
            inspection_date: new Date(), // 检验日期
            status: PROC_STATUS.PENDING, // 待检验状态
            remark:
              remark ||
              `生产任务 ${task.code} 完工 ${quantity} 件${isFullComplete ? '（全部完工）' : '（部分完工）'}`,
          },
          connection
        );

        logger.info(`任务 ${task.code} 完工 ${quantity} 件，已自动创建成品检验单`);
      }
    } catch (inspectionError) {
      logger.error(`创建检验单失败，完工流程已回滚: ${inspectionError.message}`);
      throw inspectionError;
    }

    // ===== 自动创建报工记录 =====
    try {
      const reportNo = await CodeGenerators.generateReportCode(connection);
      // 尝试获取当前用户，如果不可用则使用默认值
      const operatorId = getAuthenticatedUserId(req);
      const operatorName = await getCurrentUserName(req);

      // 从工序表中获取标准工时合计
      let estimatedHours = 0;
      try {
        const [processHours] = await connection.query(
          'SELECT COALESCE(SUM(standard_hours), 0) as total_hours FROM production_processes WHERE task_id = ?',
          [id]
        );
        const hoursPerUnit = parseFloat(processHours[0]?.total_hours) || 0;
        estimatedHours = hoursPerUnit * Number(quantity);
      } catch (phErr) {
        throw new Error(`获取工序标准工时失败: ${phErr.message}`, { cause: phErr });
      }

      if (estimatedHours <= 0) {
        throw new Error(
          '工序标准工时未配置，无法自动创建报工记录，请先在【基础数据 - 工序管理】中配置工时'
        );
      } else {
        await connection.query(
          `INSERT INTO production_reports
           (report_no, task_id, operator_id, operator_name, report_time, report_quantity,
            completed_quantity, qualified_quantity, defective_quantity, unqualified_quantity,
            work_hours, remarks, created_at)
           VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 0, 0, ?, ?, NOW())`,
          [
            reportNo,
            id,
            operatorId,
            operatorName,
            quantity,
            quantity,
            quantity,
            estimatedHours,
            `自动完工生成: ${remark || ''}`,
          ]
        );
        logger.info(`任务 ${task.code} 自动创建报工记录成功，工时: ${estimatedHours}h`);
      }
    } catch (reportError) {
      logger.error('自动创建报工记录失败:', reportError);
      throw reportError;
    }
    // ===== 报工记录结束 =====

    // 使用统一的计划同步服务
    if (isFullComplete && task.plan_id) {
      await syncPlanStatus(task.plan_id, connection);
    }

    const domainEventId = await DomainEventService.enqueue(
      'PRODUCTION_TASK_COMPLETED',
      {
        taskId: parseInt(id, 10),
        taskCode: task.code,
        isFullComplete,
      },
      {
        connection,
        aggregateType: 'production_task',
        aggregateId: id,
        dedupKey: `PRODUCTION_TASK_COMPLETED:${id}:${isFullComplete ? 'full' : 'partial'}`,
      }
    );

    await connection.commit();

    // ===== 异步发射生产完工领域事件（仅本条，不吞积压队列） =====
    DomainEventService.dispatchSoon(domainEventId);
    /*
    setImmediate(() => {
      try {
        const EventBus = require('../../../events/EventBus');
        // legacy direct event emission removed
          taskId: parseInt(id),
          taskCode: task.code,
          isFullComplete: isFullComplete
        });
        logger.info(`[completeTask] 任务 ${task.code} 完工流程数据库事务已提交，已向总线发送核算事件`);
      } catch (emitErr) {
        logger.error(`[completeTask] 触发 PRODUCTION_TASK_COMPLETED 失败:`, emitErr);
      }
    });

    // 如有警告，异步发送管理员通知（不阻断响应）
    */
    if (warnings.length > 0) {
      setImmediate(async () => {
        try {
          await NotificationService.notifyByPermissions(['production:tasks:update'], {
            type: 'warning',
            title: `完工任务 ${task.code} 发现数据缺失`,
            content: warnings.join('\n'),
            link: '/basedata/processes',
            priority: 1,
            sourceType: 'production_complete_warning',
            sourceId: id,
          });
        } catch (notifyErr) {
          logger.warn(`发送管理员通知失败: ${notifyErr.message}`);
        }
      });
    }

    const responseData = {
      taskId: id,
      completedQuantity: newCompletedQuantity,
      totalQuantity: totalQuantity,
      remaining: totalQuantity - newCompletedQuantity,
      isFullComplete,
    };
    if (warnings.length > 0) {
      responseData.warnings = warnings;
    }

    const message =
      warnings.length > 0
        ? isFullComplete
          ? '全部完工，但有注意事项需要处理'
          : `本次完工 ${quantity} 件，但有注意事项需要处理`
        : isFullComplete
          ? '全部完工，已创建检验单'
          : `本次完工 ${quantity} 件`;
    return ResponseHandler.success(res, responseData, message);
  } catch (error) {
    await connection.rollback();
    logger.error('完工失败:', error);
    handleError(res, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取生产任务的BOM清单（用于补料选择）
 */
exports.getProductionTaskBom = async (req, res) => {
  try {
    const { id } = req.params;

    if (!(await ScopeGuard.denyUnlessAccess(res, pool, req, 'production_task', id, '无权访问该生产任务', { accessMode: 'read' }))) {
      return;
    }

    // 1. 获取任务信息
    const [tasks] = await pool.query(
      'SELECT product_id, quantity FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (tasks.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const task = tasks[0];
    const productId = task.product_id;

    // 2. 获取已审核的BOM
    const bom = await BomExplosionService.getLatestApprovedBom(productId);

    if (!bom) {
      return ResponseHandler.success(res, [], '该产品尚未关联已审核的BOM');
    }

    const bomId = bom.id;

    // 3. 获取BOM明细及当前库存
    // 关联 inventory_ledger 获取当前库存
    const query = `
      SELECT
        bd.material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as material_specs,
        bd.quantity as unit_usage,
        (bd.quantity * ?) as plan_quantity,
        u.name as unit_name,
        u.id as unit_id,
        COALESCE(s.quantity, 0) as stock_quantity
      FROM bom_details bd
      JOIN materials m ON bd.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN (
        SELECT il.material_id, SUM(il.quantity) as quantity
        FROM inventory_ledger il
        JOIN materials mat ON il.material_id = mat.id
        WHERE mat.location_id IS NULL OR il.location_id = mat.location_id
        GROUP BY il.material_id
        HAVING SUM(il.quantity) > 0
      ) s ON m.id = s.material_id
      WHERE bd.bom_id = ?
      ORDER BY m.code
    `;

    const [bomItems] = await pool.query(query, [task.quantity, bomId]);

    ResponseHandler.success(res, bomItems);
  } catch (error) {
    logger.error('获取任务BOM清单失败:', error);
    handleError(res, error);
  }
};
