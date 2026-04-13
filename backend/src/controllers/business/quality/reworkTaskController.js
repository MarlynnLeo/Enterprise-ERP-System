/**
 * 返工任务管理控制器
 * @description 处理返工任务的CRUD操作、任务分配、进度跟踪等
 */

const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const db = require('../../../config/db');
const pool = db.pool;
const QualityIntegrationService = require('../../../services/business/QualityIntegrationService');
const businessConfig = require('../../../config/businessConfig');

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
      'SELECT * FROM quality_inspections WHERE id = ?',
      [task.inspection_id]
    );

    if (originalRows.length === 0) return;
    const origin = originalRows[0];
    
    // 生成新的复检单号 (例如：在原主单号加 R 标记，或者生成全新的)
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const prefix = `${origin.inspection_type === 'incoming' ? 'IQC' : origin.inspection_type === 'process' ? 'PQC' : 'FQC'}${dateStr}`;
    
    const [maxNoResult] = await connection.query(
      'SELECT MAX(inspection_no) as max_no FROM quality_inspections WHERE inspection_no LIKE ?',
      [`${prefix}%`]
    );
    let sequence = 1;
    if (maxNoResult[0].max_no) {
      sequence = parseInt(maxNoResult[0].max_no.slice(-3)) + 1;
    }
    const newInspectionNo = `${prefix}${sequence.toString().padStart(3, '0')}`;

    // 插入复检主单 (继承原单的大部分信息，数量为返工合格返工数)
    const [insertResult] = await connection.query(`
      INSERT INTO quality_inspections (
        inspection_no, inspection_type, reference_no, reference_id, 
        material_id, product_id, product_code, product_name,
        quantity, unit, planned_date, status, note, template_id, batch_no
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `, [
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
      new Date(), // 复检计划日期为当天
      `自动创建：由返工任务 ${task.rework_no} (不良品单 ${task.ncp_no}) 触发的返工复检`,
      origin.template_id,
      origin.batch_no || ''
    ]);

    const newInspectionId = insertResult.insertId;

    // 继承检验项目标准
    const [items] = await connection.query('SELECT * FROM quality_inspection_items WHERE inspection_id = ?', [task.inspection_id]);
    if (items.length > 0) {
      for (const item of items) {
        await connection.query(`
          INSERT INTO quality_inspection_items (
            inspection_id, item_name, standard, type, is_critical,
            dimension_value, tolerance_upper, tolerance_lower
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          newInspectionId, item.item_name, item.standard, item.type, item.is_critical,
          item.dimension_value, item.tolerance_upper, item.tolerance_lower
        ]);
      }
    }

    logger.info(`✅ 闭环达成: 已为返工任务 ${task.rework_no} 生成复检质检单 ${newInspectionNo}`);
  } catch(e) {
    logger.error(`❌ 创建返工复检单失败: ${e.message}`);
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
      materialCode,
      status,
      assignedTo,
      startDate,
      endDate,
    } = req.query;

    const offset = (page - 1) * pageSize;

    const whereConditions = [];
    const queryParams = [];

    if (reworkNo) {
      whereConditions.push('rt.rework_no LIKE ?');
      queryParams.push(`%${reworkNo}%`);
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
    const dataQuery = `
      SELECT 
        rt.*,
        ncp.inspection_no,
        ncp.defect_description
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
      ${whereClause}
      ORDER BY rt.created_at DESC
      LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}
    `;
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [rows] = await pool.query(dataQuery, queryParams);

    res.json({
      data: rows,
      pagination: {
        total,
        current: parseInt(page),
        pageSize: parseInt(pageSize),
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
        ncp.defect_description,
        ncp.quantity as defect_quantity
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
      WHERE rt.id = ?
    `;

    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

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
    const { rework_instructions, planned_date, rework_cost } = req.body;

    // 检查返工任务是否存在
    const [checkResult] = await connection.query('SELECT status FROM rework_tasks WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    if (
      checkResult[0].status === STATUS.REWORK.COMPLETED ||
      checkResult[0].status === STATUS.REWORK.CANCELLED
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成或已取消的返工任务不能修改', 'BAD_REQUEST', 400);
    }

    // 更新返工任务
    await connection.query(
      `UPDATE rework_tasks
       SET rework_instructions = ?, planned_date = ?, rework_cost = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rework_instructions, planned_date, rework_cost, id]
    );

    await connection.commit();
    res.json({ message: '返工任务更新成功' });
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
    const { assigned_to } = req.body;

    // 检查返工任务是否存在
    const [checkResult] = await connection.query('SELECT status FROM rework_tasks WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    if (
      checkResult[0].status === STATUS.REWORK.COMPLETED ||
      checkResult[0].status === STATUS.REWORK.CANCELLED
    ) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成或已取消的返工任务不能分配', 'BAD_REQUEST', 400);
    }

    // 分配任务
    await connection.query(
      `UPDATE rework_tasks
       SET assigned_to = ?, status = 'in_progress', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assigned_to, id]
    );

    await connection.commit();
    res.json({ message: '任务分配成功' });
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
    const { actual_date, rework_cost, note } = req.body;

    // 获取返工任务信息 (带上ncp单等信息以便复检使用)
    const [tasks] = await connection.query(`
      SELECT rt.*, ncp.ncp_no, ncp.inspection_id 
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
      WHERE rt.id = ?
    `, [id]);

    if (tasks.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    const task = tasks[0];

    if (task.status === STATUS.REWORK.COMPLETED) {
      await connection.rollback();
      return ResponseHandler.error(res, '该返工任务已完成', 'BAD_REQUEST', 400);
    }

    if (task.status === STATUS.REWORK.CANCELLED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已取消的返工任务不能完成', 'BAD_REQUEST', 400);
    }

    // 完成返工任务
    await connection.query(
      `UPDATE rework_tasks
       SET actual_date = ?, rework_cost = ?, status = 'completed', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actual_date || new Date().toISOString().slice(0, 10), rework_cost, id]
    );

    // 记录质量成本
    try {
      await QualityIntegrationService.recordQualityCost(
        {
          costType: 'rework',
          referenceNo: task.rework_no,
          materialCode: task.material_code,
          quantity: task.quantity,
          cost: rework_cost,
          operator: task.created_by,
        },
        connection
      );
    } catch (error) {
      logger.warn('记录质量成本失败(继续完成返工):', error.message);
    }

    // 触发返工复检闭环
    await createReinspectionTask(task, connection);

    await connection.commit();
    res.json({ message: '返工任务完成' });
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
 */
const updateStatus = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    await connection.query(
      `UPDATE rework_tasks
       SET status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, id]
    );

    await connection.commit();
    res.json({ message: '状态更新成功' });
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
      return ResponseHandler.error(res, '缺少必填字段: progress', 'VALIDATION_ERROR', 400);
    }

    const numProgress = parseFloat(progress);
    if (isNaN(numProgress) || numProgress < 0 || numProgress > 100) {
      return ResponseHandler.error(res, '进度值必须在0-100之间', 'VALIDATION_ERROR', 400);
    }

    // 检查返工任务是否存在 (获取 ncp 信息以便自动完成时创建复检单)
    const [checkResult] = await connection.query(`
      SELECT rt.status, rt.quantity, rt.rework_no, rt.created_by, rt.assigned_to, rt.material_code,
             ncp.ncp_no, ncp.inspection_id 
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON rt.ncp_id = ncp.id
      WHERE rt.id = ?
    `, [id]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '返工任务不存在', 'NOT_FOUND', 404);
    }

    if (checkResult[0].status === STATUS.REWORK.COMPLETED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已完成的返工任务不能修改进度', 'BAD_REQUEST', 400);
    }

    if (checkResult[0].status === STATUS.REWORK.CANCELLED) {
      await connection.rollback();
      return ResponseHandler.error(res, '已取消的返工任务不能修改进度', 'BAD_REQUEST', 400);
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
      
      // 记录质量成本 (自动完成时，成本传0或者以后让质检填写)
      try {
        await QualityIntegrationService.recordQualityCost({
            costType: 'rework', referenceNo: taskObj.rework_no, materialCode: taskObj.material_code,
            quantity: taskObj.quantity, cost: 0, operator: taskObj.created_by
        }, connection);
      } catch (ce) {
        logger.warn('自动完成返工记录质量成本失败:', ce.message);
      }
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
      ORDER BY ncp.created_at DESC
    `;
    const [rows] = await pool.query(query, [inspectionId]);

    if (rows.length === 0) {
      // 没有关联的不良品记录 — 可能检验刚标记为failed但NCP还没创建
      return ResponseHandler.success(res, {
        has_ncp: false,
        has_rework: false,
        rework_completed: false,
        disposition: null,
        allow_reinspection: false
      }, '未找到关联的不良品记录');
    }

    // 取最新的一条 NCP 记录
    const latest = rows[0];
    const hasRework = !!latest.rework_id;
    const reworkCompleted = hasRework && latest.rework_status === 'completed';
    // 只有当处置方式是返工(rework)且返工已完成时，才允许复检
    const allowReinspection = latest.disposition === 'rework' && reworkCompleted;

    return ResponseHandler.success(res, {
      has_ncp: true,
      ncp_no: latest.ncp_no,
      ncp_status: latest.ncp_status,
      disposition: latest.disposition,
      has_rework: hasRework,
      rework_no: latest.rework_no,
      rework_status: latest.rework_status,
      rework_completed: reworkCompleted,
      allow_reinspection: allowReinspection
    }, '查询成功');
  } catch (error) {
    logger.error('查询检验单关联返工状态失败:', error);
    return ResponseHandler.error(res, '查询返工状态失败', 'OPERATION_ERROR', 500, error);
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
};
