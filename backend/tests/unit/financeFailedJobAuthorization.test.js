/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/PermissionService', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/services/DataScopeService', () => ({ attachRequestScope: jest.fn() }));
jest.mock('../../src/services/business/InventoryPostingEventClosureService', () => ({
  closeReversedPosting: jest.fn().mockResolvedValue(false),
}));
jest.mock('../../src/middleware/authEnhanced', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 7, username: 'finance-user' };
    next();
  },
}));
jest.mock('../../src/middleware/inventoryApprovalAccess', () => ({
  requireInventoryApprovalAccess: () => (req, res, next) => next(),
}));
jest.mock('../../src/middleware/priceAccessControl', () => ({
  desensitizeSensitiveResponse: () => (req, res, next) => next(),
  requirePriceMutationPermission: () => (req, res, next) => next(),
}));
jest.mock(
  '../../src/controllers/business/finance/financeEnhancementController',
  () => new Proxy({}, { get: () => jest.fn() })
);
jest.mock(
  '../../src/controllers/business/finance/costController',
  () => new Proxy({}, { get: () => jest.fn() })
);
jest.mock(
  '../../src/controllers/business/finance/overheadAllocationController',
  () => new Proxy({}, { get: () => jest.fn() })
);
jest.mock(
  '../../src/controllers/business/finance/standardCostVersionController',
  () => new Proxy({}, { get: () => jest.fn() })
);

const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const request = require('supertest');
const { pool } = require('../../src/config/db');
const PermissionService = require('../../src/services/PermissionService');
const DLQ = require('../../src/services/business/DLQService');
const app = express();
app.use(express.json());
app.use('/finance', require('../../src/routes/financeEnhancement'));
let database;

beforeEach(() => {
  jest.clearAllMocks();
  PermissionService.getUserPermissions.mockResolvedValue(['finance:automation:execute']);
  database = new DatabaseSync(':memory:');
  database.function('CONCAT', (...args) => args.join(''));
  database.function('JSON_UNQUOTE', (value) => (value == null ? null : String(value)));
  database.exec(`CREATE TABLE sys_failed_jobs (id INTEGER PRIMARY KEY, task_name TEXT, status TEXT, resolved_at TEXT, error_message TEXT, payload TEXT);
    CREATE TABLE domain_events (id INTEGER PRIMARY KEY, event_name TEXT, status TEXT, payload TEXT);
    INSERT INTO sys_failed_jobs VALUES (1, 'Finance:CreateVoucher', 'pending', NULL, '', '{}'),
      (2, 'AuditLog:RoleChanged', 'pending', NULL, '', '{}'),
      (3, 'FinanceIntegration:CreateInvoice', 'pending', NULL, '', '{}'),
      (4, 'EventBus:INVENTORY_POSTING_APPROVED', 'pending', NULL, '', '{"args":[{"postingDocumentId":4,"__domainEvent":{"id":4}}]}');
    INSERT INTO domain_events VALUES (4, 'INVENTORY_POSTING_APPROVED', 'processed', '{"postingDocumentId":4}');`);
  pool.query.mockImplementation(async (sql, params = []) => {
    const statement = database.prepare(sql.replace(/NOW\(\)/g, "datetime('now')"));
    if (/^\s*SELECT/i.test(sql)) return [statement.all(...params)];
    const result = statement.run(...params);
    return [{ affectedRows: Number(result.changes) }];
  });
});
afterEach(() => database.close());

test.each([1, 3, 4])('finance executor can resolve a finance-scoped job %s', async (id) => {
  const response = await request(app).put(`/finance/automation/failed-jobs/${id}/resolve`);
  expect(response.status).toBe(200);
  expect(database.prepare('SELECT status FROM sys_failed_jobs WHERE id = ?').get(id).status).toBe(
    'resolved'
  );
});

test('knowing a non-finance job id does not permit resolving it', async () => {
  const response = await request(app).put('/finance/automation/failed-jobs/2/resolve');
  expect(response.status).toBe(404);
  expect(database.prepare('SELECT status FROM sys_failed_jobs WHERE id = 2').get().status).toBe(
    'pending'
  );
});

test('the mutation retains its namespace guard after the preceding scoped read', async () => {
  const execute = pool.query.getMockImplementation();
  pool.query.mockImplementationOnce(async (sql, params) => {
    const selected = await execute(sql, params);
    database.exec("UPDATE sys_failed_jobs SET task_name = 'AuditLog:RoleChanged' WHERE id = 1");
    return selected;
  });
  expect((await request(app).put('/finance/automation/failed-jobs/1/resolve')).status).toBe(404);
  expect(database.prepare('SELECT status FROM sys_failed_jobs WHERE id = 1').get().status).toBe(
    'pending'
  );
});

test('a financial permission cannot suppress an unfinished linked domain event', async () => {
  database.exec("UPDATE domain_events SET status = 'pending' WHERE id = 4");
  const response = await request(app).put('/finance/automation/failed-jobs/4/resolve');
  expect(response.status).toBe(409);
  expect(database.prepare('SELECT status FROM sys_failed_jobs WHERE id = 4').get().status).toBe(
    'pending'
  );
});

test('view-only finance permission cannot resolve any job', async () => {
  PermissionService.getUserPermissions.mockResolvedValue(['finance:automation:view']);
  expect((await request(app).put('/finance/automation/failed-jobs/1/resolve')).status).toBe(403);
  expect(pool.query).not.toHaveBeenCalled();
});

test('system administrator workflow may still resolve jobs without a finance scope', async () => {
  expect(await DLQ.markResolved(2, 'admin')).toBe(true);
  expect(database.prepare('SELECT status FROM sys_failed_jobs WHERE id = 2').get().status).toBe(
    'resolved'
  );
});
