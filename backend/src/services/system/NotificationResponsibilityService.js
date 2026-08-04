const { pool } = require('../../config/db');
const NotificationRecipientService = require('../NotificationRecipientService');
const { NOTIFICATION_SETTING_KEYS } = require('../../constants/notification');
const { getEvent, getEventsByResponsibility } = require('../../events/NotificationEventRegistry');

const CACHE_TTL_MS = 60 * 1000;

function parseObject(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

class NotificationResponsibilityService {
  async getAll() {
    if (this.cache && this.expiresAt > Date.now()) return this.cache;
    const [rows] = await pool.query(
      'SELECT value FROM system_settings WHERE `key` = ? LIMIT 1',
      [NOTIFICATION_SETTING_KEYS.RESPONSIBILITIES]
    );
    this.cache = parseObject(rows[0]?.value);
    this.expiresAt = Date.now() + CACHE_TTL_MS;
    return this.cache;
  }

  async getForEvent(eventType) {
    const event = getEvent(eventType);
    return event?.responsibility_code ? (await this.getAll())[event.responsibility_code] || null : null;
  }

  async validateRuleRecipients(eventType, recipientType, recipientConfig, { active = true } = {}) {
    if (!active) return;
    const event = getEvent(eventType);
    if (!event?.responsibility_code) return;

    const responsibility = await this.getForEvent(eventType);
    if (!responsibility) {
      throw new Error(`事件 ${eventType} 尚未配置责任组，不能启用通知规则`);
    }
    const configuredIds = await NotificationRecipientService.resolveRecipients(
      responsibility.recipient_type,
      responsibility.recipient_config
    );
    const ruleIds = await NotificationRecipientService.resolveRecipients(recipientType, recipientConfig);
    const configured = new Set(configuredIds.map(Number));
    const outside = ruleIds.filter((id) => !configured.has(Number(id)));
    if (!ruleIds.length) throw new Error('启用规则前必须至少匹配一名启用用户');
    if (outside.length) {
      throw new Error(`规则收件范围超出事件责任组（${outside.length} 名用户），请按责任组配置收件人`);
    }
  }

  async update(code, data) {
    const recipientConfig = await NotificationRecipientService.validateConfig(
      data.recipient_type,
      data.recipient_config
    );
    const responsibilityRecipientIds = await NotificationRecipientService.resolveRecipients(
      data.recipient_type,
      recipientConfig
    );
    if (!responsibilityRecipientIds.length) {
      throw new Error('责任组必须至少包含一名启用用户');
    }

    const eventTypes = getEventsByResponsibility(code).map((event) => event.event_type);
    if (!eventTypes.length) throw new Error('无效的通知责任组');
    const [rules] = await pool.query(
      `SELECT id, name, recipient_type, recipient_config
         FROM notification_rules
        WHERE event_type IN (?) AND is_active = 1 AND deleted_at IS NULL`,
      [eventTypes]
    );
    const allowed = new Set(responsibilityRecipientIds.map(Number));
    for (const rule of rules) {
      let values = rule.recipient_config;
      if (typeof values === 'string') {
        try {
          values = JSON.parse(values);
        } catch {
          values = [];
        }
      }
      values = Array.isArray(values) ? values : [];
      const ruleRecipientIds = await NotificationRecipientService.resolveRecipients(rule.recipient_type, values);
      if (ruleRecipientIds.some((id) => !allowed.has(Number(id)))) {
        throw new Error(`责任范围不能排除启用规则“${rule.name}”的现有收件人，请先调整该规则`);
      }
    }
    const current = await this.getAll();
    const next = {
      ...current,
      [code]: {
        code,
        name: String(data.name || code).trim(),
        recipient_type: data.recipient_type,
        recipient_config: recipientConfig,
        description: String(data.description || '').trim(),
        updated_at: new Date().toISOString(),
      },
    };
    await pool.query(
      `INSERT INTO system_settings (\`key\`, value, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), description = VALUES(description)`,
      [NOTIFICATION_SETTING_KEYS.RESPONSIBILITIES, JSON.stringify(next), '通知事件责任组配置']
    );
    this.cache = next;
    this.expiresAt = Date.now() + CACHE_TTL_MS;
    return next[code];
  }

  clearCache() {
    this.cache = null;
    this.expiresAt = 0;
  }

  async getDetails() {
    const responsibilities = await this.getAll();
    const details = [];
    for (const [code, config] of Object.entries(responsibilities)) {
      const preview = await NotificationRecipientService.preview(
        config.recipient_type,
        config.recipient_config
      );
      details.push({
        ...config,
        code,
        event_types: getEventsByResponsibility(code).map((event) => event.event_type),
        preview,
      });
    }
    return details;
  }
}

module.exports = new NotificationResponsibilityService();
