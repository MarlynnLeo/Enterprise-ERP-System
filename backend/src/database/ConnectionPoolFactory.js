/**
 * ConnectionPoolFactory.js
 * @description 连接池工厂 - 管理所有 mysql2 连接池的创建和生命周期
 *
 * [安全机制] 连接自动回收保护
 * 问题背景: 代码库中存在 364 处 getConnection() 后未在 finally 中 release() 的调用，
 *           导致异常时连接泄漏，最终连接池枯竭，整个服务无法响应。
 * 解决方案: 在连接池层为每个连接设置最大持有时间（默认 30s），超时后自动强制回收。
 *           这是一个安全网（Safety Net），不替代业务代码中正确的 finally { release() }。
 */

const mysql = require('mysql2/promise');
const { logger } = require('../utils/logger');
const EventEmitter = require('events');

/**
 * 连接池管理器
 */
class PoolManager extends EventEmitter {
  constructor(name, pool, options = {}) {
    super();
    this.name = name;
    this.pool = pool;
    this.options = options;
    this.healthCheckTimer = null;
    this.failedChecks = 0;
    this.started = false;
    // 连接回收统计
    this._stats = { autoReclaimed: 0, totalAcquired: 0 };
  }

  async start() {
    if (this.started) return;
    this.started = true;

    // 启动健康检查
    if (this.options.healthCheckInterval) {
      this.healthCheckTimer = setInterval(
        () => this._healthCheck(),
        this.options.healthCheckInterval
      );
      // 不阻塞启动的首次健康检查
      this._healthCheck().catch(() => {});
    }

    // 预热连接
    if (this.options.warmupEnabled && this.options.warmupConnections > 0) {
      await this._warmup();
    }

    logger.info(`[PoolManager] 连接池 "${this.name}" 管理器已启动`);
  }

  async _healthCheck() {
    try {
      const conn = await this.pool.getConnection();
      await conn.ping();
      conn.release();
      this.failedChecks = 0;
    } catch (error) {
      this.failedChecks++;
      if (this.failedChecks >= 3) {
        this.emit('health:critical', { failedCount: this.failedChecks });
      }
    }
  }

  async _warmup() {
    const count = this.options.warmupConnections || 2;
    const conns = [];
    try {
      for (let i = 0; i < count; i++) {
        const conn = await this.pool.getConnection();
        conns.push(conn);
      }
    } catch (error) {
      logger.warn(`[PoolManager] 预热连接失败: ${error.message}`);
    } finally {
      for (const conn of conns) {
        try { conn.release(); } catch (_) {}
      }
    }
  }

  /** 获取连接回收统计 */
  getStats() {
    return { ...this._stats };
  }

  async close() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.started = false;
    await this.pool.end();
    logger.info(`[PoolManager] 连接池 "${this.name}" 已关闭 (自动回收连接数: ${this._stats.autoReclaimed})`);
  }
}

/**
 * 连接池工厂
 */
class ConnectionPoolFactory {
  constructor() {
    this.pools = new Map();
  }

  /**
   * 创建连接池
   * @param {string} name - 连接池名称
   * @param {object} poolConfig - mysql2 连接池配置
   * @param {object} managerOptions - 管理器配置
   */
  createPool(name, poolConfig, managerOptions = {}) {
    if (this.pools.has(name)) {
      const existing = this.pools.get(name);
      return { pool: existing.pool, manager: existing.manager };
    }

    const pool = mysql.createPool(poolConfig);

    pool.on('connection', (connection) => {
      if (process.env.NODE_ENV === 'development') {
        logger.debug(`[DB] 新连接已建立 (池: ${name}, ID: ${connection.threadId})`);
      }
    });

    const manager = new PoolManager(name, pool, managerOptions);

    // ============================================================
    // [核心安全机制] 包装 getConnection，添加连接自动回收保护
    // ============================================================
    const maxHoldTime = managerOptions.maxConnectionHoldTime || 30000;
    const acquireTimeout = managerOptions.acquireTimeout || 10000;
    const originalGetConnection = pool.getConnection.bind(pool);

    pool.getConnection = async function getConnectionWithSafetyNet() {
      // 添加获取超时：避免连接池耗尽时无限等待导致服务完全阻塞
      const conn = await Promise.race([
        originalGetConnection(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`[连接池] 获取连接超时 (${acquireTimeout}ms)，连接池可能已耗尽`)),
            acquireTimeout
          )
        ),
      ]);

      manager._stats.totalAcquired++;

      // 记录获取连接的调用栈（仅开发环境，帮助排查泄漏来源）
      const acquireStack = process.env.NODE_ENV !== 'production'
        ? new Error().stack
        : null;

      // 设置自动回收定时器
      let released = false;
      const autoReclaimTimer = setTimeout(() => {
        if (!released) {
          released = true;
          manager._stats.autoReclaimed++;

          logger.warn(
            `[连接池] ⚠️ 连接 #${conn.threadId} 持有超过 ${maxHoldTime / 1000}s，自动强制回收！` +
            (acquireStack ? `\n获取位置:\n${acquireStack.split('\n').slice(2, 6).join('\n')}` : '')
          );

          try {
            originalRelease();
          } catch (e) {
            // 连接已损坏，忽略释放错误
          }
        }
      }, maxHoldTime);

      // 包装 release()，确保只执行一次并清除定时器
      const originalRelease = conn.release.bind(conn);
      conn.release = function safeRelease() {
        if (released) return; // 防止重复释放
        released = true;
        clearTimeout(autoReclaimTimer);
        return originalRelease();
      };

      return conn;
    };

    this.pools.set(name, { pool, manager });

    return { pool, manager };
  }

  /**
   * 关闭所有连接池
   */
  async closeAll() {
    const closePromises = [];
    for (const [, { manager }] of this.pools) {
      closePromises.push(manager.close());
    }
    await Promise.allSettled(closePromises);
    this.pools.clear();
  }

  /**
   * 获取指定连接池
   */
  getPool(name) {
    const entry = this.pools.get(name);
    return entry ? entry.pool : null;
  }

  /**
   * 获取指定连接池管理器
   */
  getManager(name) {
    const entry = this.pools.get(name);
    return entry ? entry.manager : null;
  }
}

// 导出单例工厂
module.exports = new ConnectionPoolFactory();
