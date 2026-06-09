/**
 * AuditLogService.js
 * @description 自动拦截器使用的审计日志写入服务
 * ✅ 重构: 统一写入 audit_logs 表，与 AuditService 使用同一张表
 * 消除 sys_audit_logs / audit_logs 双表冗余
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');

class AuditLogService {
  static diffObjects(oldValue = {}, newValue = {}) {
    const oldObj = oldValue && typeof oldValue === 'object' ? oldValue : {};
    const newObj = newValue && typeof newValue === 'object' ? newValue : {};
    const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
    const diff = {};

    for (const key of keys) {
      const beforeValue = oldObj[key];
      const afterValue = newObj[key];
      if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
        diff[key] = { old: beforeValue ?? null, new: afterValue ?? null };
      }
    }

    return diff;
  }

  /**
   * 记录审计日志（统一写入 audit_logs 表）
   * @param {Object} params
   * @param {string} params.operator_id - 操作员ID
   * @param {string} params.operator_name - 操作员名称
   * @param {string} params.action - 操作类型 (CREATE/UPDATE/DELETE)
   * @param {string} params.module - 模块名称
   * @param {string} params.target_table - 修改的底层表名
   * @param {string} params.target_id - 修改的主键ID
   * @param {Object} params.new_payload - 新修改的数据JSON
   * @param {string} params.ip_address - 操作IP
   * @param {string} params.user_agent - 终端浏览器信息
   * @param {string} params.remarks - 重要说明
   */
  static async log(params, connection = null) {
    try {
      const conn = connection || (await db.pool.getConnection());
      try {
        const oldPayload = params.old_payload || params.oldValue || null;
        const newPayload = params.new_payload || params.newValue || null;
        const diff = params.field_diff || (oldPayload && newPayload
          ? this.diffObjects(oldPayload, newPayload)
          : null);
        const requestId = params.request_id || params.requestId || null;
        const targetTable = params.target_table || params.entity_type || null;
        const targetId = String(params.target_id || params.entity_id || '').slice(0, 500);

        try {
          await conn.execute(
            `INSERT INTO audit_logs (
              request_id, user_id, username, module, action, method, path,
              entity_type, entity_id, target_table, target_id,
              old_value, new_value, field_diff, ip_address, user_agent, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, NOW())`,
            [
              requestId,
              params.operator_id || null,
              params.operator_name || 'System Auto',
              params.module || 'UNKNOWN',
              params.action || 'UNKNOWN',
              params.method || null,
              params.path || null,
              targetTable,
              targetId,
              targetTable,
              targetId,
              oldPayload ? JSON.stringify(oldPayload) : null,
              newPayload ? JSON.stringify(newPayload) : null,
              diff ? JSON.stringify(diff) : null,
              params.ip_address || '',
              params.user_agent || '',
            ]
          );
        } catch (extendedInsertError) {
          if (extendedInsertError.code !== 'ER_BAD_FIELD_ERROR') {
            throw extendedInsertError;
          }

          await conn.execute(
            `INSERT INTO audit_logs (
              user_id, username, module, action, entity_type, entity_id,
              new_value, ip_address, user_agent, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              params.operator_id || null,
              params.operator_name || 'System Auto',
              params.module || 'UNKNOWN',
              params.action || 'UNKNOWN',
              targetTable,
              targetId,
              newPayload ? JSON.stringify(newPayload) : null,
              params.ip_address || '',
              params.user_agent || '',
            ]
          );
        }
      } finally {
        if (!connection) conn.release();
      }
    } catch (err) {
      // 审计日志报错绝不能阻断业务流程！记录最底层日志告警。
      logger.error('💥 [审计日志埋点失败] AuditLogService.log 严重异常:', err);
    }
  }
}

module.exports = AuditLogService;
