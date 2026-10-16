/* global afterEach, beforeEach, describe, expect, jest, test */

jest.mock('../../src/services/business/FinancialLedgerService', () => ({
  getLedger: jest.fn(),
  getOptions: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/PermissionService', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/services/DataScopeService', () => ({ attachRequestScope: jest.fn() }));
jest.mock('../../src/middleware/authEnhanced', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers['x-test-user']) return res.sendStatus(401);
    req.user = { id: 7, username: 'report-viewer' };
    next();
  },
}));
jest.mock('../../src/middleware/priceAccessControl', () => ({
  desensitizeSensitiveResponse: () => (_req, _res, next) => next(),
  requirePriceMutationPermission: () => (_req, _res, next) => next(),
}));
jest.mock('../../src/middleware/unifiedFileUpload', () => ({
  FileUploadMiddlewares: new Proxy({}, { get: () => (_req, _res, next) => next() }),
}));

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const service = require('../../src/services/business/FinancialLedgerService');
const PermissionService = require('../../src/services/PermissionService');
const BusinessError = require('../../src/utils/BusinessError');
const { logger } = require('../../src/utils/logger');
const controller = require('../../src/controllers/business/finance/financialLedgerController');
const routerFile = path.resolve(__dirname, '../../src/routes/financeRoutes.js');

// Load the real router, ledger controller, response serializer and permission
// middleware. Only unrelated handlers and external dependencies are replaced.
for (const [, modulePath] of fs.readFileSync(routerFile, 'utf8').matchAll(/require\('(\.\.\/controllers\/[^']+)'\)/g)) {
  if (modulePath.endsWith('/financialLedgerController')) continue;
  jest.doMock(path.resolve(path.dirname(routerFile), modulePath), () =>
    new Proxy({}, { get: () => (_req, res) => res.sendStatus(204) }));
}
const financeRouter = require(routerFile);
const app = express();
app.use('/finance', financeRouter);
const endpointCases = [
  ['getLedger', '/reports/ledgers/cash', '账簿查询成功'],
  ['getOptions', '/reports/ledger-options', '筛选选项查询成功'],
];
const get = url => request(app).get(`/finance${url}`).set('x-test-user', '7');
let originalEnvironment;

beforeEach(() => {
  originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  service.getLedger.mockReset();
  service.getOptions.mockReset();
  PermissionService.getUserPermissions.mockResolvedValue(['finance:reports:view']);
});
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
});

describe('financial ledger HTTP endpoints without a database', () => {
  test('registers both GET endpoints once with the actual ledger handlers', () => {
    for (const [routePath, handler] of [
      ['/reports/ledgers/:type', controller.getLedger],
      ['/reports/ledger-options', controller.getOptions],
    ]) {
      const matching = financeRouter.stack.filter(layer => layer.route?.path === routePath);
      expect(matching).toHaveLength(1);
      expect(matching[0].route.methods).toEqual({ get: true });
      expect(matching[0].route.stack.at(-1).handle).toBe(handler);
    }
  });

  test('serializes ledger rows, summary and pagination and forwards the exact query', async () => {
    const report = {
      type: 'cash', title: '库存现金日记账', rows: [{ rowType: 'opening', balance: 100 }],
      summary: { openingBalance: 100, totalDebit: 0, closingBalance: 100 },
      pagination: { page: 2, pageSize: 50, total: 60 }, warnings: [],
    };
    service.getLedger.mockResolvedValue(report);
    const response = await get('/reports/ledgers/cash').query({ startMonth: '2026-09', endMonth: '2026-09', page: '2' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: '账簿查询成功', data: report, timestamp: expect.any(String) });
    expect(service.getLedger).toHaveBeenCalledWith('cash', { startMonth: '2026-09', endMonth: '2026-09', page: '2' });
  });

  test('serializes filter options and forwards type and search text', async () => {
    const options = { accountOptions: [], supplierOptions: [{ id: 5, code: 'S005', name: '测试供应商' }], materialOptions: [] };
    service.getOptions.mockResolvedValue(options);
    const response = await get('/reports/ledger-options').query({ type: 'payable', keyword: '测试' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: '筛选选项查询成功', data: options, timestamp: expect.any(String) });
    expect(service.getOptions).toHaveBeenCalledWith({ type: 'payable', keyword: '测试' });
  });

  test.each(endpointCases)('%s requires authentication and the report-view permission before invoking the service', async (method, url) => {
    expect((await request(app).get(`/finance${url}`)).status).toBe(401);
    for (const permissions of [[], ['finance:accounts:view'], ['finance:cash:view']]) {
      PermissionService.getUserPermissions.mockResolvedValue(permissions);
      expect((await get(url)).status).toBe(403);
    }
    expect(service[method]).not.toHaveBeenCalled();
    PermissionService.getUserPermissions.mockResolvedValue(['finance:reports:view']);
    service[method].mockResolvedValue({ rows: [] });
    expect((await get(url)).status).toBe(200);
    expect(service[method]).toHaveBeenCalledTimes(1);
  });

  test.each(endpointCases)('%s preserves BusinessError validation messages and HTTP 400', async (method, url) => {
    service[method].mockRejectedValue(new BusinessError('请选择有效的会计期间', null, 'VALIDATION_ERROR', 400));
    const response = await get(url);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, message: '请选择有效的会计期间', errorCode: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test('preserves quantity ledger statusCode errors as HTTP 400', async () => {
    const error = Object.assign(new Error('数量金额明细账超过 10000 条，请缩小期间或选择具体物料'), { statusCode: 400 });
    service.getLedger.mockRejectedValue(error);
    const response = await get('/reports/ledgers/quantity');
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ success: false, message: error.message, errorCode: 'VALIDATION_ERROR' });
    expect(logger.error).not.toHaveBeenCalled();
  });

  test.each(endpointCases)('%s returns HTTP 500 without database details or stack traces in production', async (method, url) => {
    const error = Object.assign(new Error('SELECT * FROM secret_ledger failed: db-host-private'), {
      code: 'ER_BAD_FIELD_ERROR', details: { sql: 'SELECT private_account FROM secret_ledger' },
    });
    service[method].mockRejectedValue(error);
    const response = await get(url);
    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ success: false, errorCode: 'SERVER_ERROR', code: 'SERVER_ERROR' });
    expect(response.body).not.toHaveProperty('error');
    expect(response.body).not.toHaveProperty('details');
    expect(JSON.stringify(response.body)).not.toMatch(/secret_ledger|db-host-private|ER_BAD_FIELD_ERROR|SELECT|stack/);
    expect(logger.error).toHaveBeenCalledWith(expect.any(String), error);
  });
});
