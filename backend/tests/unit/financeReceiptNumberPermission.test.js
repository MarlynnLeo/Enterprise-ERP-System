jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/PermissionService', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/services/DataScopeService', () => ({ attachRequestScope: jest.fn() }));
jest.mock('../../src/middleware/authEnhanced', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 7 };
    next();
  },
}));
jest.mock('../../src/middleware/priceAccessControl', () => ({
  desensitizeSensitiveResponse: () => (req, res, next) => next(),
  requirePriceMutationPermission: () => (req, res, next) => next(),
}));
jest.mock('../../src/middleware/unifiedFileUpload', () => ({
  FileUploadMiddlewares: new Proxy({}, { get: () => (req, res, next) => next() }),
}));

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const PermissionService = require('../../src/services/PermissionService');
const routerFile = path.resolve(__dirname, '../../src/routes/financeRoutes.js');
// Keep the real route/middleware chain; only replace business handlers so
// permission tests cannot write invoices, receipts, uploads, or any database.
for (const [, controller] of fs
  .readFileSync(routerFile, 'utf8')
  .matchAll(/require\('(\.\.\/controllers\/[^']+)'\)/g)) {
  jest.doMock(
    path.resolve(path.dirname(routerFile), controller),
    () =>
      new Proxy(
        {},
        {
          get: () => (req, res) => res.json({ code: 200 }),
        }
      )
  );
}
const app = express();
const financeRouter = require(routerFile);
app.use('/finance', financeRouter);

const financeEndpoints = financeRouter.stack
  .filter((layer) => layer.route)
  .flatMap((layer) => Object.keys(layer.route.methods).map((method) => [method, layer.route.path]));

test.each(financeEndpoints)(
  'a user without financial permissions is denied %s %s',
  async (method, routePath) => {
    PermissionService.getUserPermissions.mockResolvedValue([]);
    const url = routePath.replace(/:[A-Za-z][A-Za-z0-9_]*/g, '1');
    expect((await request(app)[method](`/finance${url}`)).status).toBe(403);
  }
);

test('cash collection permission can generate the number required by the receipt form', async () => {
  PermissionService.getUserPermissions.mockResolvedValue(['finance:ar:receive']);
  expect((await request(app).get('/finance/ar/receipts/generate-number')).status).toBe(200);
});

test('invoice creation permission does not grant receipt number allocation', async () => {
  PermissionService.getUserPermissions.mockResolvedValue(['finance:ar:create']);
  expect((await request(app).get('/finance/ar/receipts/generate-number')).status).toBe(403);
});
