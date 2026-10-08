/**
 * 返工任务管理控制器
 * @description 处理返工任务的CRUD操作、任务分配、进度跟踪等
 */

const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const db = require('../../../config/db');
const pool = db.pool;
const QualityIntegrationService = require('../../../services/business/QualityIntegrationService');
const businessConfig = require('../../../config/businessConfig');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');

// 从统一配置获取状态常量
const STATUS = {
  REWORK: businessConfig.status.rework,
};

/**
 * 自动生成返工后复检单 (Re-inspection)
 * 实现返工品到库房的真正闭环
 */
const createReinspectionTask = async (task, connection) => {
  if (!task.inspection_id) return;

  try {
    // 获取原质检单详情
    const [originalRows] = await connection.query(
      'SELECT source_type, purchase_order_item_id, id, inspection_no, inspection_type, reference_id, reference_no, material_id, supplier_id, product_id, product_name, product_code, process_id, process_name, batch_no, quantity, qualified_quantity, unqualified_quantity, unit, unit_id, status, planned_date, actual_date, inspector_id, inspector_name, punch_time, standard_type, standard_no, template_id, note, created_at, updated_at, traceability_id, traceability_batch, chain_id, chain_step_id, is_first_article, first_article_qty, is_full_inspection, first_article_result, production_can_continue, task_id, is_aql, aql_standard_id, aql_level, accept_limit, reject_limit, deleted_at FROM quality_inspections WHERE id = ? AND deleted_at IS NULL',
      [task.inspection_id]
    );

    if (originalRows.length === 0) return;
    const origin = originalRows[0];

    // 生成新的复检单号 — 使用统一编码引擎
    const { CodeGenerators } = require('../../../utils/codeGenerator');
    const newInspectionNo = await CodeGenerators.generateInspectionCode(connection);

    // 插入复检主单 (继承原单的大部分信息，数量为返工合格返工数)
    const [insertResult] = await connection.query(
      `
      INSERT INTO quality_inspections (
        inspection_no, inspection_type, reference_no, reference_id,
        material_id, product_id, product_code, product_name,
        quantity, unit, unit_id, planned_date, status, note, template_id, batch_no
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `,
      [
        newInspectionNo,
        origin.inspection_type,
        origin.reference_no,
        origin.reference_id,
        origin.material_id,
        origin.product_id,
        origin.product_code,
        origin.product_name,
        task.quantity,
        origin.unit || '个',
        origin.unit_id || null,
        new Date(), // 复检计划日期为当天
        `自动创建：由返工任务 ${task.rework_no} (不良品单 ${task.ncp_no}) 触发的返工复检`,
        origin.template_id,
        origin.batch_no || '',
      ]
    );

    const newInspectionId = insertResult.insertId;
    // Preserve source identity and accountable inspector without copying old results.
    await connection.query(
      `UPDATE quality_inspections SET
      inspector_id = ?, inspector_name = ?, source_type = ?, purchase_order_item_id = ?,
      task_id = ?, supplier_id = ?, process_id = ?, process_name = ?,
      is_full_inspection = 1, is_aql = 0, sample_quantity = ? WHERE id = ?`,
      [
        origin.inspector_id || null,
        origin.inspector_name || null,
        origin.source_type || null,
        origin.purchase_order_item_id || null,
        origin.task_id || null,
        origin.supplier_id || null,
        origin.process_id || null,
        origin.process_name || null,
        task.quantity,
        newInspectionId,
      ]
    );

    // 继承检验项目标准
    const [items] = await connection.query(
      'SELECT id, inspection_id, item_name, standard, type, is_critical, dimension_value, tolerance_upper, tolerance_lower, actual_value, measure_1, measure_2, measure_3, measure_4, measure_5, measure_6, method, result, is_qualified, remark, created_at, updated_at FROM quality_inspection_items WHERE inspection_id = ?',
      [task.inspection_id]
    );
    if (items.length > 0) {
      await connection.query(
        `INSERT INTO quality_inspection_items (
          inspection_id, item_name, standard, method, type, is_critical,
          dimension_value, tolerance_upper, tolerance_lower
        ) VALUES ?`,
        [
          items.map((item) => [
            newInspectionId,
            item.item_name,
            item.standard,
            item.method,
            item.type,
            item.is_critical,
            item.dimension_value,
            item.tolerance_upper,
            item.tolerance_lower,
          ]),
        ]
      );
    }

    await QualityIntegrationService.linkDocumentToDocument(
      {
        type: 'rework_task',
        id: task.id,
        code: task.rework_no,
      },
      {
        type: 'quality_inspection',
        id: newInspectionId,
        code: newInspectionNo,
      },
      connection
    );

    logger.info(
      `Rework loop closed with reinspection created: reworkNo=${task.rework_no}, inspectionNo=${newInspectionNo}`
    );
  } catch (e) {
    logger.error(`创建返工复检单失败: ${e.message}`);
    throw e;
  }
};

/**
 * 获取返工任务列表
 */
const getReworkTasks = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      reworkNo,
      ncpNo,
      ncpId,
      materialCode,
      status,
      assignedTo,
      startDate,
      endDate,
    } = req.query;

    const pagination = parsePagination(page, pageSize, {
      defaultPageSize: 10,
      maxPageSize: 100,
    });

    const whereConditions = [];
    const queryParams = [];

    if (reworkNo) {
      whereConditions.push('rt.rework_no LIKE ?');
      queryParams.push(`%${reworkNo}%`);
    }

    if (ncpId) {
      const sourceId = Number(ncpId);
      if (!Number.isSafeInteger(sourceId) || sourceId <= 0) {
        return ResponseHandler.error(res, '不合格品单 ID 无效', 'VALIDATION_ERROR', 400);
      }
      whereConditions.push('rt.ncp_id = ?');
      queryParams.push(sourceId);
    }

    if (ncpNo) {
      whereConditions.push('rt.ncp_no LIKE ?');
      queryParams.push(`%${ncpNo}%`);
    }

    if (materialCode) {
      whereConditions.push('rt.material_code LIKE ?');
      queryParams.push(`%${materialCode}%`);
    }

    if (status) {
      whereConditions.push('rt.status = ?');
      queryParams.push(status);
    }

    if (assignedTo) {
      whereConditions.push('rt.assigned_to LIKE ?');
      queryParams.push(`%${assignedTo}%`);
    }

    if (startDate) {
      whereConditions.push('rt.created_at >= ?');
      queryParams.push(startDate);
    }

    if (endDate) {
      whereConditions.push('rt.created_at <= ?');
      queryParams.push(`${endDate} 23:59:59`);
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

    // 查询总数
    const countQuery = `
      SELECT COUNT(*) as total
      FROM rework_tasks rt
      ${whereClause}
    `;
    const [countResult] = await pool.query(countQuery, queryParams);
    const total = countResult[0].total;

    // 查询列表数据
    const dataQuery = appendPaginationSQL(
      `
      SELECT
        rt.*,
        ncp.inspection_no,
        ncp.inspection_id,
        qi.inspection_type,
        ncp.defect_description
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
      LEFT JOIN quality_inspections qi ON qi.id = ncp.inspection_id
      ${whereClause}
      ORDER BY rt.created_at DESC
    `,
      pagination.limit,
      pagination.offset
    );
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [rows] = await pool.query(dataQuery, queryParams);
    const reinspections = await getReinspections(rows.map((row) => ({ rework_id: row.id })));
    rows.forEach((row) => {
      row.reinspection_id = reinspections.get(Number(row.id))?.id || null;
    });

    return ResponseHandler.success(res, {
      data: rows,
      pagination: {
        total,
        current: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
  } catch (error) {
    logger.error('获取返工任务列表失败:', error);
    return ResponseHandler.error(res, '获取返工任务列表失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取返工任务详情
 */
const getReworkTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT
        rt.*,
        ncp.inspection_no,
        ncp.inspection_id,
        qi.inspection_type,
        ncp.defect_description,
        ncp.quantity as defect_quantity
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
      LEFT JOIN quality_inspections qi ON qi.id = ncp.inspection_id
      WHERE rt.id = ?
    `;

    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    const reinspections = await getReinspections([{ rework_id: rows[0].id }]);
    rows[0].reinspection_id = reinspections.get(Number(rows[0].id))?.id || null;
    return ResponseHandler.success(res, rows[0], '获取返工任务详情成功');
  } catch (error) {
    logger.error('获取返工任务详情失败:', error);
    return ResponseHandler.error(res, '获取返工任务详情失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 更新返工任务
 */
const updateReworkTask = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { rework_instructions, planned_date, rework_cost } = mapKeysToSnake(req.body || {});

    // 检查返工任务是否存在
    const [checkResult] = await connection.query(
      'SELECT status FROM rework_tasks WHERE id = ? FOR UPDATE',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    if (
      checkResult[0].status === STATUS.REWORK.COMPLETED ||
      checkResult[0].status === STATUS.REWORK.CANCELLED
    ) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '已完成或已取消的返工任务不能修改',
        'VALIDATION_ERROR',
        400
      );
    }

    // 更新返工任务
    await connection.query(
      `UPDATE rework_tasks
       SET rework_instructions = ?, planned_date = ?, rework_cost = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rework_instructions, planned_date, rework_cost, id]
    );

    await connection.commit();
    return ResponseHandler.success(res, null, '返工任务更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新返工任务失败:', error);
    return ResponseHandler.error(res, '更新返工任务失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 分配返工任务
 */
const assignTask = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { assigned_to } = mapKeysToSnake(req.body || {});

    // 检查返工任务是否存在
    const [checkResult] = await connection.query(
      'SELECT status FROM rework_tasks WHERE id = ? FOR UPDATE',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    if (
      checkResult[0].status === STATUS.REWORK.COMPLETED ||
      checkResult[0].status === STATUS.REWORK.CANCELLED
    ) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '已完成或已取消的返工任务不能分配',
        'VALIDATION_ERROR',
        400
      );
    }

    if (!String(assigned_to || '').trim()) {
      await connection.rollback();
      return ResponseHandler.error(res, '请选择返工负责人', 'VALIDATION_ERROR', 400);
    }

    // 分配任务
    await connection.query(
      `UPDATE rework_tasks
       SET assigned_to = ?, status = 'in_progress', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assigned_to, id]
    );

    await connection.commit();
    return ResponseHandler.success(res, null, '任务分配成功');
  } catch (error) {
    await connection.rollback();
    logger.error('分配返工任务失败:', error);
    return ResponseHandler.error(res, '分配返工任务失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 完成返工任务
 */
const completeTask = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { actual_date, rework_cost } = mapKeysToSnake(req.body || {});

    // 获取返工任务信息 (带上ncp单等信息以便复检使用)
    const [tasks] = await connection.query(
      `
      SELECT rt.*, ncp.ncp_no, ncp.inspection_id
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
      WHERE rt.id = ?
      FOR UPDATE
    `,
      [id]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    const task = tasks[0];

    if (task.status === STATUS.REWORK.COMPLETED) {
      await connection.rollback();
      return ResponseHandler.error(res, '该返工任务已完成', 'VALIDATION_ERROR', 400);
    }

    if (task.status === STATUS.REWORK.CANCELLED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已取消的返工任务不能完成', 'VALIDATION_ERROR', 400);
    }

    if (task.status !== STATUS.REWORK.IN_PROGRESS) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '返工任务必须先分配并进入进行中后才能完成',
        'VALIDATION_ERROR',
        400
      );
    }

    const effectiveCost = rework_cost ?? task.rework_cost ?? 0;

    // 完成返工任务
    await connection.query(
      `UPDATE rework_tasks
       SET actual_date = ?, rework_cost = ?, status = 'completed', progress = 100, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actual_date || new Date().toISOString().slice(0, 10), effectiveCost, id]
    );

    await QualityIntegrationService.recordQualityCost(
      {
        costType: 'rework',
        referenceNo: task.rework_no,
        materialCode: task.material_code,
        quantity: task.quantity,
        cost: effectiveCost,
        operator: task.created_by,
      },
      connection
    );

    // 触发返工复检闭环
    await createReinspectionTask(task, connection);

    await connection.commit();
    return ResponseHandler.success(res, null, '返工任务完成');
  } catch (error) {
    await connection.rollback();
    logger.error('完成返工任务失败:', error);
    return ResponseHandler.error(res, '完成返工任务失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新返工任务状态
 * 注意：当目标状态为 completed 时，必须触发复检单创建和质量成本记录，
 * 与 completeTask 保持一致，避免绕过正规完成流程导致闭环断裂。
 */
const updateStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'VALIDATION_ERROR', 400);
    }

    // Serialize every transition on the same task, including attempts to reopen terminal tasks.
    const [tasks] = await connection.query(
      `SELECT rt.*, ncp.ncp_no, ncp.inspection_id
         FROM rework_tasks rt
         LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
        WHERE rt.id = ? FOR UPDATE`,
      [id]
    );
    if (!tasks.length) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }
    const task = tasks[0];
    if (task.status === status) {
      await connection.commit();
      return ResponseHandler.success(res, null, '返工任务状态未变化');
    }
    const transitions = {
      pending: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };
    if (!transitions[task.status]?.includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '当前返工状态不允许此操作', 'VALIDATION_ERROR', 400);
    }
    if (status === 'in_progress' && !task.assigned_to) {
      await connection.rollback();
      return ResponseHandler.error(res, '请先分配返工负责人', 'VALIDATION_ERROR', 400);
    }
    if (status === 'cancelled' && task.ncp_id) {
      await connection.query(
        `UPDATE nonconforming_products
        SET handled_quantity = GREATEST(0, COALESCE(handled_quantity, 0) - ?),
            status = 'processing', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND deleted_at IS NULL`,
        [task.quantity, task.ncp_id]
      );
    }
    if (status === 'completed') {
      // 更新状态为已完成
      await connection.query(
        `UPDATE rework_tasks SET status = ?, progress = 100, actual_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ['completed', new Date().toISOString().slice(0, 10), id]
      );

      await QualityIntegrationService.recordQualityCost(
        {
          costType: 'rework',
          referenceNo: task.rework_no,
          materialCode: task.material_code,
          quantity: task.quantity,
          cost: task.rework_cost || 0,
          operator: task.created_by,
        },
        connection
      );

      // 触发返工复检闭环
      await createReinspectionTask(task, connection);

      logger.info(`Rework task completed through status update: reworkNo=${task.rework_no}`);
    } else {
      // 其他状态：直接更新
      await connection.query(
        `UPDATE rework_tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, id]
      );
    }

    await connection.commit();
    return ResponseHandler.success(res, null, '状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新返工任务状态失败:', error);
    return ResponseHandler.error(res, '更新返工任务状态失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取返工任务统计数据
 */
const getStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateCondition = '';
    let queryParams = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE created_at BETWEEN ? AND ?';
      queryParams = [startDate, `${endDate} 23:59:59`];
    }

    const query = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        SUM(quantity) as total_quantity,
        SUM(rework_cost) as total_cost
      FROM rework_tasks
      ${dateCondition}
    `;

    const [rows] = await pool.query(query, queryParams);
    return ResponseHandler.success(res, rows[0], '获取返工任务统计数据成功');
  } catch (error) {
    logger.error('获取返工任务统计数据失败:', error);
    return ResponseHandler.error(res, '获取统计数据失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 更新返工进度
 */
const updateProgress = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { progress } = req.body;

    // 验证进度值
    if (progress === undefined || progress === null) {
      await connection.rollback();
      return ResponseHandler.error(res, '缺少必填字段: progress', 'VALIDATION_ERROR', 400);
    }

    const numProgress = Number(progress);
    if (!Number.isFinite(numProgress) || numProgress < 0 || numProgress > 100) {
      await connection.rollback();
      return ResponseHandler.error(res, '进度值必须在0-100之间', 'VALIDATION_ERROR', 400);
    }

    // 检查返工任务是否存在 (获取 ncp 信息以便自动完成时创建复检单)
    const [checkResult] = await connection.query(
      `
      SELECT rt.id, rt.status, rt.quantity, rt.rework_no, rt.created_by, rt.assigned_to, rt.material_code, rt.rework_cost,
             ncp.ncp_no, ncp.inspection_id
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
      WHERE rt.id = ?
      FOR UPDATE
    `,
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    if (checkResult[0].status === STATUS.REWORK.COMPLETED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成的返工任务不能修改进度', 'VALIDATION_ERROR', 400);
    }

    if (checkResult[0].status === STATUS.REWORK.CANCELLED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已取消的返工任务不能修改进度', 'VALIDATION_ERROR', 400);
    }

    if (checkResult[0].status !== STATUS.REWORK.IN_PROGRESS || !checkResult[0].assigned_to) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '返工任务必须先分配后才能更新进度',
        'VALIDATION_ERROR',
        400
      );
    }

    // 更新进度
    await connection.query(
      `UPDATE rework_tasks
       SET progress = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [numProgress, id]
    );

    // 如果进度达到100%,自动更新状态为完成并触发复检单
    if (numProgress >= 100) {
      await connection.query(
        `UPDATE rework_tasks
         SET status = ?, actual_date = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [STATUS.REWORK.COMPLETED, new Date().toISOString().slice(0, 10), id]
      );

      const taskObj = checkResult[0];
      // 触发闭环
      await createReinspectionTask(taskObj, connection);

      await QualityIntegrationService.recordQualityCost(
        {
          costType: 'rework',
          referenceNo: taskObj.rework_no,
          materialCode: taskObj.material_code,
          quantity: taskObj.quantity,
          cost: taskObj.rework_cost || 0,
          operator: taskObj.created_by,
        },
        connection
      );
    }

    await connection.commit();

    const message = numProgress >= 100 ? '返工进度更新成功,任务已自动完成' : '返工进度更新成功';
    return ResponseHandler.success(res, { progress: numProgress }, message);
  } catch (error) {
    await connection.rollback();
    logger.error('更新返工进度失败:', error);
    return ResponseHandler.error(res, '更新返工进度失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 根据检验单ID查询关联的返工任务状态
 * 关系链: quality_inspections → nonconforming_products (inspection_id) → rework_tasks (ncp_id)
 * 用于前端判断 FQC/IQC 复检按钮是否可以点击（必须等返工完成才能复检）
 */
// Resolve the new inspection created by the rework transaction; never reopen the source.
const getReinspections = async (rows) => {
  const ids = [...new Set(rows.map((row) => Number(row.rework_id)).filter(Boolean))];
  if (!ids.length) return new Map();
  const [inspections] = await pool.query(
    `SELECT dl.source_id AS rework_id, qi.id, qi.status
       FROM document_links dl
       JOIN quality_inspections qi ON qi.id = dl.target_id AND qi.deleted_at IS NULL
      WHERE dl.source_type = 'rework_task' AND dl.source_id IN (?)
        AND dl.target_type = 'quality_inspection'
      ORDER BY qi.id DESC`,
    [ids]
  );
  const result = new Map();
  for (const inspection of inspections) {
    if (!result.has(Number(inspection.rework_id)))
      result.set(Number(inspection.rework_id), inspection);
  }
  return result;
};

const getReworkStatusByInspectionId = async (req, res) => {
  try {
    const { inspectionId } = req.params;

    const query = `
      SELECT
        rt.id AS rework_id,
        rt.rework_no,
        rt.status AS rework_status,
        rt.quantity,
        rt.assigned_to,
        rt.actual_date,
        ncp.id AS ncp_id,
        ncp.ncp_no,
        ncp.disposition,
        ncp.status AS ncp_status
      FROM nonconforming_products ncp
      LEFT JOIN rework_tasks rt ON rt.ncp_id = ncp.id
      WHERE ncp.inspection_id = ?
      ORDER BY ncp.created_at DESC, rt.id DESC
    `;
    const [rows] = await pool.query(query, [inspectionId]);

    if (rows.length === 0) {
      // 没有关联的不良品记录 — 可能检验刚标记为failed但NCP还没创建
      return ResponseHandler.success(
        res,
        {
          has_ncp: false,
          has_rework: false,
          rework_completed: false,
          disposition: null,
          allow_reinspection: false,
        },
        '未找到关联的不良品记录'
      );
    }

    // 取最新的一条 NCP 记录
    const latest = rows[0];
    const reinspections = await getReinspections([latest]);
    const reinspection = reinspections.get(Number(latest.rework_id));
    const hasRework = !!latest.rework_id;
    const reworkCompleted = hasRework && latest.rework_status === 'completed';
    // 只有当处置方式是返工(rework)且返工已完成时，才允许复检
    const allowReinspection = latest.disposition === 'rework' && reworkCompleted;

    return ResponseHandler.success(
      res,
      {
        has_ncp: true,
        ncp_no: latest.ncp_no,
        ncp_status: latest.ncp_status,
        disposition: latest.disposition,
        has_rework: hasRework,
        rework_no: latest.rework_no,
        rework_status: latest.rework_status,
        rework_completed: reworkCompleted,
        allow_reinspection: allowReinspection,
        reinspection_id: reinspection?.id || null,
        reinspection_status: reinspection?.status || null,
      },
      '查询成功'
    );
  } catch (error) {
    logger.error('查询检验单关联返工状态失败:', error);
    return ResponseHandler.error(res, '查询返工状态失败', 'OPERATION_ERROR', 500, error);
  }
};

const getReworkStatusByInspectionIds = async (req, res) => {
  try {
    const bodyIn = mapKeysToSnake(req.body || {});
    const inspectionIds = Array.isArray(bodyIn.inspection_ids)
      ? bodyIn.inspection_ids.map((id) => parseInt(id, 10)).filter(Boolean)
      : Array.isArray(req.body?.inspectionIds)
        ? req.body.inspectionIds.map((id) => parseInt(id, 10)).filter(Boolean)
        : [];
    const uniqueIds = [...new Set(inspectionIds)];

    if (uniqueIds.length === 0) {
      return ResponseHandler.success(res, {}, '查询成功');
    }

    const [rows] = await pool.query(
      `
      SELECT
        inspection_id,
        rework_id,
        rework_no,
        rework_status,
        quantity,
        assigned_to,
        actual_date,
        ncp_id,
        ncp_no,
        disposition,
        ncp_status
      FROM (
        SELECT
          ncp.inspection_id,
          rt.id AS rework_id,
          rt.rework_no,
          rt.status AS rework_status,
          rt.quantity,
          rt.assigned_to,
          rt.actual_date,
          ncp.id AS ncp_id,
          ncp.ncp_no,
          ncp.disposition,
          ncp.status AS ncp_status,
          ROW_NUMBER() OVER (PARTITION BY ncp.inspection_id ORDER BY ncp.created_at DESC, rt.id DESC) as row_num
        FROM nonconforming_products ncp
        LEFT JOIN rework_tasks rt ON rt.ncp_id = ncp.id
        WHERE ncp.inspection_id IN (?)
      ) latest
      WHERE row_num = 1
      `,
      [uniqueIds]
    );

    const statusMap = {};
    uniqueIds.forEach((id) => {
      statusMap[id] = {
        has_ncp: false,
        has_rework: false,
        rework_completed: false,
        disposition: null,
        allow_reinspection: false,
      };
    });

    const reinspections = await getReinspections(rows);
    rows.forEach((row) => {
      const reinspection = reinspections.get(Number(row.rework_id));
      const hasRework = !!row.rework_id;
      const reworkCompleted = hasRework && row.rework_status === 'completed';
      statusMap[row.inspection_id] = {
        has_ncp: true,
        ncp_no: row.ncp_no,
        ncp_status: row.ncp_status,
        disposition: row.disposition,
        has_rework: hasRework,
        rework_no: row.rework_no,
        rework_status: row.rework_status,
        rework_completed: reworkCompleted,
        allow_reinspection: row.disposition === 'rework' && reworkCompleted,
        reinspection_id: reinspection?.id || null,
        reinspection_status: reinspection?.status || null,
      };
    });

    return ResponseHandler.success(res, statusMap, '查询成功');
  } catch (error) {
    logger.error('批量查询检验单关联返工状态失败:', error);
    return ResponseHandler.error(res, '批量查询返工状态失败', 'OPERATION_ERROR', 500, error);
  }
};

module.exports = {
  getReworkTasks,
  getReworkTaskById,
  updateReworkTask,
  assignTask,
  completeTask,
  updateStatus,
  getStatistics,
  updateProgress,
  getReworkStatusByInspectionId,
  getReworkStatusByInspectionIds,
};
