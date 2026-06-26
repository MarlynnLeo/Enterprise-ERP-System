/**
 * TaskRepository.js
 * @description 生产任务数据访问层 — 所有 SQL 查询集中管理
 * @date 2026-06-22
 *
 * 架构改进说明:
 *  从 taskController.js (71 条内联 SQL) 中提取纯数据访问逻辑。
 *  Controller 只负责: 请求解析 → 业务编排 → 响应格式化
 *  Repository 只负责: SQL 执行 → 结果映射
 *
 *  所有方法的第一个参数都是 conn (connection | pool)，
 *  支持在事务中传入 connection，普通查询传入 pool。
 */

const { pool } = require('../config/db');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');
const { softDelete } = require('../utils/softDelete');
const { PRODUCTION_STATUS_KEYS } = require('../constants/systemConstants');

class TaskRepository {
  // ======================== 查询类 ========================

  /**
   * 根据 ID 获取任务（含 FOR UPDATE 锁）
   * @param {Object} conn - 数据库连接
   * @param {number} id - 任务 ID
   * @param {boolean} [forUpdate=false] - 是否加行锁
   * @returns {Promise<Object|null>}
   */
  static async findById(conn, id, forUpdate = false) {
    const lockClause = forUpdate ? ' FOR UPDATE' : '';
    const [rows] = await conn.query(
      `SELECT id, code, status, plan_id, product_id, quantity, manager,
              start_date, expected_end_date, actual_start_time, actual_end_date,
              cost_center_id, remarks, created_at, updated_at
       FROM production_tasks
       WHERE id = ? AND deleted_at IS NULL${lockClause}`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * 获取任务详情（含关联数据）
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findByIdWithDetails(id) {
    const [rows] = await pool.query(
      `SELECT pt.*,
              pt.code as task_code,
              pt.manager as operator_name,
              pt.start_date as plan_start_time,
              pt.expected_end_date as plan_end_time,
              pt.actual_start_time as actual_start_time,
              pt.actual_end_date as actual_end_time,
              pp.name as planName, pp.contract_code,
              p.name as product_name, p.name as productName,
              p.code as product_code, p.code as productCode,
              p.specs as specification,
              u.name as unit
       FROM production_tasks pt
       LEFT JOIN production_plans pp ON pt.plan_id = pp.id AND pp.deleted_at IS NULL
       LEFT JOIN materials p ON pt.product_id = p.id
       LEFT JOIN units u ON p.unit_id = u.id
       WHERE pt.id = ? AND pt.deleted_at IS NULL`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * 获取去重的负责人列表
   * @returns {Promise<string[]>}
   */
  static async findDistinctManagers() {
    const [rows] = await pool.query(
      `SELECT DISTINCT manager
       FROM production_tasks
       WHERE deleted_at IS NULL AND manager IS NOT NULL AND manager != ''
       ORDER BY manager ASC`
    );
    return rows.map((m) => m.manager);
  }

  /**
   * 分页查询任务列表（含工序和统计）
   * @param {Object} filters - 过滤条件
   * @param {Object} paginationParams - 分页参数 { page, pageSize }
   * @returns {Promise<{items: Array, total: number, statistics: Object, page: number, pageSize: number}>}
   */
  static async findListWithPagination(filters, paginationParams) {
    const pagination = parsePagination(paginationParams.page, paginationParams.pageSize, {
      defaultPageSize: 10,
      maxPageSize: 100,
    });

    const { whereClause, queryParams } = TaskRepository.buildFilterConditions(filters);
    const filterParams = [...queryParams];

    // 主查询
    const listSql = appendPaginationSQL(
      `SELECT pt.*, pp.name as planName, pp.code as plan_code, pp.contract_code,
              p.name as productName, p.code as productCode, p.specs,
              u.name as unit,
              DATE_FORMAT(pt.actual_start_time, '%Y-%m-%d %H:%i:%s') as actual_start_time,
              EXISTS (
                SELECT 1 FROM inventory_outbound o
                WHERE (
                  o.production_task_id = pt.id
                  OR (o.reference_type = 'production_task' AND o.reference_id = pt.id)
                  OR (
                    o.reference_type = 'batch_production_tasks'
                    AND o.source_task_ids IS NOT NULL
                    AND JSON_CONTAINS(o.source_task_ids, CAST(pt.id AS JSON))
                  )
                )
                AND o.status NOT IN ('cancelled', 'reversed')
                AND o.deleted_at IS NULL
              ) as has_outbound_document
       FROM production_tasks pt
       LEFT JOIN production_plans pp ON pt.plan_id = pp.id
       LEFT JOIN materials p ON pt.product_id = p.id
       LEFT JOIN units u ON p.unit_id = u.id
       WHERE pt.deleted_at IS NULL ${whereClause}
       ORDER BY pt.created_at DESC`,
      pagination.limit,
      pagination.offset
    );
    const [tasks] = await pool.query(listSql, filterParams);

    // 批量获取工序（消除 N+1）
    if (tasks.length > 0) {
      const taskIds = tasks.map((t) => t.id);
      const placeholders = taskIds.map(() => '?').join(',');
      const [processes] = await pool.query(
        `SELECT pp.id, pp.task_id, pp.process_name, pp.sequence, pp.quantity,
                pp.progress, pp.status, pp.standard_hours, pp.description, pp.remarks,
                DATE_FORMAT(pp.planned_start_time, '%Y-%m-%d %H:%i:%s') as plannedStartTime,
                DATE_FORMAT(pp.planned_end_time, '%Y-%m-%d %H:%i:%s') as plannedEndTime,
                DATE_FORMAT(pp.actual_start_time, '%Y-%m-%d %H:%i:%s') as actualStartTime,
                DATE_FORMAT(pp.actual_end_time, '%Y-%m-%d %H:%i:%s') as actualEndTime
         FROM production_processes pp
         WHERE pp.task_id IN (${placeholders})
         ORDER BY pp.task_id, pp.sequence`,
        taskIds
      );
      const processesMap = {};
      processes.forEach((p) => {
        if (!processesMap[p.task_id]) processesMap[p.task_id] = [];
        processesMap[p.task_id].push({
          ...p,
          processName: p.process_name,
        });
      });
      tasks.forEach((t) => { t.processes = processesMap[t.id] || []; });
    }

    // 计数查询
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM production_tasks pt
       LEFT JOIN materials p ON pt.product_id = p.id
       WHERE pt.deleted_at IS NULL ${whereClause}`,
      filterParams
    );
    const total = countResult[0].total;

    // 统计查询
    const [statsResult] = await pool.query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.PENDING}' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.PREPARING}' THEN 1 ELSE 0 END) as preparing,
         SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED}' THEN 1 ELSE 0 END) as material_issued,
         SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}' THEN 1 ELSE 0 END) as in_progress,
         SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN pt.status = '${PRODUCTION_STATUS_KEYS.CANCELLED}' THEN 1 ELSE 0 END) as cancelled
       FROM production_tasks pt
       LEFT JOIN materials p ON pt.product_id = p.id
       WHERE pt.deleted_at IS NULL ${whereClause}`,
      filterParams
    );

    return {
      items: tasks,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      statistics: statsResult[0] || {},
    };
  }

  /**
   * 获取任务关联的工序列表
   * @param {number} taskId
   * @returns {Promise<Array>}
   */
  static async findProcessesByTaskId(taskId) {
    const [rows] = await pool.query(
      `SELECT id, task_id, process_name, sequence, quantity, planned_start_time,
              planned_end_time, actual_start_time, actual_end_time, progress,
              status, description, remarks, created_at, updated_at,
              sequence_number, standard_hours, efficiency_rate
       FROM production_processes
       WHERE task_id = ?
       ORDER BY sequence`,
      [taskId]
    );
    return rows;
  }

  /**
   * 检查任务是否有下游单据（出库/报工/检验）
   * @param {Object} conn
   * @param {number} taskId
   * @returns {Promise<{outbound_count: number, report_count: number, inspection_count: number}>}
   */
  static async checkDownstreamDocuments(conn, taskId) {
    const [rows] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM inventory_outbound
          WHERE (
            production_task_id = ?
            OR (reference_type = 'production_task' AND reference_id = ?)
            OR (
              reference_type = 'batch_production_tasks'
              AND source_task_ids IS NOT NULL
              AND JSON_CONTAINS(source_task_ids, CAST(? AS JSON))
            )
          )
            AND status NOT IN ('cancelled', 'reversed')
            AND deleted_at IS NULL) as outbound_count,
         (SELECT COUNT(*) FROM production_reports WHERE task_id = ?) as report_count,
         (SELECT COUNT(*) FROM quality_inspections
          WHERE task_id = ? AND deleted_at IS NULL AND (status IS NULL OR status != 'cancelled')) as inspection_count`,
      [taskId, taskId, String(taskId), taskId, taskId]
    );
    return rows[0] || { outbound_count: 0, report_count: 0, inspection_count: 0 };
  }

  /**
   * 获取计划的活跃任务数
   * @param {Object} conn
   * @param {number} planId
   * @param {string} cancelledStatus
   * @returns {Promise<number>}
   */
  static async countActivePlanTasks(conn, planId, cancelledStatus) {
    const [rows] = await conn.query(
      `SELECT COUNT(*) as active_count
       FROM production_tasks
       WHERE plan_id = ? AND deleted_at IS NULL AND status != ?`,
      [planId, cancelledStatus]
    );
    return Number(rows[0]?.active_count || 0);
  }

  // ======================== 写入类 ========================

  /**
   * 创建任务
   * @param {Object} conn
   * @param {Object} data
   * @returns {Promise<number>} insertId
   */
  static async create(conn, data) {
    const [result] = await conn.query(
      `INSERT INTO production_tasks
       (code, plan_id, product_id, quantity, start_date, expected_end_date, manager, remarks, cost_center_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'allocated')`,
      [
        data.code,
        data.plan_id || null,
        data.product_id,
        data.quantity,
        data.start_date || null,
        data.expected_end_date || null,
        data.manager || '未分配',
        data.remarks || '',
        data.cost_center_id,
      ]
    );
    return result.insertId;
  }

  /**
   * 更新任务
   * @param {Object} conn
   * @param {number} id
   * @param {Object} data
   */
  static async update(conn, id, data) {
    await conn.query(
      `UPDATE production_tasks
       SET plan_id = ?, product_id = ?, quantity = ?, start_date = ?,
           expected_end_date = ?, manager = ?, remarks = ?, cost_center_id = ?, status = IFNULL(?, status)
       WHERE id = ? AND deleted_at IS NULL`,
      [
        data.plan_id || null,
        data.product_id,
        data.quantity,
        data.start_date || null,
        data.expected_end_date || null,
        data.manager,
        data.remarks || '',
        data.cost_center_id,
        data.status || null,
        id,
      ]
    );
  }

  /**
   * 更新任务状态
   * @param {Object} conn
   * @param {number} id
   * @param {string} status
   */
  static async updateStatus(conn, id, status) {
    await conn.query(
      'UPDATE production_tasks SET status = ? WHERE id = ? AND deleted_at IS NULL',
      [status, id]
    );
  }

  /**
   * 软删除任务及关联数据
   * @param {Object} conn
   * @param {number} id
   */
  static async deleteWithRelated(conn, id) {
    await conn.query('DELETE FROM production_processes WHERE task_id = ?', [id]);
    await conn.query('DELETE FROM production_reports WHERE task_id = ?', [id]);
    await softDelete(conn, 'production_tasks', 'id', id);
  }

  // ======================== 计划关联 ========================

  /**
   * 查询计划（含锁）
   * @param {Object} conn
   * @param {number} planId
   * @returns {Promise<Object|null>}
   */
  static async findPlanById(conn, planId) {
    const [rows] = await conn.query(
      `SELECT id, status, product_id, quantity, COALESCE(pushed_quantity, 0) as pushed_quantity
       FROM production_plans
       WHERE id = ? AND deleted_at IS NULL
       FOR UPDATE`,
      [planId]
    );
    return rows[0] || null;
  }

  /**
   * 增加计划已下推数量
   * @param {Object} conn
   * @param {number} planId
   * @param {number} quantity
   */
  static async incrementPlanPushedQuantity(conn, planId, quantity) {
    await conn.query(
      `UPDATE production_plans
       SET pushed_quantity = COALESCE(pushed_quantity, 0) + ?
       WHERE id = ? AND deleted_at IS NULL`,
      [quantity, planId]
    );
  }

  /**
   * 减少计划已下推数量
   * @param {Object} conn
   * @param {number} planId
   * @param {number} quantity
   */
  static async decrementPlanPushedQuantity(conn, planId, quantity) {
    await conn.query(
      `UPDATE production_plans
       SET pushed_quantity = GREATEST(0, COALESCE(pushed_quantity, 0) - ?)
       WHERE id = ? AND deleted_at IS NULL`,
      [quantity, planId]
    );
  }

  /**
   * 更新计划状态
   * @param {Object} conn
   * @param {number} planId
   * @param {string} status
   */
  static async updatePlanStatus(conn, planId, status) {
    await conn.query(
      `UPDATE production_plans
       SET status = ?
       WHERE id = ? AND deleted_at IS NULL AND status NOT IN ('completed', 'cancelled')`,
      [status, planId]
    );
  }

  // ======================== 工序 ========================

  /**
   * 根据产品查找激活的工序模板
   * @param {Object} conn
   * @param {number} productId
   * @returns {Promise<{templateId: number|null, steps: Array}>}
   */
  static async findActiveProcessTemplate(conn, productId) {
    if (!productId) return { templateId: null, steps: [] };

    const [templates] = await conn.query(
      'SELECT id FROM process_templates WHERE product_id = ? AND status = 1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
      [productId]
    );
    if (templates.length === 0) return { templateId: null, steps: [] };

    const templateId = templates[0].id;
    const [steps] = await conn.query(
      `SELECT id, template_id, order_num, name, description, standard_hours,
              department, remark, created_at, updated_at, instruction_docs
       FROM process_template_details
       WHERE template_id = ?
       ORDER BY order_num`,
      [templateId]
    );
    return { templateId, steps };
  }

  /**
   * 批量插入工序
   * @param {Object} conn
   * @param {number} taskId
   * @param {number} taskQuantity
   * @param {Array} steps
   */
  static async insertProcesses(conn, taskId, taskQuantity, steps) {
    for (const step of steps) {
      await conn.query(
        `INSERT INTO production_processes
         (task_id, process_name, sequence, quantity, progress, status, standard_hours, description, remarks)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
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
  }

  /**
   * 删除任务的所有工序
   * @param {Object} conn
   * @param {number} taskId
   */
  static async deleteProcesses(conn, taskId) {
    await conn.query('DELETE FROM production_processes WHERE task_id = ?', [taskId]);
  }

  /**
   * 同步工序数量
   * @param {Object} conn
   * @param {number} taskId
   * @param {number} quantity
   */
  static async syncProcessQuantity(conn, taskId, quantity) {
    await conn.query(
      'UPDATE production_processes SET quantity = ? WHERE task_id = ?',
      [quantity, taskId]
    );
  }

  // ======================== 成本中心 ========================

  /**
   * 根据产品推导成本中心 ID
   * @param {Object} conn
   * @param {number} productId
   * @returns {Promise<number|null>}
   */
  static async resolveCostCenterId(conn, productId) {
    if (!productId) return null;

    const [rows] = await conn.query(
      `SELECT cost_center_id
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
       LIMIT 1`,
      [productId]
    );
    return rows.length > 0 ? rows[0].cost_center_id : null;
  }

  // ======================== 工具方法 ========================

  /**
   * 构建通用查询过滤条件
   * @param {Object} params
   * @returns {{ whereClause: string, queryParams: Array }}
   */
  static buildFilterConditions(params) {
    const { status, statusList, code, product, keyword, manager, startDate, endDate } = params;
    let whereClause = '';
    const queryParams = [];

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
      } else if (status.includes(',')) {
        const statuses = status.split(',').map((s) => s.trim());
        const placeholders = statuses.map(() => '?').join(',');
        whereClause += ` AND pt.status IN (${placeholders})`;
        queryParams.push(...statuses);
      } else {
        whereClause += ' AND pt.status = ?';
        queryParams.push(status);
      }
    }

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

    if (manager) {
      whereClause += ' AND pt.manager LIKE ?';
      queryParams.push(`%${manager}%`);
    }
    if (startDate) {
      whereClause += ' AND DATE(pt.created_at) >= ?';
      queryParams.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND DATE(pt.created_at) <= ?';
      queryParams.push(endDate);
    }

    if (params.has_started_process === 'true' || params.has_started_process === true) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM production_processes pp
        WHERE pp.task_id = pt.id AND pp.status IN ('in_progress', 'completed')
      )`;
    }

    return { whereClause, queryParams };
  }
}

module.exports = TaskRepository;
