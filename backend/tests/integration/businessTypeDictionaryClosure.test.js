const { authRequest, clearCache } = require('../testHelper');
const db = require('../../src/config/db');

describe('business type dictionary consumer closure', () => {
  let api;
  let rule;
  let connection;
  const poolSpies = [];

  beforeAll(async () => {
    api = await authRequest();
    [[rule]] = await db.pool.query(
      `SELECT bt.id, bt.code, bt.name, DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS start_date, DATE_FORMAT(CURRENT_DATE, '%Y-%m-%d') AS end_date
       FROM business_types bt
       WHERE bt.group_code = 'inventory_transaction' AND bt.code = 'inbound' AND bt.status = 1
       ORDER BY bt.id
       LIMIT 1`
    );
    expect(rule).toBeTruthy();
    const prefix = `BT-${Date.now()}`;
    connection = await db.pool.getConnection();
    await connection.beginTransaction();
    const [location] = await connection.query("INSERT INTO locations (code, name, type, status) VALUES (?, ?, 'warehouse', 1)", [prefix, prefix]);
    const [unit] = await connection.query('INSERT INTO units (code, name) VALUES (?, ?)', [prefix, '件']);
    const [material] = await connection.query('INSERT INTO materials (code, name, location_id, unit_id) VALUES (?, ?, ?, ?)', [prefix, prefix, location.insertId, unit.insertId]);
    const [actor] = await connection.query("INSERT INTO users (username, password, real_name, role, status) VALUES (?, ?, ?, 'user', 1)", [prefix, 'login-disabled-test-fixture', prefix]);
    const [inbound] = await connection.query("INSERT INTO inventory_inbound (inbound_no, inbound_date, inbound_type, location_id, status, operator, created_by) VALUES (?, CURRENT_DATE, 'other', ?, 'completed', ?, 1)", [prefix, location.insertId, '字典业务测试']);
    const InventoryService = require('../../src/services/InventoryService');
    const InventoryPostingService = require('../../src/services/InventoryPostingService');
    await InventoryService.updateStock({
      materialId: material.insertId, locationId: location.insertId, unitId: unit.insertId,
      quantity: 1, unitCost: 1, batchNumber: prefix, transactionType: 'inbound',
      referenceType: 'inbound', referenceNo: prefix, sourceId: inbound.insertId,
      operator: '字典业务测试', businessApprovedById: 1, idempotencyKey: prefix,
    }, connection);
    const [[posting]] = await connection.query('SELECT id FROM inventory_posting_documents WHERE source_no = ?', [prefix]);
    await InventoryPostingService.approve(posting.id, { id: actor.insertId, label: prefix }, connection);
  });

  beforeEach(() => {
    // Every API statement still executes against MySQL, inside this fixture transaction.
    for (const method of ['query', 'execute']) {
      poolSpies.push(jest.spyOn(db.pool, method).mockImplementation((...args) => connection[method](...args)));
    }
    poolSpies.push(jest.spyOn(db.pool, 'getConnection').mockResolvedValue(new Proxy(connection, {
      get(target, key) {
        if (key === 'release') return () => {};
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    })));
  });

  afterAll(async () => {
    for (const spy of poolSpies) spy.mockRestore();
    if (connection) { await connection.rollback(); connection.release(); }
    require('../../src/services/BusinessTypeService').clearCache();
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
