jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/services/PermissionService', () => ({ isAdmin: jest.fn(), getUserPermissions: jest.fn() }));
jest.mock('../../src/services/DataScopeService', () => ({ attachRequestScope: jest.fn() }));
jest.mock('../../src/middleware/authEnhanced', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 7, username: 'finance_user' };
    next();
  },
}));
jest.mock('../../src/controllers/business/finance/financeEnhancementController', () => new Proxy({}, {
  get(target, name) {
    if (!target[name]) target[name] = jest.fn((_req, res) => res.json({ success: true }));
    return target[name];
  },
}));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));

const express = require('express');
const request = require('supertest');
const { pool } = require('../../src/config/db');
const PermissionService = require('../../src/services/PermissionService');
const Controller = require('../../src/controllers/business/finance/financeEnhancementController');
const router = require('../../src/routes/financeEnhancement');

const app = express();
app.use(express.json());
app.use('/api/finance', router);

beforeEach(() => {
  pool.query.mockResolvedValue([[{ department_id: 2, department_name: '财务部' }]]);
  PermissionService.isAdmin.mockResolvedValue(false);
  PermissionService.getUserPermissions.mockResolvedValue([]);
});

test.each([
  [],
  ['inventory:inbound:view', 'inventory:outbound:approve'],
  ['finance'],
  ['finance:inventory'],
  ['finance:inventory:view'],
  ['finance:inventory:approve'],
])('batch route rejects insufficient permissions even in the finance department: %j', async (...permissions) => {
  PermissionService.getUserPermissions.mockResolvedValue(permissions);
  const response = await request(app).post('/api/finance/inventory-postings/batch-approve').send({ ids: [101] });
  expect(response.status).toBe(403);
  expect(Controller.batchApproveInventoryPostings).not.toHaveBeenCalled();
});

test.each([
  ['finance:inventory:view', 'finance:inventory:approve'],
  ['finance:inventory:*'],
  ['finance:*'],
])('batch route honors explicit finance grants outside the finance department: %j', async (...permissions) => {
  pool.query.mockResolvedValue([[{ department_id: 3, department_name: '采购部' }]]);
  PermissionService.getUserPermissions.mockResolvedValue(permissions);
  const response = await request(app).post('/api/finance/inventory-postings/batch-approve').send({ ids: [101] });
  expect(response.status).toBe(200);
  expect(Controller.batchApproveInventoryPostings).toHaveBeenCalledTimes(1);
});

test('batch route accepts verified super administrator grants', async () => {
  PermissionService.isAdmin.mockResolvedValue(true);
  PermissionService.getUserPermissions.mockResolvedValue(['*']);
  const response = await request(app).post('/api/finance/inventory-postings/batch-approve').send({ ids: [101] });
  expect(response.status).toBe(200);
  expect(Controller.batchApproveInventoryPostings).toHaveBeenCalledTimes(1);
  expect(PermissionService.isAdmin).toHaveBeenCalledWith(7);
  expect(PermissionService.getUserPermissions).toHaveBeenCalledWith(7);
});

test('client supplied permissions and administrator flags cannot authorize a batch', async () => {
  const response = await request(app).post('/api/finance/inventory-postings/batch-approve').send({
    ids: [101], isAdmin: true, user: { id: 1, isSuperAdmin: true }, permissions: ['*'],
  });
  expect(response.status).toBe(403);
  expect(Controller.batchApproveInventoryPostings).not.toHaveBeenCalled();
});

test('the existing single approval route keeps its own action permission contract', async () => {
  PermissionService.getUserPermissions.mockResolvedValue(['finance:inventory:approve']);
  const response = await request(app).post('/api/finance/inventory-postings/101/approve').send({});
  expect(response.status).toBe(200);
  expect(Controller.approveInventoryPosting).toHaveBeenCalledTimes(1);
  expect(Controller.batchApproveInventoryPostings).not.toHaveBeenCalled();
});
