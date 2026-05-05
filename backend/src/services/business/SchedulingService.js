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
      'SELECT * FROM production_calendar WHERE is_default = 1 LIMIT 1'
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
  static async checkConflicts({ manager, startTime, endTime, excludeTaskId = null }) {
    if (!manager || !startTime || !endTime) {
      return { hasConflict: false, conflicts: [] };
    }

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

    query += ' GROUP BY t.id';

    const [tasks] = await pool.query(query, params);

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
  static async batchSchedule({ taskIds, startTime }) {
    if (!taskIds || taskIds.length === 0) {
      return { scheduled: [] };
    }

    const connection = await pool.getConnection();
    const calendar = await this.getDefaultCalendar();
    const scheduled = [];

    try {
      await connection.beginTransaction();

      let cursor = new Date(startTime);

      for (const taskId of taskIds) {
        // 获取任务信息
        // 查询任务信息（排除已完成/已取消的任务）
        const [taskRows] = await connection.query(
          `SELECT t.id, t.code, t.product_id, t.quantity, t.manager, t.status, t.plan_id,
                  m.name as product_name,
                  pp.delivery_date
           FROM production_tasks t
           LEFT JOIN materials m ON t.product_id = m.id
           LEFT JOIN production_plans pp ON t.plan_id = pp.id
           WHERE t.id = ? AND t.deleted_at IS NULL
             AND t.status NOT IN ('completed', 'cancelled')`,
          [taskId]
        );

        if (taskRows.length === 0) {
          logger.warn(`[批量排程] 任务 ${taskId} 不存在或状态不可排程，跳过`);
          continue;
        }

        const task = taskRows[0];
        const quantity = parseFloat(task.quantity) || 0;

        // 获取产品工时
        const { totalMinutesPerUnit } = await this.getProductStandardHours(task.product_id, connection);
        const totalMinutes = Math.ceil(totalMinutesPerUnit * quantity);
        const hasStandardHours = totalMinutesPerUnit > 0;

        const taskStart = new Date(cursor);
        let taskEnd;

        if (totalMinutes > 0) {
          taskEnd = this._advanceWorkMinutes(new Date(cursor), totalMinutes, calendar);
        } else {
          // 无工时数据，默认占1天
          taskEnd = this._advanceWorkMinutes(new Date(cursor), 480, calendar);
          logger.warn(`[批量排程] 任务 ${task.code} 工时数据缺失，已按默认1天排程`);
        }

        const startStr = this._formatDateTime(taskStart);
        const endStr = this._formatDateTime(taskEnd);

        // 排程只回写日期，不改变状态（状态由「发料」操作驱动）
        await connection.query(
          `UPDATE production_tasks 
           SET start_date = ?, expected_end_date = ?
           WHERE id = ?`,
          [startStr.split(' ')[0], endStr.split(' ')[0], taskId]
        );

        // 填充工序时间
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

        // 交期对比
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
          manager: task.manager,
          quantity: task.quantity,
          totalMinutes,
          totalHours: (totalMinutes / 60).toFixed(1),
          startTime: startStr,
          endTime: endStr,
          hasStandardHours,
          warning: !hasStandardHours ? '工时数据缺失，时间不准确' : null,
          deliveryDate: task.delivery_date ? this._formatDateTime(deliveryDate).split(' ')[0] : null,
          deliveryStatus,
          overdueDays: deliveryStatus === 'overdue' ? Math.abs(overdueDays) : 0,
        });

        // 下一个任务的开始 = 当前任务的结束
        cursor = new Date(taskEnd);
      }

      // ===== 反写时间到关联的生产计划 =====
      // 收集本次排程涉及的所有 plan_id
      const planIds = [...new Set(
        (await connection.query(
          `SELECT DISTINCT plan_id FROM production_tasks WHERE id IN (${taskIds.map(() => '?').join(',')}) AND plan_id IS NOT NULL`,
          taskIds
        ))[0].map(r => r.plan_id)
      )];

      for (const planId of planIds) {
        // 查询该计划下所有已排程任务的时间范围
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

      await connection.commit();
      logger.info(`[批量排程] 已排程 ${scheduled.length} 个任务`);

      return { scheduled };
    } catch (error) {
      await connection.rollback();
      logger.error('[批量排程] 失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ============ 内部工具方法 ============

  /**
   * 从指定时间推进 N 个工作分钟（跳过午休、下班时间、周末）
   * @param {Date} start - 起始时间
   * @param {number} minutes - 需要推进的工作分钟数
   * @param {Object} calendar - 班次配置
   * @returns {Date} 结束时间
   */
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
}

module.exports = SchedulingService;
