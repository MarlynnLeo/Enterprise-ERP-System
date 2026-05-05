/**
 * DLQService.js
 * @description 死信队列处理服务：专门负责捕获及补偿最终失败的异步业务逻辑
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

class DLQService {
  static safeStringify(value) {
    try {
      return JSON.stringify(value || {});
    } catch (error) {
      return JSON.stringify({
        serialization_error: error.message,
        value_type: typeof value,
      });
    }
  }

  /**
   * 记录最终失败的异步任务
   */
  static async recordFailedJob(taskName, payload, error) {
    let connection;
    try {
      connection = await db.pool.getConnection();
      await connection.query(
        `INSERT INTO sys_failed_jobs
          (task_name, payload, error_message, error_stack, status, attempts, next_retry_at)
         VALUES (?, CAST(? AS JSON), ?, ?, 'pending', 0, NULL)`,
        [
          taskName,
          this.safeStringify(payload),
          error.message || String(error),
          error.stack || '',
        ]
      );
      logger.error(`🚨 [DLQ 告警] 异步任务 "${taskName}" 全局失败并已落库，请系统管理员通过面板进行重放。`);
    } catch (dbError) {
      // 这里的 logger 真的是最后一道防线
      logger.error(`🔥 [DLQ 致命错误] 无法写入死信表以记录失败任务: ${dbError.message}`, {
        originalTask: taskName,
        payload,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  static async recordSideEffectFailure(taskName, payload, error) {
    await this.recordFailedJob(taskName, payload, error);
  }

  static async listFailedJobs({ status = 'pending', page = 1, pageSize = 50 } = {}) {
    const allowedStatuses = new Set(['pending', 'retrying', 'resolved', 'ignored']);
    const actualPage = Math.max(Number(page) || 1, 1);
    const actualPageSize = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
    const offset = (actualPage - 1) * actualPageSize;
    const whereSql = allowedStatuses.has(status) ? 'WHERE status = ?' : '';
    const params = allowedStatuses.has(status) ? [status] : [];

    const [rows] = await db.pool.query(
      `SELECT id, task_name, payload, error_message, status, attempts, next_retry_at,
              locked_at, resolved_at, created_at, updated_at
       FROM sys_failed_jobs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, actualPageSize, offset]
    );

    const [countRows] = await db.pool.query(
      `SELECT COUNT(*) AS total FROM sys_failed_jobs ${whereSql}`,
      params
    );

    return {
      list: rows,
      total: Number(countRows[0]?.total || 0),
      page: actualPage,
      pageSize: actualPageSize,
    };
  }

  static async markResolved(id, operator = 'system') {
    await db.pool.query(
      `UPDATE sys_failed_jobs
       SET status = 'resolved',
           resolved_at = NOW(),
           error_message = CONCAT(COALESCE(error_message, ''), ?)
       WHERE id = ?`,
      [`\n[resolved_by=${operator}]`, id]
    );
  }

  /**
   * 提供给异步包裹器的一个重试执行模板
   */
  static runWithRetry(taskName, payload, taskFn, maxRetries = 3) {
    setImmediate(async () => {
      let retries = maxRetries;
      while (retries > 0) {
        try {
          await taskFn();
          break; // 成功退出
        } catch (err) {
          retries--;
          logger.warn(`⚠️ [异步重试] 任务 "${taskName}" 失败 (剩余试错机会: ${retries}): ${err.message}`);
          if (retries === 0) {
            // 极限超标，扔进死信表
            await this.recordFailedJob(taskName, payload, err);
          } else {
            // 指数级退避等待: 2s, 4s...
            const waitTime = (maxRetries - retries) * 2000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
    });
  }
}

module.exports = DLQService;
