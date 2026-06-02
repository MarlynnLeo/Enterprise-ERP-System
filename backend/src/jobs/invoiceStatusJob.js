/**
 * 发票状态定时任务
 * 每日自动检查并更新逾期发票状态
 */

const cron = require('node-cron');
const {
  updateAllOverdueInvoices,
  getOverdueInvoicesStats,
} = require('../utils/invoiceStatusUpdater');
const { logger } = require('../utils/logger');

/**
 * 启动发票状态定时任务
 */
function startInvoiceStatusJob() {
  // 每日凌晨1点执行
  cron.schedule('0 1 * * *', async () => {
    logger.info('[定时任务] 开始执行发票状态更新任务...');

    try {
      const result = await updateAllOverdueInvoices();
      logger.info(`[定时任务] 发票状态更新完成: 共更新 ${result.total} 条发票`);

      // 获取逾期统计
      const stats = await getOverdueInvoicesStats();
      logger.info('[定时任务] 当前逾期发票统计:');
      logger.info(`  - 应收逾期: ${stats.ar.count}条, 金额: ¥${stats.ar.totalAmount.toFixed(2)}`);
      logger.info(`  - 应付逾期: ${stats.ap.count}条, 金额: ¥${stats.ap.totalAmount.toFixed(2)}`);
    } catch (error) {
      logger.error('[定时任务] 发票状态更新失败:', error);
    }
  });

  logger.info('[定时任务] 发票状态更新任务已启动 (每日凌晨1点执行)');
}

/**
 * 手动执行发票状态更新
 */
async function runInvoiceStatusUpdateNow() {
  logger.info('[手动执行] 开始更新发票状态...');

  try {
    const result = await updateAllOverdueInvoices();
    logger.info(`[手动执行] 发票状态更新完成: 共更新 ${result.total} 条发票`);

    // 获取逾期统计
    const stats = await getOverdueInvoicesStats();
    logger.info('[手动执行] 当前逾期发票统计:');
    logger.info(`  - 应收逾期: ${stats.ar.count}条, 金额: ¥${stats.ar.totalAmount.toFixed(2)}`);
    logger.info(`  - 应付逾期: ${stats.ap.count}条, 金额: ¥${stats.ap.totalAmount.toFixed(2)}`);

    return { result, stats };
  } catch (error) {
    logger.error('[手动执行] 发票状态更新失败:', error);
    throw error;
  }
}

module.exports = {
  startInvoiceStatusJob,
  runInvoiceStatusUpdateNow,
};
