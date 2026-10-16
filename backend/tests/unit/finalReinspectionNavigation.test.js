jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/business/QualityIntegrationService', () => ({}));
const { pool } = require('../../src/config/db');
const controller = require('../../src/controllers/business/quality/reworkTaskController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
beforeEach(() => jest.clearAllMocks());
test('batch status identifies the separate pending inspection for the repaired ten', async () => {
  pool.query.mockImplementation(async (sql) =>
    sql.includes('FROM document_links')
      ? [[{ rework_id: 4, id: 70, status: 'pending' }]]
      : [
          [
            {
              inspection_id: 7,
              rework_id: 4,
              rework_status: 'completed',
              disposition: 'rework',
              ncp_id: 9,
            },
          ],
        ]
  );
  const res = response();
  await controller.getReworkStatusByInspectionIds({ body: { inspectionIds: [7] } }, res);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        7: expect.objectContaining({
          reinspectionId: 70,
          reinspectionStatus: 'pending',
          allowReinspection: true,
        }),
      },
    })
  );
});
test('single status never uses the original inspection as a fallback', async () => {
  pool.query.mockImplementation(async (sql) =>
    sql.includes('FROM document_links')
      ? [[]]
      : [[{ rework_id: 4, rework_status: 'completed', disposition: 'rework' }]]
  );
  const res = response();
  await controller.getReworkStatusByInspectionId({ params: { inspectionId: 7 } }, res);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ reinspectionId: null }) })
  );
});

test.each(['list', 'detail'])(
  'rework %s provides direct separate inspection navigation',
  async (view) => {
    pool.query.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*)')) return [[{ total: 1 }]];
      if (sql.includes('FROM document_links'))
        return [[{ rework_id: 4, id: 70, status: 'pending' }]];
      return [[{ id: 4, inspection_id: 7, inspection_type: 'final', status: 'completed' }]];
    });
    const res = response();
    if (view === 'list') await controller.getReworkTasks({ query: {} }, res);
    else await controller.getReworkTaskById({ params: { id: 4 } }, res);
    const body = res.json.mock.calls[0][0];
    const record = view === 'list' ? body.data.data[0] : body.data;
    expect(record).toMatchObject({
      id: 4,
      inspectionId: 7,
      reinspectionId: 70,
      inspectionType: 'final',
    });
  }
);

test('NCP rework navigation uses an exact source id filter', async () => {
  pool.query.mockImplementation(async (sql) =>
    sql.includes('COUNT(*)') ? [[{ total: 0 }]] : [[]]
  );
  await controller.getReworkTasks({ query: { ncpId: '27' } }, response());
  expect(pool.query.mock.calls[0][0]).toContain('rt.ncp_id = ?');
  expect(pool.query.mock.calls[0][1]).toEqual([27]);
  expect(pool.query.mock.calls[1][1]).toEqual([27]);
});
