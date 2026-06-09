const db = require('../../config/db');
const { logger } = require('../../utils/logger');

class DomainEventService {
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

  static async enqueue(eventName, payload, options = {}) {
    if (!eventName) {
      throw new Error('DomainEventService.enqueue requires eventName');
    }

    const connection = options.connection || (await db.pool.getConnection());
    const shouldRelease = !options.connection;
    const aggregateType = options.aggregateType || null;
    const aggregateId = options.aggregateId ? String(options.aggregateId) : null;
    const dedupKey = options.dedupKey || (aggregateType && aggregateId ? `${eventName}:${aggregateType}:${aggregateId}` : null);

    try {
      await connection.execute(
        `INSERT INTO domain_events (
          event_name, aggregate_type, aggregate_id, dedup_key, payload,
          status, attempts, available_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, CAST(? AS JSON), 'pending', 0, NOW(), NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          payload = VALUES(payload),
          status = IF(status = 'processed', status, 'pending'),
          available_at = NOW(),
          updated_at = NOW()`,
        [
          eventName,
          aggregateType,
          aggregateId,
          dedupKey,
          this.safeStringify(payload),
        ]
      );
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

    return true;
  }

  static async dispatchPending(limit = 20) {
    const connection = await db.pool.getConnection();
    let events = [];

    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute(
        `SELECT id, event_name, payload, attempts
           FROM domain_events
          WHERE status IN ('pending', 'failed')
            AND available_at <= NOW()
          ORDER BY id ASC
          LIMIT ${Math.max(1, Math.min(Number(limit) || 20, 100))}
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
      await this.dispatchEvent(event);
    }

    return events.length;
  }

  static async dispatchEvent(event) {
    const EventBus = require('../../events/EventBus');
    const payload = this.parsePayload(event.payload);

    try {
      const hasListener = typeof EventBus.emitAsync === 'function'
        ? await EventBus.emitAsync(event.event_name, payload)
        : EventBus.emit(event.event_name, payload);
      await db.pool.execute(
        `UPDATE domain_events
            SET status = ?,
                processed_at = IF(? = 'processed', NOW(), processed_at),
                error_message = ?,
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
                available_at = DATE_ADD(NOW(), INTERVAL LEAST(POWER(2, attempts), 3600) SECOND),
                updated_at = NOW()
          WHERE id = ?`,
        [error.message || String(error), event.id]
      );
      throw error;
    }
  }

  static dispatchSoon() {
    setImmediate(async () => {
      try {
        await this.dispatchPending();
      } catch (error) {
        logger.error('[DomainEvent] Dispatch failed:', error);
      }
    });
  }
}

module.exports = DomainEventService;
