const request = require('supertest');
const { getApp, authRequest, clearCache } = require('../testHelper');

let app;

beforeAll(() => {
  app = getApp();
});

afterAll(() => {
  clearCache();
});

describe('finance core flow and permission smoke tests', () => {
  test('finance endpoints require authentication', async () => {
    const res = await request(app).get('/api/finance/entries');
    expect(res.status).toBe(401);
  });

  test('authenticated admin can load core finance workflow entry points', async () => {
    const api = await authRequest();
    const endpoints = [
      '/api/finance/accounts',
      '/api/finance/accounts/options',
      '/api/finance/periods',
      '/api/finance/entries',
      '/api/finance/gl/trial-balance',
      '/api/finance/ar/invoices',
      '/api/finance/ar/receipts',
      '/api/finance/ar/aging',
      '/api/finance/ap/invoices',
      '/api/finance/ap/payments',
      '/api/finance/ap/aging',
      '/api/finance/bank-accounts',
      '/api/finance/bank-transactions',
      '/api/finance/assets',
      '/api/finance/assets/stats',
      '/api/finance/settings',
      '/api/finance/budgets',
      '/api/finance/tax/invoices',
      '/api/finance/tax/returns',
      '/api/finance/cost-ledger',
      '/api/finance/cost/closing/status',
      '/api/finance/automation/scheduled-tasks/status',
    ];

    for (const endpoint of endpoints) {
      const res = await api.get(endpoint);
      expect([200, 204]).toContain(res.status);
    }
  });
});
