/**
 * dashboardController.js
 * @description 生产仪表盘数据控制器
 * @date 2025-10-16
 * @version 1.0.0
 */

const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { pool } = require('../../../config/db');
const { handleError } = require('./shared/errorHandler');
const { PRODUCTION_STATUS_KEYS } = require('../../../constants/systemConstants');

/**
 * 获取仪表盘统计数据
 */
exports.getDashboardStatistics = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 生产计划统计 - 查询所有记录的总计，不限制为今天创建
    const [planRows] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status NOT IN ('${PRODUCTION_STATUS_KEYS.COMPLETED}', '${PRODUCTION_STATUS_KEYS.CANCELLED}') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.DRAFT}' THEN 1 ELSE 0 END) as draft
      FROM production_plans
    `);

    // 生产任务统计 - 查询所有记录的总计
    const [taskRows] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.IN_PROGRESS}' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.PENDING}' THEN 1 ELSE 0 END) as pending
      FROM production_tasks
    `);

    // 工序完成统计 - 本月完成的工序数
    const [processRows] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' THEN 1 ELSE 0 END) as completed
      FROM production_processes
      WHERE YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())
    `);

    // 生产报工统计 - 总数和今日报工
    const [reportRows] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN DATE(report_time) = ? THEN 1 ELSE 0 END) as today
      FROM production_reports
    `, [today]);

    // 今日生产量（用于质量率计算）
    const [productionRows] = await pool.query(`
      SELECT
        COALESCE(SUM(completed_quantity), 0) as total_quantity,
        COALESCE(SUM(qualified_quantity), 0) as qualified_quantity,
        COALESCE(SUM(defective_quantity), 0) as defective_quantity
      FROM production_reports
      WHERE DATE(report_time) = ?
    `, [today]);

    const plans = planRows[0] || { total: 0, completed: 0, in_progress: 0, pending: 0, draft: 0 };
    const tasks = taskRows[0] || { total: 0, completed: 0, in_progress: 0, pending: 0 };
    const processData = processRows[0] || { total: 0, completed: 0 };
    const reportData = reportRows[0] || { total: 0, today: 0 };
    const production = productionRows[0] || {
      total_quantity: 0,
      qualified_quantity: 0,
      defective_quantity: 0,
    };

    const qualityRate =
      production.total_quantity > 0
        ? parseFloat(((production.qualified_quantity / production.total_quantity) * 100).toFixed(2))
        : 0;

    // 工序完成率
    const processRate = processData.total > 0
      ? `${((processData.completed / processData.total) * 100).toFixed(1)}%`
      : '0%';

    ResponseHandler.success(res, {
      plans: {
        total: parseInt(plans.total) || 0,
        pending: parseInt(plans.pending) || 0,
        completed: parseInt(plans.completed) || 0,
        in_progress: parseInt(plans.in_progress) || 0,
      },
      tasks: {
        total: parseInt(tasks.total) || 0,
        inProgress: parseInt(tasks.in_progress) || 0,
        completed: parseInt(tasks.completed) || 0,
        pending: parseInt(tasks.pending) || 0,
      },
      processes: {
        completed: parseInt(processData.completed) || 0,
        total: parseInt(processData.total) || 0,
        rate: processRate,
      },
      reports: {
        total: parseInt(reportData.total) || 0,
        today: parseInt(reportData.today) || 0,
      },
      production: {
        ...production,
        quality_rate: qualityRate,
      },
      date: today,
    });
  } catch (error) {
    logger.error('获取仪表盘统计数据失败:', error);
    handleError(res, error);
  }
};

/**
 * 获取生产趋势数据
 */
exports.getDashboardTrends = async (req, res) => {
  try {
    // 支持三种模式：
    // A) 日级范围：提供 startDate/endDate（或days）时返回按日补零数组
    // B) 月级趋势：默认（或 granularity=month）返回近12个月聚合，结构为 { months, plannedData, completedData }
    // C) 当月趋势：granularity=day 返回当月每天的数据
    const { startDate, endDate, granularity } = req.query;
    const { days = 7 } = req.query;

    logger.info('[生产趋势] 请求参数:', { startDate, endDate, granularity, days });

    // 如果提供了显式日期范围，则走日级模式
    if (startDate || endDate) {
      // 使用显式范围，缺失的一端以今天补齐
      const today = new Date();
      const rangeStart = startDate
        ? new Date(startDate)
        : new Date(today.getFullYear(), today.getMonth(), today.getDate() - (parseInt(days) - 1));
      const rangeEnd = endDate ? new Date(endDate) : today;

      // 规范为 YYYY-MM-DD 字符串
      const toDateStr = (d) =>
        new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
      const startStr = toDateStr(rangeStart);
      const endStr = toDateStr(rangeEnd);

      const query = `
        SELECT
          DATE(report_time) as date,
          SUM(completed_quantity) as completed,
          SUM(qualified_quantity) as qualified,
          SUM(defective_quantity) as defective
        FROM production_reports
        WHERE DATE(report_time) BETWEEN ? AND ?
        GROUP BY DATE(report_time)
        ORDER BY date ASC
      `;

      const [rows] = await pool.query(query, [startStr, endStr]);

      // 将结果映射为字典，便于补零
      const map = new Map();
      for (const r of rows) {
        const dateKey = typeof r.date === 'string' ? r.date : toDateStr(new Date(r.date));
        map.set(dateKey, {
          date: dateKey,
          completed: parseInt(r.completed) || 0,
          qualified: parseInt(r.qualified) || 0,
          defective: parseInt(r.defective) || 0,
        });
      }

      // 生成连续日期并补零
      const result = [];
      const cursor = new Date(
        rangeStart.getFullYear(),
        rangeStart.getMonth(),
        rangeStart.getDate()
      );
      const endDateObj = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate());
      while (cursor <= endDateObj) {
        const key = toDateStr(cursor);
        const item = map.get(key) || { date: key, completed: 0, qualified: 0, defective: 0 };
        const qualityRate =
          item.completed > 0 ? parseFloat(((item.qualified / item.completed) * 100).toFixed(2)) : 0;
        result.push({ ...item, qualityRate });
        cursor.setDate(cursor.getDate() + 1);
      }

      return ResponseHandler.success(res, result);
    }

    // ===== 当月日级趋势 =====
    if (granularity === 'day') {
      logger.info('[生产趋势] 进入当月日级趋势模式');
      // 生成当月每天的标签
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      logger.info('[生产趋势] 当前年月:', { year, month: month + 1, daysInMonth });

      const days = [];
      for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        days.push(dateStr);
      }

      // 统计当月每天的生产计划数量
      const [planRows] = await pool.query(
        `
        SELECT DATE(created_at) AS day, COALESCE(SUM(quantity), 0) AS planned
        FROM production_plans
        WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?
        GROUP BY DATE(created_at)
        ORDER BY day ASC
      `,
        [year, month + 1]
      );

      logger.info('[生产趋势] 计划数据行数:', planRows.length);

      // 统计当月每天的完成数量
      const [completedRows] = await pool.query(
        `
        SELECT DATE(report_time) AS day, COALESCE(SUM(completed_quantity), 0) AS completed
        FROM production_reports
        WHERE YEAR(report_time) = ? AND MONTH(report_time) = ?
        GROUP BY DATE(report_time)
        ORDER BY day ASC
      `,
        [year, month + 1]
      );

      logger.info('[生产趋势] 完成数据行数:', completedRows.length);

      const planMap = new Map(
        planRows.map((r) => {
          const dateStr = typeof r.day === 'string' ? r.day : r.day.toISOString().split('T')[0];
          return [dateStr, Number(r.planned) || 0];
        })
      );
      const completedMap = new Map(
        completedRows.map((r) => {
          const dateStr = typeof r.day === 'string' ? r.day : r.day.toISOString().split('T')[0];
          return [dateStr, Number(r.completed) || 0];
        })
      );

      const plannedData = days.map((d) => planMap.get(d) ?? 0);
      let completedData = days.map((d) => completedMap.get(d) ?? 0);

      // 如果没有报工数据，尝试用已完成的生产任务数量作为完成量兜底
      if (completedData.every((v) => Number(v) === 0)) {
        logger.info('[生产趋势] 没有报工数据，尝试使用任务完成数据');
        const [taskCompletedRows] = await pool.query(
          `
          SELECT DATE(updated_at) AS day, COALESCE(SUM(quantity), 0) AS completed
          FROM production_tasks
          WHERE status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' AND YEAR(updated_at) = ? AND MONTH(updated_at) = ?
          GROUP BY DATE(updated_at)
          ORDER BY day ASC
        `,
          [year, month + 1]
        );
        logger.info('[生产趋势] 任务完成数据行数:', taskCompletedRows.length);
        const taskCompletedMap = new Map(
          taskCompletedRows.map((r) => {
            const dateStr = typeof r.day === 'string' ? r.day : r.day.toISOString().split('T')[0];
            return [dateStr, Number(r.completed) || 0];
          })
        );
        completedData = days.map((d) => taskCompletedMap.get(d) ?? 0);
      }

      return ResponseHandler.success(res, { days, plannedData, completedData });
    }

    // ===== 月级趋势（默认） =====
    if (!startDate && !endDate && (granularity === 'month' || !granularity)) {
      // 生成近12个月标签（包含当月）
      const months = [];
      const today = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push(label);
      }

      // 统计生产计划（按创建时间，合计计划数量）
      const [planRows] = await pool.query(`
        SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COALESCE(SUM(quantity), 0) AS planned
        FROM production_plans
        WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY month ASC
      `);

      // 统计完成数量（报工）
      const [completedRows] = await pool.query(`
        SELECT DATE_FORMAT(report_time, '%Y-%m') AS month, COALESCE(SUM(completed_quantity), 0) AS completed
        FROM production_reports
        WHERE report_time >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
        GROUP BY DATE_FORMAT(report_time, '%Y-%m')
        ORDER BY month ASC
      `);

      const planMap = new Map(planRows.map((r) => [r.month, Number(r.planned) || 0]));
      const completedMap = new Map(completedRows.map((r) => [r.month, Number(r.completed) || 0]));

      const plannedData = months.map((m) => planMap.get(m) ?? 0);
      let completedData = months.map((m) => completedMap.get(m) ?? 0);

      // 如果没有报工数据，尝试用已完成的生产任务数量作为完成量兜底（可选）
      if (completedData.every((v) => Number(v) === 0)) {
        const [taskCompletedRows] = await pool.query(`
          SELECT DATE_FORMAT(updated_at, '%Y-%m') AS month, COALESCE(SUM(quantity), 0) AS completed
          FROM production_tasks
          WHERE status = '${PRODUCTION_STATUS_KEYS.COMPLETED}' AND updated_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
          GROUP BY DATE_FORMAT(updated_at, '%Y-%m')
          ORDER BY month ASC
        `);
        const taskCompletedMap = new Map(
          taskCompletedRows.map((r) => [r.month, Number(r.completed) || 0])
        );
        completedData = months.map((m) => taskCompletedMap.get(m) ?? 0);
      }

      return ResponseHandler.success(res, { months, plannedData, completedData });
    }
  } catch (error) {
    logger.error('获取生产趋势数据失败:', error);
    handleError(res, error);
  }
};
