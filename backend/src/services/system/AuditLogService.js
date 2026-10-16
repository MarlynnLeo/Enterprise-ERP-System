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
        // Database errors may include interpolated SQL; never copy them into evidence.
        error: { name: error?.name || 'Error', code: error?.code || null },
        persisted: false,
        transactional: params?.transactional === true,
        request_id: params?.request_id || params?.requestId || null,
        operator_id: params?.operator_id || null,
        action: params?.action || null,
        module: params?.module || null,
        method: params?.method || null,
        path: params?.path ? String(params.path).split('?')[0].slice(0, 255) : null,
        target_table: params?.target_table || params?.entity_type || null,
        target_id: params?.target_id || params?.entity_id || null,
        operator_name: params?.operator_name || null,
        old_payload: sanitizeAuditValue(params?.old_payload ?? params?.oldValue ?? null),
        new_payload: sanitizeAuditValue(params?.new_payload ?? params?.newValue ?? null),
        request_body: sanitizeAuditValue(params?.request_body ?? null),
        response_status: params?.response_status ?? null,
        response_body: sanitizeAuditValue(params?.response_body ?? null),
        field_diff: sanitizeAuditValue(params?.field_diff ?? null),
        ip_address: params?.ip_address || null,
        user_agent: params?.user_agent || null,
      })}\n`,
      'utf8'
    );
    return true;
  } catch (fallbackError) {
    logger.error('Audit fallback write failed:', fallbackError);
    return false;
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
        const oldPayload = sanitizeAuditValue(params.old_payload ?? params.oldValue ?? null);
        const newPayload = sanitizeAuditValue(params.new_payload ?? params.newValue ?? null);
        const diff =
          params.field_diff ||
          (oldPayload && newPayload ? this.diffObjects(oldPayload, newPayload) : null);
        const requestId = String(params.request_id || params.requestId || '').slice(0, 50) || null;
        const targetTable = String(params.target_table || params.entity_type || '').slice(0, 50) || null;
        const targetId = String(params.target_id ?? params.entity_id ?? '').slice(0, 500);
        const operatorId = Number(params.operator_id);
        const userId = Number.isSafeInteger(operatorId) && operatorId > 0 ? operatorId : null;
        const requestPath = params.path ? String(params.path).split('?')[0].slice(0, 255) : null;

        try {
          await conn.execute(
            `INSERT INTO audit_logs (
              request_id, user_id, username, module, action, method, path,
              entity_type, entity_id, target_table, target_id,
              old_value, new_value, field_diff, ip_address, user_agent,
              request_body, response_status, response_body, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, NOW())`,
            [
              requestId,
              userId,
              String(params.operator_name || 'System Auto').slice(0, 100),
              params.module || 'UNKNOWN',
              params.action || 'UNKNOWN',
              params.method || null,
              requestPath,
              targetTable,
              targetId,
              targetTable,
              targetId,
              serializeAuditPayload(oldPayload),
              serializeAuditPayload(newPayload),
              serializeAuditPayload(diff),
              params.ip_address || '',
              params.user_agent || '',
              serializeAuditPayload(params.request_body),
              params.response_status ?? null,
              serializeAuditPayload(params.response_body),
            ]
          );
        } catch (extendedInsertError) {
          if (connection || extendedInsertError.code !== 'ER_BAD_FIELD_ERROR') {
            throw extendedInsertError;
          }

          await conn.execute(
            `INSERT INTO audit_logs (
              user_id, username, module, action, entity_type, entity_id,
              old_value, new_value, ip_address, user_agent, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
              userId,
              params.operator_name || 'System Auto',
              params.module || 'UNKNOWN',
              params.action || 'UNKNOWN',
              targetTable,
              targetId,
              serializeAuditPayload(oldPayload),
              serializeAuditPayload({
                value: newPayload,
                _audit: {
                  request_id: requestId, method: params.method || null, path: requestPath,
                  request_body: params.request_body ?? null,
                  response_status: params.response_status ?? null,
                  response_body: params.response_body ?? null,
                  field_diff: diff,
                },
              }),
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
      const fallbackWritten = await writeAuditFailure({ ...params, transactional: !!connection }, err);
      // An event written with the business connection is part of that transaction.
      // A filesystem fallback cannot make a partially committed approval valid.
      if (connection || !fallbackWritten) throw err;
    }
  }
}

module.exports = AuditLogService;
module.exports.writeAuditFailure = writeAuditFailure;
