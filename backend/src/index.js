const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { logger } = require('./utils/logger');
const app = require('./app');
const { server: serverConfig } = require('./config');

// SIGUSR2 (nodemon) 信号处理已由 db.js 统一管理（关闭连接池后重启）

/**
 * 启动时迁移策略：
 * - production 默认关闭（须发布流水线显式 migrate）
 * - 开发/测试默认开启
 * - 可用 AUTO_MIGRATE=true|false 覆盖
 */
function shouldAutoMigrate() {
  if (process.env.AUTO_MIGRATE === 'true') return true;
  if (process.env.AUTO_MIGRATE === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

async function runMigrations() {
  if (!shouldAutoMigrate()) {
    logger.info(
      'AUTO_MIGRATE disabled (production default). Run `npm run migrate` in release pipeline.'
    );
    return;
  }

  let knex;

  try {
    const knexConfig = require('../knexfile');
    knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
    logger.info('Running database migrations...');

    const [batchNo, migrations] = await knex.migrate.latest();
    if (migrations.length > 0) {
      logger.info(`Database migrations completed. Batch: ${batchNo}, files: ${migrations.length}`);
      migrations.forEach(migration => logger.info(`Migration executed: ${migration}`));
    } else {
      logger.info('Database schema is already up to date.');
    }
  } finally {
    if (knex) {
      await knex.destroy();
    }
  }
}

function startCronJobs() {
  if (process.env.DISABLE_CRON === 'true') {
    logger.info('DISABLE_CRON=true, scheduled jobs skipped.');
    return;
  }

  try {
    const { startInvoiceStatusJob } = require('./jobs/invoiceStatusJob');
    startInvoiceStatusJob();
  } catch (error) {
    logger.warn('Invoice status job failed to start.', { error: error.message });
  }

  try {
    const { startNotificationCleanupJob } = require('./jobs/notificationCleanupJob');
    startNotificationCleanupJob();
  } catch (error) {
    logger.warn('Notification cleanup job failed to start.', { error: error.message });
  }
}

async function startServer() {
  try {
    await runMigrations();

    const cacheManager = require('./services/cache/CacheManager');
    await cacheManager.initialize();
    logger.info('Cache service initialized.');

    const globalConfigManager = require('./config/globalConfig');
    await globalConfigManager.init();

    const PermissionService = require('./services/PermissionService');
    await PermissionService.initOnStartup();

    const http = require('http');
    const { initSocket } = require('./socket/index');
    const server = http.createServer(app);
    initSocket(server);

    server.listen(serverConfig.port, () => {
      logger.info(`Server started on port ${serverConfig.port}`);
      if (serverConfig.publicApiBaseUrl) {
        logger.info(`Socket.IO: ${serverConfig.publicApiBaseUrl.replace(/^http/, 'ws')}/socket.io`);
      } else {
        logger.info('Socket.IO: /socket.io');
      }
    });

    server.timeout = serverConfig.timeoutMs;
    startCronJobs();

    return server;
  } catch (error) {
    logger.error('Server startup failed.', error);
    process.exit(1);
  }
}

startServer();

if (global.gc) {
  const gcTimer = setInterval(() => {
    global.gc();
  }, serverConfig.gcIntervalMs);

  gcTimer.unref?.();
}

module.exports = { startServer };
