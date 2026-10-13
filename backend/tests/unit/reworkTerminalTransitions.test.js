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
    if (sql.includes('UPDATE quality_inspections')) return [{ affectedRows: 1 }];
    if (sql.includes('UPDATE nonconforming_products')) return [{ affectedRows: 1 }];
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

test('cancelled rework releases reserved disposition quantity exactly once', async () => {
  const connection = makeConnection({ id: 1, status: 'in_progress', ncp_id: 7, quantity: 10 });
  db.pool.getConnection.mockResolvedValue(connection);
  const req = { params: { id: 1 }, body: { status: 'cancelled' } };
  await controller.updateStatus(req, response());
  await controller.updateStatus(req, response());
  const restores = connection.query.mock.calls.filter(([sql]) =>
    sql.includes('UPDATE nonconforming_products')
  );
  expect(restores).toHaveLength(1);
  expect(restores[0][1]).toEqual([10, 7]);
});

test('progress cannot complete an unassigned pending task', async () => {
  const connection = makeConnection({ status: 'pending' });
  connection.query.mockResolvedValue([[{ status: 'pending', assigned_to: null }]]);
  db.pool.getConnection.mockResolvedValue(connection);
  const res = response();
  await controller.updateProgress({ params: { id: 1 }, body: { progress: 100 } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(quality.linkDocumentToDocument).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalled();
});

test('progress completion creates a linked reinspection with source and inspector', async () => {
  const task = {
    id: 9,
    status: 'in_progress',
    assigned_to: 'Operator',
    inspection_id: 50,
    quantity: 10,
  };
  const connection = makeConnection(task);
  const original = connection.query.getMockImplementation();
  connection.query.mockImplementation(async (sql, args) => {
    if (sql.includes('SELECT rt.id')) return [[task]];
    if (sql.includes('FROM quality_inspections'))
      return [
        [
          {
            id: 50,
            inspector_id: 8,
            inspector_name: 'Inspector',
            source_type: 'production_task',
            task_id: 15,
            reference_id: 15,
            quantity: 100,
          },
        ],
      ];
    return original(sql, args);
  });
  db.pool.getConnection.mockResolvedValue(connection);
  await controller.updateProgress({ params: { id: 9 }, body: { progress: 100 } }, response());
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(quality.linkDocumentToDocument).toHaveBeenCalledWith(
    expect.objectContaining({ id: 9 }),
    expect.objectContaining({ id: 51 }),
    connection
  );
  const source = connection.query.mock.calls.find(([sql]) =>
    sql.includes('UPDATE quality_inspections')
  );
  expect(source[1]).toEqual([
    8,
    'Inspector',
    'production_task',
    null,
    15,
    null,
    null,
    null,
    10,
    51,
  ]);
});

test('completion without a price edit preserves the existing rework cost', async () => {
  const task = {
    id: 5,
    status: 'in_progress',
    assigned_to: 'Operator',
    rework_cost: 37,
    quantity: 10,
  };
  const connection = makeConnection(task);
  db.pool.getConnection.mockResolvedValue(connection);
  await controller.completeTask(
    { params: { id: 5 }, body: { actualDate: '2026-10-07' } },
    response()
  );
  expect(connection.rollback).not.toHaveBeenCalled();
  const update = connection.query.mock.calls.find(([sql]) => sql.includes('UPDATE rework_tasks'));
  expect(update[1]).toEqual(['2026-10-07', 37, 5]);
  expect(quality.recordQualityCost).toHaveBeenCalledWith(
    expect.objectContaining({ cost: 37 }),
    connection
  );
});
