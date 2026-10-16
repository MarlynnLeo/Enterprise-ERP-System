/* global beforeEach, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn() } }));
jest.mock('../../src/models/system', () => ({}));
jest.mock('../../src/services/AuditService', () => ({}));
jest.mock('../../src/services/PermissionChangeService', () => ({}));
jest.mock('../../src/services/cache/CacheManager', () => ({ clear: jest.fn() }));
jest.mock('../../src/services/business/DLQService', () => ({}));
jest.mock('../../src/services/system/BackupService', () => ({}));
jest.mock('../../src/services/system/AccountLockService', () => ({}));
jest.mock('../../src/services/PermissionService', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/services/RoleAccessService', () => ({}));
jest.mock('../../src/services/DataScopeService', () => ({ attachRequestScope: jest.fn() }));
jest.mock('../../src/middleware/authEnhanced', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 7 };
    next();
  },
}));

const express = require('express');
const request = require('supertest');
const { pool } = require('../../src/config/db');
const { getUsersList } = require('../../src/controllers/system/systemController');
const PermissionService = require('../../src/services/PermissionService');
const systemRouter = require('../../src/routes/system');
const { detectSQLInjection, validateAndSanitizeInput } = require('../../src/middleware/inputValidation');
const { pathTraversalDetection, xssDetection } = require('../../src/middleware/securityEnhanced');

const app = express();
app.get('/users/list', getUsersList);
const routedApp = express();
routedApp.use(pathTraversalDetection, detectSQLInjection, xssDetection, validateAndSanitizeInput);
routedApp.use('/api/system', systemRouter);

const warehouseRoles = [
  'inventory_manager',
  'inventory_operator',
  'finished_goods_operator',
  'component_warehouse_operator',
];

beforeEach(() => {
  pool.query.mockReset();
  pool.query.mockResolvedValue([[]]);
  PermissionService.getUserPermissions.mockResolvedValue(['lookup:read']);
});

test('unfiltered consumers keep the existing simple user list and response fields', async () => {
  pool.query.mockResolvedValueOnce([[{
    id: 7,
    username: 'general_staff',
    real_name: '普通员工',
    department_id: 4,
    department_name: '生产部',
  }]]);

  const response = await request(app).get('/users/list');

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual([{
    id: 7,
    username: 'general_staff',
    realName: '普通员工',
    departmentId: 4,
    departmentName: '生产部',
  }]);
  const [sql, params] = pool.query.mock.calls[0];
  expect(params).toEqual([]);
  expect(sql).not.toMatch(/u\.status\s*=|EXISTS/i);
  expect(sql).toContain('ORDER BY u.created_at DESC LIMIT 1000');
});

test('department, enabled status and every warehouse role are combined with bound parameters', async () => {
  const response = await request(app).get('/users/list').query({
    departmentId: 9,
    status: 'enabled',
    roleCodes: ` ${warehouseRoles.join(', ')} , inventory_manager `,
  });

  expect(response.status).toBe(200);
  expect(pool.query).toHaveBeenCalledTimes(1);
  const [sql, params] = pool.query.mock.calls[0];
  expect(params).toEqual([9, 1, ...warehouseRoles]);
  expect(sql).toContain('u.department_id = ?');
  expect(sql).toContain('u.status = ?');
  expect(sql).toMatch(/EXISTS\s*\(\s*SELECT 1 FROM user_roles ur\s+JOIN roles r ON r.id = ur.role_id/);
  expect(sql).toContain('ur.user_id = u.id AND r.status = 1 AND r.code IN (?,?,?,?)');
  for (const role of warehouseRoles) expect(sql).not.toContain(role);
});

test('the real system route and global input middleware preserve the warehouse role filter', async () => {
  const response = await request(routedApp).get('/api/system/users/list').query({
    status: 1,
    roleCodes: warehouseRoles.join(','),
  });

  expect(response.status).toBe(200);
  expect(PermissionService.getUserPermissions).toHaveBeenCalledWith(7);
  expect(pool.query).toHaveBeenCalledTimes(1);
  expect(pool.query.mock.calls[0][1]).toEqual([1, ...warehouseRoles]);
  expect(pool.query.mock.calls[0][0]).toContain('r.code IN (?,?,?,?)');
});

test('a role with no matching users returns an empty list without retrying an unfiltered query', async () => {
  const response = await request(app).get('/users/list').query({
    status: 1,
    roleCodes: 'unassigned_warehouse_role',
  });

  expect(response.status).toBe(200);
  expect(response.body.data).toEqual([]);
  expect(pool.query).toHaveBeenCalledTimes(1);
  expect(pool.query.mock.calls[0][1]).toEqual([1, 'unassigned_warehouse_role']);
});

test('an explicit disabled filter is preserved', async () => {
  const response = await request(app).get('/users/list').query({ status: 0 });

  expect(response.status).toBe(200);
  expect(pool.query.mock.calls[0][1]).toEqual([0]);
  expect(pool.query.mock.calls[0][0]).toContain('u.status = ?');
});

test.each([
  { roleCodes: '' },
  { roleCodes: ' , ' },
  { roleCodes: 'inventory_manager,invalid-role' },
  { roleCodes: "inventory_manager') OR 1=1 --" },
  { roleCodes: 'a'.repeat(51) },
  { roleCodes: ['inventory_manager', 'inventory_operator'] },
  { status: 'unexpected' },
])('invalid user filters fail before querying instead of returning everyone: %j', async (query) => {
  const response = await request(app).get('/users/list').query(query);

  expect(response.status).toBe(400);
  expect(response.body.errorCode).toBe('VALIDATION_ERROR');
  expect(pool.query).not.toHaveBeenCalled();
});

test('database failures retain a server error response', async () => {
  pool.query.mockRejectedValueOnce(new Error('database unavailable'));

  const response = await request(app).get('/users/list').query({
    status: 1,
    roleCodes: warehouseRoles.join(','),
  });

  expect(response.status).toBe(500);
  expect(response.body.errorCode).toBe('SERVER_ERROR');
  expect(response.body.success).toBe(false);
});
