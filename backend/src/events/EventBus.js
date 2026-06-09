const EventEmitter = require('events');
const { logger } = require('../utils/logger');

const CRITICAL_EVENTS = new Set([
  'SALES_OUTBOUND_COMPLETED',
  'PURCHASE_RECEIPT_COMPLETED',
  'PRODUCTION_TASK_COMPLETED',
]);

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.criticalListenerAuditEnabled = false;
  }

  enableCriticalListenerAudit() {
    this.criticalListenerAuditEnabled = true;
  }

  on(eventName, listener) {
    return super.on(eventName, this.wrapListener(eventName, listener));
  }

  once(eventName, listener) {
    return super.once(eventName, this.wrapListener(eventName, listener));
  }

  wrapListener(eventName, listener) {
    return (...args) => {
      try {
        const result = listener(...args);
        if (result && typeof result.catch === 'function') {
          result.catch((error) => this.recordListenerFailure(eventName, args, error));
        }
        return result;
      } catch (error) {
        this.recordListenerFailure(eventName, args, error);
        throw error;
      }
    };
  }

  async recordListenerFailure(eventName, args, error) {
    logger.error(`[EventBus] listener failed for ${eventName}:`, error);
    try {
      const DLQService = require('../services/business/DLQService');
      await DLQService.recordFailedJob(`EventBus:${eventName}`, { eventName, args }, error);
    } catch (dlqError) {
      logger.error(`[EventBus] failed to record listener failure for ${eventName}`, dlqError);
    }
  }

  emit(eventName, ...args) {
    logger.debug(`[EventBus] emit ${eventName}`);
    try {
      const hasListener = super.emit(eventName, ...args);
      if (!hasListener && this.criticalListenerAuditEnabled && CRITICAL_EVENTS.has(eventName)) {
        void this.recordListenerFailure(
          eventName,
          args,
          new Error(`Critical event ${eventName} has no registered listeners`)
        );
      }
      return hasListener;
    } catch (error) {
      logger.error(`[EventBus] emit failed for ${eventName}`, error);
      return false;
    }
  }

  async emitAsync(eventName, ...args) {
    logger.debug(`[EventBus] async emit ${eventName}`);
    const listeners = this.listeners(eventName);
    if (listeners.length === 0) {
      if (this.criticalListenerAuditEnabled && CRITICAL_EVENTS.has(eventName)) {
        await this.recordListenerFailure(
          eventName,
          args,
          new Error(`Critical event ${eventName} has no registered listeners`)
        );
      }
      return false;
    }

    const results = await Promise.allSettled(
      listeners.map((listener) => Promise.resolve().then(() => listener(...args)))
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      throw failed.reason;
    }
    return true;
  }
}

module.exports = new EventBus();
