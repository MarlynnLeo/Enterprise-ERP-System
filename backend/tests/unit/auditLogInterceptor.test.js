const EventEmitter = require('events');

jest.mock('../../src/services/system/AuditLogService', () => ({
  log: jest.fn().mockResolvedValue(undefined),
}));

const AuditLogService = require('../../src/services/system/AuditLogService');
const auditLogInterceptor = require('../../src/middleware/auditLogInterceptor');

function createReq(overrides = {}) {
  return {
    method: 'POST',
    originalUrl: '/api/inventory/outbound',
    headers: { 'user-agent': 'jest', 'x-request-id': 'req-1' },
    body: { id: 10, password: 'secret', nested: { accessToken: 'token' } },
    params: {},
    ip: '127.0.0.1',
    user: { id: 7, username: 'operator' },
    ...overrides,
  };
}

function createRes(statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  return res;
}

describe('auditLogInterceptor', () => {
  it('logs successful mutating requests after response finish with masked payload', () => {
    const req = createReq();
    const res = createRes(201);
    const next = jest.fn();

    auditLogInterceptor(req, res, next);
    res.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(AuditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      request_id: 'req-1',
      operator_id: '7',
      operator_name: 'operator',
      action: 'CREATE',
      module: 'inventory',
      method: 'POST',
      path: '/api/inventory/outbound',
      new_payload: {
        id: 10,
        password: '***REDACTED***',
        nested: { accessToken: '***REDACTED***' },
      },
    }));
  });

  it('does not log failed responses or read-only requests', () => {
    const failedRes = createRes(400);
    auditLogInterceptor(createReq(), failedRes, jest.fn());
    failedRes.emit('finish');

    const getRes = createRes(200);
    auditLogInterceptor(createReq({ method: 'GET' }), getRes, jest.fn());
    getRes.emit('finish');

    expect(AuditLogService.log).not.toHaveBeenCalled();
  });

  it('captures non-id route parameters and IDs before action suffixes', () => {
    expect(auditLogInterceptor.inferTargetId(createReq({
      originalUrl: '/api/inventory/manual-transactions/TZ20260713001',
      params: { transaction_no: 'TZ20260713001' },
      body: {},
    }))).toBe('TZ20260713001');

    expect(auditLogInterceptor.inferTargetId(createReq({
      originalUrl: '/api/finance/entries/551/post',
      params: {},
      body: {},
    }))).toBe('551');
    expect(auditLogInterceptor.inferTargetTable(createReq({
      originalUrl: '/api/finance/entries/551/post',
    }))).toBe('gl_entries');
  });
});
