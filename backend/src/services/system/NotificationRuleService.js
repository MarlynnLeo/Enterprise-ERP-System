/**
 * NotificationRuleService.js
 * @description 通知规则服务 — 规则 CRUD + 事件匹配引擎 + 模板变量渲染。
 *              参照 WorkflowService 的「模板 → 实例」模式设计。
 * @date 2026-06-22
 */

const { pool } = require('../../config/db');
const { softDelete } = require('../../utils/softDelete');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');
const NotificationService = require('../NotificationService');
const NotificationRecipientService = require('../NotificationRecipientService');
const NotificationResponsibilityService = require('./NotificationResponsibilityService');
const { RECIPIENT_TYPES: RECIPIENT_TYPE_VALUES } = require('../../constants/notification');
const { getEvent, getEvents } = require('../../events/NotificationEventRegistry');

const RECIPIENT_TYPES = new Set(Object.values(RECIPIENT_TYPE_VALUES));
const SUPPORTED_EVENTS = getEvents();

class NotificationRuleService {
  // ==================== CRUD ====================

  /**
   * 获取规则列表（分页/筛选）
   */
  async getRules(params = {}) {
    const { keyword, event_type, is_active, page = 1, pageSize = 20 } = params;
    const pagination = parsePagination(page, pageSize, { defaultPageSize: 20, maxPageSize: 100 });

    const conditions = ['deleted_at IS NULL'];
    const values = [];

    if (keyword) {
      conditions.push('(name LIKE ? OR event_type LIKE ?)');
      values.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (event_type) {
      conditions.push('event_type = ?');
      values.push(event_type);
    }
    if (is_active !== undefined && is_active !== '') {
      conditions.push('is_active = ?');
      values.push(Number(is_active));
    }

    const whereClause = conditions.join(' AND ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM notification_rules WHERE ${whereClause}`,
      values
    );

    const listSql = appendPaginationSQL(
      `SELECT id, name, event_type, recipient_type, recipient_config,
              title_template, content_template, link_template,
              priority, is_active, created_by, created_at, updated_at
       FROM notification_rules
       WHERE ${whereClause}
       ORDER BY updated_at DESC`,
      pagination.limit,
      pagination.offset
    );
    const [rows] = await pool.query(listSql, values);

    // JSON 字段解析
    for (const row of rows) {
      row.recipient_config = this._parseJson(row.recipient_config);
    }

    return { list: rows, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  /**
   * 获取规则详情
   */
  async getRuleById(id) {
    const [[rule]] = await pool.query(
      `SELECT id, name, event_type, recipient_type, recipient_config,
              title_template, content_template, link_template,
              priority, is_active, created_by, created_at, updated_at
       FROM notification_rules
       WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (!rule) return null;

    rule.recipient_config = this._parseJson(rule.recipient_config);
    return rule;
  }

  /**
   * 创建规则
   */
  async createRule(data, userId) {
    const normalized = await this._validateRuleData(data);

    const [result] = await pool.query(
      `INSERT INTO notification_rules
       (name, event_type, recipient_type, recipient_config, title_template, content_template, link_template, priority, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalized.name,
        normalized.event_type,
        normalized.recipient_type,
        JSON.stringify(normalized.recipient_config),
        normalized.title_template,
        normalized.content_template,
        normalized.link_template || null,
        normalized.priority,
        normalized.is_active,
        userId,
      ]
    );

    // 清除缓存
    this._clearCache();
    return this.getRuleById(result.insertId);
  }

  /**
   * 更新规则
   */
  async updateRule(id, data) {
    const current = await this.getRuleById(id);
    if (!current) return null;
    const normalized = await this._validateRuleData(data, id);

    await pool.query(
      `UPDATE notification_rules SET
         name = ?, event_type = ?, recipient_type = ?, recipient_config = ?,
         title_template = ?, content_template = ?, link_template = ?,
         priority = ?, is_active = ?, updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [
        normalized.name,
        normalized.event_type,
        normalized.recipient_type,
        JSON.stringify(normalized.recipient_config),
        normalized.title_template,
        normalized.content_template,
        normalized.link_template || null,
        normalized.priority,
        normalized.is_active,
        id,
      ]
    );

    this._clearCache();
    return this.getRuleById(id);
  }

  /**
   * 删除规则（软删除）
   */
  async deleteRule(id) {
    this._clearCache();
    return softDelete(pool, 'notification_rules', 'id', id);
  }

  /**
   * 切换启用/禁用
   */
  async toggleActive(id, isActive) {
    const current = await this.getRuleById(id);
    if (!current) return null;
    if (isActive) {
      await this._validateRuleData({ ...current, is_active: 1 }, id);
    }
    await pool.query(
      'UPDATE notification_rules SET is_active = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [isActive ? 1 : 0, id]
    );
    this._clearCache();
    return this.getRuleById(id);
  }

  // ==================== 规则引擎 ====================

  /**
   * 获取某事件类型的所有启用规则（带内存缓存）
   * @param {string} eventType - 事件类型
   * @returns {Object[]} 匹配的规则列表
   */
  async getActiveRulesByEvent(eventType) {
    // 先查缓存
    if (this._cache && this._cacheExpiry > Date.now()) {
      return (this._cache.get(eventType) || []);
    }

    // 查询所有启用规则并按事件分组缓存
    const [allRules] = await pool.query(
      `SELECT id, name, event_type, recipient_type, recipient_config,
              title_template, content_template, link_template, priority
       FROM notification_rules
       WHERE is_active = 1 AND deleted_at IS NULL`
    );

    const grouped = new Map();
    for (const rule of allRules) {
      rule.recipient_config = this._parseJson(rule.recipient_config);
      const list = grouped.get(rule.event_type) || [];
      list.push(rule);
      grouped.set(rule.event_type, list);
    }

    this._cache = grouped;
    this._cacheExpiry = Date.now() + 60_000; // 缓存 60 秒

    return (grouped.get(eventType) || []);
  }

  /**
   * 根据规则配置解析接收人ID列表
   * @param {Object} rule - 通知规则
   * @returns {number[]} 用户ID列表
   */
  async resolveRecipients(rule) {
    const config = Array.isArray(rule.recipient_config)
      ? rule.recipient_config
      : this._parseJson(rule.recipient_config);

    if (!config || config.length === 0) return [];

    return NotificationRecipientService.resolveRecipients(rule.recipient_type, config);
  }

  async previewRecipients(data) {
    const recipientType = data.recipient_type || RECIPIENT_TYPE_VALUES.PERMISSION;
    const recipientConfig = await NotificationRecipientService.validateConfig(
      recipientType,
      data.recipient_config
    );
    return NotificationRecipientService.preview(recipientType, recipientConfig);
  }

  async getRecipientOptions() {
    return NotificationRecipientService.getOptions();
  }

  async sendTestNotification(id, userId) {
    const rule = await this.getRuleById(id);
    if (!rule) return null;

    const event = getEvent(rule.event_type);
    const samples = Object.fromEntries((event?.variables || []).map((variable) => [variable, `[${variable}]`]));
    const notification = {
      type: 'notification_test',
      title: `[测试] ${this.renderTemplate(rule.title_template, samples)}`,
      content: this.renderTemplate(rule.content_template, samples),
      link: this.renderTemplate(rule.link_template, samples) || null,
      priority: rule.priority,
      createdBy: userId,
    };
    const result = await NotificationService.notifyUsers([userId], notification, { dedupeByDay: false });
    return { rule, result };
  }

  /**
   * 渲染模板变量
   * 将 ${variable} 替换为 payload 中的实际值
   * @param {string} template - 模板字符串
   * @param {Object} variables - 变量映射
   * @returns {string} 渲染后的字符串
   */
  renderTemplate(template, variables) {
    if (!template) return '';

    // 从嵌套的 payload 中提取扁平化变量
    const flatVars = this._flattenPayload(variables);

    return template.replace(/\$\{(\w+)}/g, (match, key) => {
      const value = flatVars[key];
      if (value === undefined || value === null) return match; // 未匹配的变量保留原样
      return String(value);
    });
  }

  /**
   * 获取支持的事件类型列表（供前端下拉选择）
   */
  getSupportedEvents() {
    return SUPPORTED_EVENTS;
  }

  // ==================== 内部方法 ====================

  /**
   * 将嵌套的事件 payload 扁平化为变量映射
   * 例如 { outboundData: { outbound_no: 'SO001' } } → { outboundNo: 'SO001' }
   */
  _flattenPayload(payload) {
    if (!payload || typeof payload !== 'object') return {};

    const vars = { ...payload };

    // 常见嵌套结构提取
    if (payload.outboundData) {
      vars.outboundId = payload.outboundData.id;
      vars.outboundNo = payload.outboundData.outbound_no;
    }
    if (payload.salesOrder) {
      vars.customerName = payload.salesOrder.customer_name;
    }

    // snake_case → camelCase 映射（兼容数据库字段和模板变量）
    if (payload.receipt_no) vars.receiptNo = payload.receipt_no;
    if (payload.return_no) vars.returnNo = payload.return_no;
    if (payload.outbound_no) vars.outboundNo = payload.outbound_no;
    if (payload.task_code) vars.taskCode = payload.task_code;
    if (payload.supplier_name) vars.supplierName = payload.supplier_name;
    if (payload.customer_name) vars.customerName = payload.customer_name;
    if (payload.product_name) vars.productName = payload.product_name;

    return vars;
  }

  async _validateRuleData(data, ruleId = null) {
    if (!data.name || !String(data.name).trim()) {
      throw new Error('规则名称不能为空');
    }
    if (String(data.name).trim().length > 100) {
      throw new Error('规则名称不能超过 100 个字符');
    }
    if (!data.event_type || !String(data.event_type).trim()) {
      throw new Error('事件类型不能为空');
    }
    if (!data.title_template || !String(data.title_template).trim()) {
      throw new Error('标题模板不能为空');
    }
    if (String(data.title_template).length > 200) {
      throw new Error('标题模板不能超过 200 个字符');
    }
    if (!data.content_template || !String(data.content_template).trim()) {
      throw new Error('内容模板不能为空');
    }
    if (String(data.content_template).length > 2000) {
      throw new Error('内容模板不能超过 2000 个字符');
    }
    const event = getEvent(data.event_type);
    if (!event) {
      throw new Error('不支持的事件类型');
    }
    const recipientType = data.recipient_type || RECIPIENT_TYPE_VALUES.PERMISSION;
    if (!RECIPIENT_TYPES.has(recipientType)) {
      throw new Error('不支持的接收人类型');
    }
    const recipientConfig = await NotificationRecipientService.validateConfig(
      recipientType,
      data.recipient_config
    );
    const priority = Number(data.priority ?? 1);
    if (![0, 1, 2].includes(priority)) {
      throw new Error('通知优先级必须为 0、1 或 2');
    }

    const templates = [data.title_template, data.content_template, data.link_template || ''];
    const usedVariables = [...new Set(templates.flatMap((template) =>
      [...String(template).matchAll(/\$\{(\w+)}/g)].map((match) => match[1])
    ))];
    const invalidVariables = usedVariables.filter((variable) => !event.variables.includes(variable));
    if (invalidVariables.length) {
      throw new Error(`模板包含不可用变量: ${invalidVariables.join(', ')}`);
    }

    const link = String(data.link_template || '').trim();
    if (link && (!link.startsWith('/') || link.startsWith('//') || link.includes('\\'))) {
      throw new Error('跳转链接必须是以 / 开头的系统内部路由');
    }

    const isActive = Number(data.is_active ?? 1) ? 1 : 0;
    const [duplicateCandidates] = await pool.query(
      `SELECT id, recipient_config
         FROM notification_rules
        WHERE event_type = ?
          AND recipient_type = ?
          AND is_active = 1
          AND deleted_at IS NULL
          ${ruleId ? 'AND id <> ?' : ''}
        LIMIT 100`,
      [data.event_type, recipientType, ...(ruleId ? [ruleId] : [])]
    );
    const normalizedConfigJson = JSON.stringify(recipientConfig);
    const hasDuplicate = duplicateCandidates.some((candidate) => {
      const parsedConfig = this._parseJson(candidate.recipient_config);
      if (!Array.isArray(parsedConfig)) return false;
      const existingConfig = recipientType === 'permission'
        ? [...parsedConfig].map(String).sort()
        : [...parsedConfig].map(Number).sort((a, b) => a - b);
      return JSON.stringify(existingConfig) === normalizedConfigJson;
    });
    if (isActive && hasDuplicate) {
      throw new Error('已存在相同事件和接收范围的启用规则');
    }

    if (isActive) {
      const preview = await NotificationRecipientService.preview(recipientType, recipientConfig);
      if (!preview.count) {
        throw new Error('启用规则前必须至少匹配一名启用用户');
      }
      if (preview.exceedsBroadcastThreshold) {
        throw new Error(`接收范围达到启用用户的 ${Math.round(preview.ratio * 100)}%，请缩小范围后再启用`);
      }
    }

    await NotificationResponsibilityService.validateRuleRecipients(
      data.event_type,
      recipientType,
      recipientConfig,
      { active: isActive === 1 }
    );

    return {
      name: String(data.name).trim(),
      event_type: data.event_type,
      recipient_type: recipientType,
      recipient_config: recipientConfig,
      title_template: String(data.title_template).trim(),
      content_template: String(data.content_template).trim(),
      link_template: link,
      priority,
      is_active: isActive,
    };
  }

  _parseJson(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  _clearCache() {
    this._cache = null;
    this._cacheExpiry = 0;
  }
}

module.exports = new NotificationRuleService();
