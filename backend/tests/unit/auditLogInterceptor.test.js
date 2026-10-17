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
      operator_id: 7,
      operator_name: 'operator',
      action: 'CREATE',
      module: 'inventory',
      method: 'POST',
      path: '/api/inventory/outbound',
      request_body: {
        id: 10,
        password: '***REDACTED***',
        nested: { accessToken: '***REDACTED***' },
      },
      response_status: 201,
      response_body: { outcome: 'success' },
    }));
    expect(AuditLogService.log.mock.calls[0][0].new_payload).toBeUndefined();
  });

  it('records failed mutations and skips read-only requests', () => {
    const failedRes = createRes(400);
    auditLogInterceptor(createReq(), failedRes, jest.fn());
    failedRes.emit('finish');

    const getRes = createRes(200);
    auditLogInterceptor(createReq({ method: 'GET' }), getRes, jest.fn());
    getRes.emit('finish');

    expect(AuditLogService.log).toHaveBeenCalledTimes(1);
    expect(AuditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      response_status: 400, response_body: { outcome: 'failed' },
    }));
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

  it.each(['approve', 'reject', 'reverse'])('records %s with the real document, actor and server request ID', (action) => {
    const req = createReq({
      originalUrl: `/api/finance/inventory-postings/72/${action}?token=do-not-store`,
      params: { 0: `finance/inventory-postings/72/${action}` },
      body: { id: 999, remark: 'review' },
      requestId: 'server-request',
    });
    const res = createRes(403);
    auditLogInterceptor(req, res, jest.fn());
    res.emit('finish');
    expect(AuditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: action.toUpperCase(), target_table: 'inventory_posting_documents', target_id: '72',
      request_id: 'server-request', response_status: 403,
      path: `/api/finance/inventory-postings/72/${action}`,
    }));
  });

  it('retains batch outcomes and DELETE attempts, without marking HTTP 200 partial results successful', () => {
    const req = createReq({
      originalUrl: '/api/finance/inventory-postings/batch-approve', body: { ids: [5, 6] },
    });
    const res = createRes(200);
    res.json = jest.fn().mockReturnThis();
    auditLogInterceptor(req, res, jest.fn());
    res.json({ success: true, data: { successCount: 1, failureCount: 1, results: [
      { id: 5, success: true, result: { privateData: 'not copied' } },
      { id: 6, success: false, code: 'SEPARATION_OF_DUTIES' },
    ] } });
    res.emit('finish');
    expect(AuditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'APPROVE', target_id: '5,6', request_body: { ids: [5, 6] },
      response_body: expect.objectContaining({ outcome: 'partial', failed_count: 1, results: [
        { id: 5, success: true, code: null }, { id: 6, success: false, code: 'SEPARATION_OF_DUTIES' },
      ] }),
    }));
    const deleteRes = createRes(403);
    auditLogInterceptor(createReq({ method: 'DELETE', user: null }), deleteRes, jest.fn());
    deleteRes.emit('finish');
    expect(AuditLogService.log).toHaveBeenLastCalledWith(expect.objectContaining({
      operator_id: null, operator_name: 'anonymous', request_body: expect.objectContaining({ id: 10 }),
    }));
  });

  it('does not throw from finish for malformed percent encoding', () => {
    const res = createRes(400);
    auditLogInterceptor(createReq({ originalUrl: '/api/inventory/inbound/%E0%A4%A/approve' }), res, jest.fn());
    expect(() => res.emit('finish')).not.toThrow();
  });

  it.each([
    [2, 0, 'success'],
    [1, 1, 'partial'],
    [0, 2, 'failed'],
  ])('classifies batch outcomes from committed results: %i succeeded, %i failed', (successCount, failureCount, outcome) => {
    const req = createReq({
      originalUrl: '/api/finance/inventory-postings/batch-approve',
      body: { ids: [5, 6] },
    });
    const res = createRes(200);
    res.json = jest.fn().mockReturnThis();
    auditLogInterceptor(req, res, jest.fn());
    res.json({ success: true, data: {
      totalCount: 2, successCount, failureCount,
      results: [5, 6].map((id, index) => ({ id, success: index < successCount,
        ...(index < successCount ? {} : { code: 'INVALID_STATUS' }) })),
    } });
    res.emit('finish');
    expect(AuditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      target_table: 'inventory_posting_documents', target_id: '5,6',
      response_body: expect.objectContaining({ outcome, success_count: successCount, failed_count: failureCount }),
    }));
  });

  it.each([200, 403])('does not let an unused body id replace batch targets for HTTP %i', status => {
    const req = createReq({
      originalUrl: '/api/finance/inventory-postings/batch-approve',
      body: { ids: [5, 6], id: 999 },
    });
    const res = createRes(status);
    auditLogInterceptor(req, res, jest.fn());
    res.emit('finish');
    expect(AuditLogService.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'APPROVE', target_id: '5,6', target_table: 'inventory_posting_documents',
      request_body: { ids: [5, 6], id: 999 }, response_status: status,
    }));
  });
});
