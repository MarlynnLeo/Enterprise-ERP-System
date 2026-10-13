jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ applyListScope: jest.fn() }));
const { pool } = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const {
  getProductionSources,
} = require('../../src/controllers/business/quality/inspectionSourceController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
beforeEach(() => {
  jest.clearAllMocks();
  ScopeGuard.applyListScope.mockResolvedValue({ where: ' AND pt.manager = ?', params: ['车间A'] });
  pool.query.mockImplementation(async (sql) =>
    sql.includes('COUNT(*)')
      ? [[{ total: 1 }]]
      : [
          [
            {
              id: 7,
              code: 'PT-1',
              product_id: 4,
              product_name: '零件',
              product_code: 'P4',
              unit: '件',
              quantity: '100',
              completed_quantity: '90',
              batch_no: 'B-PT1',
              secret_cost: 999,
            },
          ],
        ]
  );
});
test.each([
  ['final', ['inspection', 'completed']],
  ['process', ['in_progress']],
])('lookup %s is scoped, state filtered and exposes no costing fields', async (type, statuses) => {
  const req = { query: { inspectionType: type, pageSize: 200 } };
  const res = response();
  await getProductionSources(req, res);
  expect(ScopeGuard.applyListScope).toHaveBeenCalledWith(
    req,
    'production_task',
    expect.objectContaining({ accessMode: 'read' })
  );
  expect(pool.query.mock.calls[1][1]).toEqual([statuses, '车间A']);
  expect(pool.query.mock.calls[1][0]).toContain('LIMIT 100');
  const body = res.json.mock.calls[0][0];
  expect(body.data.list[0]).toEqual({
    id: 7,
    code: 'PT-1',
    taskNo: 'PT-1',
    productId: 4,
    materialId: 4,
    productName: '零件',
    productCode: 'P4',
    batchNo: 'B-PT1',
    unit: '件',
    quantity: 100,
    completedQuantity: 90,
  });
});
test('rejects unsupported inspection type before reading database', async () => {
  const res = response();
  await getProductionSources({ query: { inspectionType: 'incoming' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(pool.query).not.toHaveBeenCalled();
});
