/**
 * production.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
// 更新：使用重构后的生产控制器（向后兼容）
const productionController = require('../controllers/business/production');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const {
  desensitizeSensitiveResponse,
  requirePriceMutationPermission,
} = require('../middleware/priceAccessControl');
const { ResponseHandler } = require('../utils/responseHandler');
const { safeParseId } = require('../utils/safeParseId');
const { isValidDateOnly, getMonthRange } = require('../utils/dateOnly');
const { pool } = require('../config/db');

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const CALENDAR_VIEW_PERMISSIONS = ['production:calendar', 'production:calendar:view', 'production:tasks:view'];
const CALENDAR_UPDATE_PERMISSIONS = ['production:calendar:update', 'production:tasks:update'];

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

// 应用认证中间件
router.use(authenticateToken);
router.use(desensitizeSensitiveResponse('view'));
router.use(requirePriceMutationPermission('update'));

// 仪表盘数据接口
router.get('/dashboard/statistics', requirePermission(['production:data-view', 'production:plans:view', 'production:tasks:view', 'production:reports:view']), productionController.getDashboardStatistics);
router.get('/dashboard/trends', requirePermission(['production:data-view', 'production:plans:view', 'production:tasks:view', 'production:reports:view']), productionController.getDashboardTrends);
router.get('/dashboard/process-completion', requirePermission(['production:data-view', 'production:plans:view', 'production:tasks:view', 'production:reports:view']), productionController.getProcessCompletionRates);
router.get('/dashboard/pending-tasks', requirePermission(['production:data-view', 'production:tasks:view', 'production:plans:view']), productionController.getPendingTasks);
// 仪表盘生产计划接口 - 所有用户都可访问
router.get('/dashboard/plans', requirePermission(['production:data-view', 'production:plans:view']), productionController.getDashboardProductionPlans);

// ===== 排程与冲突检测接口 =====
const SchedulingService = require('../services/business/SchedulingService');

// 获取产品标准工时
router.get('/scheduling/standard-hours/:productId', requirePermission('production:tasks:view'), async (req, res) => {
  try {
    const result = await SchedulingService.getProductStandardHours(safeParseId(req.params.productId));
    ResponseHandler.success(res, result);
  } catch (error) {
    ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
  }
});

// 计算排程（预计耗时+结束时间+工序时间表）
router.post('/scheduling/calculate', requirePermission('production:tasks:view'), async (req, res) => {
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
});

// 检测冲突
router.post('/scheduling/check-conflicts', requirePermission('production:tasks:view'), async (req, res) => {
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
});

// 获取班次配置
router.get('/scheduling/calendar', requirePermission(CALENDAR_VIEW_PERMISSIONS), async (req, res) => {
  try {
    const calendar = await SchedulingService.getDefaultCalendar();
    ResponseHandler.success(res, calendar);
  } catch (error) {
    ResponseHandler.error(res, error.message, 'ERROR', 500, error);
  }
});

// 获取所有班次列表
router.get('/scheduling/calendars', requirePermission(CALENDAR_VIEW_PERMISSIONS), async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, work_start, work_end, break_start, break_end, dinner_start, dinner_end, exclude_weekends, is_default, created_at, updated_at FROM production_calendar ORDER BY is_default DESC, id ASC'
    );
    ResponseHandler.success(res, { list: rows });
  } catch (error) {
    ResponseHandler.error(res, error.message, 'ERROR', 500, error);
  }
});

// 更新班次配置
router.put('/scheduling/calendars/:id', requirePermission(CALENDAR_UPDATE_PERMISSIONS), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, work_start, work_end, break_start, break_end, dinner_start, dinner_end, exclude_weekends } = req.body;

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

    ResponseHandler.success(res, updated[0], '班次配置更新成功');
  } catch (error) {
    ResponseHandler.error(res, error.message, 'ERROR', 500, error);
  }
});

// 设置默认班次
router.post('/scheduling/calendars/:id/default', requirePermission(CALENDAR_UPDATE_PERMISSIONS), async (req, res) => {
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

    await connection.commit();
    ResponseHandler.success(res, null, `已将「${target[0].name}」设为默认班次`);
  } catch (error) {
    await connection.rollback();
    ResponseHandler.error(res, error.message, 'ERROR', 500, error);
  } finally {
    connection.release();
  }
});

// ===== 日历覆盖日期 API =====

// 获取某月的覆盖日期列表
router.get('/scheduling/calendar-overrides', requirePermission(CALENDAR_VIEW_PERMISSIONS), async (req, res) => {
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
});

// 批量保存覆盖日期（前端月历保存）
router.post('/scheduling/calendar-overrides', requirePermission(CALENDAR_UPDATE_PERMISSIONS), async (req, res) => {
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

      const validationError = validateTimePairs({
        work_start: item.work_start,
        work_end: item.work_end,
        break_start: item.break_start,
        break_end: item.break_end,
        dinner_start: item.dinner_start,
        dinner_end: item.dinner_end,
      }, false);
      if (validationError) {
        await connection.rollback();
        return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
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
    }

    await connection.commit();
    ResponseHandler.success(res, null, `成功保存 ${savedCount} 条日历覆盖`);
  } catch (error) {
    await connection.rollback();
    ResponseHandler.error(res, error.message, 'ERROR', 500, error);
  } finally {
    connection.release();
  }
});

// 删除单日覆盖（恢复默认）
router.delete('/scheduling/calendar-overrides/:date', requirePermission(CALENDAR_UPDATE_PERMISSIONS), async (req, res) => {
  try {
    const { date } = req.params;
    if (!isValidDateOnly(date)) {
      return ResponseHandler.error(res, '日期格式不正确，应为 YYYY-MM-DD', 'VALIDATION_ERROR', 400);
    }
    await pool.query('DELETE FROM production_calendar_overrides WHERE calendar_date = ?', [date]);
    ResponseHandler.success(res, null, '已恢复默认');
  } catch (error) {
    ResponseHandler.error(res, error.message, 'ERROR', 500, error);
  }
});

// 批量排程（一键排程）
router.post('/scheduling/batch', requirePermission('production:tasks:update'), async (req, res) => {
  try {
    const { taskIds, groups, startTime } = req.body;
    const hasTaskIds = Array.isArray(taskIds) && taskIds.length > 0;
    const hasGroups = Array.isArray(groups) && groups.some(
      (group) => Array.isArray(group?.taskIds) && group.taskIds.length > 0
    );
    if ((!hasTaskIds && !hasGroups) || !startTime) {
      return ResponseHandler.error(res, '缺少参数: taskIds/groups, startTime', 'VALIDATION_ERROR', 400);
    }
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
});

// 甘特图排程数据
router.get('/scheduling/gantt', requirePermission('production:gantt'), async (req, res) => {
  try {
    const data = await SchedulingService.getGanttData(req.query);
    return ResponseHandler.success(res, data);
  } catch (error) {
    ResponseHandler.error(res, error.message, 'ERROR', error.statusCode || 500, error);
  }
});

// 生产计划相关接口
router.get(
  '/plans',
  requirePermission('production:plans:view'),
  productionController.getProductionPlans
);
router.get(
  '/plans/:id',
  requirePermission('production:plans:view'),
  productionController.getProductionPlanById
);
router.post(
  '/plans',
  requirePermission('production:plans:create'),
  productionController.createProductionPlan
);
router.put(
  '/plans/:id',
  requirePermission('production:plans:update'),
  productionController.updateProductionPlan
);
router.put(
  '/plans/:id/status',
  requirePermission(['production:plans:update', 'production:plans:cancel', 'production:plans:close']),
  productionController.updateProductionPlanStatus
);
router.delete(
  '/plans/:id',
  requirePermission('production:plans:delete'),
  productionController.deleteProductionPlan
);
// 导出生产计划数据
router.get(
  '/export',
  requirePermission('production:plans:export'),
  productionController.exportProductionData
);

// 计算物料需求
router.post('/calculate-materials', requirePermission(['production:plans:view', 'production:mrp', 'production:mrp:view']), productionController.calculateMaterials);
router.get('/calculate-materials/:bomId', requirePermission(['production:plans:view', 'production:mrp', 'production:mrp:view']), productionController.calculateMaterialsByBomId);

// 直接获取产品BOM信息
router.get('/product-bom/:productId', requirePermission(['production:plans:view', 'production:mrp', 'production:mrp:view']), productionController.getBomByProductId);

// 获取当天的最大序号
router.get('/today-sequence', requirePermission('production:plans:view'), productionController.getTodayMaxSequence);

// 获取生产计划物料清单
router.get('/plans/:id/materials', requirePermission('production:plans:view'), productionController.getPlanMaterials);

// 获取所有生产计划的缺料统计
router.get(
  '/material-shortage-summary',
  requirePermission(['production:shortage', 'production:plans:view', 'production:mrp', 'production:mrp:view']),
  productionController.getMaterialShortageSummary
);

// 生产任务相关路由
router.get(
  '/tasks/managers',
  requirePermission('production:tasks:view'),
  productionController.getProductionTaskManagers
);
router.get(
  '/tasks/generate-code',
  requirePermission('production:tasks:create'),
  productionController.generateTaskCode
);
router.get(
  '/tasks',
  requirePermission('production:tasks:view'),
  productionController.getProductionTasks
);
router.get(
  '/tasks/:id',
  requirePermission('production:tasks:view'),
  productionController.getProductionTaskById
);
router.post(
  '/tasks',
  requirePermission('production:tasks:create'),
  productionController.createProductionTask
);
router.put(
  '/tasks/:id',
  requirePermission('production:tasks:update'),
  productionController.updateProductionTask
);
router.delete(
  '/tasks/:id',
  requirePermission('production:tasks:delete'),
  productionController.deleteProductionTask
);
router.post(
  '/tasks/:id/progress',
  requirePermission('production:tasks:update'),
  productionController.updateProductionTaskProgress
);
router.put(
  '/tasks/:id/status',
  requirePermission('production:tasks:update'),
  productionController.updateProductionTaskStatus
);
router.post(
  '/tasks/:id/complete',
  requirePermission('production:tasks:update'),
  productionController.completeTask
);
router.get(
  '/tasks/:id/bom',
  requirePermission('production:tasks:view'),
  productionController.getProductionTaskBom
);

// 生产过程相关路由
router.get(
  '/processes',
  requirePermission('production:process:view'),
  productionController.getProcesses
);
router.get(
  '/processes/:id',
  requirePermission('production:process:view'),
  productionController.getProcessById
);
router.put(
  '/processes/:id',
  requirePermission('production:process:update'),
  productionController.updateProcess
);
router.post(
  '/processes',
  requirePermission('production:process:create'),
  productionController.createProcess
);
router.delete(
  '/processes/:id',
  requirePermission('production:process:delete'),
  productionController.deleteProcess
);

// 生产报工相关路由
router.get(
  '/reports/summary',
  requirePermission('production:reports:view'),
  productionController.getReportSummary
);
router.get(
  '/reports/detail',
  requirePermission('production:reports:view'),
  productionController.getReportDetail
);
router.get(
  '/reports/export',
  requirePermission('production:reports:view'),
  productionController.exportReport
);
router.get(
  '/reports/statistics',
  requirePermission('production:reports:view'),
  productionController.getReportStatistics
);
router.get(
  '/reports/task/:taskId/stats',
  requirePermission('production:reports:view'),
  productionController.getTaskReportStats
);
router.get(
  '/reports/task/:taskId/processes',
  requirePermission('production:reports:view'),
  productionController.getTaskProcesses
);
router.post(
  '/reports',
  requirePermission('production:reports:create'),
  productionController.createReport
);
router.get(
  '/reports/:id',
  requirePermission('production:reports:view'),
  productionController.getReportById
);
router.put(
  '/reports/:id',
  requirePermission('production:reports:update'),
  productionController.updateReport
);
router.delete(
  '/reports/:id',
  requirePermission('production:reports:delete'),
  productionController.deleteReport
);

module.exports = router;
