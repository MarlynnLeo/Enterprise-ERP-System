const { authRequest, clearCache } = require('../testHelper');
const db = require('../../src/config/db');

describe('business type dictionary consumer closure', () => {
  let api;
  let rule;

  beforeAll(async () => {
    api = await authRequest();
    [[rule]] = await db.pool.query(
      `SELECT bt.id, bt.code, bt.name,
              DATE_FORMAT(MIN(COALESCE(il.transaction_date, DATE(il.created_at))), '%Y-%m-%d') start_date,
              DATE_FORMAT(MAX(COALESCE(il.transaction_date, DATE(il.created_at))), '%Y-%m-%d') end_date
       FROM inventory_ledger il
       JOIN business_types bt ON BINARY bt.code = BINARY il.transaction_type
       WHERE bt.group_code = 'inventory_transaction' AND bt.status = 1
       GROUP BY bt.id, bt.code, bt.name
       ORDER BY bt.id
       LIMIT 1`
    );
    expect(rule).toBeTruthy();
  });

  afterAll(() => {
    clearCache();
  });

  test('management rule changes flow into the consumer dictionary and inventory chart', async () => {
    const testName = `规则联动验证-${Date.now()}`;
    try {
      await api.put(`/api/system/business-types/${rule.id}`).send({ name: testName }).expect(200);

      const dictionaryResponse = await api.get('/api/system/business-types/dictionary').expect(200);
      const dictionary = dictionaryResponse.body.data || [];
      expect(dictionary.find((item) => item.code === rule.code)?.name).toBe(testName);

      const statsResponse = await api
        .get(
          `/api/inventory/transactions/stats?startDate=${rule.start_date}&endDate=${rule.end_date}`
        )
        .expect(200);
      const distribution = statsResponse.body.data?.typeDistribution || [];
      expect(distribution.some((item) => item.name === testName)).toBe(true);
    } finally {
      await api.put(`/api/system/business-types/${rule.id}`).send({ name: rule.name }).expect(200);
    }
  });
});
