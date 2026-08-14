const AuditLogService = require('../services/system/AuditLogService');

const AUDITED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_FIELDS = [
  'password',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
];

function maskSensitiveData(data) {
  if (!data || typeof data !== 'object') return data;

  const masked = Array.isArray(data) ? [...data] : { ...data };
  for (const key of Object.keys(masked)) {
    const normalizedKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((field) => normalizedKey.includes(field.toLowerCase()))) {
      masked[key] = '***REDACTED***';
    } else if (masked[key] && typeof masked[key] === 'object') {
      masked[key] = maskSensitiveData(masked[key]);
    }
  }
  return masked;
}

function getRequestPath(req) {
  return String(req.originalUrl || req.url || '').split('?')[0] || '/';
}

function shouldAudit(req) {
  if (!AUDITED_METHODS.has(req.method)) return false;

  const requestPath = getRequestPath(req);
  return !requestPath.startsWith('/api/auth') && !requestPath.includes('/login');
}

function inferAction(method) {
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
  const paramPriority = [
    'id', 'entryId', 'periodId', 'receiptId', 'invoiceId', 'transactionId',
    'salesOrderId', 'purchaseOrderId', 'taskId', 'transaction_no', 'receipt_no',
  ];
  for (const key of paramPriority) {
    if (req.params?.[key] !== undefined && req.params?.[key] !== null && req.params?.[key] !== '') {
      return req.params[key];
    }
  }
  const remainingParam = Object.values(req.params || {}).find(
    (value) => value !== undefined && value !== null && value !== ''
  );
  if (remainingParam !== undefined) return remainingParam;
  if (resolvableAuditTarget(req)) return resolvableAuditTarget(req);
  if (req.body?.id) return req.body.id;
  if (Array.isArray(req.body?.ids)) return req.body.ids.join(',');

  const actionSegments = new Set([
    'approve', 'reject', 'audit', 'post', 'reverse', 'close', 'reopen', 'submit',
    'status', 'retry', 'resolve', 'confirm', 'cancel', 'complete', 'execute',
  ]);
  const parts = getRequestPath(req).split('/').filter(Boolean).map(decodeURIComponent);
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
    return { id: 'SYS', name: 'System' };
  }

  return {
    id: req.user.id || req.user.userId || 'UNKNOWN',
    name: req.user.realName || req.user.name || req.user.real_name || req.user.username || 'UNKNOWN',
  };
}

function auditLogInterceptor(req, res, next) {
  if (!shouldAudit(req)) {
    return next();
  }

  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const moduleName = inferModule(req);
    const operator = getOperator(req);

    AuditLogService.log({
      request_id: req.headers['x-request-id'] || req.headers['x-correlation-id'] || req.id || null,
      operator_id: String(operator.id),
      operator_name: String(operator.name),
      action: inferAction(req.method),
      module: moduleName,
      target_table: inferTargetTable(req),
      target_id: String(inferTargetId(req)),
      new_payload: req.method !== 'DELETE' ? maskSensitiveData(req.body) : null,
      method: req.method,
      path: req.originalUrl,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.headers['user-agent'],
      remarks: `Triggered by ${req.method} ${req.originalUrl}`,
    }).catch(() => {
      // AuditLogService owns durable fallback logging; keep the response path non-blocking.
    });
  });

  return next();
}

module.exports = auditLogInterceptor;
module.exports.maskSensitiveData = maskSensitiveData;
module.exports.shouldAudit = shouldAudit;
module.exports.inferTargetId = inferTargetId;
module.exports.inferTargetTable = inferTargetTable;
