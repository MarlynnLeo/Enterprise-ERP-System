/**
 * DLQService.js
 * @description Dead-letter queue service for async side effects.
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const { appendPaginationSQL } = require('../../utils/safePagination');

class DLQService {
  static handlers = new Map();

  static retryTimer = null;

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

  static parsePayload(payload) {
    if (!payload) return {};
    if (typeof payload === 'object') return payload;

    try {
      return JSON.parse(payload);
    } catch (error) {
      logger.warn(`[DLQ] Failed to parse payload JSON: ${error.message}`);
      return {};
    }
  }

  static normalizePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, max);
  }

  static getRetryConfig(options = {}) {
    const maxAttempts = this.normalizePositiveInteger(
      options.maxAttempts ?? process.env.DLQ_MAX_ATTEMPTS,
      5,
      20
    );
    const baseDelaySeconds = this.normalizePositiveInteger(
      options.baseDelaySeconds ?? process.env.DLQ_RETRY_BASE_DELAY_SECONDS,
      120,
      3600
    );
    const maxDelaySeconds = this.normalizePositiveInteger(
      options.maxDelaySeconds ?? process.env.DLQ_RETRY_MAX_DELAY_SECONDS,
      3600,
      86400
    );
    const lockTimeoutSeconds = this.normalizePositiveInteger(
      options.lockTimeoutSeconds ?? process.env.DLQ_LOCK_TIMEOUT_SECONDS,
      300,
      3600
    );

    return {
      maxAttempts,
      baseDelaySeconds,
      maxDelaySeconds,
      lockTimeoutSeconds,
    };
  }

  static nextRetryDelaySeconds(attempts, config = this.getRetryConfig()) {
    const exponent = Math.max(Number(attempts || 1) - 1, 0);
    const delay = config.baseDelaySeconds * (2 ** exponent);
    return Math.min(delay, config.maxDelaySeconds);
  }

  static registerHandler(taskName, handler) {
    if (!taskName || typeof handler !== 'function') {
      throw new Error('DLQ handler registration requires a taskName and handler function');
    }
    this.handlers.set(taskName, handler);
    logger.info(`[DLQ] Registered retry handler: ${taskName}`);
  }

  static unregisterHandler(taskName) {
    this.handlers.delete(taskName);
  }

  /**
   * Record an async side effect that failed after its primary transaction.
   */
  static async recordFailedJob(taskName, payload, error) {
    let connection;
    try {
      connection = await db.pool.getConnection();
      await connection.query(
        `INSERT INTO sys_failed_jobs
          (task_name, payload, error_message, error_stack, status, attempts, next_retry_at)
         VALUES (?, CAST(? AS JSON), ?, ?, 'pending', 0, NOW())`,
        [
          taskName,
          this.safeStringify(payload),
          error.message || String(error),
          error.stack || '',
        ]
      );
      logger.error(
        `[DLQ] Async task "${taskName}" failed and was persisted for retry/replay.`
      );
    } catch (dbError) {
      logger.error(`[DLQ] Failed to persist failed task: ${dbError.message}`, {
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

  static normalizeTaskNamePrefixes(taskNamePrefixes = []) {
    return Array.isArray(taskNamePrefixes)
      ? taskNamePrefixes.filter((prefix) => typeof prefix === 'string' && prefix.trim())
      : [];
  }

  static buildTaskNamePrefixSql(taskNamePrefixes = [], params = []) {
    const prefixes = this.normalizeTaskNamePrefixes(taskNamePrefixes);
    if (prefixes.length === 0) return '';
    params.push(...prefixes.map((prefix) => `${prefix}%`));
    return `task_name LIKE ${prefixes.map(() => '?').join(' OR task_name LIKE ')}`;
  }

  static async listFailedJobs({ status = 'pending', page = 1, pageSize = 50, taskNamePrefixes = [] } = {}) {
    const allowedStatuses = new Set(['pending', 'retrying', 'resolved', 'failed', 'ignored']);
    const actualPage = Math.max(Number(page) || 1, 1);
    const actualPageSize = Math.min(Math.max(Number(pageSize) || 50, 1), 100);
    const offset = (actualPage - 1) * actualPageSize;
    const conditions = [];
    const params = [];
    if (allowedStatuses.has(status)) {
      conditions.push('status = ?');
      params.push(status);
    }
    const taskNamePrefixSql = this.buildTaskNamePrefixSql(taskNamePrefixes, params);
    if (taskNamePrefixSql) {
      conditions.push(`(${taskNamePrefixSql})`);
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const listSql = appendPaginationSQL(
      `SELECT id, task_name, payload, error_message, status, attempts, next_retry_at,
              locked_at, resolved_at, created_at, updated_at
       FROM sys_failed_jobs
       ${whereSql}
       ORDER BY created_at DESC`,
      actualPageSize,
      offset
    );
    const [rows] = await db.pool.query(listSql, params);

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

  static async markResolved(id, operator) {
    const { resolveActorLabel } = require('../../utils/userUtils');
    const resolvedBy =
      operator != null && operator !== '' && operator !== 'system' && operator !== 'SYSTEM'
        ? String(operator)
        : await resolveActorLabel(null);
    await db.pool.query(
      `UPDATE sys_failed_jobs
       SET status = 'resolved',
           resolved_at = NOW(),
           error_message = CONCAT(COALESCE(error_message, ''), ?)
       WHERE id = ?`,
      [`\n[resolved_by=${resolvedBy}]`, id]
    );
  }

  static async requeueFailedJobs(ids = []) {
    const normalizedIds = [...new Set((Array.isArray(ids) ? ids : [ids])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isInteger(id) && id > 0))];
    if (normalizedIds.length === 0) return 0;

    const placeholders = normalizedIds.map(() => '?').join(',');
    const [result] = await db.pool.query(
      `UPDATE sys_failed_jobs
          SET status = 'pending',
              attempts = 0,
              next_retry_at = NOW(),
              locked_at = NULL,
              resolved_at = NULL,
              updated_at = NOW()
        WHERE id IN (${placeholders})
          AND status IN ('failed','ignored')`,
      normalizedIds
    );
    return Number(result.affectedRows || 0);
  }

  static async retryJob(job, config = this.getRetryConfig()) {
    const handler = this.handlers.get(job.task_name);
    if (!handler) {
      return {
        retried: false,
        reason: 'NO_HANDLER',
      };
    }

    const [claimResult] = await db.pool.query(
      `UPDATE sys_failed_jobs
       SET status = 'retrying',
           attempts = attempts + 1,
           locked_at = NOW(),
           updated_at = NOW()
       WHERE id = ?
         AND status IN ('pending','retrying')
         AND attempts < ?
         AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL ? SECOND))`,
      [job.id, config.maxAttempts, config.lockTimeoutSeconds]
    );

    if (claimResult.affectedRows === 0) {
      return {
        retried: false,
        reason: 'NOT_CLAIMED',
      };
    }

    const [[claimedJob]] = await db.pool.query(
      `SELECT id, task_name, payload, attempts
       FROM sys_failed_jobs
       WHERE id = ?`,
      [job.id]
    );
    const payload = this.parsePayload(claimedJob?.payload);
    const attempts = Number(claimedJob?.attempts || job.attempts || 1);

    try {
      await handler(payload, {
        jobId: job.id,
        attempts,
        maxAttempts: config.maxAttempts,
      });

      await db.pool.query(
        `UPDATE sys_failed_jobs
         SET status = 'resolved',
             locked_at = NULL,
             resolved_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [job.id]
      );

      logger.info(`[DLQ] Retry resolved job ${job.id} (${job.task_name})`);
      return {
        retried: true,
        resolved: true,
      };
    } catch (error) {
      const exhausted = attempts >= config.maxAttempts;
      const nextDelay = this.nextRetryDelaySeconds(attempts, config);

      await db.pool.query(
        `UPDATE sys_failed_jobs
         SET status = ?,
             error_message = ?,
             error_stack = ?,
             next_retry_at = ${exhausted ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? SECOND)'},
             locked_at = NULL,
             updated_at = NOW()
         WHERE id = ?`,
        exhausted
          ? ['failed', error.message || String(error), error.stack || '', job.id]
          : ['pending', error.message || String(error), error.stack || '', nextDelay, job.id]
      );

      logger.warn(
        `[DLQ] Retry failed for job ${job.id} (${job.task_name}), attempts=${attempts}/${config.maxAttempts}: ${error.message}`
      );
      return {
        retried: true,
        resolved: false,
        exhausted,
      };
    }
  }

  static async retryPendingJobs(options = {}) {
    const taskNamePrefixes = this.normalizeTaskNamePrefixes(options.taskNamePrefixes);
    const registeredTaskNames = [...this.handlers.keys()].filter((taskName) => (
      taskNamePrefixes.length === 0 || taskNamePrefixes.some((prefix) => taskName.startsWith(prefix))
    ));
    if (registeredTaskNames.length === 0) {
      return {
        scanned: 0,
        retried: 0,
        resolved: 0,
        failed: 0,
        exhausted: 0,
      };
    }

    const limit = this.normalizePositiveInteger(
      options.limit ?? process.env.DLQ_RETRY_BATCH_SIZE,
      20,
      200
    );
    const config = this.getRetryConfig(options);
    const placeholders = registeredTaskNames.map(() => '?').join(',');

    const [jobs] = await db.pool.query(
      `SELECT id, task_name, payload, attempts
       FROM sys_failed_jobs
       WHERE task_name IN (${placeholders})
         AND status IN ('pending','retrying')
         AND attempts < ?
         AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL ? SECOND))
       ORDER BY created_at ASC
       LIMIT ?`,
      [...registeredTaskNames, config.maxAttempts, config.lockTimeoutSeconds, limit]
    );

    const result = {
      scanned: jobs.length,
      retried: 0,
      resolved: 0,
      failed: 0,
      exhausted: 0,
    };

    for (const job of jobs) {
      const retryResult = await this.retryJob(job, config);
      if (!retryResult.retried) continue;
      result.retried += 1;
      if (retryResult.resolved) {
        result.resolved += 1;
      } else {
        result.failed += 1;
        if (retryResult.exhausted) result.exhausted += 1;
      }
    }

    return result;
  }

  static startRetryWorker(options = {}) {
    if (process.env.DISABLE_DLQ_RETRY === 'true') {
      logger.info('[DLQ] Retry worker disabled by DISABLE_DLQ_RETRY=true');
      return null;
    }

    if (this.retryTimer) return this.retryTimer;

    const intervalMs = this.normalizePositiveInteger(
      options.intervalMs ?? process.env.DLQ_RETRY_INTERVAL_MS,
      60000,
      3600000
    );

    const run = async () => {
      try {
        const result = await this.retryPendingJobs(options);
        if (result.retried > 0) {
          logger.info(
            `[DLQ] Retry worker batch complete: retried=${result.retried}, resolved=${result.resolved}, failed=${result.failed}, exhausted=${result.exhausted}`
          );
        }
      } catch (error) {
        logger.error(`[DLQ] Retry worker failed: ${error.message}`, error);
      }
    };

    this.retryTimer = setInterval(run, intervalMs);
    this.retryTimer.unref?.();

    const initialDelayMs = this.normalizePositiveInteger(
      options.initialDelayMs ?? process.env.DLQ_RETRY_INITIAL_DELAY_MS,
      5000,
      intervalMs
    );
    const initialTimer = setTimeout(run, initialDelayMs);
    initialTimer.unref?.();

    logger.info(`[DLQ] Retry worker started, interval=${intervalMs}ms`);
    return this.retryTimer;
  }

  static stopRetryWorker() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
      logger.info('[DLQ] Retry worker stopped');
    }
  }

  /**
   * Local async retry wrapper. Exhausted jobs enter the DLQ and are picked up by
   * the registered retry worker when a handler exists for the task name.
   */
  static runWithRetry(taskName, payload, taskFn, maxRetries = 3) {
    setImmediate(async () => {
      let retries = maxRetries;
      while (retries > 0) {
        try {
          await taskFn();
          break;
        } catch (err) {
          retries--;
          logger.warn(
            `[DLQ] Async task "${taskName}" failed (remaining attempts: ${retries}): ${err.message}`
          );
          if (retries === 0) {
            await this.recordFailedJob(taskName, payload, err);
          } else {
            const waitTime = (maxRetries - retries) * 2000;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }
    });
  }
}

module.exports = DLQService;
