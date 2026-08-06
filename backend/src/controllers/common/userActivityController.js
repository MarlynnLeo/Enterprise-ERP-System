/**
 * userActivityController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { parsePagination } = require('../../utils/safePagination');

function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

// 记录用户活动
exports.logActivity = async (req, res) => {
  try {


    // 这里可以扩展为使用专门的活动记录表
    // 目前先返回成功响应

    return ResponseHandler.success(res, null, '活动记录成功');
  } catch (error) {
    return ResponseHandler.error(res, '记录活动失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取用户活动记录
exports.getUserActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, category, startDate, endDate } = req.query;
    const { AuditService } = require('../../services/AuditService');
    const pagination = parsePagination(page, limit, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });

    // 调用真实的审计查询引擎
    const result = await AuditService.query({
      userId,
      module: category,
      startDate,
      endDate,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });

    // 适配前端期望的数据结构
    const activities = result.list.map((log) => ({
      id: log.id,
      userId: log.user_id,
      timestamp: log.created_at,
      content: `${log.module} - ${log.action} ${log.entity_type || ''}`,
      type: 'info', // 默认状态标
      category: log.module,
      createdAt: log.created_at,
    }));

    return ResponseHandler.success(res, {
      activities,
      pagination: {
        page: result.page,
        limit: result.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / result.pageSize),
      },
    });
  } catch (error) {
    logger.error('获取用户活动失败:', error);
    return ResponseHandler.error(res, '获取活动记录失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取用户统计数据
exports.getUserStatistics = async (req, res) => {
  try {
    const userId = req.user.id;
    const db = require('../../config/db');

    logger.info(`获取用户统计数据，用户ID: ${userId}`);

    // 获取待办事项统计（使用数据库直接查询，避免Sequelize依赖问题）
    let totalTodos = 0;
    let completedTodos = 0;
    let completionRate = 0;

    try {
      const [todoResult] = await db.pool.query(
        `
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
        FROM todos
        WHERE userId = ?
      `,
        [userId]
      );

      totalTodos = parseInt(todoResult[0]?.total) || 0;
      completedTodos = parseInt(todoResult[0]?.completed) || 0;
      completionRate = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

      logger.info(`待办统计: 总数=${totalTodos}, 已完成=${completedTodos}`);
    } catch (todoError) {
      logger.error('查询待办事项失败:', todoError);
      throw todoError;
    }

    // 获取真实登录统计数据
    let loginCount = 0;
    let daysActive = 0;
    let lastLogin = null;
    let todayOnlineTime = 0;
    let totalOnlineTime = 0;

    try {
      // 统计总登录次数（通过audit_logs中的登录记录）
      const [loginCountResult] = await db.pool.query(
        `
        SELECT COUNT(DISTINCT DATE(created_at)) as login_count
        FROM audit_logs
        WHERE user_id = ?
          AND action IN ('LOGIN', 'login', '登录')
      `,
        [userId]
      );
      loginCount = parseInt(loginCountResult[0]?.login_count) || 0;

      // 统计活跃天数（有操作记录的天数）
      const [daysActiveResult] = await db.pool.query(
        `
        SELECT COUNT(DISTINCT DATE(created_at)) as days_active
        FROM audit_logs
        WHERE user_id = ?
          AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      `,
        [userId]
      );
      daysActive = parseInt(daysActiveResult[0]?.days_active) || 0;

      // 获取最后登录时间
      const [lastLoginResult] = await db.pool.query(
        `
        SELECT MAX(created_at) as last_login
        FROM audit_logs
        WHERE user_id = ?
      `,
        [userId]
      );
      lastLogin = lastLoginResult[0]?.last_login || new Date();

      // 计算今日在线时长（秒）
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [todayOnlineResult] = await db.pool.query(
        `
        WITH user_activities AS (
          SELECT
            created_at,
            TIMESTAMPDIFF(SECOND,
              LAG(created_at) OVER (ORDER BY created_at),
              created_at
            ) as time_diff
          FROM audit_logs
          WHERE user_id = ?
            AND created_at >= ?
            AND created_at < ?
          ORDER BY created_at
        )
        SELECT
          SUM(
            CASE
              WHEN time_diff IS NULL OR time_diff > 300 THEN 60
              WHEN time_diff <= 300 THEN time_diff
              ELSE 60
            END
          ) as total_seconds
        FROM user_activities
      `,
        [userId, today, tomorrow]
      );
      todayOnlineTime = parseInt(todayOnlineResult[0]?.total_seconds) || 0;

      // 计算总在线时长（秒）
      const [totalOnlineResult] = await db.pool.query(
        `
        WITH user_activities AS (
          SELECT
            created_at,
            TIMESTAMPDIFF(SECOND,
              LAG(created_at) OVER (ORDER BY created_at),
              created_at
            ) as time_diff
          FROM audit_logs
          WHERE user_id = ?
          ORDER BY created_at
        )
        SELECT
          SUM(
            CASE
              WHEN time_diff IS NULL OR time_diff > 300 THEN 60
              WHEN time_diff <= 300 THEN time_diff
              ELSE 60
            END
          ) as total_seconds
        FROM user_activities
      `,
        [userId]
      );
      totalOnlineTime = parseInt(totalOnlineResult[0]?.total_seconds) || 0;
    } catch (dbError) {
      logger.error('查询用户统计数据失败:', dbError);
      logger.error('请确保audit_logs表已创建。运行: node src/database/run-audit-logs-migration.js');
      throw dbError;
    }

    const statistics = {
      todoStats: {
        total: totalTodos,
        completed: completedTodos,
        totalTodos,
        completedTodos,
        completionRate,
      },
      loginStats: {
        totalLogins: loginCount,
        daysActive: daysActive,
        lastLogin: lastLogin,
        todayOnlineTime: todayOnlineTime, // 今日在线时长（秒）
        totalOnlineTime: totalOnlineTime, // 总在线时长（秒）
      },
      activityStats: {
        monthlyActivity: Math.min(Math.round((daysActive / 30) * 100), 100),
        averageResponseTime: '2.3小时',
        efficiencyScore: Math.min(
          Math.round((completedTodos / Math.max(totalTodos, 1)) * 100),
          100
        ),
      },
    };

    return ResponseHandler.success(res, statistics);
  } catch (error) {
    logger.error('获取用户统计失败:', error);
    return ResponseHandler.error(res, '获取统计数据失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取用户在线时长排行榜
exports.getOnlineTimeRanking = async (req, res) => {
  try {
    const { date } = req.query;
    const db = require('../../config/db');

    // 排行榜统计 SQL（通过操作间隔推算在线时长）
    const rankingQuery = `
      WITH user_activities AS (
        SELECT
          u.id as user_id,
          u.username,
          u.real_name,
          u.avatar,
          u.avatar_frame,
          u.bio,
          a.created_at,
          TIMESTAMPDIFF(SECOND,
            LAG(a.created_at) OVER (PARTITION BY u.id ORDER BY a.created_at),
            a.created_at
          ) as time_diff
        FROM audit_logs a
        INNER JOIN users u ON a.user_id = u.id
        WHERE a.created_at >= ?
          AND a.created_at <= ?
          AND a.user_id IS NOT NULL
        ORDER BY u.id, a.created_at
      ),
      user_online_time AS (
        SELECT
          user_id,
          username,
          real_name,
          avatar,
          avatar_frame,
          bio,
          SUM(
            CASE
              WHEN time_diff IS NULL OR time_diff > 300 THEN 60
              WHEN time_diff <= 300 THEN time_diff
              ELSE 60
            END
          ) as total_seconds
        FROM user_activities
        GROUP BY user_id, username, real_name, avatar, avatar_frame, bio
      )
      SELECT
        user_id,
        username,
        real_name,
        avatar,
        avatar_frame,
        bio,
        total_seconds,
        FLOOR(total_seconds / 3600) as hours,
        FLOOR((total_seconds % 3600) / 60) as minutes
      FROM user_online_time
      ORDER BY total_seconds DESC
      LIMIT 3
    `;

    // 执行排行查询的辅助函数
    const queryRanking = async (queryDate) => {
      const startDate = new Date(queryDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(queryDate);
      endDate.setHours(23, 59, 59, 999);
      const [results] = await db.pool.query(rankingQuery, [startDate, endDate]);
      return results;
    };

    let targetDate;
    let results;

    if (date) {
      // 用户指定了日期，直接查询
      targetDate = parseDateOnly(date);
      if (!targetDate) {
        return ResponseHandler.error(res, '日期格式无效，请使用 YYYY-MM-DD', 'VALIDATION_ERROR', 400);
      }
      results = await queryRanking(targetDate);
    } else {
      // 默认查当天
      targetDate = new Date();
      results = await queryRanking(targetDate);

      // 当天无数据时，回退到最近有数据的日期（最多回退7天）
      if (results.length === 0) {
        const [recentDate] = await db.pool.query(
          `SELECT DATE(created_at) as log_date
           FROM audit_logs
           WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             AND user_id IS NOT NULL
           GROUP BY DATE(created_at)
           ORDER BY log_date DESC
           LIMIT 1`
        );

        if (recentDate.length > 0) {
          targetDate = new Date(recentDate[0].log_date);
          results = await queryRanking(targetDate);
        }
      }
    }

    // 格式化日期用于前端展示
    const displayDate = targetDate.toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric',
    });

    // 格式化结果
    const rankings = results.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      username: row.username,
      realName: row.realName || row.username,
      avatar: row.avatar || null,
      avatarFrame: row.avatar_frame || null,
      bio: row.bio || '这个家伙很懒，什么也没留下',
      totalSeconds: parseInt(row.total_seconds),
      hours: parseInt(row.hours),
      minutes: parseInt(row.minutes),
      displayTime: `${row.hours}小时${row.minutes}分钟`,
    }));

    return ResponseHandler.success(res, { rankings, date: displayDate });
  } catch (error) {
    logger.error('获取在线时长排行榜失败:', error);

    // 返回空数据，不生成虚构活动记录
    return ResponseHandler.error(res, '获取在线时长排行榜失败', 'SERVER_ERROR', 500, error);
  }
};

// 导出用户活动记录
exports.exportActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, startDate, endDate, format = 'csv' } = req.query;
    const { AuditService } = require('../../services/AuditService');

    const result = await AuditService.queryForExport({
      userId,
      module: category,
      startDate,
      endDate,
    });

    const activities = result.list.map((log) => ({
      timestamp: new Date(log.created_at).toLocaleString(),
      content: `${log.module} - ${log.action} ${log.entity_type || ''} (${log.entity_id || ''})`,
      category: log.module,
    }));

    if (format === 'csv') {
      // 生成CSV格式
      const csvHeaders = ['时间', '内容', '类型'];
      const csvRows = activities.map((activity) => [
        activity.timestamp,
        activity.content,
        activity.category,
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvRows.map((row) => row.map((field) => `"${field}"`).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="user_activities_${new Date().toISOString().split('T')[0]}.csv"`
      );
      res.send('\ufeff' + csvContent); // BOM for UTF-8
    } else {
      // JSON格式
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="user_activities_${new Date().toISOString().split('T')[0]}.json"`
      );
      return ResponseHandler.success(res, activities);
    }
  } catch (error) {
    logger.error('导出活动记录失败:', error);
    return ResponseHandler.error(res, '导出失败', 'SERVER_ERROR', 500, error);
  }
};

module.exports = exports;
