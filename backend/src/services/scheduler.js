/**
 * 定时任务调度器
 * 使用node-cron进行定时任务调度
 */

const cron = require('node-cron');
const logger = require('../utils/logger');
const { runOverdueCheck } = require('../services/overdueCheckService');

// 存储所有定时任务
const tasks = {};

/**
 * 启动逾期发票检查任务
 * 每天早上9点执行
 */
function startOverdueCheckTask() {
  // 0 9 * * * = 每天早上9点
  const task = cron.schedule(
    '0 9 * * *',
    async () => {
      logger.info('[定时任务] 开始执行逾期发票检查');
      try {
        await runOverdueCheck();
      } catch (error) {
        logger.error('[定时任务] 逾期发票检查失败:', error);
      }
    },
    {
      scheduled: false,
      timezone: 'Asia/Shanghai',
    }
  );

  tasks.overdueCheck = task;
  task.start();

  logger.info('[定时任务] 逾期发票检查任务已启动（每天9:00执行）');
}

/**
 * 手动触发逾期检查（用于运维即时执行）
 */
async function triggerOverdueCheck() {
  logger.info('[定时任务] 手动触发逾期检查');
  return await runOverdueCheck();
}

/**
 * 停止所有定时任务
 */
function stopAllTasks() {
  Object.values(tasks).forEach((task) => {
    if (task) {
      task.stop();
    }
  });
  logger.info('[定时任务] 所有定时任务已停止');
}

/**
 * 初始化所有定时任务
 */
function initScheduler() {
  logger.info('[定时任务] 初始化任务调度器');
  startOverdueCheckTask();
}

module.exports = {
  initScheduler,
  triggerOverdueCheck,
  stopAllTasks,
};
