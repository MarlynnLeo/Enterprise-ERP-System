jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/middleware/authEnhanced', () => ({ authenticateToken: (req, res, next) => { req.user = { id: 7, username: 'inspector' }; next(); } }));
jest.mock('../../src/services/PermissionService', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/services/DataScopeService', () => ({ attachRequestScope: jest.fn() }));
jest.mock('../../src/middleware/priceAccessControl', () => ({ desensitizeSensitiveResponse: () => (req, res, next) => next(), requirePriceMutationPermission: () => (req, res, next) => next() }));
jest.mock('../../src/middleware/unifiedFileUpload', () => ({ FileUploadMiddlewares: { docxTemplate: (req, res, next) => next() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/controllers/business/quality/inspectionController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
jest.mock('../../src/controllers/business/quality/qualityStandardController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
jest.mock('../../src/controllers/business/quality/firstArticleController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
jest.mock('../../src/controllers/business/quality/processInspectionController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
jest.mock('../../src/controllers/business/quality/qualityStatisticsController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
jest.mock('../../src/controllers/business/quality/InspectionTemplateController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
jest.mock('../../src/controllers/business/quality/aqlController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
jest.mock('../../src/controllers/business/quality/nonconformingProductController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
jest.mock('../../src/controllers/business/quality/inspectionSourceController', () => new Proxy({}, { get: () => (req, res) => res.json({ success: true }) }));
const express = require('express');
const request = require('supertest');
const PermissionService = require('../../src/services/PermissionService');
const router = require('../../src/routes/qualityRoutes');
const app = express();
app.use(express.json());
app.use('/quality', router);
beforeEach(() => PermissionService.getUserPermissions.mockResolvedValue(['quality:final:view']));
test.each(['/quality/aql-standards', '/quality/aql-levels', '/quality/templates', '/quality/templates/2', '/quality/inspection-sources/production?inspectionType=final'])(
  'final inspector can read necessary lookup %s without role reseeding', async path => {
    expect((await request(app).get(path)).status).toBe(200);
  });
test.each(['/quality/aql-standards', '/quality/templates'])(
  'lookup access does not authorize creation of %s', async path => {
    expect((await request(app).post(path).send({})).status).toBe(403);
  });
test('final inspector cannot use process-only production source lookup', async () => {
  expect((await request(app).get('/quality/inspection-sources/production?inspectionType=process')).status).toBe(403);
});
test('process inspector receives process lookup without production permissions', async () => {
  PermissionService.getUserPermissions.mockResolvedValue(['quality:process:view']);
  expect((await request(app).get('/quality/inspection-sources/production?inspectionType=process')).status).toBe(200);
});
