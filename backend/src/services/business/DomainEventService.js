const db = require('../../config/db');
const { logger } = require('../../utils/logger');

/**
 * 领域事件出站表服务。
 *
 * 重要约定：
 * - enqueue 后应调用 dispatchSoon(eventId) 只派发「刚写入」的那条事件
 * - 禁止在业务写路径里 dispatchPending 清空整个积压队列
 *   （否则一次「采购入库」会把历史销售出库/生产完工事件一并弹通知）
 * - 积压/失败事件由定时任务小批量回收
 */
class DomainEventService {
  static isPoolClosedError(error) {
    return /pool is closed/i.test(error?.message || '');
  }

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
      logger.error(`[DomainEvent] Failed to parse payload: ${error.message}`);
      return {};
    }
  }

  /**
   * 入队领域事件
   * @returns {Promise<number|false|null>} 事件 id；表不存在返回 false
   */
  static async enqueue(eventName, payload, options = {}) {
    if (!eventName) {
      throw new Error('DomainEventService.enqueue requires eventName');
    }

    const connection = options.connection || (await db.pool.getConnection());
    const shouldRelease = !options.connection;
    const aggregateType = options.aggregateType || null;
    const aggregateId = options.aggregateId ? String(options.aggregateId) : null;
    const dedupKey =
      options.dedupKey ||
      (aggregateType && aggregateId ? `${eventName}:${aggregateType}:${aggregateId}` : null);

    try {
      // ON DUPLICATE 时用 LAST_INSERT_ID(id) 保证 insertId 始终可取到本行 id
      const [result] = await connection.execute(
        `INSERT INTO domain_events (
          event_name, aggregate_type, aggregate_id, dedup_key, payload,
          status, attempts, available_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, CAST(? AS JSON), 'pending', 0, NOW(), NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          payload = VALUES(payload),
          status = IF(status = 'processed', status, 'pending'),
          available_at = NOW(),
          updated_at = NOW(),
          id = LAST_INSERT_ID(id)`,
        [
          eventName,
          aggregateType,
          aggregateId,
          dedupKey,
          this.safeStringify(payload),
        ]
      );

      let eventId = result?.insertId || null;
      if (!eventId && dedupKey) {
        const [rows] = await connection.execute(
          'SELECT id FROM domain_events WHERE dedup_key = ? LIMIT 1',
          [dedupKey]
        );
        eventId = rows[0]?.id || null;
      }
      return eventId;
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        logger.warn(`[DomainEvent] domain_events table is missing; event ${eventName} was not persisted`);
        return false;
      }
      throw error;
    } finally {
      if (shouldRelease) {
        connection.release();
      }
    }
  }

  /**
   * 回收卡在 processing 过久的事件（进程崩溃、未提交等）
   */
  static async recoverStaleProcessing(staleMinutes = 10) {
    const minutes = Math.max(1, Math.min(Number(staleMinutes) || 10, 120));
    try {
      const [result] = await db.pool.execute(
        `UPDATE domain_events
            SET status = 'failed',
                error_message = COALESCE(NULLIF(error_message, ''), 'Stale processing lock recovered'),
                available_at = NOW(),
                locked_at = NULL,
                updated_at = NOW()
          WHERE status = 'processing'
            AND (
              locked_at IS NULL
              OR locked_at < DATE_SUB(NOW(), INTERVAL ${minutes} MINUTE)
            )`
      );
      if (result.affectedRows > 0) {
        logger.warn(`[DomainEvent] Recovered ${result.affectedRows} stale processing event(s)`);
      }
      return result.affectedRows || 0;
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return 0;
      throw error;
    }
  }

  /**
   * 认领并派发指定事件（业务写路径专用）
   */
  static async claimAndDispatchIds(eventIds = []) {
    const ids = [...new Set((Array.isArray(eventIds) ? eventIds : [eventIds])
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0))];

    if (ids.length === 0) return 0;

    const connection = await db.pool.getConnection();
    let events;
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query(
        `SELECT id, event_name, payload, attempts, created_at
           FROM domain_events
          WHERE id IN (?)
            AND status IN ('pending', 'failed')
            AND available_at <= NOW()
          FOR UPDATE`,
        [ids]
      );
      events = rows;

      if (events.length > 0) {
        const claimedIds = events.map((event) => event.id);
        await connection.query(
          `UPDATE domain_events
              SET status = 'processing',
                  attempts = attempts + 1,
                  locked_at = NOW(),
                  updated_at = NOW()
            WHERE id IN (?)`,
          [claimedIds]
        );
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    for (const event of events) {
      await this.dispatchEvent(event);
    }
    return events.length;
  }

  /**
   * 小批量处理积压（仅定时任务使用，切勿在用户请求里大批量调用）
   */
  static async dispatchPending(limit = 5) {
    await this.recoverStaleProcessing();

    const connection = await db.pool.getConnection();
    let events;

    try {
      await connection.beginTransaction();
      const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 20));
      const [rows] = await connection.execute(
        `SELECT id, event_name, payload, attempts, created_at
           FROM domain_events
          WHERE status IN ('pending', 'failed')
            AND available_at <= NOW()
          ORDER BY id ASC
          LIMIT ${safeLimit}
          FOR UPDATE`
      );
      events = rows;

      if (events.length > 0) {
        const ids = events.map((event) => event.id);
        await connection.query(
          `UPDATE domain_events
              SET status = 'processing',
                  attempts = attempts + 1,
                  locked_at = NOW(),
                  updated_at = NOW()
            WHERE id IN (?)`,
          [ids]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }

    connection.release();

    for (const event of events) {
      try {
        await this.dispatchEvent(event);
      } catch (error) {
        // 单条失败不阻断同批其它事件；状态已在 dispatchEvent 内写回 failed
        logger.warn(`[DomainEvent] Pending event ${event.id} failed: ${error.message}`);
      }
    }

    return events.length;
  }

  static async dispatchEvent(event) {
    const EventBus = require('../../events/EventBus');
    const basePayload = this.parsePayload(event.payload);
    // 附带元数据，供通知订阅者判断是否实时弹窗 / 是否跳过陈旧事件
    const payload = {
      ...basePayload,
      __domainEvent: {
        id: event.id,
        createdAt: event.created_at || null,
        attempts: event.attempts || 0,
      },
    };

    try {
      const hasListener =
        typeof EventBus.emitAsync === 'function'
          ? await EventBus.emitAsync(event.event_name, payload)
          : EventBus.emit(event.event_name, payload);
      await db.pool.execute(
        `UPDATE domain_events
            SET status = ?,
                processed_at = IF(? = 'processed', NOW(), processed_at),
                error_message = ?,
                locked_at = NULL,
                updated_at = NOW()
          WHERE id = ?`,
        [
          hasListener ? 'processed' : 'failed',
          hasListener ? 'processed' : 'failed',
          hasListener ? null : `No listener registered for ${event.event_name}`,
          event.id,
        ]
      );
    } catch (error) {
      await db.pool.execute(
        `UPDATE domain_events
            SET status = 'failed',
                error_message = ?,
                available_at = DATE_ADD(NOW(), INTERVAL LEAST(POWER(2, GREATEST(attempts, 1)), 3600) SECOND),
                locked_at = NULL,
                updated_at = NOW()
          WHERE id = ?`,
        [error.message || String(error), event.id]
      );
      throw error;
    }
  }

  /**
   * 业务写路径：仅派发刚入队的事件，不清空历史积压
   * @param {number|null} eventId enqueue 返回的事件 id
   */
  static dispatchSoon(eventId = null) {
    const id = eventId && eventId !== true ? Number(eventId) : null;
    setImmediate(async () => {
      try {
        if (Number.isInteger(id) && id > 0) {
          await this.claimAndDispatchIds([id]);
          return;
        }
        // 无 eventId 时不再清积压（否则一次业务操作会刷出无关历史通知）
        logger.debug('[DomainEvent] dispatchSoon called without eventId; backlog is handled by scheduler');
      } catch (error) {
        if (this.isPoolClosedError(error)) {
          logger.debug('[DomainEvent] Dispatch skipped because database pool is closed');
          return;
        }
        logger.error('[DomainEvent] Dispatch failed:', error);
      }
    });
  }
}

module.exports = DomainEventService;
