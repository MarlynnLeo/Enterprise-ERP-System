/**
 * NotificationRuleService.js
 * @description 通知规则服务 — 规则 CRUD + 事件匹配引擎 + 模板变量渲染。
 *              参照 WorkflowService 的「模板 → 实例」模式设计。
 * @date 2026-06-22
 */

const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const { softDelete } = require('../../utils/softDelete');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');
const NotificationService = require('../NotificationService');

/**
 * 系统支持的事件类型及其可用变量
 * 用于前端下拉列表和模板编辑器的变量提示
 */
const SUPPORTED_EVENTS = [
  {
    event_type: 'PRODUCTION_TASK_COMPLETED',
    label: '生产任务完工',
    variables: ['taskId', 'taskCode', 'productName', 'isFullComplete'],
    category: '生产管理',
  },
  {
    event_type: 'PURCHASE_RECEIPT_COMPLETED',
    label: '采购收货入库',
    variables: ['receiptId', 'receiptNo', 'supplierName'],
    category: '采购管理',
  },
  {
    event_type: 'SALES_OUTBOUND_COMPLETED',
    label: '销售出库完成',
    variables: ['outboundId', 'outboundNo', 'customerName'],
    category: '销售管理',
  },
  {
    event_type: 'SALES_RETURN_COMPLETED',
    label: '销售退货完成',
    variables: ['returnId', 'returnNo', 'customerName'],
    category: '销售管理',
  },
  {
    event_type: 'PURCHASE_RETURN_COMPLETED',
    label: '采购退货完成',
    variables: ['returnId', 'returnNo', 'supplierName'],
    category: '采购管理',
  },
  {
    event_type: 'ANOMALY_REPORTED',
    label: '装配异常上报',
    variables: ['anomalyId', 'code', 'title', 'category', 'severity', 'reporterName', 'location'],
    category: '生产管理',
  },
];

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
    this._validateRuleData(data);

    const [result] = await pool.query(
      `INSERT INTO notification_rules
       (name, event_type, recipient_type, recipient_config, title_template, content_template, link_template, priority, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.event_type,
        data.recipient_type || 'permission',
        JSON.stringify(data.recipient_config),
        data.title_template,
        data.content_template,
        data.link_template || null,
        data.priority ?? 1,
        data.is_active ?? 1,
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
    this._validateRuleData(data);

    await pool.query(
      `UPDATE notification_rules SET
         name = ?, event_type = ?, recipient_type = ?, recipient_config = ?,
         title_template = ?, content_template = ?, link_template = ?,
         priority = ?, is_active = ?, updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [
        data.name,
        data.event_type,
        data.recipient_type || 'permission',
        JSON.stringify(data.recipient_config),
        data.title_template,
        data.content_template,
        data.link_template || null,
        data.priority ?? 1,
        data.is_active ?? 1,
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

    switch (rule.recipient_type) {
      case 'permission':
        return NotificationService.getUserIdsByPermissions(config, { includeAdmins: true });

      case 'role': {
        const roleIds = config.map(Number).filter(Boolean);
        if (roleIds.length === 0) return [];
        const [users] = await pool.query(
          `SELECT DISTINCT ur.user_id
           FROM user_roles ur
           JOIN users u ON u.id = ur.user_id AND u.status = 1
           WHERE ur.role_id IN (?)`,
          [roleIds]
        );
        return users.map((u) => u.user_id);
      }

      case 'department': {
        const deptIds = config.map(Number).filter(Boolean);
        if (deptIds.length === 0) return [];
        const [users] = await pool.query(
          'SELECT id FROM users WHERE department_id IN (?) AND status = 1',
          [deptIds]
        );
        return users.map((u) => u.id);
      }

      case 'user': {
        return config.map(Number).filter(Boolean);
      }

      default:
        logger.warn(`[NotificationRuleService] 未知接收人类型: ${rule.recipient_type}`);
        return [];
    }
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

  _validateRuleData(data) {
    if (!data.name || !String(data.name).trim()) {
      throw new Error('规则名称不能为空');
    }
    if (!data.event_type || !String(data.event_type).trim()) {
      throw new Error('事件类型不能为空');
    }
    if (!data.title_template || !String(data.title_template).trim()) {
      throw new Error('标题模板不能为空');
    }
    if (!data.content_template || !String(data.content_template).trim()) {
      throw new Error('内容模板不能为空');
    }
    if (!data.recipient_config || !Array.isArray(data.recipient_config) || data.recipient_config.length === 0) {
      throw new Error('接收人配置不能为空');
    }
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
