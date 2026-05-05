/**
 * index.js
 * @description 应用程序入口文件
 * @date 2025-08-27
 * @version 1.0.0
 * Last restart: Env config update
 */

const logger = require('./utils/logger');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const app = require('./app');

const PORT = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';
const PUBLIC_API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  (isProduction ? '' : `http://${process.env.API_HOST || 'localhost'}:${PORT}`);

// 全局异常处理由 app.js → unifiedErrorHandler 统一管理
// 此处不再重复注册 uncaughtException / unhandledRejection，避免竞态退出

// 使用 db.js 中的统一优雅关闭机制，这里不再直接 process.exit(0)

// 添加对 nodemon 重启信号的支持，防止端口被占用
process.once('SIGUSR2', () => {
  logger.info('收到SIGUSR2信号(nodemon)，准备优雅重启...');
  // 留给 db.js 优雅关闭的时间
  setTimeout(() => {
    process.kill(process.pid, 'SIGUSR2');
  }, 500);
});

// 异步启动服务器
async function startServer() {
  try {
    // ===== Knex 数据库迁移 =====
    let knex;
    try {
      const knexConfig = require('../knexfile');
      knex = require('knex')(knexConfig[process.env.NODE_ENV || 'development']);
      logger.info('🔄 正在执行数据库迁移...');
      const [batchNo, migrations] = await knex.migrate.latest();
      if (migrations.length > 0) {
        logger.info(`✅ 数据库迁移完成 (批次 ${batchNo})，已执行 ${migrations.length} 个迁移文件:`);
        migrations.forEach(m => logger.info(`   - ${m}`));
      } else {
        logger.info('✅ 数据库已是最新，无需执行迁移');
      }
    } catch (migrateError) {
      logger.error('❌ 数据库迁移执行失败，服务启动已中止:', migrateError);
      throw migrateError;
    } finally {
      if (knex) {
        await knex.destroy(); // 释放 Knex 连接（应用使用 mysql2 连接池）
      }
    }

    // 缓存服务已在导入时初始化（单例模式）
    logger.info('✅ 缓存服务已就绪');

    // 初始化 SSOT 全局配置中心
    const globalConfigManager = require('./config/globalConfig');
    await globalConfigManager.init();

    // 初始化权限服务（清除旧缓存，确保代码变更后权限一致）
    const PermissionService = require('./services/PermissionService');
    PermissionService.initOnStartup();

    // 启动服务器（集成 Socket.IO）
    const http = require('http');
    const { initSocket } = require('./socket/index');
    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      logger.info(`服务器已启动，监听端口 ${PORT}`);
      if (PUBLIC_API_BASE_URL) {
        logger.info(`API文档: ${PUBLIC_API_BASE_URL}/api-docs`);
        logger.info(`Socket.IO 已就绪: ${PUBLIC_API_BASE_URL.replace(/^http/, 'ws')}/socket.io`);
      } else {
        logger.info('API文档: /api-docs');
        logger.info('Socket.IO 已就绪: /socket.io');
      }
    });

    // 设置服务器超时
    server.timeout = 120000; // 2分钟

    // 启动定时任务
    try {
      // 启动库存数据一致性检查定时任务 - 已禁用自动修复功能
      // const inventoryChecker = require('./jobs/inventoryConsistencyCheck');
      // inventoryChecker.start();
      logger.info('📊 库存数据一致性检查定时任务已禁用');
    } catch (error) {
      logger.warn('⚠️ 库存一致性检查定时任务启动失败:', error.message);
    }

    // 启动发票状态自动更新定时任务
    try {
      const { startInvoiceStatusJob } = require('./jobs/invoiceStatusJob');
      startInvoiceStatusJob();
      logger.info('💰 发票状态自动更新定时任务已启动 (每日凌晨1点执行)');
    } catch (error) {
      logger.warn('⚠️ 发票状态定时任务启动失败:', error.message);
    }

    // 启动通知清理定时任务
    try {
      const { startNotificationCleanupJob } = require('./jobs/notificationCleanupJob');
      startNotificationCleanupJob();
      logger.info('🧹 通知清理定时任务已启动 (每日凌晨2:30执行)');
    } catch (error) {
      logger.warn('⚠️ 通知清理定时任务启动失败:', error.message);
    }

    return server;
  } catch (error) {
    logger.error('❌ 服务器启动失败:', error);
    process.exit(1);
  }
}

// 启动服务器
startServer();

// 简单的垃圾回收（可选）
if (global.gc) {
  setInterval(
    () => {
      global.gc();
    },
    30 * 60 * 1000
  ); // 30分钟执行一次
}
