/**
 * SchedulingService — gantt methods (mixin)
 */

const runtime = require('./runtime');
const {
  pool,
  DEFAULT_WORK_START,
  DEFAULT_WORK_END,
} = runtime;

module.exports = {
  async getGanttData({ startDate, endDate } = {}) {
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
          (row.start_date ? `${row.start_date} ${DEFAULT_WORK_START}` : null);
        const rawEndTime =
          row.planned_end ||
          (row.actual_end_date ? `${row.actual_end_date} ${DEFAULT_WORK_END}` : null) ||
          (row.expected_end_date ? `${row.expected_end_date} ${DEFAULT_WORK_END}` : null) ||
          (row.start_date ? `${row.start_date} ${DEFAULT_WORK_END}` : null);
  
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
    },

  _normalizeGanttRange(startDate, endDate) {
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
    },
};
