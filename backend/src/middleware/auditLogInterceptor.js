const AuditLogService = require('../services/system/AuditLogService');
const { sanitizeAuditValue } = require('../utils/auditSanitizer');
const { logger } = require('../utils/logger');

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function maskSensitiveData(data) {
  return sanitizeAuditValue(data);
}

function getRequestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0] || '/';
}

function shouldAudit(req) {
  if (!AUDITED_METHODS.has(req.method)) return false;

  const requestPath = getRequestPath(req);
  return !requestPath.startsWith('/api/auth') && !requestPath.includes('/login');
}

function inferAction(method, requestPath = '') {
  const command = requestPath.split('/').filter(Boolean).at(-1)?.toLowerCase();
  const actions = {
    approve: 'APPROVE', 'batch-approve': 'APPROVE', reject: 'REJECT',
    reverse: 'REVERSE', submit: 'SUBMIT', resubmit: 'SUBMIT', cancel: 'CANCEL',
    post: 'POST', close: 'CLOSE', reopen: 'REOPEN',
  };
  if (actions[command]) return actions[command];
  if (method === 'POST') return 'CREATE';
  if (method === 'PUT' || method === 'PATCH') return 'UPDATE';
  if (method === 'DELETE') return 'DELETE';
  return 'UNKNOWN';
}

function inferModule(req) {
  const parts = getRequestPath(req).split('/').filter(Boolean);
  return parts[1] || parts[0] || 'UNKNOWN';
}

function inferTargetId(req) {
  const explicitTarget = resolvableAuditTarget(req);
  if (explicitTarget !== null) return explicitTarget;
  const paramPriority = [
    'id',
    'entryId',
    'periodId',
    'receiptId',
    'invoiceId',
    'transactionId',
    'salesOrderId',
    'purchaseOrderId',
    'taskId',
    'transaction_no',
    'receipt_no',
  ];
  for (const key of paramPriority) {
    if (req.params?.[key] !== undefined && req.params?.[key] !== null && req.params?.[key] !== '') {
      return req.params[key];
    }
  }
  const actionSegments = new Set([
    'approve',
    'batch-approve',
    'reject',
    'audit',
    'post',
    'reverse',
    'close',
    'reopen',
    'submit',
    'status',
    'retry',
    'resolve',
    'confirm',
    'cancel',
    'complete',
    'execute',
  ]);
  const parts = getRequestPath(req).split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  while (parts.length > 0 && actionSegments.has(String(parts.at(-1)).toLowerCase())) {
    parts.pop();
  }
  const candidate = parts.at(-1);
  if (
    candidate &&
    /\d/.test(candidate) &&
    !['api', inferModule(req)].includes(candidate.toLowerCase())
  ) {
    return candidate;
  }
  if (Array.isArray(req.body?.ids)) return req.body.ids.join(',');
  if (req.body?.id) return req.body.id;
  // Express's /api/* mount leaves a numeric wildcard parameter on denied requests.
  // It is a path, not an entity identifier.
  const remainingParam = Object.entries(req.params || {}).find(
    ([key, value]) => !/^\d+$/.test(key) && value !== undefined && value !== null && value !== ''
  );
  if (remainingParam) return remainingParam[1];
  return 'N/A';
}

function resolvableAuditTarget(req) {
  return resTarget(req.res?.locals?.auditTargetId) || resTarget(req.auditTargetId);
}

function resTarget(value) {
  return value !== undefined && value !== null && value !== '' ? value : null;
}

function inferTargetTable(req) {
  const path = getRequestPath(req).toLowerCase();
  const mappings = [
    ['/inventory-postings', 'inventory_posting_documents'],
    ['/finance/entries', 'gl_entries'],
    ['/finance/periods', 'gl_periods'],
    ['/manual-transactions', 'manual_transactions'],
    ['/purchase/receipts', 'purchase_receipts'],
    ['/sales/outbound', 'sales_outbound'],
    ['/inventory/inbound', 'inventory_inbound'],
    ['/inventory/outbound', 'inventory_outbound'],
    ['/cash-transactions', 'cash_transactions'],
    ['/bank-transactions', 'bank_transactions'],
  ];
  return mappings.find(([prefix]) => path.includes(prefix))?.[1] || inferModule(req);
}

function getOperator(req) {
  if (!req.user) {
    return { id: null, name: 'anonymous' };
  }

  return {
    id: req.user.id || req.user.userId || null,
    name:
      req.user.realName || req.user.name || req.user.real_name || req.user.username || 'UNKNOWN',
  };
}

function auditLogInterceptor(req, res, next) {
  if (!shouldAudit(req)) {
    return next();
  }

  let responseSummary = {};
  if (typeof res.json === 'function') {
    const originalJson = res.json;
    res.json = function auditResponse(body) {
      responseSummary = {
        success: body?.success,
        error_code: body?.errorCode || body?.error_code || null,
      };
      // Keep the per-document batch outcome, without copying complete response data.
      const result = body?.data;
      if (result && Array.isArray(result.results)) {
        responseSummary.results = result.results.map((item) => ({
          id: item.id, success: item.success, code: item.code || item.errorCode || null,
        }));
        responseSummary.success_count = result.successCount ?? result.success_count;
        responseSummary.failed_count = result.failedCount ?? result.failed_count ?? result.failureCount;
      }
      return originalJson.call(this, body);
    };
  }

  res.once('finish', () => {

    const moduleName = inferModule(req);
    const operator = getOperator(req);

    AuditLogService.log({
      request_id: req.requestId || req.id || req.headers?.['x-request-id'] || req.headers?.['x-correlation-id'] || null,
      operator_id: operator.id,
      operator_name: String(operator.name),
      action: inferAction(req.method, getRequestPath(req)),
      module: moduleName,
      target_table: inferTargetTable(req),
      target_id: String(inferTargetId(req)),
      // A submitted payload is not proof of the values actually committed.
      request_body: maskSensitiveData(req.body),
      response_status: res.statusCode,
      response_body: {
        ...responseSummary,
        outcome: res.statusCode >= 400 || responseSummary.success === false
          ? 'failed'
          : Number(responseSummary.failed_count) > 0
            ? Number(responseSummary.success_count) > 0 ? 'partial' : 'failed'
            : 'success',
      },
      method: req.method,
      path: getRequestPath(req),
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.headers?.['user-agent'],
    }).catch((error) => {
      logger.error('Request audit persistence failed', { code: error.code });
    });
  });

  return next();
}

module.exports = auditLogInterceptor;
module.exports.maskSensitiveData = maskSensitiveData;
module.exports.shouldAudit = shouldAudit;
module.exports.inferTargetId = inferTargetId;
module.exports.inferTargetTable = inferTargetTable;
module.exports.inferAction = inferAction;
