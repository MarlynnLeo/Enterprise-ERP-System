/**
 * NotificationSubscriber.js
 * @description 监听核心业务事件，自动匹配数据库中的通知规则并发送通知。
 *              规则通过 /system/notification-rules 后台管理页面配置。
 *              通知持久化到 notifications 表（离线用户登录后可见）。
 *              通过 Socket.IO 实时推送给在线用户。
 * @date 2026-06-22
 */

const EventBus = require('../EventBus');
const NotificationRuleService = require('../../services/system/NotificationRuleService');
const NotificationService = require('../../services/NotificationService');
const { logger } = require('../../utils/logger');

/**
 * 所有可被监听的事件类型
 * 当数据库中有对应规则且启用时才会实际发送通知
 */
const SUBSCRIBABLE_EVENTS = [
  'PRODUCTION_TASK_COMPLETED',
  'PURCHASE_RECEIPT_COMPLETED',
  'SALES_OUTBOUND_COMPLETED',
  'SALES_RETURN_COMPLETED',
  'PURCHASE_RETURN_COMPLETED',
  'ANOMALY_REPORTED',
  'ASSEMBLY_ALL_STEPS_COMPLETED',
];

/**
 * 通过 Socket.IO 推送实时通知给在线用户
 */
function pushToOnlineUsers(userIds, notification) {
  try {
    const { getIO } = require('../../socket');
    const io = getIO();
    if (!io) return;

    for (const userId of userIds) {
      io.to(`user:${userId}`).emit('notification:new', {
        title: notification.title,
        content: notification.content,
        type: notification.type || 'business',
        link: notification.link || null,
        priority: notification.priority || 0,
        createdAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    // Socket 推送失败不应阻塞通知写入
    logger.warn('[NotificationSubscriber] Socket.IO 推送失败:', error.message);
  }
}

class NotificationSubscriber {
  constructor() {
    this.registerListeners();
    logger.info('🔔 [NotificationSubscriber] 已挂载业务通知事件监听器（数据库驱动）');
  }

  registerListeners() {
    for (const eventName of SUBSCRIBABLE_EVENTS) {
      EventBus.on(eventName, (payload) => this.handleEvent(eventName, payload));
    }
  }

  /**
   * 统一事件处理入口
   * 1. 从数据库查询该事件的所有启用规则（带 60 秒缓存）
   * 2. 对每条规则：解析接收人 + 渲染模板 + 写入通知表 + Socket.IO 推送
   */
  async handleEvent(eventName, payload) {
    try {
      // 查询匹配规则
      const rules = await NotificationRuleService.getActiveRulesByEvent(eventName);
      if (rules.length === 0) return;

      for (const rule of rules) {
        await this._processRule(eventName, rule, payload);
      }
    } catch (error) {
      // 通知发送失败不应影响主业务流程
      logger.warn(`[NotificationSubscriber] ${eventName} 通知处理失败:`, error.message);
    }
  }

  /**
   * 处理单条规则
   */
  async _processRule(eventName, rule, payload) {
    try {
      // 1. 解析接收人
      const recipientIds = await NotificationRuleService.resolveRecipients(rule);
      if (recipientIds.length === 0) {
        logger.debug(`[NotificationSubscriber] 规则 "${rule.name}" 无匹配接收人，跳过`);
        return;
      }

      // 2. 渲染模板
      const title = NotificationRuleService.renderTemplate(rule.title_template, payload);
      const content = NotificationRuleService.renderTemplate(rule.content_template, payload);
      const link = NotificationRuleService.renderTemplate(rule.link_template, payload);

      // 3. 构建通知源标识（用于去重）
      const sourceType = `notification_rule:${rule.id}`;
      const sourceId = this._extractSourceId(eventName, payload);

      // 4. 写入通知表（NotificationService 自带去重逻辑）
      const notification = {
        type: 'business',
        title,
        content,
        link: link || null,
        priority: rule.priority,
        sourceType,
        sourceId,
      };

      const result = await NotificationService.notifyUsers(recipientIds, notification, {
        dedupeBySource: true,
      });

      // 5. Socket.IO 实时推送
      if (result.inserted > 0) {
        pushToOnlineUsers(recipientIds, notification);
      }

      if (result.inserted > 0) {
        logger.info(
          `🔔 [NotificationSubscriber] ${eventName} 规则 "${rule.name}" → 发送 ${result.inserted} 条通知` +
            (result.skipped > 0 ? `，跳过 ${result.skipped} 条（去重）` : '')
        );
      }
    } catch (error) {
      logger.warn(`[NotificationSubscriber] 规则 "${rule.name}" 处理失败:`, error.message);
    }
  }

  /**
   * 从事件 payload 提取源 ID（用于通知去重）
   */
  _extractSourceId(eventName, payload) {
    switch (eventName) {
      case 'PRODUCTION_TASK_COMPLETED':
        return payload.taskId;
      case 'PURCHASE_RECEIPT_COMPLETED':
        return payload.receiptId;
      case 'SALES_OUTBOUND_COMPLETED':
        return payload.outboundData?.id;
      case 'SALES_RETURN_COMPLETED':
        return payload.returnId;
      case 'PURCHASE_RETURN_COMPLETED':
        return payload.returnId;
      case 'ANOMALY_REPORTED':
        return payload.anomalyId;
      case 'ASSEMBLY_ALL_STEPS_COMPLETED':
        return payload.taskId;
      default:
        return null;
    }
  }
}

module.exports = new NotificationSubscriber();
