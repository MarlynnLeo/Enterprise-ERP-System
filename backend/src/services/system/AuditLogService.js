const fs = require('fs');
const path = require('path');
const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const { sanitizeAuditValue, serializeAuditPayload } = require('../../utils/auditSanitizer');

const AUDIT_FAILURE_LOG = path.resolve(
  process.env.AUDIT_FAILURE_LOG || path.join(process.cwd(), 'logs', 'audit-failures.ndjson')
);

async function writeAuditFailure(params, error) {
  try {
    await fs.promises.mkdir(path.dirname(AUDIT_FAILURE_LOG), { recursive: true });
    await fs.promises.appendFile(
      AUDIT_FAILURE_LOG,
      `${JSON.stringify({
        failed_at: new Date().toISOString(),
        error: error?.message || String(error),
        request_id: params?.request_id || params?.requestId || null,
        operator_id: params?.operator_id || null,
        action: params?.action || null,
        module: params?.module || null,
        method: params?.method || null,
        path: params?.path || null,
        target_table: params?.target_table || params?.entity_type || null,
        target_id: params?.target_id || params?.entity_id || null,
      })}\n`,
      'utf8'
    );
  } catch (fallbackError) {
    logger.error('Audit fallback write failed:', fallbackError);
  }
}

class AuditLogService {
  static diffObjects(oldValue = {}, newValue = {}) {
    const oldObj = sanitizeAuditValue(oldValue && typeof oldValue === 'object' ? oldValue : {});
    const newObj = sanitizeAuditValue(newValue && typeof newValue === 'object' ? newValue : {});
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

  static async log(params, connection = null) {
    try {
      const conn = connection || (await db.pool.getConnection());
      try {
        const oldPayload = sanitizeAuditValue(params.old_payload || params.oldValue || null);
        const newPayload = sanitizeAuditValue(params.new_payload || params.newValue || null);
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
               serializeAuditPayload(oldPayload),
               serializeAuditPayload(newPayload),
               serializeAuditPayload(diff),
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
               serializeAuditPayload(newPayload),
              params.ip_address || '',
              params.user_agent || '',
            ]
          );
        }
      } finally {
        if (!connection) conn.release();
      }
    } catch (err) {
      logger.error('AuditLogService.log failed:', err);
      await writeAuditFailure(params, err);
    }
  }
}

module.exports = AuditLogService;
module.exports.writeAuditFailure = writeAuditFailure;
