jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/business/QualityIntegrationService', () => ({
  recordQualityCost: jest.fn(),
  linkDocumentToDocument: jest.fn(),
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateInspectionCode: jest.fn(async () => 'QI-NEW') },
}));
const db = require('../../src/config/db');
const quality = require('../../src/services/business/QualityIntegrationService');
const controller = require('../../src/controllers/business/quality/reworkTaskController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const makeConnection = (task) => ({
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  query: jest.fn(async (sql, args) => {
    if (sql.includes('SELECT rt.*')) return [[{ ...task }]];
    if (sql.includes('UPDATE rework_tasks')) {
      task.status = args[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM quality_inspections'))
      return [[{ id: 50, inspection_no: 'QI-OLD', quantity: 2 }]];
    if (sql.includes('INSERT INTO quality_inspections')) return [{ insertId: 51 }];
    if (sql.includes('FROM quality_inspection_items')) return [[]];
    throw new Error('Unexpected SQL: ' + sql);
  }),
});
beforeEach(() => jest.clearAllMocks());

test.each(['completed', 'cancelled'])(
  'terminal %s cannot be reopened to repeat costs or inspections',
  async (status) => {
    const connection = makeConnection({ status });
    db.pool.getConnection.mockResolvedValue(connection);
    const res = response();
    await controller.updateStatus({ params: { id: 1 }, body: { status: 'in_progress' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls.some(([sql]) => /^\s*UPDATE/.test(sql))).toBe(false);
    expect(quality.recordQualityCost).not.toHaveBeenCalled();
  }
);

test('repeating a successful completion does not repeat either side effect', async () => {
  const connection = makeConnection({
    id: 1,
    status: 'in_progress',
    inspection_id: 50,
    rework_no: 'RW-1',
    quantity: 2,
  });
  db.pool.getConnection.mockResolvedValue(connection);
  const req = { params: { id: 1 }, body: { status: 'completed' } };
  await controller.updateStatus(req, response());
  await controller.updateStatus(req, response());
  expect(quality.recordQualityCost).toHaveBeenCalledTimes(1);
  expect(quality.linkDocumentToDocument).toHaveBeenCalledTimes(1);
  expect(
    connection.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO quality_inspections'))
  ).toHaveLength(1);
});

test('pending tasks cannot skip assignment and complete', async () => {
  const connection = makeConnection({ status: 'pending' });
  db.pool.getConnection.mockResolvedValue(connection);
  const res = response();
  await controller.updateStatus({ params: { id: 1 }, body: { status: 'completed' } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(quality.recordQualityCost).not.toHaveBeenCalled();
});
