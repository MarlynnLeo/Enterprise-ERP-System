/**
 * SchedulingService.js
 * @description 生产排程与产能冲突检测服务
 * @date 2026-04-28
 * @version 1.0.0
 *
 * 核心功能：
 *  1. 根据产品工序模板 + 数量，自动计算总工时和预计结束时间
 *  2. 根据生产日历（班次、午休、周末）推算实际结束时刻
 *  3. 检测同一生产组在指定时间段内的任务冲突
 *  4. 自动填充各工序的计划开始/结束时间
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');

class SchedulingService {
  /**
   * 获取默认班次配置
   * @returns {Object} { work_start, work_end, break_start, break_end, exclude_weekends }
   */
  static async getDefaultCalendar() {
    const [rows] = await pool.query(
      'SELECT id, name, work_start, work_end, break_start, break_end, exclude_weekends, is_default, created_at, updated_at FROM production_calendar WHERE is_default = 1 LIMIT 1'
    );
    if (rows.length === 0) {
      // 兜底默认值
      return {
        work_start: '08:00:00',
        work_end: '17:30:00',
        break_start: '12:00:00',
        break_end: '13:00:00',
        exclude_weekends: 1,
      };
    }
    return rows[0];
  }

  /**
   * 获取产品的标准工时总和（分钟/件）
   * @param {number} productId - 产品ID
   * @param {Object} [connection] - 可选数据库连接
   * @returns {Object} { totalMinutesPerUnit, processes: [{name, standardHours, sequence}] }
   */
  static async getProductStandardHours(productId, connection = null) {
    const conn = connection || pool;

    // 通过产品ID找到激活的工序模板
    const [templates] = await conn.query(
      `SELECT id FROM process_templates
       WHERE product_id = ? AND status = 1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [productId]
    );

    if (templates.length === 0) {
      return { totalMinutesPerUnit: 0, processes: [], templateId: null };
    }

    const templateId = templates[0].id;

    // 获取工序详情及标准工时
    const [steps] = await conn.query(
      `SELECT name, standard_hours, order_num
       FROM process_template_details
       WHERE template_id = ?
       ORDER BY order_num`,
      [templateId]
    );

    let totalMinutesPerUnit = 0;
    const processes = steps.map((s) => {
      // 注意：数据库字段名为 standard_hours 但实际存储的是「分钟/件」
      // 例如：standard_hours = 0.10 表示每件需要 0.10 分钟（≈6秒）
      const minutesPerUnit = parseFloat(s.standard_hours) || 0;
      totalMinutesPerUnit += minutesPerUnit;
      return {
        name: s.name,
        standardHours: minutesPerUnit,  // 实为分钟/件
        sequence: s.order_num,
      };
    });

    return { totalMinutesPerUnit, processes, templateId };
  }

  /**
   * 计算预计耗时和结束时间
   * @param {Object} params
   * @param {number} params.productId - 产品ID
   * @param {number} params.quantity - 生产数量
   * @param {string} params.startTime - 开始时间 'YYYY-MM-DD HH:mm'
   * @returns {Object} { totalMinutes, estimatedEndTime, processSchedule }
   */
  static async calculateSchedule({ productId, quantity, startTime }) {
    const { totalMinutesPerUnit, processes, templateId } =
      await this.getProductStandardHours(productId);

    if (totalMinutesPerUnit === 0) {
      return {
        totalMinutes: 0,
        estimatedEndTime: startTime,
        processSchedule: [],
        templateId: null,
        warning: '该产品未配置工序标准工时，无法自动排程',
      };
    }

    // 总耗时 = 各工序工时之和 × 数量（串行工序）
    const totalMinutes = Math.ceil(totalMinutesPerUnit * quantity);

    // 获取班次配置
    const calendar = await this.getDefaultCalendar();

    // 推算结束时间（考虑午休和工作时间）
    const startDate = new Date(startTime);
    const estimatedEndTime = this._advanceWorkMinutes(startDate, totalMinutes, calendar);

    // 计算各工序的计划时间（串行排列）
    let cursor = new Date(startDate);
    const processSchedule = processes.map((proc) => {
      const procMinutes = Math.ceil(proc.standardHours * quantity);
      const procStart = new Date(cursor);
      const procEnd = this._advanceWorkMinutes(new Date(cursor), procMinutes, calendar);
      cursor = new Date(procEnd);
      return {
        name: proc.name,
        sequence: proc.sequence,
        standardHours: proc.standardHours,
        totalMinutes: procMinutes,
        plannedStartTime: this._formatDateTime(procStart),
        plannedEndTime: this._formatDateTime(procEnd),
      };
    });

    return {
      totalMinutes,
      totalHours: (totalMinutes / 60).toFixed(1),
      estimatedEndTime: this._formatDateTime(estimatedEndTime),
      processSchedule,
      templateId,
    };
  }

  /**
   * 检测时间冲突
   * @param {Object} params
   * @param {string} params.manager - 生产组
   * @param {string} params.startTime - 开始时间
   * @param {string} params.endTime - 结束时间
   * @param {number} [params.excludeTaskId] - 排除的任务ID（编辑时排除自身）
   * @returns {Object} { hasConflict, conflicts: [] }
   */
  static async checkConflicts({ manager, startTime, endTime, excludeTaskId = null, ignoreTaskIds = [] }, connection = null) {
    if (!manager || !startTime || !endTime) {
      return { hasConflict: false, conflicts: [] };
    }
    const conn = connection || pool;

    // 查询同一生产组中活跃且有时间交叉的任务
    // 使用 actual_start_time 或 start_date 作为任务开始时间
    // 使用工序的 planned_end_time 或 expected_end_date 作为任务结束时间
    let query = `
      SELECT
        t.id, t.code, t.quantity, t.manager, t.status,
        t.start_date, t.expected_end_date,
        t.actual_start_time,
        m.name as product_name,
        MIN(p.planned_start_time) as task_start,
        MAX(p.planned_end_time) as task_end
      FROM production_tasks t
      LEFT JOIN materials m ON t.product_id = m.id
      LEFT JOIN production_processes p ON p.task_id = t.id
      WHERE t.manager = ?
        AND t.status NOT IN ('completed', 'cancelled')
        AND t.deleted_at IS NULL
    `;
    const params = [manager];

    if (excludeTaskId) {
      query += ' AND t.id != ?';
      params.push(excludeTaskId);
    }
    const ignoredIds = (Array.isArray(ignoreTaskIds) ? ignoreTaskIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0 && id !== Number(excludeTaskId));
    if (ignoredIds.length > 0) {
      query += ` AND t.id NOT IN (${ignoredIds.map(() => '?').join(',')})`;
      params.push(...ignoredIds);
    }

    query += ' GROUP BY t.id';

    const [tasks] = await conn.query(query, params);

    const newStart = new Date(startTime).getTime();
    const newEnd = new Date(endTime).getTime();
    const conflicts = [];

    for (const task of tasks) {
      // 确定任务的实际时间范围
      const taskStart = task.task_start
        ? new Date(task.task_start).getTime()
        : task.actual_start_time
          ? new Date(task.actual_start_time).getTime()
          : task.start_date
            ? new Date(task.start_date).getTime()
            : null;

      const taskEnd = task.task_end
        ? new Date(task.task_end).getTime()
        : task.expected_end_date
          ? new Date(task.expected_end_date + ' 17:30:00').getTime()
          : null;

      if (!taskStart || !taskEnd) continue;

      // 检测时间交叉：A开始 < B结束 && A结束 > B开始
      if (newStart < taskEnd && newEnd > taskStart) {
        const overlapStart = Math.max(newStart, taskStart);
        const overlapEnd = Math.min(newEnd, taskEnd);
        const overlapMinutes = Math.round((overlapEnd - overlapStart) / 60000);

        conflicts.push({
          taskId: task.id,
          taskCode: task.code,
          productName: task.product_name,
          quantity: task.quantity,
          status: task.status,
          occupiedFrom: this._formatDateTime(new Date(taskStart)),
          occupiedTo: this._formatDateTime(new Date(taskEnd)),
          overlapMinutes,
          suggestedStart: this._formatDateTime(new Date(taskEnd)),
        });
      }
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  /**
   * 为已创建的任务自动填充工序计划时间
   * @param {number} taskId - 任务ID
   * @param {string} startTime - 开始时间
   * @param {number} quantity - 数量
   * @param {Object} connection - 数据库连接
   */
  static async fillProcessSchedule(taskId, startTime, quantity, connection) {
    const calendar = await this.getDefaultCalendar();

    // 获取任务的工序列表
    const [processes] = await connection.query(
      `SELECT id, standard_hours, sequence FROM production_processes
       WHERE task_id = ? ORDER BY sequence`,
      [taskId]
    );

    if (processes.length === 0) return;

    let cursor = new Date(startTime);

    for (const proc of processes) {
      const minutes = Math.ceil((parseFloat(proc.standard_hours) || 0) * quantity);
      const procStart = new Date(cursor);
      const procEnd = this._advanceWorkMinutes(new Date(cursor), minutes, calendar);

      await connection.query(
        `UPDATE production_processes
         SET planned_start_time = ?, planned_end_time = ?
         WHERE id = ?`,
        [this._formatDateTime(procStart), this._formatDateTime(procEnd), proc.id]
      );

      cursor = new Date(procEnd);
    }

    // 更新任务的预计结束时间
    const estimatedEnd = this._formatDateTime(cursor);
    await connection.query(
      'UPDATE production_tasks SET expected_end_date = ? WHERE id = ?',
      [estimatedEnd.split(' ')[0], taskId]
    );

    logger.info(`[排程] 任务 ${taskId} 工序时间已填充，预计结束: ${estimatedEnd}`);
    return estimatedEnd;
  }

  /**
   * 批量排程 — 按指定顺序串行排程多个任务
   * @param {Object} params
   * @param {Array<number>} params.taskIds - 有序的任务ID列表
   * @param {string} params.startTime - 第一个任务的开始时间
   * @returns {Object} { scheduled: [{ taskId, code, productName, startTime, endTime, totalMinutes }] }
   */
  static async batchSchedule({ taskIds, groups, startTime }) {
    if (Array.isArray(groups) && groups.length > 0) {
      return this.batchScheduleGroups({ groups, startTime });
    }

    if (!taskIds || taskIds.length === 0) {
      return { scheduled: [] };
    }

    const normalizedTaskIds = [...new Set(
      taskIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];
    if (normalizedTaskIds.length === 0) {
      return { scheduled: [] };
    }

    return this.batchScheduleGroups({
      groups: [{ name: 'default', taskIds: normalizedTaskIds }],
      startTime,
    });
  }

  // ============ 内部工具方法 ============

  /**
   * 从指定时间推进 N 个工作分钟（跳过午休、下班时间、周末）
   * @param {Date} start - 起始时间
   * @param {number} minutes - 需要推进的工作分钟数
   * @param {Object} calendar - 班次配置
   * @returns {Date} 结束时间
   */
  static async batchScheduleGroups({ groups, startTime }) {
    const normalizedGroups = this._normalizeBatchScheduleGroups(groups);
    if (normalizedGroups.length === 0) {
      return { scheduled: [], groups: [] };
    }

    const start = new Date(startTime);
    if (isNaN(start)) {
      const error = new Error('Invalid startTime');
      error.statusCode = 400;
      throw error;
    }

    const connection = await pool.getConnection();
    const calendar = await this.getDefaultCalendar();
    const scheduled = [];
    const groupResults = [];

    try {
      await connection.beginTransaction();

      for (const group of normalizedGroups) {
        const groupScheduled = await this._scheduleTaskSequence({
          connection,
          calendar,
          taskIds: group.taskIds,
          startTime,
          groupName: group.name,
        });

        groupResults.push({
          name: group.name,
          taskIds: group.taskIds,
          scheduled: groupScheduled,
        });
        scheduled.push(...groupScheduled);
      }

      await this._syncScheduledPlanDates(connection, scheduled.map((item) => item.taskId));

      await connection.commit();
      logger.info(`[批量排程] 已排程 ${scheduled.length} 个任务，生产组 ${groupResults.length} 个`);

      return { scheduled, groups: groupResults };
    } catch (error) {
      await connection.rollback();
      logger.error('[批量排程] 失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static _normalizeBatchScheduleGroups(groups) {
    const grouped = new Map();
    const seenTaskIds = new Set();

    for (const [index, group] of groups.entries()) {
      const name = String(group?.name || `group_${index + 1}`);
      const taskIds = (Array.isArray(group?.taskIds) ? group.taskIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);

      if (taskIds.length === 0) continue;
      if (!grouped.has(name)) grouped.set(name, []);

      for (const taskId of taskIds) {
        if (seenTaskIds.has(taskId)) {
          const error = new Error(`Task ${taskId} appears in multiple scheduling groups`);
          error.statusCode = 400;
          throw error;
        }
        seenTaskIds.add(taskId);
        grouped.get(name).push(taskId);
      }
    }

    return Array.from(grouped.entries()).map(([name, taskIds]) => ({ name, taskIds }));
  }

  static async _scheduleTaskSequence({
    connection,
    calendar,
    taskIds,
    startTime,
    groupName,
  }) {
    const scheduled = [];
    let cursor = new Date(startTime);

    for (const taskId of taskIds) {
      const [taskRows] = await connection.query(
        `SELECT t.id, t.code, t.product_id, t.quantity, t.manager, t.status, t.plan_id,
                m.name as product_name,
                pp.delivery_date
         FROM production_tasks t
         LEFT JOIN materials m ON t.product_id = m.id
         LEFT JOIN production_plans pp ON t.plan_id = pp.id
         WHERE t.id = ? AND t.deleted_at IS NULL
         FOR UPDATE`,
        [taskId]
      );

      if (taskRows.length === 0) {
        const error = new Error(`Task ${taskId} does not exist or has been deleted`);
        error.statusCode = 404;
        throw error;
      }

      const task = taskRows[0];
      await this._assertTaskSchedulable(connection, task);
      const quantity = parseFloat(task.quantity) || 0;
      const { totalMinutesPerUnit } = await this.getProductStandardHours(task.product_id, connection);
      const totalMinutes = Math.ceil(totalMinutesPerUnit * quantity);
      const hasStandardHours = totalMinutesPerUnit > 0;

      const taskStart = new Date(cursor);
      const taskEnd = totalMinutes > 0
        ? this._advanceWorkMinutes(new Date(cursor), totalMinutes, calendar)
        : this._advanceWorkMinutes(new Date(cursor), 480, calendar);

      if (totalMinutes <= 0) {
        logger.warn(`[批量排程] 任务 ${task.code} 缺少标准工时，已按 1 个工作日排程`);
      }

      const startStr = this._formatDateTime(taskStart);
      const endStr = this._formatDateTime(taskEnd);
      const manager = task.manager || groupName;

      const conflictResult = await this.checkConflicts({
        manager,
        startTime: startStr,
        endTime: endStr,
        excludeTaskId: task.id,
        ignoreTaskIds: taskIds,
      }, connection);
      if (conflictResult.hasConflict) {
        const firstConflict = conflictResult.conflicts[0];
        const error = new Error(
          `任务 ${task.code} 与 ${manager} 的既有排程 ${firstConflict.taskCode} 冲突，请调整起始时间或先处理冲突任务`
        );
        error.statusCode = 409;
        error.details = conflictResult.conflicts;
        throw error;
      }

      await connection.query(
        `UPDATE production_tasks
         SET start_date = ?, expected_end_date = ?
         WHERE id = ?`,
        [startStr.split(' ')[0], endStr.split(' ')[0], taskId]
      );

      const [processes] = await connection.query(
        `SELECT id, standard_hours, sequence FROM production_processes
         WHERE task_id = ? ORDER BY sequence`,
        [taskId]
      );

      let procCursor = new Date(taskStart);
      for (const proc of processes) {
        const minutes = Math.ceil((parseFloat(proc.standard_hours) || 0) * quantity);
        const procStart = new Date(procCursor);
        const procEnd = this._advanceWorkMinutes(new Date(procCursor), minutes, calendar);

        await connection.query(
          `UPDATE production_processes
           SET planned_start_time = ?, planned_end_time = ?
           WHERE id = ?`,
          [this._formatDateTime(procStart), this._formatDateTime(procEnd), proc.id]
        );
        procCursor = new Date(procEnd);
      }

      let deliveryStatus = null;
      let overdueDays = 0;
      const deliveryDate = task.delivery_date ? new Date(task.delivery_date) : null;
      if (deliveryDate) {
        const endDate = new Date(endStr.split(' ')[0]);
        const diffMs = deliveryDate - endDate;
        overdueDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        deliveryStatus = overdueDays >= 0 ? 'ok' : 'overdue';
      }

      scheduled.push({
        taskId: task.id,
        code: task.code,
        productName: task.product_name,
        manager,
        groupName,
        quantity: task.quantity,
        totalMinutes,
        totalHours: (totalMinutes / 60).toFixed(1),
        startTime: startStr,
        endTime: endStr,
        hasStandardHours,
        warning: !hasStandardHours ? '标准工时缺失，排程时间按默认值估算' : null,
        deliveryDate: task.delivery_date ? this._formatDateTime(deliveryDate).split(' ')[0] : null,
        deliveryStatus,
        overdueDays: deliveryStatus === 'overdue' ? Math.abs(overdueDays) : 0,
      });

      cursor = new Date(taskEnd);
    }

    return scheduled;
  }

  static async _assertTaskSchedulable(connection, task) {
    const schedulableStatuses = new Set(['pending', 'allocated', 'preparing']);
    if (!schedulableStatuses.has(task.status)) {
      const error = new Error(
        `任务 ${task.code} 当前状态为 ${task.status}，只能对未发料、未报工、未检验的任务排程`
      );
      error.statusCode = 400;
      throw error;
    }

    const [usageRows] = await connection.query(
      `SELECT
         (SELECT COUNT(*)
          FROM inventory_outbound o
          WHERE o.status NOT IN ('cancelled', 'reversed')
            AND o.deleted_at IS NULL
            AND (
              o.production_task_id = ?
              OR (o.reference_type = 'production_task' AND o.reference_id = ?)
              OR (
                o.reference_type = 'batch_production_tasks'
                AND o.source_task_ids IS NOT NULL
                AND JSON_CONTAINS(o.source_task_ids, CAST(? AS JSON))
              )
            )) as outbound_count,
         (SELECT COUNT(*) FROM production_reports WHERE task_id = ?) as report_count,
         (SELECT COUNT(*)
          FROM quality_inspections qi
          WHERE qi.task_id = ?
            AND qi.deleted_at IS NULL
            AND (qi.status IS NULL OR qi.status NOT IN ('cancelled'))) as inspection_count`,
      [task.id, task.id, String(task.id), task.id, task.id]
    );

    const usage = usageRows[0] || {};
    if (
      Number(usage.outbound_count || 0) > 0 ||
      Number(usage.report_count || 0) > 0 ||
      Number(usage.inspection_count || 0) > 0
    ) {
      const error = new Error(
        `任务 ${task.code} 已有关联发料、报工或检验单据，不能重新排程；请先走撤销/关闭流程`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  static async _syncScheduledPlanDates(connection, scheduledTaskIds) {
    const taskIds = [...new Set(
      (scheduledTaskIds || [])
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    )];
    if (taskIds.length === 0) return;

    const [planRows] = await connection.query(
      `SELECT DISTINCT plan_id
       FROM production_tasks
       WHERE id IN (${taskIds.map(() => '?').join(',')}) AND plan_id IS NOT NULL`,
      taskIds
    );

    for (const { plan_id: planId } of planRows) {
      const [timeRange] = await connection.query(
        `SELECT MIN(start_date) as earliest_start, MAX(expected_end_date) as latest_end
         FROM production_tasks
         WHERE plan_id = ? AND start_date IS NOT NULL AND deleted_at IS NULL
           AND status NOT IN ('cancelled')`,
        [planId]
      );

      if (timeRange[0]?.earliest_start) {
        await connection.query(
          `UPDATE production_plans SET start_date = ?, end_date = ? WHERE id = ?`,
          [timeRange[0].earliest_start, timeRange[0].latest_end, planId]
        );
        logger.info(`[排程反写] 计划 ${planId} 时间已更新: ${timeRange[0].earliest_start} ~ ${timeRange[0].latest_end}`);
      }
    }
  }

  static _advanceWorkMinutes(start, minutes, calendar) {
    const cursor = new Date(start);
    let remaining = minutes;

    // 解析班次时间
    const [wsH, wsM] = calendar.work_start.split(':').map(Number);
    const [weH, weM] = calendar.work_end.split(':').map(Number);
    const [bsH, bsM] = (calendar.break_start || '12:00:00').split(':').map(Number);
    const [beH, beM] = (calendar.break_end || '13:00:00').split(':').map(Number);

    // 每天有效工作分钟数 = (下班-上班) - (午休结束-午休开始)


    // 安全保护：最多循环365天
    let safetyCounter = 0;

    while (remaining > 0 && safetyCounter < 365 * 2) {
      safetyCounter++;

      // 跳过周末
      if (calendar.exclude_weekends) {
        const dow = cursor.getDay(); // 0=周日, 6=周六
        if (dow === 0 || dow === 6) {
          cursor.setDate(cursor.getDate() + 1);
          cursor.setHours(wsH, wsM, 0, 0);
          continue;
        }
      }

      const curH = cursor.getHours();
      const curM = cursor.getMinutes();
      const curMinOfDay = curH * 60 + curM;
      const workStartMin = wsH * 60 + wsM;
      const workEndMin = weH * 60 + weM;
      const breakStartMin = bsH * 60 + bsM;
      const breakEndMin = beH * 60 + beM;

      // 如果在上班时间之前，跳到上班时间
      if (curMinOfDay < workStartMin) {
        cursor.setHours(wsH, wsM, 0, 0);
        continue;
      }

      // 如果在下班时间之后，跳到第二天上班
      if (curMinOfDay >= workEndMin) {
        cursor.setDate(cursor.getDate() + 1);
        cursor.setHours(wsH, wsM, 0, 0);
        continue;
      }

      // 如果在午休时间内，跳到午休结束
      if (curMinOfDay >= breakStartMin && curMinOfDay < breakEndMin) {
        cursor.setHours(beH, beM, 0, 0);
        continue;
      }

      // 计算当前时段可用分钟（到下一个中断点）
      let availableMinutes;
      if (curMinOfDay < breakStartMin) {
        // 上午时段：可用到午休开始
        availableMinutes = breakStartMin - curMinOfDay;
      } else {
        // 下午时段：可用到下班
        availableMinutes = workEndMin - curMinOfDay;
      }

      if (remaining <= availableMinutes) {
        // 本时段内完成
        cursor.setMinutes(cursor.getMinutes() + remaining);
        remaining = 0;
      } else {
        // 本时段不够，用完后跳到下一时段
        remaining -= availableMinutes;
        if (curMinOfDay < breakStartMin) {
          // 上午用完 → 跳到午休结束
          cursor.setHours(beH, beM, 0, 0);
        } else {
          // 下午用完 → 跳到第二天上班
          cursor.setDate(cursor.getDate() + 1);
          cursor.setHours(wsH, wsM, 0, 0);
        }
      }
    }

    return cursor;
  }

  /**
   * 格式化日期时间为 MySQL 格式
   */
  static _formatDateTime(date) {
    if (!(date instanceof Date) || isNaN(date)) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  static async getGanttData({ startDate, endDate } = {}) {
    const { start, end, rangeStartMs, rangeEndMs } = this._normalizeGanttRange(startDate, endDate);

    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.code,
        t.quantity,
        COALESCE(NULLIF(t.manager, ''), '未分配') AS manager,
        t.status,
        DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(t.expected_end_date, '%Y-%m-%d') AS expected_end_date,
        DATE_FORMAT(t.actual_start_time, '%Y-%m-%d %H:%i:%s') AS actual_start_time,
        DATE_FORMAT(t.actual_end_date, '%Y-%m-%d') AS actual_end_date,
        m.name AS product_name,
        m.code AS product_code,
        u.name AS unit_name,
        pp.code AS plan_code,
        pp.name AS plan_name,
        DATE_FORMAT(pp.delivery_date, '%Y-%m-%d') AS delivery_date,
        DATE_FORMAT(MIN(p.planned_start_time), '%Y-%m-%d %H:%i:%s') AS planned_start,
        DATE_FORMAT(MAX(p.planned_end_time), '%Y-%m-%d %H:%i:%s') AS planned_end,
        COUNT(p.id) AS process_count
      FROM production_tasks t
      LEFT JOIN materials m ON t.product_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN production_plans pp ON t.plan_id = pp.id
      LEFT JOIN production_processes p ON p.task_id = t.id
      WHERE t.deleted_at IS NULL
        AND t.status <> 'cancelled'
        AND (
          (
            t.start_date IS NOT NULL
            AND t.start_date <= ?
            AND COALESCE(t.expected_end_date, t.start_date) >= ?
          )
          OR (
            t.actual_start_time IS NOT NULL
            AND DATE(t.actual_start_time) <= ?
            AND COALESCE(t.actual_end_date, t.expected_end_date, DATE(t.actual_start_time)) >= ?
          )
          OR (
            p.planned_start_time IS NOT NULL
            AND p.planned_start_time <= CONCAT(?, ' 23:59:59')
            AND COALESCE(p.planned_end_time, p.planned_start_time) >= CONCAT(?, ' 00:00:00')
          )
        )
      GROUP BY
        t.id, t.code, t.quantity, t.manager, t.status, t.start_date,
        t.expected_end_date, t.actual_start_time, t.actual_end_date,
        m.name, m.code, u.name, pp.code, pp.name, pp.delivery_date
      ORDER BY manager ASC, COALESCE(MIN(p.planned_start_time), t.actual_start_time, t.start_date, t.created_at) ASC
      `,
      [end, start, end, start, end, start]
    );

    const today = this._formatDateOnly(new Date());
    const groupsByName = new Map();
    const meta = {
      totalTasks: 0,
      scheduledTasks: 0,
      activeTasks: 0,
      overdueTasks: 0,
      dateIssueTasks: 0,
      missingDateTasks: 0,
      source: {
        primary: 'production_tasks',
        joins: ['materials', 'units', 'production_plans', 'production_processes'],
      },
      generatedAt: new Date().toISOString(),
    };

    const activeStatuses = new Set([
      'preparing',
      'material_issuing',
      'material_partial_issued',
      'material_issued',
      'in_progress',
      'inspection',
      'warehousing',
    ]);

    for (const row of rows) {
      const startTime =
        row.planned_start ||
        row.actual_start_time ||
        (row.start_date ? `${row.start_date} 08:00:00` : null);
      const rawEndTime =
        row.planned_end ||
        (row.actual_end_date ? `${row.actual_end_date} 17:30:00` : null) ||
        (row.expected_end_date ? `${row.expected_end_date} 17:30:00` : null) ||
        (row.start_date ? `${row.start_date} 17:30:00` : null);

      if (!startTime || !rawEndTime) {
        meta.missingDateTasks += 1;
        continue;
      }

      const startMs = this._parseDateTimeMs(startTime);
      const rawEndMs = this._parseDateTimeMs(rawEndTime);

      if (!Number.isFinite(startMs) || !Number.isFinite(rawEndMs)) {
        meta.dateIssueTasks += 1;
        continue;
      }

      const hasDateIssue = rawEndMs < startMs;
      const endMs = hasDateIssue ? startMs : rawEndMs;

      if (startMs > rangeEndMs || endMs < rangeStartMs) {
        continue;
      }

      const groupName = row.manager || '未分配';
      if (!groupsByName.has(groupName)) groupsByName.set(groupName, []);

      const isOverdue =
        row.expected_end_date &&
        row.expected_end_date < today &&
        !['completed', 'cancelled'].includes(row.status);

      const task = {
        id: row.id,
        code: row.code,
        productName: row.product_name || '未命名产品',
        productCode: row.product_code || '',
        planCode: row.plan_code || '',
        planName: row.plan_name || '',
        quantity: Number(row.quantity || 0),
        unitName: row.unit_name || '',
        manager: groupName,
        status: row.status || 'pending',
        startTime: this._toIsoFromSqlDateTime(startTime),
        endTime: this._toIsoFromSqlDateTime(hasDateIssue ? startTime : rawEndTime),
        startDate: row.start_date,
        expectedEndDate: row.expected_end_date,
        deliveryDate: row.delivery_date,
        durationHours: hasDateIssue ? 0 : Number(((endMs - startMs) / 3600000).toFixed(1)),
        processCount: Number(row.process_count || 0),
        isOverdue,
        dateIssue: hasDateIssue ? 'end_before_start' : null,
        source: 'production_tasks',
      };

      groupsByName.get(groupName).push(task);
      meta.totalTasks += 1;
      meta.scheduledTasks += 1;
      if (activeStatuses.has(task.status)) meta.activeTasks += 1;
      if (isOverdue) meta.overdueTasks += 1;
      if (hasDateIssue) meta.dateIssueTasks += 1;
    }

    const groups = Array.from(groupsByName.entries())
      .map(([name, tasks]) => ({
        name,
        tasks: tasks.sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    return {
      groups,
      dateRange: { start, end },
      meta,
    };
  }

  static _normalizeGanttRange(startDate, endDate) {
    const today = new Date();
    const start = startDate || this._formatDateOnly(new Date(today.getTime() - 30 * 86400000));
    const end = endDate || this._formatDateOnly(new Date(today.getTime() + 30 * 86400000));
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    if (!datePattern.test(start) || !datePattern.test(end)) {
      const error = new Error('startDate/endDate must be YYYY-MM-DD');
      error.statusCode = 400;
      throw error;
    }

    const rangeStartMs = this._parseDateTimeMs(`${start} 00:00:00`);
    const rangeEndMs = this._parseDateTimeMs(`${end} 23:59:59`);
    if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeStartMs > rangeEndMs) {
      const error = new Error('Invalid Gantt date range');
      error.statusCode = 400;
      throw error;
    }

    const maxRangeDays = 180;
    const rangeDays = Math.ceil((rangeEndMs - rangeStartMs) / 86400000);
    if (rangeDays > maxRangeDays) {
      const error = new Error(`Gantt date range cannot exceed ${maxRangeDays} days`);
      error.statusCode = 400;
      throw error;
    }

    return { start, end, rangeStartMs, rangeEndMs };
  }

  static _parseDateTimeMs(value) {
    if (!value) return NaN;
    if (value instanceof Date) return value.getTime();
    const normalized = String(value).replace(' ', 'T');
    return new Date(normalized).getTime();
  }

  static _toIsoFromSqlDateTime(value) {
    const time = this._parseDateTimeMs(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }

  static _formatDateOnly(date) {
    if (!(date instanceof Date) || isNaN(date)) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
}

module.exports = SchedulingService;
