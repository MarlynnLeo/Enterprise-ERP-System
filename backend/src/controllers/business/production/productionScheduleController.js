/**
 * productionScheduleController.js
 * @description 排程/日历/班次管理控制器
 *              从 routes/production.js 内联逻辑迁移而来
 * @date 2026-06-11
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { safeParseId } = require('../../../utils/safeParseId');
const { isValidDateOnly, getMonthRange } = require('../../../utils/dateOnly');
const { pool } = require('../../../config/db');
const SchedulingService = require('../../../services/business/SchedulingService');
const ScopeGuard = require('../../../authorization/ScopeGuard');

// ==================== 辅助常量与函数 ====================

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const padTime = (time) => (time ? (time.length === 5 ? `${time}:00` : time) : null);

const validateTimeField = (field, value, required = false) => {
  if (!value) {
    return required ? `${field} 为必填` : null;
  }
  return TIME_PATTERN.test(value) ? null : `${field} 格式不正确，应为 HH:MM 或 HH:MM:SS`;
};

const compareTime = (start, end, startField, endField) => {
  if (!start || !end) return null;
  return padTime(start) < padTime(end) ? null : `${startField} 必须早于 ${endField}`;
};

const validateTimePairs = (data, requireWorkTime = true) => {
  const fields = [
    ['work_start', requireWorkTime],
    ['work_end', requireWorkTime],
    ['break_start', false],
    ['break_end', false],
    ['dinner_start', false],
    ['dinner_end', false],
  ];
  for (const [field, required] of fields) {
    const error = validateTimeField(field, data[field], required);
    if (error) return error;
  }

  return compareTime(data.work_start, data.work_end, 'work_start', 'work_end') ||
    compareTime(data.break_start, data.break_end, 'break_start', 'break_end') ||
    compareTime(data.dinner_start, data.dinner_end, 'dinner_start', 'dinner_end');
};

const normalizeWorkdayFlag = (value) => {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return null;
};

const valueOrDefault = (value, fallback) => (
  value === null || value === undefined || value === '' ? fallback : value
);

const validateEffectiveWorkdayTimes = (item, defaultCalendar) => validateTimePairs({
  work_start: valueOrDefault(item.work_start, defaultCalendar.work_start),
  work_end: valueOrDefault(item.work_end, defaultCalendar.work_end),
  break_start: valueOrDefault(item.break_start, defaultCalendar.break_start),
  break_end: valueOrDefault(item.break_end, defaultCalendar.break_end),
  dinner_start: valueOrDefault(item.dinner_start, defaultCalendar.dinner_start),
  dinner_end: valueOrDefault(item.dinner_end, defaultCalendar.dinner_end),
}, true);

const formatDateOnlyLocal = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const getDefaultCalendarImpactCriteria = () => {
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 180);
  return {
    startDate: formatDateOnlyLocal(start),
    endDate: formatDateOnlyLocal(end),
  };
};

async function assertProductionTaskWriteAccess(req, taskId, connection = pool) {
  const normalized = Number(taskId);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    const error = new Error('生产任务 ID 无效');
    error.statusCode = 400;
    throw error;
  }
  const allowed = await ScopeGuard.assertAccess(connection, req, 'production_task', normalized);
  if (!allowed) {
    const error = new Error(`无权排程生产任务 ${normalized}`);
    error.statusCode = 403;
    throw error;
  }
}

async function assertProductionTaskWriteAccessMany(req, taskIds, connection = pool) {
  const normalized = [...new Set((Array.isArray(taskIds) ? taskIds : []).map(Number))];
  for (const taskId of normalized) {
    await assertProductionTaskWriteAccess(req, taskId, connection);
  }
  return normalized;
}

// ==================== 排程接口 ====================

module.exports = {
  /**
   * 获取产品标准工时
   */
  getStandardHours: async (req, res) => {
    try {
      const result = await SchedulingService.getProductStandardHours(safeParseId(req.params.productId));
      ResponseHandler.success(res, result);
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
    }
  },

  /**
   * 计算排程（预计耗时+结束时间+工序时间表）
   */
  calculateSchedule: async (req, res) => {
    try {
      const { productId, quantity, startTime } = req.body;
      if (!productId || !quantity || !startTime) {
        return ResponseHandler.error(res, '缺少必填参数: productId, quantity, startTime', 'VALIDATION_ERROR', 400);
      }
      const result = await SchedulingService.calculateSchedule({
        productId: parseInt(productId),
        quantity: parseFloat(quantity),
        startTime,
      });
      ResponseHandler.success(res, result);
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
    }
  },

  /**
   * 检测冲突
   */
  checkConflicts: async (req, res) => {
    try {
      const { manager, startTime, endTime, excludeTaskId } = req.body;
      const result = await SchedulingService.checkConflicts({
        manager,
        startTime,
        endTime,
        excludeTaskId: excludeTaskId ? parseInt(excludeTaskId) : null,
      });
      ResponseHandler.success(res, result);
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
    }
  },

  /**
   * 获取默认班次配置
   */
  getDefaultCalendar: async (req, res) => {
    try {
      const calendar = await SchedulingService.getDefaultCalendar();
      ResponseHandler.success(res, calendar);
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', 500, error);
    }
  },

  /**
   * 获取所有班次列表
   */
  getCalendars: async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name, work_start, work_end, break_start, break_end, dinner_start, dinner_end, exclude_weekends, is_default, created_at, updated_at FROM production_calendar ORDER BY is_default DESC, id ASC'
      );
      ResponseHandler.success(res, { list: rows });
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', 500, error);
    }
  },

  /**
   * 更新班次配置
   */
  updateCalendar: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, work_start, work_end, break_start, break_end, dinner_start, dinner_end, exclude_weekends } = mapKeysToSnake(req.body || {});

      // 校验必填字段
      if (!name || !work_start || !work_end) {
        return ResponseHandler.error(res, '班次名称、上班时间、下班时间为必填', 'VALIDATION_ERROR', 400);
      }

      const validationError = validateTimePairs({
        work_start,
        work_end,
        break_start,
        break_end,
        dinner_start,
        dinner_end,
      });
      if (validationError) {
        return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
      }

      const updateFields = {
        name,
        work_start: padTime(work_start),
        work_end: padTime(work_end),
        break_start: padTime(break_start),
        break_end: padTime(break_end),
        dinner_start: padTime(dinner_start),
        dinner_end: padTime(dinner_end),
        exclude_weekends: exclude_weekends ? 1 : 0,
      };

      await pool.query(
        'UPDATE production_calendar SET name = ?, work_start = ?, work_end = ?, break_start = ?, break_end = ?, dinner_start = ?, dinner_end = ?, exclude_weekends = ?, updated_at = NOW() WHERE id = ?',
        [updateFields.name, updateFields.work_start, updateFields.work_end, updateFields.break_start, updateFields.break_end, updateFields.dinner_start, updateFields.dinner_end, updateFields.exclude_weekends, id]
      );

      const [updated] = await pool.query(
        'SELECT id, name, work_start, work_end, break_start, break_end, dinner_start, dinner_end, exclude_weekends, is_default, created_at, updated_at FROM production_calendar WHERE id = ?',
        [id]
      );

      if (updated.length === 0) {
        return ResponseHandler.error(res, '班次不存在', 'NOT_FOUND', 404);
      }

      const impact = Number(updated[0].is_default || 0) === 1
        ? await SchedulingService.analyzeCalendarImpact(getDefaultCalendarImpactCriteria())
        : null;

      ResponseHandler.success(res, { calendar: updated[0], impact }, '班次配置更新成功');
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', 500, error);
    }
  },

  /**
   * 设置默认班次
   */
  setDefaultCalendar: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;

      // 先检查目标是否存在
      const [target] = await connection.query('SELECT id, name FROM production_calendar WHERE id = ?', [id]);
      if (target.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '班次不存在', 'NOT_FOUND', 404);
      }

      // 清除其他默认
      await connection.query('UPDATE production_calendar SET is_default = 0 WHERE is_default = 1');
      // 设置新默认
      await connection.query('UPDATE production_calendar SET is_default = 1, updated_at = NOW() WHERE id = ?', [id]);

      const impact = await SchedulingService.analyzeCalendarImpact(getDefaultCalendarImpactCriteria(), connection);

      await connection.commit();
      ResponseHandler.success(res, { impact }, `已将「${target[0].name}」设为默认班次`);
    } catch (error) {
      await connection.rollback();
      ResponseHandler.error(res, error.message, 'ERROR', 500, error);
    } finally {
      connection.release();
    }
  },

  // ===== 日历覆盖日期 API =====

  /**
   * 获取某月的覆盖日期列表
   */
  getCalendarOverrides: async (req, res) => {
    try {
      const { month } = req.query; // 格式 YYYY-MM
      const range = getMonthRange(month);
      if (!range) {
        return ResponseHandler.error(res, '请提供 month 参数，格式 YYYY-MM', 'VALIDATION_ERROR', 400);
      }
      const [rows] = await pool.query(
        `SELECT id, DATE_FORMAT(calendar_date, '%Y-%m-%d') AS calendar_date, is_workday, work_start, work_end, break_start, break_end, dinner_start, dinner_end, label
         FROM production_calendar_overrides
         WHERE calendar_date BETWEEN ? AND ?
         ORDER BY calendar_date ASC`,
        [range.start, range.end]
      );
      ResponseHandler.success(res, { list: rows });
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', 500, error);
    }
  },

  /**
   * 批量保存覆盖日期（前端月历保存）
   */
  saveCalendarOverrides: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const { overrides } = req.body; // [{calendar_date, is_workday, work_start?, work_end?, break_start?, break_end?, label?}]

      if (!Array.isArray(overrides) || overrides.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '请提供 overrides 数组', 'VALIDATION_ERROR', 400);
      }

      const defaultCalendar = await SchedulingService.getDefaultCalendar();
      let savedCount = 0;
      const affectedDates = [];

      for (const item of overrides) {
        if (!item || typeof item !== 'object' || !item.calendar_date) {
          await connection.rollback();
          return ResponseHandler.error(res, 'calendar_date 为必填', 'VALIDATION_ERROR', 400);
        }
        if (!isValidDateOnly(item.calendar_date)) {
          await connection.rollback();
          return ResponseHandler.error(res, 'calendar_date 格式不正确，应为 YYYY-MM-DD', 'VALIDATION_ERROR', 400);
        }

        const isWorkday = normalizeWorkdayFlag(item.is_workday);
        if (isWorkday === null) {
          await connection.rollback();
          return ResponseHandler.error(res, 'is_workday 必须为布尔值', 'VALIDATION_ERROR', 400);
        }

        const overrideValidationError = validateTimePairs({
          work_start: item.work_start,
          work_end: item.work_end,
          break_start: item.break_start,
          break_end: item.break_end,
          dinner_start: item.dinner_start,
          dinner_end: item.dinner_end,
        }, false);
        if (overrideValidationError) {
          await connection.rollback();
          return ResponseHandler.error(res, overrideValidationError, 'VALIDATION_ERROR', 400);
        }

        if (isWorkday) {
          const effectiveValidationError = validateEffectiveWorkdayTimes(item, defaultCalendar);
          if (effectiveValidationError) {
            await connection.rollback();
            return ResponseHandler.error(res, effectiveValidationError, 'VALIDATION_ERROR', 400);
          }
        }

        // UPSERT: 存在则更新，不存在则插入
        await connection.query(
          `INSERT INTO production_calendar_overrides (calendar_date, is_workday, work_start, work_end, break_start, break_end, dinner_start, dinner_end, label)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             is_workday = VALUES(is_workday),
             work_start = VALUES(work_start),
             work_end = VALUES(work_end),
             break_start = VALUES(break_start),
             break_end = VALUES(break_end),
             dinner_start = VALUES(dinner_start),
             dinner_end = VALUES(dinner_end),
             label = VALUES(label),
             updated_at = NOW()`,
          [
            item.calendar_date,
            isWorkday ? 1 : 0,
            isWorkday ? padTime(item.work_start) : null,
            isWorkday ? padTime(item.work_end) : null,
            isWorkday ? padTime(item.break_start) : null,
            isWorkday ? padTime(item.break_end) : null,
            isWorkday ? padTime(item.dinner_start) : null,
            isWorkday ? padTime(item.dinner_end) : null,
            item.label || null,
          ]
        );
        savedCount += 1;
        affectedDates.push(item.calendar_date);
      }

      const impact = await SchedulingService.analyzeCalendarImpact({
        dates: [...new Set(affectedDates)],
      }, connection);

      await connection.commit();
      ResponseHandler.success(res, { savedCount, impact }, `成功保存 ${savedCount} 条日历覆盖`);
    } catch (error) {
      await connection.rollback();
      ResponseHandler.error(res, error.message, 'ERROR', 500, error);
    } finally {
      connection.release();
    }
  },

  /**
   * 删除单日覆盖（恢复默认）
   */
  deleteCalendarOverride: async (req, res) => {
    try {
      const { date } = req.params;
      if (!isValidDateOnly(date)) {
        return ResponseHandler.error(res, '日期格式不正确，应为 YYYY-MM-DD', 'VALIDATION_ERROR', 400);
      }
      await pool.query('DELETE FROM production_calendar_overrides WHERE calendar_date = ?', [date]);
      const impact = await SchedulingService.analyzeCalendarImpact({ dates: [date] });
      ResponseHandler.success(res, { impact }, '已恢复默认');
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', 500, error);
    }
  },

  /**
   * 日历影响分析
   */
  analyzeCalendarImpact: async (req, res) => {
    try {
      const impact = await SchedulingService.analyzeCalendarImpact(req.body || {});
      ResponseHandler.success(res, impact, '日历影响分析完成');
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
    }
  },

  /**
   * 重排受影响任务
   */
  recalculateCalendarImpact: async (req, res) => {
    try {
      const criteria = { ...(req.body || {}) };
      const requestedIds = Array.isArray(criteria.taskIds)
        ? criteria.taskIds
        : [];
      await assertProductionTaskWriteAccessMany(req, requestedIds);
      const result = await SchedulingService.rescheduleCalendarImpact(criteria);
      ResponseHandler.success(res, result, '受影响任务已重排');
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
    }
  },

  /**
   * 批量排程（一键排程）
   */
  batchSchedule: async (req, res) => {
    try {
      const { taskIds, groups, startTime } = req.body;
      const hasTaskIds = Array.isArray(taskIds) && taskIds.length > 0;
      const hasGroups = Array.isArray(groups) && groups.some(
        (group) => Array.isArray(group?.taskIds) && group.taskIds.length > 0
      );
      if ((!hasTaskIds && !hasGroups) || !startTime) {
        return ResponseHandler.error(res, '缺少参数: taskIds/groups, startTime', 'VALIDATION_ERROR', 400);
      }
      const submittedTaskIds = hasTaskIds
        ? taskIds
        : groups.flatMap((group) => Array.isArray(group?.taskIds) ? group.taskIds : []);
      await assertProductionTaskWriteAccessMany(req, submittedTaskIds);
      const result = await SchedulingService.batchSchedule({
        taskIds: hasTaskIds ? taskIds.map(id => parseInt(id)) : undefined,
        groups: hasGroups
          ? groups.map((group) => ({
              name: group.name,
              taskIds: group.taskIds.map((id) => parseInt(id)),
            }))
          : undefined,
        startTime,
      });
      ResponseHandler.success(res, result);
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
    }
  },

  /**
   * 甘特图排程数据
   */
  getGanttData: async (req, res) => {
    try {
      const data = await SchedulingService.getGanttData(req.query);
      return ResponseHandler.success(res, data);
    } catch (error) {
      ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
    }
  },
};
