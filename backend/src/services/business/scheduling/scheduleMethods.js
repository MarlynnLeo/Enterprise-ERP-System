/**
 * SchedulingService — schedule methods (mixin)
 */

const runtime = require('./runtime');
const {
  pool,
  logger,
  DEFAULT_WORK_END,
  SCHEDULABLE_STATUSES,
} = runtime;

module.exports = {
  /**
     * 获取产品的标准工时总和（分钟/件）
     * @param {number} productId - 产品ID
     * @param {Object} [connection] - 可选数据库连接
     * @returns {Object} { totalMinutesPerUnit, processes: [{name, standardHours, sequence}] }
     */
    async getProductStandardHours(productId, connection = null) {
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
        // standard_hours 存储的是「小时/件」，需要乘以 60 转换为分钟/件
        // 例如：standard_hours = 0.20 表示每件需要 0.20 小时 = 12 分钟
        const minutesPerUnit = (parseFloat(s.standard_hours) || 0) * 60;
        totalMinutesPerUnit += minutesPerUnit;
        return {
          name: s.name,
          standardHours: minutesPerUnit,  // 分钟/件（已从小时转换）
          sequence: s.order_num,
        };
      });
  
      return { totalMinutesPerUnit, processes, templateId };
    },

  /**
     * 计算预计耗时和结束时间
     * @param {Object} params
     * @param {number} params.productId - 产品ID
     * @param {number} params.quantity - 生产数量
     * @param {string} params.startTime - 开始时间 'YYYY-MM-DD HH:mm'
     * @returns {Object} { totalMinutes, estimatedEndTime, processSchedule }
     */
    async calculateSchedule({ productId, quantity, startTime }) {
      const startDate = this._parseScheduleDateTime(startTime);
      if (!startDate) {
        const error = new Error('Invalid startTime');
        error.statusCode = 400;
        throw error;
      }
  
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
  
      // 预加载日历覆盖数据（覆盖的工作日/休息日）
      const overridesMap = await this.getOverridesMap(startTime);
  
      // 推算结束时间（考虑午休和工作时间）
      const estimatedEndTime = this._advanceWorkMinutes(startDate, totalMinutes, calendar, overridesMap);
  
      // 计算各工序的计划时间（串行排列）
      let cursor = new Date(startDate);
      const processSchedule = processes.map((proc) => {
        const procMinutes = Math.ceil(proc.standardHours * quantity);
        const procStart = new Date(cursor);
        const procEnd = this._advanceWorkMinutes(new Date(cursor), procMinutes, calendar, overridesMap);
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
    },

  /**
     * 检测时间冲突
     * @param {Object} params
     * @param {string} params.manager - 生产组
     * @param {string} params.startTime - 开始时间
     * @param {string} params.endTime - 结束时间
     * @param {number} [params.excludeTaskId] - 排除的任务ID（编辑时排除自身）
     * @returns {Object} { hasConflict, conflicts: [] }
     */
    async checkConflicts({ manager, startTime, endTime, excludeTaskId = null, ignoreTaskIds = [] }, connection = null) {
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
  
      const newStart = this._parseDateTimeMs(startTime);
      const newEnd = this._parseDateTimeMs(endTime);
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
            ? new Date(`${task.expected_end_date} ${DEFAULT_WORK_END}`).getTime()
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
    },

  /**
     * 为已创建的任务自动填充工序计划时间
     * @param {number} taskId - 任务ID
     * @param {string} startTime - 开始时间
     * @param {number} quantity - 数量
     * @param {Object} connection - 数据库连接
     */
    async fillProcessSchedule(taskId, startTime, quantity, connection) {
      const startDate = this._parseScheduleDateTime(startTime);
      if (!startDate) {
        const error = new Error('Invalid startTime');
        error.statusCode = 400;
        throw error;
      }
  
      const calendar = await this.getDefaultCalendar();
      const overridesMap = await this.getOverridesMap(startTime);
  
      // 获取任务的工序列表
      const [processes] = await connection.query(
        `SELECT id, standard_hours, sequence FROM production_processes
         WHERE task_id = ? ORDER BY sequence`,
        [taskId]
      );
  
      if (processes.length === 0) return null;
  
      const { schedule, estimatedEnd } = this._buildProcessSchedule(
        processes,
        startDate,
        quantity,
        calendar,
        overridesMap
      );
      await this._applyProcessSchedule(connection, taskId, schedule, estimatedEnd);
  
      logger.info(`[排程] 任务 ${taskId} 工序时间已填充，预计结束: ${estimatedEnd}`);
      return estimatedEnd;
    },

  async rescheduleTask(taskId, startTime, quantity, connection, options = {}) {
      const startDate = this._parseScheduleDateTime(startTime);
      if (!startDate) {
        const error = new Error('Invalid startTime');
        error.statusCode = 400;
        throw error;
      }
  
      const [taskRows] = await connection.query(
        `SELECT id, code, product_id, quantity, manager, status, plan_id
         FROM production_tasks
         WHERE id = ? AND deleted_at IS NULL
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
  
      const [processes] = await connection.query(
        `SELECT id, standard_hours, sequence FROM production_processes
         WHERE task_id = ? ORDER BY sequence`,
        [taskId]
      );
      if (processes.length === 0) return null;
  
      const calendar = await this.getDefaultCalendar();
      const overridesMap = await this.getOverridesMap(startTime);
      const taskQuantity = Number(quantity ?? task.quantity) || 0;
      const { schedule, estimatedEnd } = this._buildProcessSchedule(
        processes,
        startDate,
        taskQuantity,
        calendar,
        overridesMap
      );
  
      if (options.checkConflicts !== false && task.manager && estimatedEnd) {
        const conflictResult = await this.checkConflicts({
          manager: task.manager,
          startTime: this._formatDateTime(startDate),
          endTime: estimatedEnd,
          excludeTaskId: task.id,
        }, connection);
        if (conflictResult.hasConflict) {
          const firstConflict = conflictResult.conflicts[0];
          const error = new Error(
            `任务 ${task.code} 与生产组 ${task.manager} 的既有排程 ${firstConflict.taskCode} 冲突，请调整开始时间或先处理冲突任务`
          );
          error.statusCode = 409;
          error.details = conflictResult.conflicts;
          throw error;
        }
      }
  
      await this._applyProcessSchedule(connection, taskId, schedule, estimatedEnd);
      logger.info(`[排程] 任务 ${taskId} 已重新排程，预计结束: ${estimatedEnd}`);
      return estimatedEnd;
    },

  /**
     * 批量排程 — 按指定顺序串行排程多个任务
     * @param {Object} params
     * @param {Array<number>} params.taskIds - 有序的任务ID列表
     * @param {string} params.startTime - 第一个任务的开始时间
     * @returns {Object} { scheduled: [{ taskId, code, productName, startTime, endTime, totalMinutes }] }
     */
    async batchSchedule({ taskIds, groups, startTime }) {
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
    },

  /**
     * 从指定时间推进 N 个工作分钟（跳过午休、下班时间、周末）
     * @param {Date} start - 起始时间
     * @param {number} minutes - 需要推进的工作分钟数
     * @param {Object} calendar - 班次配置
     * @returns {Date} 结束时间
     */
    async batchScheduleGroups({ groups, startTime }) {
      const normalizedGroups = this._normalizeBatchScheduleGroups(groups);
      if (normalizedGroups.length === 0) {
        return { scheduled: [], groups: [] };
      }
  
      if (!this._parseScheduleDateTime(startTime)) {
        const error = new Error('Invalid startTime');
        error.statusCode = 400;
        throw error;
      }
  
      const connection = await pool.getConnection();
      const calendar = await this.getDefaultCalendar();
      const overridesMap = await this.getOverridesMap(startTime);
      const scheduled = [];
      const groupResults = [];
  
      try {
        await connection.beginTransaction();
  
        for (const group of normalizedGroups) {
          const groupScheduled = await this._scheduleTaskSequence({
            connection,
            calendar,
            overridesMap,
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
    },

  _normalizeBatchScheduleGroups(groups) {
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
    },

  async _scheduleTaskSequence({
      connection,
      calendar,
      overridesMap = new Map(),
      taskIds,
      startTime,
      groupName,
    }) {
      const scheduled = [];
      let cursor = this._parseScheduleDateTime(startTime);
  
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
          ? this._advanceWorkMinutes(new Date(cursor), totalMinutes, calendar, overridesMap)
          : this._advanceWorkMinutes(new Date(cursor), 480, calendar, overridesMap);
  
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
           WHERE id = ? AND deleted_at IS NULL`,
          [startStr.split(' ')[0], endStr.split(' ')[0], taskId]
        );
  
        const [processes] = await connection.query(
          `SELECT id, standard_hours, sequence FROM production_processes
           WHERE task_id = ? ORDER BY sequence`,
          [taskId]
        );
  
        let procCursor = new Date(taskStart);
        for (const proc of processes) {
          const minutes = Math.ceil((parseFloat(proc.standard_hours) || 0) * 60 * quantity);
          const procStart = new Date(procCursor);
          const procEnd = this._advanceWorkMinutes(new Date(procCursor), minutes, calendar, overridesMap);
  
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
    },

  async _assertTaskSchedulable(connection, task) {
      if (!SCHEDULABLE_STATUSES.has(task.status)) {
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
              AND qi.inspection_type IN ('first_article', 'process', 'final')
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
        logger.warn('[排程] 任务存在执行单据，阻止重新排程', {
          taskId: task.id,
          taskCode: task.code,
          outboundCount: Number(usage.outbound_count || 0),
          reportCount: Number(usage.report_count || 0),
          inspectionCount: Number(usage.inspection_count || 0),
        });
        const error = new Error(
          `任务 ${task.code} 已有关联发料、报工或检验单据，不能重新排程；请先走撤销/关闭流程`
        );
        error.statusCode = 400;
        error.details = {
          taskId: task.id,
          outboundCount: Number(usage.outbound_count || 0),
          reportCount: Number(usage.report_count || 0),
          inspectionCount: Number(usage.inspection_count || 0),
        };
        throw error;
      }
    },

  async _syncScheduledPlanDates(connection, scheduledTaskIds) {
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
            `UPDATE production_plans SET start_date = ?, end_date = ? WHERE id = ? AND deleted_at IS NULL`,
            [timeRange[0].earliest_start, timeRange[0].latest_end, planId]
          );
          logger.info(`[排程反写] 计划 ${planId} 时间已更新: ${timeRange[0].earliest_start} ~ ${timeRange[0].latest_end}`);
        }
      }
    },

  _buildProcessSchedule(processes, startDate, quantity, calendar, overridesMap) {
      let cursor = new Date(startDate);
      const schedule = [];
  
      for (const proc of processes) {
        const minutes = Math.ceil((parseFloat(proc.standard_hours) || 0) * 60 * quantity);
        const procStart = new Date(cursor);
        const procEnd = this._advanceWorkMinutes(new Date(cursor), minutes, calendar, overridesMap);
        schedule.push({
          processId: proc.id,
          plannedStartTime: this._formatDateTime(procStart),
          plannedEndTime: this._formatDateTime(procEnd),
        });
        cursor = new Date(procEnd);
      }
  
      return {
        schedule,
        estimatedEnd: this._formatDateTime(cursor),
      };
    },

  async _applyProcessSchedule(connection, taskId, schedule, estimatedEnd) {
      for (const item of schedule) {
        await connection.query(
          `UPDATE production_processes
           SET planned_start_time = ?, planned_end_time = ?
           WHERE id = ?`,
          [item.plannedStartTime, item.plannedEndTime, item.processId]
        );
      }
  
      await connection.query(
        'UPDATE production_tasks SET expected_end_date = ? WHERE id = ? AND deleted_at IS NULL',
        [estimatedEnd ? estimatedEnd.split(' ')[0] : null, taskId]
      );
    },
};
