/**
 * 通知清理定时任务
 * 每日自动清理 90 天前的已读通知，防止通知表无限增长
 */

const cron = require('node-cron');
const { pool } = require('../config/db');
const logger = require('../utils/logger');

/**
 * 清理过期的已读通知（默认 90 天）
 * @param {number} retentionDays - 保留天数，默认 90
 */
async function cleanupExpiredNotifications(retentionDays = 90) {
  try {
    const [result] = await pool.query(
      `DELETE FROM notifications
       WHERE is_read = 1
         AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [retentionDays]
    );

    const deletedCount = result.affectedRows || 0;
    if (deletedCount > 0) {
      logger.info(`[通知清理] 已清理 ${deletedCount} 条过期已读通知（${retentionDays} 天前）`);
    } else {
      logger.info(`[通知清理] 无需清理，无过期已读通知`);
    }

    return { success: true, deletedCount };
  } catch (error) {
    logger.error('[通知清理] 清理失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 启动通知清理定时任务
 * 每天凌晨 2:30 执行
 */
function startNotificationCleanupJob() {
  cron.schedule('30 2 * * *', async () => {
    logger.info('[定时任务] 开始执行通知清理任务...');
    await cleanupExpiredNotifications(90);
  });

  logger.info('[定时任务] 通知清理任务已启动（每日凌晨 2:30 执行）');
}

module.exports = {
  cleanupExpiredNotifications,
  startNotificationCleanupJob,
};
