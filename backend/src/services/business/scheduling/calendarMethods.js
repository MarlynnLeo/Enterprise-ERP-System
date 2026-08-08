/**
 * SchedulingService — calendar methods (mixin)
 */

const runtime = require('./runtime');
const {
  pool,
  MAX_SCHEDULE_LOOKAHEAD_DAYS,
  DEFAULT_CALENDAR_IMPACT_DAYS,
  DEFAULT_WORK_START,
  DEFAULT_WORK_END,
  SCHEDULABLE_STATUSES,
} = runtime;

module.exports = {
  /**
     * 获取默认班次配置
     * @returns {Object} { work_start, work_end, break_start, break_end, exclude_weekends }
     */
    async getDefaultCalendar(connection = null) {
      const conn = connection || pool;
      const [rows] = await conn.query(
        'SELECT id, name, work_start, work_end, break_start, break_end, dinner_start, dinner_end, exclude_weekends, is_default, created_at, updated_at FROM production_calendar WHERE is_default = 1 LIMIT 1'
      );
      if (rows.length === 0) {
        // 兜底默认值
        return {
          work_start: '08:00:00',
          work_end: '17:30:00',
          break_start: '12:00:00',
          break_end: '13:00:00',
          dinner_start: null,
          dinner_end: null,
          exclude_weekends: 1,
        };
      }
      return rows[0];
    },

  async resolveStartTime(startDateValue, connection = null) {
      if (!startDateValue) return null;
      if (startDateValue instanceof Date) {
        return this._formatDateTime(startDateValue);
      }
  
      const text = String(startDateValue).trim();
      if (!text) return null;
      if (text.includes(' ') || text.includes('T')) return text;
  
      const calendar = await this.getDefaultCalendar(connection);
      return `${text} ${this._normalizeSqlTime(calendar.work_start, DEFAULT_WORK_START)}`;
    },

  /**
     * 预加载指定日期范围的日历覆盖数据
     * @param {Date|string} startDate - 起始日期
     * @param {number} [days=730] - 加载天数
     * @returns {Map<string, Object>} dateStr => override row
     */
    async getOverridesMap(startDate, days = MAX_SCHEDULE_LOOKAHEAD_DAYS) {
      const start = this._parseScheduleDateTime(startDate);
      if (!start) {
        const error = new Error('Invalid startDate');
        error.statusCode = 400;
        throw error;
      }
      const end = new Date(start);
      end.setDate(end.getDate() + days);
  
      const startStr = this._formatDateOnly(start);
      const endStr = this._formatDateOnly(end);
  
      const [rows] = await pool.query(
        `SELECT DATE_FORMAT(calendar_date, '%Y-%m-%d') AS calendar_date, is_workday, work_start, work_end, break_start, break_end, dinner_start, dinner_end, label
         FROM production_calendar_overrides
         WHERE calendar_date BETWEEN ? AND ?`,
        [startStr, endStr]
      );
  
      const map = new Map();
      for (const row of rows) {
        const dateKey = String(row.calendar_date).substring(0, 10);
        map.set(dateKey, row);
      }
      return map;
    },

  async analyzeCalendarImpact(criteria = {}, connection = null) {
      const conn = connection || pool;
      const range = this._normalizeCalendarImpactCriteria(criteria);
      const calendar = await this.getDefaultCalendar(conn);
  
      const [rows] = await conn.query(
        `
        SELECT
          t.id,
          t.code,
          t.quantity,
          t.manager,
          t.status,
          DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
          DATE_FORMAT(t.expected_end_date, '%Y-%m-%d') AS expected_end_date,
          DATE_FORMAT(t.actual_start_time, '%Y-%m-%d %H:%i:%s') AS actual_start_time,
          m.name AS product_name,
          pp.code AS plan_code,
          pp.name AS plan_name,
          DATE_FORMAT(pp.delivery_date, '%Y-%m-%d') AS delivery_date,
          DATE_FORMAT(MIN(p.planned_start_time), '%Y-%m-%d %H:%i:%s') AS planned_start,
          DATE_FORMAT(MAX(p.planned_end_time), '%Y-%m-%d %H:%i:%s') AS planned_end,
          COUNT(p.id) AS process_count,
          (SELECT COUNT(*)
             FROM inventory_outbound o
            WHERE o.status NOT IN ('cancelled', 'reversed')
              AND o.deleted_at IS NULL
              AND (
                o.production_task_id = t.id
                OR (o.reference_type = 'production_task' AND o.reference_id = t.id)
                OR (
                  o.reference_type = 'batch_production_tasks'
                  AND o.source_task_ids IS NOT NULL
                  AND JSON_CONTAINS(o.source_task_ids, CAST(t.id AS JSON))
                )
              )) AS outbound_count,
          (SELECT COUNT(*) FROM production_reports pr WHERE pr.task_id = t.id) AS report_count,
          (SELECT COUNT(*)
             FROM quality_inspections qi
            WHERE qi.task_id = t.id
              AND qi.deleted_at IS NULL
              AND (qi.status IS NULL OR qi.status NOT IN ('cancelled'))) AS inspection_count
        FROM production_tasks t
        LEFT JOIN materials m ON t.product_id = m.id
        LEFT JOIN production_plans pp ON t.plan_id = pp.id
        LEFT JOIN production_processes p ON p.task_id = t.id
        WHERE t.deleted_at IS NULL
          AND t.status NOT IN ('completed', 'cancelled')
        GROUP BY
          t.id, t.code, t.quantity, t.manager, t.status, t.start_date,
          t.expected_end_date, t.actual_start_time,
          m.name, pp.code, pp.name, pp.delivery_date
        HAVING (
            planned_start IS NOT NULL
            AND DATE(planned_start) <= ?
            AND DATE(COALESCE(planned_end, planned_start)) >= ?
          )
          OR (
            start_date IS NOT NULL
            AND start_date <= ?
            AND COALESCE(expected_end_date, start_date) >= ?
          )
        ORDER BY COALESCE(
          planned_start,
          DATE_FORMAT(t.actual_start_time, '%Y-%m-%d %H:%i:%s'),
          CONCAT(DATE_FORMAT(t.start_date, '%Y-%m-%d'), ' 00:00:00')
        ) ASC, t.id ASC
        `,
        [range.endDate, range.startDate, range.endDate, range.startDate]
      );
  
      const tasks = [];
      for (const row of rows) {
        const windowStart = this._getTaskScheduleStart(row, calendar);
        const windowEnd = this._getTaskScheduleEnd(row, calendar, windowStart);
        if (!windowStart || !windowEnd) continue;
  
        const windowStartDate = windowStart.slice(0, 10);
        const windowEndDate = windowEnd.slice(0, 10);
        const affectedDates = range.explicitDates.length > 0
          ? range.explicitDates.filter((date) => date >= windowStartDate && date <= windowEndDate)
          : [];
        if (range.explicitDates.length > 0 && affectedDates.length === 0) continue;
  
        const blockers = this._getScheduleBlockers(row);
        tasks.push({
          taskId: row.id,
          code: row.code,
          productName: row.product_name || '',
          planCode: row.plan_code || '',
          planName: row.plan_name || '',
          manager: row.manager || '未分配',
          status: row.status,
          quantity: Number(row.quantity || 0),
          processCount: Number(row.process_count || 0),
          plannedStart: windowStart,
          plannedEnd: windowEnd,
          startDate: row.start_date,
          expectedEndDate: row.expected_end_date,
          deliveryDate: row.delivery_date,
          affectedDates,
          reschedulable: blockers.length === 0,
          blockers,
        });
      }
  
      const reschedulableCount = tasks.filter((task) => task.reschedulable).length;
      return {
        criteria: {
          dates: range.explicitDates,
          startDate: range.startDate,
          endDate: range.endDate,
        },
        summary: {
          total: tasks.length,
          reschedulable: reschedulableCount,
          blocked: tasks.length - reschedulableCount,
        },
        tasks,
      };
    },

  async rescheduleCalendarImpact(criteria = {}, connection = null) {
      const shouldRelease = !connection;
      const conn = connection || await pool.getConnection();
      const scheduled = [];
      const skipped = [];
      let analysis;
  
      try {
        if (shouldRelease) await conn.beginTransaction();
  
        analysis = await this.analyzeCalendarImpact(criteria, conn);
        const requestedTaskIds = this._normalizeTaskIds(criteria.taskIds);
        const candidateIds = requestedTaskIds.length > 0
          ? requestedTaskIds
          : analysis.tasks
            .filter((task) => task.reschedulable)
            .map((task) => Number(task.taskId));
  
        if (candidateIds.length === 0) {
          if (shouldRelease) await conn.commit();
          return { analysis, scheduled, skipped };
        }
  
        const placeholders = candidateIds.map(() => '?').join(',');
        const [taskRows] = await conn.query(
          `SELECT
             t.id, t.code, t.product_id, t.quantity, t.manager, t.status, t.plan_id,
             DATE_FORMAT(t.start_date, '%Y-%m-%d') AS start_date,
             m.name AS product_name
           FROM production_tasks t
           LEFT JOIN materials m ON t.product_id = m.id
           WHERE t.id IN (${placeholders}) AND t.deleted_at IS NULL
           FOR UPDATE`,
          candidateIds
        );
  
        const [processWindows] = await conn.query(
          `SELECT
             task_id,
             DATE_FORMAT(MIN(planned_start_time), '%Y-%m-%d %H:%i:%s') AS planned_start,
             DATE_FORMAT(MAX(planned_end_time), '%Y-%m-%d %H:%i:%s') AS planned_end
           FROM production_processes
           WHERE task_id IN (${placeholders})
           GROUP BY task_id`,
          candidateIds
        );
        const windowMap = new Map(processWindows.map((row) => [Number(row.task_id), row]));
  
        const calendar = await this.getDefaultCalendar(conn);
        const tasksByGroup = new Map();
        for (const task of taskRows) {
          const window = windowMap.get(Number(task.id)) || {};
          const currentStart = window.planned_start || await this.resolveStartTime(task.start_date, conn);
          const groupName = task.manager || '未分配';
          if (!tasksByGroup.has(groupName)) tasksByGroup.set(groupName, []);
          tasksByGroup.get(groupName).push({
            ...task,
            groupName,
            currentStart,
          });
        }
  
        for (const groupTasks of tasksByGroup.values()) {
          groupTasks.sort((a, b) => this._parseDateTimeMs(a.currentStart) - this._parseDateTimeMs(b.currentStart));
          let cursor = null;
  
          for (const task of groupTasks) {
            try {
              await this._assertTaskSchedulable(conn, task);
  
              const proposedStart = this._parseScheduleDateTime(task.currentStart);
              if (!proposedStart) {
                skipped.push({ taskId: task.id, code: task.code, reason: '缺少有效排程开始时间' });
                continue;
              }
              if (!cursor || proposedStart > cursor) cursor = new Date(proposedStart);
  
              const [processes] = await conn.query(
                `SELECT id, standard_hours, sequence
                 FROM production_processes
                 WHERE task_id = ?
                 ORDER BY sequence`,
                [task.id]
              );
              if (processes.length === 0) {
                skipped.push({ taskId: task.id, code: task.code, reason: '任务未配置工序' });
                continue;
              }
  
              const startStr = this._formatDateTime(cursor);
              const overridesMap = await this.getOverridesMap(startStr);
              const { schedule, estimatedEnd } = this._buildProcessSchedule(
                processes,
                cursor,
                Number(task.quantity || 0),
                calendar,
                overridesMap
              );
  
              if (task.manager && estimatedEnd) {
                const conflictResult = await this.checkConflicts({
                  manager: task.manager,
                  startTime: startStr,
                  endTime: estimatedEnd,
                  excludeTaskId: task.id,
                  ignoreTaskIds: candidateIds,
                }, conn);
                if (conflictResult.hasConflict) {
                  skipped.push({
                    taskId: task.id,
                    code: task.code,
                    reason: `与既有排程 ${conflictResult.conflicts[0]?.taskCode || ''} 冲突`,
                  });
                  continue;
                }
              }
  
              await this._applyProcessSchedule(conn, task.id, schedule, estimatedEnd);
              await conn.query(
                `UPDATE production_tasks
                 SET start_date = ?, expected_end_date = ?
                 WHERE id = ? AND deleted_at IS NULL`,
                [startStr.split(' ')[0], estimatedEnd ? estimatedEnd.split(' ')[0] : null, task.id]
              );
  
              scheduled.push({
                taskId: task.id,
                code: task.code,
                productName: task.product_name || '',
                manager: task.groupName,
                startTime: startStr,
                endTime: estimatedEnd,
              });
              cursor = this._parseScheduleDateTime(estimatedEnd) || cursor;
            } catch (error) {
              skipped.push({
                taskId: task.id,
                code: task.code,
                reason: error.message || '重排失败',
              });
            }
          }
        }
  
        await this._syncScheduledPlanDates(conn, scheduled.map((item) => item.taskId));
  
        if (shouldRelease) await conn.commit();
        return { analysis, scheduled, skipped };
      } catch (error) {
        if (shouldRelease) await conn.rollback();
        throw error;
      } finally {
        if (shouldRelease) conn.release();
      }
    },

  _normalizeCalendarImpactCriteria(criteria = {}) {
      const explicitDates = [...new Set(
        (Array.isArray(criteria.dates) ? criteria.dates : [])
          .map((date) => String(date || '').trim().slice(0, 10))
          .filter((date) => this._isValidDateOnlyString(date))
      )].sort();
  
      let startDate = this._isValidDateOnlyString(criteria.startDate) ? criteria.startDate : null;
      let endDate = this._isValidDateOnlyString(criteria.endDate) ? criteria.endDate : null;
  
      if (explicitDates.length > 0) {
        startDate = startDate || explicitDates[0];
        endDate = endDate || explicitDates[explicitDates.length - 1];
      }
  
      if (!startDate || !endDate) {
        const today = new Date();
        startDate = startDate || this._formatDateOnly(today);
        endDate = endDate || this._formatDateOnly(this._addDays(today, DEFAULT_CALENDAR_IMPACT_DAYS));
      }
  
      if (startDate > endDate) {
        const error = new Error('Invalid calendar impact date range');
        error.statusCode = 400;
        throw error;
      }
  
      return { explicitDates, startDate, endDate };
    },

  _getTaskScheduleStart(row, calendar) {
      return row.planned_start ||
        row.actual_start_time ||
        (row.start_date
          ? `${row.start_date} ${this._normalizeSqlTime(calendar.work_start, DEFAULT_WORK_START)}`
          : null);
    },

  _getTaskScheduleEnd(row, calendar, startTime = null) {
      return row.planned_end ||
        (row.expected_end_date
          ? `${row.expected_end_date} ${this._normalizeSqlTime(calendar.work_end, DEFAULT_WORK_END)}`
          : null) ||
        (row.start_date
          ? `${row.start_date} ${this._normalizeSqlTime(calendar.work_end, DEFAULT_WORK_END)}`
          : null) ||
        startTime;
    },

  _getScheduleBlockers(row) {
      const blockers = [];
      if (!SCHEDULABLE_STATUSES.has(row.status)) {
        blockers.push(`状态为 ${row.status}`);
      }
      if (Number(row.outbound_count || 0) > 0) blockers.push('已有发料单');
      if (Number(row.report_count || 0) > 0) blockers.push('已有报工记录');
      if (Number(row.inspection_count || 0) > 0) blockers.push('已有检验单');
      return blockers;
    },
};
