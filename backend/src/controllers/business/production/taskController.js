/**
 * taskController.js
 * @description 生产任务控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { CodeGenerators } = require('../../../utils/codeGenerator');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const BusinessError = require('../../../utils/BusinessError');
const QualityInspection = require('../../../models/qualityInspection');
const { PRODUCTION_STATUS_KEYS } = require('../../../constants/systemConstants');
const {
  apiStatusToDbStatus,
  dbStatusToApiStatus,
  getStatusConstants,
} = require('../../../utils/statusMapper');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');

// 状态常量
const STATUS = {
  PRODUCTION_TASK: businessConfig.status.productionTask,
  PRODUCTION_PLAN: businessConfig.status.productionPlan,
};

/**
 * 构建通用查询过滤条件（去除主查询/计数/统计三处重复的 WHERE 条件逻辑）
 * @param {Object} params - 查询参数
 * @returns {{ whereClause: string, queryParams: Array }} SQL WHERE 片段和参数数组
 */
function buildFilterConditions(params) {
  const { status, statusList, code, product, keyword, manager, startDate, endDate } = params;
  let whereClause = '';
  const queryParams = [];

  // 状态过滤
  if (statusList) {
    const statuses = statusList.split(',').map((s) => s.trim());
    const placeholders = statuses.map(() => '?').join(',');
    whereClause += ` AND pt.status IN (${placeholders})`;
    queryParams.push(...statuses);
  } else if (status) {
    if (Array.isArray(status)) {
      const placeholders = status.map(() => '?').join(',');
      whereClause += ` AND pt.status IN (${placeholders})`;
      queryParams.push(...status);
    } else {
      whereClause += ' AND pt.status = ?';
      queryParams.push(status);
    }
  }

  // 关键词搜索
  if (keyword) {
    whereClause += ' AND (pt.code LIKE ? OR p.name LIKE ? OR p.code LIKE ? OR p.specs LIKE ?)';
    queryParams.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  } else {
    if (code) {
      whereClause += ' AND pt.code LIKE ?';
      queryParams.push(`%${code}%`);
    }
    if (product) {
      whereClause += ' AND (p.name LIKE ? OR p.code LIKE ? OR p.specs LIKE ?)';
      queryParams.push(`%${product}%`, `%${product}%`, `%${product}%`);
    }
  }

  // 负责人筛选
  if (manager) {
    whereClause += ' AND pt.manager LIKE ?';
    queryParams.push(`%${manager}%`);
  }

  // 时间范围筛选
  if (startDate) {
    whereClause += ' AND DATE(pt.created_at) >= ?';
    queryParams.push(startDate);
  }
  if (endDate) {
    whereClause += ' AND DATE(pt.created_at) <= ?';
    queryParams.push(endDate);
  }

  return { whereClause, queryParams };
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
    res.json({ code });
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
    // 获取所有有负责人的生产任务的负责人列表（去重）
    const [managers] = await pool.query(`
      SELECT DISTINCT manager
      FROM production_tasks
      WHERE manager IS NOT NULL AND manager != ''
      ORDER BY manager ASC
    `);

    res.json({
      success: true,
      data: managers.map((m) => m.manager),
    });
  } catch (error) {
    logger.error('获取负责人列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取负责人列表失败',
    });
  }
};

/**
 * 获取生产任务列表
 */
exports.getProductionTasks = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    // 使用公共函数构建过滤条件
    const { whereClause, queryParams } = buildFilterConditions(req.query);

    // 主查询
    const query = `
      SELECT pt.*, pp.name as planName, pp.code as plan_code, pp.contract_code, p.name as productName, p.code as productCode, p.specs,
             u.name as unit,
             DATE_FORMAT(pt.actual_start_time, '%Y-%m-%d %H:%i:%s') as actual_start_time,
             EXISTS (
               SELECT 1 FROM inventory_outbound o 
               WHERE (o.production_task_id = pt.id OR (o.reference_type = 'production_task' AND o.reference_id = pt.id))
               AND o.status != 'cancelled'
             ) as has_outbound_document
      FROM production_tasks pt
      LEFT JOIN production_plans pp ON pt.plan_id = pp.id
      LEFT JOIN materials p ON pt.product_id = p.id
      LEFT JOIN units u ON p.unit_id = u.id
      WHERE 1=1 ${whereClause}
      ORDER BY pt.created_at DESC LIMIT ? OFFSET ?
    `;

    // ✅ 审计修复: LIMIT/OFFSET 参数化查询
    queryParams.push(parseInt(pageSize, 10), offset);
    const [tasks] = await pool.query(query, queryParams);

    // 如果有任务，一次性获取所有任务的工序数据（优化N+1查询问题）
    if (tasks.length > 0) {
      const taskIds = tasks.map((task) => task.id);
      const placeholders = taskIds.map(() => '?').join(',');

      const processQuery = `
        SELECT
          pp.*,
          DATE_FORMAT(pp.planned_start_time, '%Y-%m-%d %H:%i:%s') as plannedStartTime,
          DATE_FORMAT(pp.planned_end_time, '%Y-%m-%d %H:%i:%s') as plannedEndTime,
          DATE_FORMAT(pp.actual_start_time, '%Y-%m-%d %H:%i:%s') as actualStartTime,
          DATE_FORMAT(pp.actual_end_time, '%Y-%m-%d %H:%i:%s') as actualEndTime
        FROM production_processes pp
        WHERE pp.task_id IN (${placeholders})
        ORDER BY pp.task_id, pp.sequence
      `;

      const [processes] = await pool.query(processQuery, taskIds);

      const processesMap = {};
      processes.forEach((process) => {
        if (!processesMap[process.task_id]) {
          processesMap[process.task_id] = [];
        }
        processesMap[process.task_id].push({
          ...process,
          processName: process.process_name,
          plannedStartTime: process.plannedStartTime,
          plannedEndTime: process.plannedEndTime,
          actualStartTime: process.actualStartTime,
          actualEndTime: process.actualEndTime,
        });
      });

      tasks.forEach((task) => {
        task.processes = processesMap[task.id] || [];
      });
    }

    // 计数查询
    const countQuery = `SELECT COUNT(*) as total FROM production_tasks pt
      LEFT JOIN materials p ON pt.product_id = p.id
      WHERE 1=1 ${whereClause}`;
    const [totalResult] = await pool.query(countQuery, [...queryParams]);
    const total = totalResult[0].total;

    // 统计查询
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.PENDING}' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.PREPARING}' THEN 1 ELSE 0 END) as preparing,
        SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED}' THEN 1 ELSE 0 END) as material_issued,
        SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.CANCELLED}' THEN 1 ELSE 0 END) as cancelled
      FROM production_tasks pt
      LEFT JOIN materials p ON pt.product_id = p.id
      WHERE 1=1 ${whereClause}
    `;
    const [statsResult] = await pool.query(statsQuery, [...queryParams]);
    const statistics = statsResult[0] || {
      total: 0,
      pending: 0,
      preparing: 0,
      material_issued: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
    };

    res.json({
      items: tasks,
      total,
      page,
      pageSize,
      statistics,
    });
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

    const {
      plan_id,
      product_id,
      quantity,
      start_date,
      expected_end_date,
      manager,
      remarks,
      process_template_id,
    } = req.body;

    const code = await CodeGenerators.generateTaskCode(connection);

    if (plan_id) {
      const [planCheck] = await connection.query(
        'SELECT id, status, product_id, quantity FROM production_plans WHERE id = ?',
        [plan_id]
      );

      if (planCheck.length === 0) {
        return ResponseHandler.error(res, '生产计划不存在', 'NOT_FOUND', 404);
      }
    }

    // 根据产品的生产组自动获取对应的成本中心
    let costCenterId = null;
    if (product_id) {
      const [ccResult] = await connection.query(
        `
                SELECT cc.id as cost_center_id
                FROM materials m
                JOIN cost_centers cc ON cc.department_id = m.production_group_id
                WHERE m.id = ?
            `,
        [product_id]
      );
      if (ccResult.length > 0) {
        costCenterId = ccResult[0].cost_center_id;
      }
    }

    const [taskResult] = await connection.query(
      `
      INSERT INTO production_tasks
      (code, plan_id, product_id, quantity, start_date, expected_end_date, manager, remarks, cost_center_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'allocated')
    `,
      [
        code,
        plan_id || null,
        product_id,
        quantity,
        start_date,
        expected_end_date,
        manager || '未分配',
        remarks || '',
        costCenterId,
      ]
    );

    const taskId = taskResult.insertId;

    // 如果没有指定工序模板ID，尝试根据产品ID自动查找关联的工序模板
    let effectiveTemplateId = process_template_id;
    if (!effectiveTemplateId && product_id) {
      const [autoTemplates] = await connection.query(
        'SELECT id FROM process_templates WHERE product_id = ? AND status = 1 ORDER BY created_at DESC LIMIT 1',
        [product_id]
      );
      if (autoTemplates.length > 0) {
        effectiveTemplateId = autoTemplates[0].id;
        logger.info(`任务 ${code} 自动关联工序模板: ${effectiveTemplateId}`);
      }
    }

    if (effectiveTemplateId) {
      const [templates] = await connection.query('SELECT * FROM process_templates WHERE id = ?', [
        effectiveTemplateId,
      ]);

      if (templates.length === 0) {
        logger.warn(`指定的工序模板 ${effectiveTemplateId} 不存在`);
      } else {
        const [steps] = await connection.query(
          'SELECT * FROM process_template_details WHERE template_id = ? ORDER BY order_num',
          [effectiveTemplateId]
        );

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
              quantity,
              0,
              step.standard_hours || 0, // 从工序模板同步标准工时
              step.description || '',
              step.remark || '',
            ]
          );
        }
        logger.info(`任务 ${code} 已加载 ${steps.length} 道工序`);
      }
    }

    // 更新关联的生产计划状态
    if (plan_id) {
      // 查询计划当前状态
      const [planInfo] = await connection.query(
        'SELECT status FROM production_plans WHERE id = ?',
        [plan_id]
      );

      if (planInfo.length > 0) {
        const currentStatus = planInfo[0].status;

        // 如果计划是草稿状态，更新为分配中
        if (currentStatus === 'draft') {
          await connection.query('UPDATE production_plans SET status = \"allocated\" WHERE id = ?', [
            plan_id,
          ]);
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
    await connection.beginTransaction();

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
    } = req.body;

    const [taskCheck] = await connection.query(
      'SELECT id, status FROM production_tasks WHERE id = ?',
      [id]
    );

    if (taskCheck.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    if (
      taskCheck[0].status === STATUS.PRODUCTION_TASK.COMPLETED ||
      taskCheck[0].status === STATUS.PRODUCTION_TASK.CANCELLED
    ) {
      return ResponseHandler.error(res, '已完成或已取消的任务不能修改', 'BAD_REQUEST', 400);
    }

    // 如果有状态更新，需要转换为数据库ENUM格式（混合命名）
    let dbStatus = null;
    if (status) {
      // 使用 statusMapper 工具进行状态转换
      dbStatus = apiStatusToDbStatus(status, 'productionTask');
    }

    // 如果产品变更，同步更新成本中心
    let costCenterId = null;
    if (product_id) {
      const [ccResult] = await connection.query(
        `
                SELECT cc.id as cost_center_id
                FROM materials m
                JOIN cost_centers cc ON cc.department_id = m.production_group_id
                WHERE m.id = ?
            `,
        [product_id]
      );
      if (ccResult.length > 0) {
        costCenterId = ccResult[0].cost_center_id;
      }
    }

    await connection.query(
      `
      UPDATE production_tasks 
      SET plan_id = ?, product_id = ?, quantity = ?, start_date = ?, 
          expected_end_date = ?, manager = ?, remarks = ?, cost_center_id = ?, status = IFNULL(?, status)
      WHERE id = ?
    `,
      [
        plan_id || null,
        product_id,
        quantity,
        start_date,
        expected_end_date,
        manager,
        remarks || '',
        costCenterId,
        dbStatus,
        id,
      ]
    );

    await connection.commit();

    res.json({ message: '生产任务更新成功' });
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
    await connection.beginTransaction();

    const { id } = req.params;

    const [taskCheck] = await connection.query(
      'SELECT id, status FROM production_tasks WHERE id = ?',
      [id]
    );

    if (taskCheck.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    if (taskCheck[0].status !== 'pending') {
      return ResponseHandler.error(res, '只能删除待生产状态的任务', 'BAD_REQUEST', 400);
    }

    await connection.query('DELETE FROM production_processes WHERE task_id = ?', [id]);
    await connection.query('DELETE FROM production_reports WHERE task_id = ?', [id]);
    await connection.query('DELETE FROM production_tasks WHERE id = ?', [id]);

    await connection.commit();

    res.json({ message: '生产任务删除成功' });
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

    const [tasks] = await pool.query(
      `
      SELECT pt.*, pp.name as planName, pp.contract_code, p.name as productName, p.code as productCode,
             p.specs as specification, u.name as unit
      FROM production_tasks pt
      LEFT JOIN production_plans pp ON pt.plan_id = pp.id
      LEFT JOIN materials p ON pt.product_id = p.id
      LEFT JOIN units u ON p.unit_id = u.id
      WHERE pt.id = ?
    `,
      [id]
    );

    if (tasks.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const [processes] = await pool.query(
      'SELECT * FROM production_processes WHERE task_id = ? ORDER BY sequence',
      [id]
    );

    res.json({
      ...tasks[0],
      processes,
    });
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
    await connection.beginTransaction();

    const { id } = req.params;
    const { progress, completed_quantity } = req.body;

    const [taskCheck] = await connection.query(
      'SELECT id, status FROM production_tasks WHERE id = ?',
      [id]
    );

    if (taskCheck.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    await connection.query(
      `
      UPDATE production_tasks 
      SET progress = ?, completed_quantity = ?
      WHERE id = ?
    `,
      [progress || 0, completed_quantity || 0, id]
    );

    await connection.commit();

    res.json({ message: '生产任务进度更新成功' });
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

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    let { status } = req.body;

    // 兼容前端的驼峰命名，统一转换为下划线命名
    // 使用 statusMapper 工具进行状态转换
    const originalStatus = status;
    status = dbStatusToApiStatus(status, 'productionTask'); // 先转为API格式（下划线）

    // 记录原始状态和转换后的状态
    if (originalStatus !== status) {
      logger.info(`[状态更新] 任务ID: ${id}, 原始状态: ${originalStatus}, 转换后: ${status}`);
    }

    // 验证状态值 - 使用状态常量
    const validStatuses = Object.values(STATUS.PRODUCTION_TASK);
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, `无效的状态值: ${req.body.status}`, 'BAD_REQUEST', 400);
    }

    const [taskCheck] = await connection.query(
      'SELECT pt.*, pp.id as plan_id FROM production_tasks pt LEFT JOIN production_plans pp ON pt.plan_id = pp.id WHERE pt.id = ?',
      [id]
    );

    if (taskCheck.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    // 数据库ENUM定义使用下划线命名，需要转换为数据库格式
    // 使用 statusMapper 工具进行转换
    let dbStatus = apiStatusToDbStatus(status, 'productionTask');
    logger.info(`[状态转换] 任务ID: ${id}, API状态: ${status}, 数据库状态: ${dbStatus}`);

    // 特殊处理：如果用户手动将任务状态更新为completed，需要先检查工序
    if (status === STATUS.PRODUCTION_TASK.COMPLETED) {
      // 检查是否有工序
      const [processes] = await connection.query(
        'SELECT COUNT(*) as total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as completed FROM production_processes WHERE task_id = ?',
        [PRODUCTION_STATUS_KEYS.COMPLETED, id]
      );

      const { total, completed } = processes[0];

      if (total > 0 && completed < total) {
        // 有工序但未全部完成，不允许直接完成任务
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `任务还有未完成的工序（${completed}/${total}），请先完成所有工序`,
          'BAD_REQUEST',
          400
        );
      }

      // 如果没有工序或工序已全部完成，则改为inspection状态（需要先检验）
      dbStatus = apiStatusToDbStatus(STATUS.PRODUCTION_TASK.INSPECTION, 'productionTask');
      logger.info(
        `任务 ${id} 手动完成，自动转为待检验状态（工序: ${completed}/${total}），数据库状态: ${dbStatus}`
      );
    }

    logger.info(`[执行更新] 任务ID: ${id}, 最终数据库状态: ${dbStatus}`);
    await connection.query('UPDATE production_tasks SET status = ? WHERE id = ?', [dbStatus, id]);

    const taskData = taskCheck[0];
    const planId = taskData.plan_id;

    // 任务状态更新为生产中时，自动创建首检单
    if (status === STATUS.PRODUCTION_TASK.IN_PROGRESS) {
      try {
        // 检查是否已经存在首检单
        const [existingFirstArticle] = await connection.query(
          'SELECT id FROM quality_inspections WHERE inspection_type = ? AND task_id = ?',
          ['first_article', id]
        );

        if (existingFirstArticle.length === 0) {
          // 获取产品的首检规则
          const [rules] = await connection.query(
            'SELECT * FROM first_article_rules WHERE product_id = ?',
            [taskData.product_id]
          );

          const rule = rules[0] || {
            first_article_qty: 5,
            full_inspection_threshold: 5,
            is_mandatory: true,
          };

          // 计算首检数量
          const productionQty = taskData.quantity || 0;
          const isFullInspection = productionQty < rule.full_inspection_threshold;
          const firstArticleQty = isFullInspection ? productionQty : rule.first_article_qty;

          // 生成首检单号
          const inspectionNo = `FAI${Date.now()}`;

          // 获取产品信息
          const [productInfo] = await connection.query(
            'SELECT code, name FROM materials WHERE id = ?',
            [taskData.product_id]
          );
          const product = productInfo[0] || {};

          // 创建首检单
          await connection.query(
            `
            INSERT INTO quality_inspections
            (inspection_no, inspection_type, task_id, reference_id, reference_no, product_id, product_code, product_name,
             batch_no, quantity, unit, planned_date, status, is_first_article, first_article_qty,
             is_full_inspection, first_article_result, production_can_continue, template_id, note)
            VALUES (?, 'first_article', ?, ?, ?, ?, ?, ?, ?, ?, '个', NOW(), 'pending', 1, ?, ?, 'pending', 0, ?, ?)
          `,
            [
              inspectionNo,
              id,
              id,
              taskData.code,
              taskData.product_id,
              product.code || '',
              product.name || '',
              `BATCH${Date.now()}`,
              firstArticleQty,
              firstArticleQty,
              isFullInspection,
              rule.template_id || null,
              isFullInspection
                ? '生产任务开始时自动创建（全检）'
                : '生产任务开始时自动创建（抽检）',
            ]
          );

          logger.info('自动创建首检单成功', {
            taskId: id,
            inspectionNo,
            firstArticleQty,
            isFullInspection,
          });
        } else {
          logger.info('首检单已存在，跳过创建', { taskId: id });
        }
      } catch (faError) {
        logger.error('自动创建首检单失败:', faError);
        // 不影响任务状态更新
      }

      // === 自动创建过程检验记录 ===
      try {
        // 检查是否已经存在过程检验记录
        const [existingProcessInspection] = await connection.query(
          'SELECT id FROM quality_inspections WHERE inspection_type = ? AND task_id = ?',
          ['process', id]
        );

        if (existingProcessInspection.length === 0) {
          // 获取产品的过程检验规则
          const [processRules] = await connection.query(
            'SELECT * FROM process_inspection_rules WHERE product_id = ? OR product_id IS NULL ORDER BY product_id DESC LIMIT 1',
            [taskData.product_id]
          );

          const processRule = processRules[0] || { inspection_interval: 60, sample_rate: 10 };

          // 获取生产任务的第一个工序名称
          const [firstProcess] = await connection.query(
            'SELECT process_name FROM production_processes WHERE task_id = ? ORDER BY sequence ASC LIMIT 1',
            [id]
          );
          const processName = firstProcess[0]?.process_name || '生产过程';

          // 生成过程检验单号
          const processInspectionNo = `PCI${Date.now()}`;

          // 获取产品信息
          const [productInfo] = await connection.query(
            'SELECT code, name FROM materials WHERE id = ?',
            [taskData.product_id]
          );
          const product = productInfo[0] || {};

          // 计算抽检数量
          const sampleQty = Math.max(
            1,
            Math.ceil(taskData.quantity * (processRule.sample_rate / 100))
          );

          // 创建过程检验记录
          await connection.query(
            `
            INSERT INTO quality_inspections
            (inspection_no, inspection_type, task_id, reference_id, reference_no, product_id, product_code, product_name,
             batch_no, quantity, unit, planned_date, status, process_name, template_id, note)
            VALUES (?, 'process', ?, ?, ?, ?, ?, ?, ?, ?, '个', NOW(), 'pending', ?, ?, ?)
          `,
            [
              processInspectionNo,
              id,
              id,
              taskData.code,
              taskData.product_id,
              product.code || '',
              product.name || '',
              `BATCH${Date.now()}`,
              sampleQty,
              processName,
              processRule.template_id || null,
              `生产任务开始时自动创建（抽检率${processRule.sample_rate}%）`,
            ]
          );

          logger.info('自动创建过程检验记录成功', {
            taskId: id,
            inspectionNo: processInspectionNo,
            processName,
            sampleQty,
            sampleRate: processRule.sample_rate,
          });
        } else {
          logger.info('过程检验记录已存在，跳过创建', { taskId: id });
        }
      } catch (processError) {
        logger.error('自动创建过程检验记录失败:', processError);
        // 不影响任务状态更新
      }
    }

    // 任务状态更新为待检验或完成时，在事务内创建检验单
    if (
      status === STATUS.PRODUCTION_TASK.INSPECTION ||
      status === STATUS.PRODUCTION_TASK.COMPLETED
    ) {
      try {
        // 检查是否已经存在检验单（成品检验类型，reference_id为任务ID）
        const [existingInspection] = await connection.query(
          'SELECT id FROM quality_inspections WHERE inspection_type = ? AND reference_id = ?',
          ['final', id]
        );

        // 如果不存在检验单，则创建
        if (existingInspection.length === 0) {
          // 直接使用模型创建检验单
          await QualityInspection.createInspection({
            inspection_type: 'final',
            reference_id: id,
            reference_no: taskData.code,
            task_id: id,
            product_id: taskData.product_id,
            batch_no: `BATCH${Date.now()}`,
            quantity: taskData.quantity || 0,
            unit: '个',
            planned_date: new Date(),
            status: 'pending',
            note: '生产任务完成时自动创建',
          });
          logger.info('自动创建检验单成功', { taskId: id });
        } else {
          logger.info('检验单已存在，跳过创建', {
            taskId: id,
            inspectionId: existingInspection[0].id,
          });
        }
      } catch (inspError) {
        logger.error('自动创建检验单失败:', inspError);
        // 不影响任务完成
      }
    }

    // ===== (1) 同步更新关联的生产计划状态 =====
    if (planId) {
      try {
        const [taskStats] = await connection.query(
          `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.PENDING}' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.ALLOCATED}' THEN 1 ELSE 0 END) as allocated_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUING}' THEN 1 ELSE 0 END) as material_issuing_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.PREPARING}' THEN 1 ELSE 0 END) as preparing_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED}' THEN 1 ELSE 0 END) as material_issued_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}' THEN 1 ELSE 0 END) as in_progress_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.INSPECTION}' THEN 1 ELSE 0 END) as inspection_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.WAREHOUSING}' THEN 1 ELSE 0 END) as warehousing_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.CANCELLED}' THEN 1 ELSE 0 END) as cancelled_count
          FROM production_tasks
          WHERE plan_id = ?`,
          [planId]
        );

        const stats = taskStats[0];
        const activeTotal = stats.total - stats.cancelled_count;

        const [planInfo] = await connection.query(
          'SELECT status FROM production_plans WHERE id = ? FOR UPDATE',
          [planId]
        );

        if (planInfo.length > 0) {
          const currentPlanStatus = planInfo[0].status;
          let newPlanStatus = currentPlanStatus;

          if (stats.completed_count === activeTotal && activeTotal > 0) {
            newPlanStatus = 'completed';
          } else if (stats.warehousing_count > 0) {
            newPlanStatus = 'warehousing';
          } else if (stats.inspection_count > 0) {
            newPlanStatus = 'inspection';
          } else if (stats.in_progress_count > 0) {
            newPlanStatus = 'in_progress';
          } else if (stats.material_issued_count > 0) {
            newPlanStatus = 'material_issued';
          } else if (stats.preparing_count > 0 || stats.material_issuing_count > 0 || stats.allocated_count > 0) {
            newPlanStatus = 'preparing';
          } else if (stats.pending_count === activeTotal && activeTotal > 0) {
            newPlanStatus = 'draft';
          }

          if (newPlanStatus !== currentPlanStatus) {
            await connection.query('UPDATE production_plans SET status = ? WHERE id = ?', [
              newPlanStatus,
              planId,
            ]);
            logger.info(`生产计划 ${planId} 状态已同步更新: ${currentPlanStatus} → ${newPlanStatus}`);
          }
        }
      } catch (error) {
        logger.error(`同步更新生产计划 ${planId} 状态失败:`, error);
        throw error;
      }
    }

    // ===== (2) 工序完成路径的报工+成本核算 =====
    if (
      status === STATUS.PRODUCTION_TASK.INSPECTION ||
      status === STATUS.PRODUCTION_TASK.COMPLETED
    ) {
      try {
        await connection.query(
          'UPDATE production_tasks SET completed_quantity = quantity WHERE id = ? AND (completed_quantity IS NULL OR completed_quantity < quantity)',
          [id]
        );

        const [existingReports] = await connection.query(
          'SELECT COUNT(*) as count FROM production_reports WHERE task_id = ?',
          [id]
        );

        if (existingReports[0].count === 0) {
          const [processHours] = await connection.query(
            'SELECT COALESCE(SUM(standard_hours), 0) as total_hours FROM production_processes WHERE task_id = ?',
            [id]
          );
          const estimatedHours = parseFloat(processHours[0]?.total_hours) || 0;

          if (estimatedHours > 0) {
            const reportNo = `RPT${Date.now()}`;
            const operatorName = taskData.manager || 'System';

            await connection.query(
              `INSERT INTO production_reports
              (report_no, task_id, operator_id, operator_name, report_time, report_quantity,
               completed_quantity, qualified_quantity, defective_quantity, unqualified_quantity,
               work_hours, remarks, created_at)
              VALUES (?, ?, 0, ?, NOW(), ?, ?, ?, 0, 0, ?, ?, NOW())`,
              [
                reportNo, id, operatorName, taskData.quantity || 0,
                taskData.quantity || 0, taskData.quantity || 0,
                estimatedHours, '工序完成后系统自动生成',
              ]
            );
          }
        }

        const [updatedInspections] = await connection.query(
          `UPDATE quality_inspections
           SET status = 'passed', note = CONCAT(COALESCE(note, ''), ' | 工序全部完成时自动关闭')
           WHERE task_id = ? AND inspection_type IN ('first_article', 'process') AND status = 'pending'`,
          [id]
        );

        // 强一致性成本核算：直接在事务中调用，并传入 connection
        try {
          const CostAccountingService = require('../../../services/business/CostAccountingService');
          await CostAccountingService.calculateActualCost(parseInt(id), connection);
        } catch (costError) {
          throw costError;
        }
      } catch (compError) {
         throw compError;
      }

      // ===== (3) 处理批次追溯 =====
      try {
        const [productResult] = await connection.query(
          `SELECT m.code, m.name, m.location_id, COALESCE(u.name, '') as unit
           FROM materials m LEFT JOIN units u ON m.unit_id = u.id WHERE m.id = ?`,
          [taskData.product_id]
        );
        const productInfo = productResult && productResult.length > 0 ? productResult[0] : null;

        if (productInfo) {
          const batchNumber = `BATCH${Date.now()}`;
          const InventoryTraceabilityService = require('../../../services/business/InventoryTraceabilityService');
          let warehouseInfo = { id: null, name: null };
          if (productInfo.location_id) {
            const [configuredWarehouse] = await connection.query(
              'SELECT id, name FROM locations WHERE id = ?',
              [productInfo.location_id]
            );
            if (configuredWarehouse.length > 0) {
              warehouseInfo = configuredWarehouse[0];
            }
          }
          if (!warehouseInfo.id) {
             const InventoryService = require('../../../services/InventoryService');
             const materialLocationId = await InventoryService.getMaterialLocation(taskData.product_id);
             warehouseInfo.id = materialLocationId;
             warehouseInfo.name = '系统分配默认';
          }

          const [outboundRecords] = await connection.query(
            `SELECT il.material_id, m.code as material_code, il.batch_number, SUM(il.quantity * -1) as consumed_quantity
             FROM inventory_ledger il
             JOIN inventory_outbound io ON il.reference_no = io.outbound_no
             JOIN materials m ON il.material_id = m.id
             WHERE il.transaction_type IN ('outbound', 'production_outbound') AND io.production_task_id = ?
             GROUP BY il.material_id, m.code, il.batch_number`,
            [id]
          );

          await InventoryTraceabilityService.handleProductionInbound({
             production_task_id: id, production_order_no: taskData.code,
             product_id: taskData.product_id, product_code: productInfo.code, product_name: productInfo.name,
             batch_number: batchNumber, produced_quantity: taskData.quantity,
             unit: productInfo.unit, production_date: new Date(),
             warehouse_id: warehouseInfo.id, warehouse_name: warehouseInfo.name,
             operator: taskData.manager || 'system',
             consumed_materials: outboundRecords.map(r => ({
                material_id: r.material_id, material_code: r.material_code,
                batch_number: r.batch_number, consumed_quantity: r.consumed_quantity || 0
             }))
          }, connection); // 注意：这也需要外部支持如果追溯服务支持事务。但如果不传，它只会新建条目，不破坏ACID。
        }
      } catch (err) {
          logger.warn('处理批次追溯发生错误，作为次要逻辑不阻断:', err);
      }
    }

    // 所有业务同步处理完成后，统一提交事务
    await connection.commit();

    // 最后返回成功响应
    res.json({
      message: '生产任务状态更新成功',
      status,
    });
  } catch (error) {
    await connection.rollback();
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

    const safeLimit = parseInt(limit, 10) || 10;

    const query = `
      SELECT
        pt.id,
        pt.code,
        pt.status,
        pt.quantity,
        pt.expected_end_date,
        m.name as productName
      FROM production_tasks pt
      LEFT JOIN materials m ON pt.product_id = m.id
      WHERE pt.status IN ('pending', 'in_progress')
      ORDER BY pt.expected_end_date ASC
      LIMIT ?
    `;

    // ✅ 审计修复: LIMIT 参数化查询
    const [tasks] = await pool.query(query, [safeLimit]);
    res.json(tasks);
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

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: '请输入有效的完工数量',
      });
    }

    await connection.beginTransaction();

    // 第一性原理防御：获取当前任务信息并开启悲观排他锁，防并发完工超卖
    const [tasks] = await connection.query(
      `SELECT pt.id, pt.code, pt.quantity, pt.completed_quantity, pt.status, pt.plan_id
       FROM production_tasks pt
       WHERE pt.id = ? FOR UPDATE`,
      [id]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '任务不存在',
      });
    }

    const task = tasks[0];
    const totalQuantity = Number(task.quantity) || 0;
    const currentCompleted = Number(task.completed_quantity) || 0;
    const remaining = totalQuantity - currentCompleted;

    if (quantity > remaining) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `完工数量不能超过剩余数量 ${remaining}`,
      });
    }

    const newCompletedQuantity = currentCompleted + Number(quantity);
    const isFullComplete = newCompletedQuantity >= totalQuantity;

    // 更新完工数量
    let updateQuery = 'UPDATE production_tasks SET completed_quantity = ?';
    const updateParams = [newCompletedQuantity];

    // 如果全部完工，更新状态为待检验
    if (isFullComplete) {
      updateQuery += ', status = ?';
      updateParams.push('inspection');
    }

    updateQuery += ' WHERE id = ?';
    updateParams.push(id);

    await connection.query(updateQuery, updateParams);

    // 记录完工日志（可选）
    logger.info(
      `任务 ${task.code} 完工 ${quantity} 件，累计 ${newCompletedQuantity}/${totalQuantity}，备注: ${remark || '无'}`
    );

    // 每次完工都创建成品检验单（包括部分完工）
    try {
      // 获取任务详情用于创建检验单（包含单位信息）
      const [taskDetails] = await connection.query(
        `
        SELECT pt.*, m.name as product_name, m.code as product_code, u.name as unit_name
        FROM production_tasks pt
        LEFT JOIN materials m ON pt.product_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE pt.id = ?
      `,
        [id]
      );

      if (taskDetails.length > 0) {
        const taskDetail = taskDetails[0];

        // 使用 QualityInspection.createInspection 创建成品检验单
        await QualityInspection.createInspection({
          inspection_type: 'final', // 成品检验
          reference_no: task.code, // 关联生产任务编号
          reference_id: id, // 关联生产任务ID
          task_id: id, // 显式传入任务ID
          product_id: taskDetail.product_id,
          product_name: taskDetail.product_name,
          product_code: taskDetail.product_code,
          quantity: Number(quantity), // 本次完工数量
          unit: taskDetail.unit_name || '件', // 单位
          batch_no: taskDetail.batch_no || `BATCH${Date.now()}`,
          planned_date: new Date(), // 计划检验日期（当天）
          inspection_date: new Date(), // 检验日期
          status: 'pending', // 待检验状态
          remark:
            remark ||
            `生产任务 ${task.code} 完工 ${quantity} 件${isFullComplete ? '（全部完工）' : '（部分完工）'}`,
        });

        logger.info(`任务 ${task.code} 完工 ${quantity} 件，已自动创建成品检验单`);
      }
    } catch (inspectionError) {
      logger.warn(`创建检验单失败（不影响完工）: ${inspectionError.message}`);
    }

    // ===== 自动创建报工记录 =====
    try {
      const reportNo = `RPT${Date.now()}`;
      // 尝试获取当前用户，如果不可用则使用默认值
      const operatorId = req.user ? req.user.id : 0;
      const operatorName = await getCurrentUserName(req);

      // 从工序表中获取标准工时合计，避免 work_hours 为 0 导致人工成本为 0
      let estimatedHours = 0;
      try {
        const [processHours] = await connection.query(
          'SELECT COALESCE(SUM(standard_hours), 0) as total_hours FROM production_processes WHERE task_id = ?',
          [id]
        );
        estimatedHours = parseFloat(processHours[0]?.total_hours) || 0;
      } catch (phErr) {
        logger.warn(`获取工序标准工时失败: ${phErr.message}`);
      }
      // SSOT 原则：严禁通过魔法数字对缺陷主数据进行补偿估算
      // 只要没有在生产工序上准确配置标准工时，系统强拦截并抛错，倒逼前端完善基础物料主数据！
      if (estimatedHours <= 0) {
        throw new BusinessError(
          '工序未配置有效的标准工时，无法核算人工及制造费用，请先在生管模块完善受影响产品的工序参数设定。',
          { route: '/basedata/processes', buttonText: '去设置标准工时' }
        );
      }

      await connection.query(
        `
                INSERT INTO production_reports
                (report_no, task_id, operator_id, operator_name, report_time, report_quantity, 
                 completed_quantity, qualified_quantity, defective_quantity, unqualified_quantity, 
                 work_hours, remarks, created_at)
                VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, 0, 0, ?, ?, NOW())
            `,
        [
          reportNo,
          id,
          operatorId,
          operatorName,
          quantity, // 报工数量
          quantity, // 完成数量
          quantity, // 默认合格数量等于完成数量（乐观）
          estimatedHours, // 使用工序标准工时或兜底估算值
          `自动完工生成: ${remark || ''}`,
        ]
      );

      logger.info(`任务 ${task.code} 自动创建报工记录成功，工时: ${estimatedHours}h`);
    } catch (reportError) {
      logger.error('自动创建报工记录失败:', reportError);
      // 不阻塞主流程，仅记录错误
    }
    // ===== 报工记录结束 =====

    // ===== 自动关闭未完成的首检/过程检验单 =====
    if (isFullComplete) {
      try {
        const [updatedInspections] = await connection.query(
          `UPDATE quality_inspections 
           SET status = 'passed', note = CONCAT(COALESCE(note, ''), ' | 任务完工时系统自动按合格跳过')
           WHERE task_id = ? 
             AND inspection_type IN ('first_article', 'process')
             AND status = 'pending'`,
          [id]
        );
        if (updatedInspections.affectedRows > 0) {
          logger.info(`任务 ${task.code} 完工，自动跳过 ${updatedInspections.affectedRows} 个未执行的首检/过程检验`);
        }
      } catch (skipError) {
        logger.warn(`自动跳过检验单失败: ${skipError.message}`);
      }
    }
    // ===== 自动关闭检验单结束 =====

    // ===== 同步生产计划状态（强一致性要求，移动到 commit 之前，使用共有事务 connection） =====
    if (isFullComplete && task.plan_id) {
      try {
        const [taskStats] = await connection.query(
          `SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.PENDING}' THEN 1 ELSE 0 END) as pending_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}' THEN 1 ELSE 0 END) as in_progress_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.INSPECTION}' THEN 1 ELSE 0 END) as inspection_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.WAREHOUSING}' THEN 1 ELSE 0 END) as warehousing_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.CANCELLED}' THEN 1 ELSE 0 END) as cancelled_count
          FROM production_tasks WHERE plan_id = ?`,
          [task.plan_id]
        );

        const stats = taskStats[0];
        const activeTotal = stats.total - stats.cancelled_count;

        const [planInfo] = await connection.query(
          'SELECT status FROM production_plans WHERE id = ? FOR UPDATE',
          [task.plan_id]
        );

        if (planInfo.length > 0) {
          const currentPlanStatus = planInfo[0].status;
          let newPlanStatus = currentPlanStatus;

          if (stats.completed_count === activeTotal && activeTotal > 0) {
            newPlanStatus = 'completed';
          } else if (stats.warehousing_count > 0) {
            newPlanStatus = 'warehousing';
          } else if (stats.inspection_count > 0) {
            newPlanStatus = 'inspection';
          } else if (stats.in_progress_count > 0) {
            newPlanStatus = 'in_progress';
          }

          if (newPlanStatus !== currentPlanStatus) {
            await connection.query(
              'UPDATE production_plans SET status = ? WHERE id = ?',
              [newPlanStatus, task.plan_id]
            );
            logger.info(`[completeTask] 计划 ${task.plan_id} 状态同步: ${currentPlanStatus} → ${newPlanStatus}`);
          }
        }
      } catch (err) {
        logger.error(`[completeTask] 同步计划 ${task.plan_id} 状态失败:`, err);
        throw err; // 同步失败，向外抛出阻断事务，避免数据撕裂
      }
    }

    await connection.commit();

    // ===== 异步发射生产完工领域事件 =====
    const EventBus = require('../../../events/EventBus');
    EventBus.emit('PRODUCTION_TASK_COMPLETED', {
      taskId: parseInt(id),
      taskCode: task.code,
      isFullComplete: isFullComplete
    });
    logger.info(`[completeTask] 任务 ${task.code} 完工流程数据库事务已提交，已向总线发送核算事件`);
    // ===== 事件发射完毕 =====

    const responseData = {
      taskId: id,
      completedQuantity: newCompletedQuantity,
      totalQuantity: totalQuantity,
      remaining: totalQuantity - newCompletedQuantity,
      isFullComplete,
    };

    res.json({
      success: true,
      message: isFullComplete ? '全部完工，已创建检验单' : `本次完工 ${quantity} 件`,
      data: responseData,
    });
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

    // 1. 获取任务信息
    const [tasks] = await pool.query(
      'SELECT product_id, quantity FROM production_tasks WHERE id = ?',
      [id]
    );

    if (tasks.length === 0) {
      return ResponseHandler.error(res, '生产任务不存在', 'NOT_FOUND', 404);
    }

    const task = tasks[0];
    const productId = task.product_id;

    // 2. 获取已审核的BOM
    const [boms] = await pool.query(
      'SELECT id FROM bom_masters WHERE product_id = ? AND approved_by IS NOT NULL ORDER BY created_at DESC LIMIT 1',
      [productId]
    );

    if (boms.length === 0) {
      return ResponseHandler.success(res, [], '该产品尚未关联已审核的BOM');
    }

    const bomId = boms[0].id;

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
