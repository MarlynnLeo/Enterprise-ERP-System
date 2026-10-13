/* global jest, test, expect, beforeEach */
jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/events/EventBus', () => ({ emit: jest.fn() }));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  assertAccess: jest.fn(),
  applyListScope: jest.fn(),
}));
jest.mock('../../src/services/FileAccessService', () => ({
  bindExistingUploadInTransaction: jest.fn(),
}));

const { pool } = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const FileAccessService = require('../../src/services/FileAccessService');
const EventBus = require('../../src/events/EventBus');
const service = require('../../src/services/business/AnomalyReportService');

const req = { user: { id: 7 } };
const image = '/uploads/anomalies/file_123_abcd.png';
const input = (extra = {}) => ({
  title: '装配有异响',
  category: 'quality',
  description: '工位复现',
  ...extra,
});
let connection;

beforeEach(() => {
  jest.resetAllMocks();
  connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM production_tasks')) return [[{ id: 23 }]];
      if (sql.startsWith('SELECT code')) return [[]];
      return [{ insertId: 99 }];
    }),
  };
  pool.getConnection.mockResolvedValue(connection);
  pool.query.mockResolvedValue([[{ id: 99, task_id: 23, images: [image] }]]);
  ScopeGuard.assertAccess.mockResolvedValue(true);
  ScopeGuard.applyListScope.mockResolvedValue({
    join: '',
    where: ' AND pt.created_by = ?',
    params: [7],
  });
});

test.each(['taskId', 'task_id'])(
  'persists %s and binds image in the same transaction before notification',
  async (key) => {
    const result = await service.create(input({ [key]: '23', images: [image] }), 7, req);
    expect(result.id).toBe(99);
    expect(ScopeGuard.assertAccess).toHaveBeenCalledWith(connection, req, 'production_task', 23);
    const insert = connection.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO anomaly_reports')
    );
    expect(insert[1]).toEqual([
      expect.stringMatching(/^ANM-/),
      23,
      'quality',
      'medium',
      '装配有异响',
      '工位复现',
      null,
      JSON.stringify([image]),
      7,
    ]);
    expect(FileAccessService.bindExistingUploadInTransaction).toHaveBeenCalledWith(connection, {
      userId: 7,
      fileUrl: image,
      businessType: 'anomaly_report',
      businessId: 99,
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.commit.mock.invocationCallOrder[0]).toBeLessThan(
      EventBus.emit.mock.invocationCallOrder[0]
    );
    expect(connection.release).toHaveBeenCalledTimes(1);
  }
);

test('general site anomaly remains valid without a task or photos', async () => {
  await service.create(input(), 7, req);
  expect(ScopeGuard.assertAccess).not.toHaveBeenCalled();
  const insert = connection.query.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO anomaly_reports')
  );
  expect(insert[1][1]).toBeNull();
  expect(insert[1][7]).toBe('[]');
});

test('out-of-scope tasks produce no report or event', async () => {
  ScopeGuard.assertAccess.mockResolvedValue(false);
  await expect(service.create(input({ taskId: 23 }), 7, req)).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(connection.query).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(EventBus.emit).not.toHaveBeenCalled();
});

test('task deletion between scope validation and row lock is rejected', async () => {
  connection.query.mockResolvedValueOnce([[]]);
  await expect(service.create(input({ taskId: 23 }), 7, req)).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(connection.query).toHaveBeenCalledTimes(1);
  expect(connection.commit).not.toHaveBeenCalled();
});

test.each(['FILE_OWNER_MISMATCH', 'FILE_ACCESS_BINDING_CONFLICT', 'FILE_ACCESS_RECORD_NOT_FOUND'])(
  'invalid image %s rolls back report and bindings',
  async (code) => {
    FileAccessService.bindExistingUploadInTransaction.mockRejectedValue(
      Object.assign(new Error('denied'), { code })
    );
    await expect(service.create(input({ images: [image] }), 7, req)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(EventBus.emit).not.toHaveBeenCalled();
  }
);

test.each([
  { taskId: 'untrusted' },
  { taskId: -1 },
  { taskId: 1.5 },
  { images: [image, image] },
  { images: [image, image, image, image, image, image] },
  { images: ['https://example.com/photo.png'] },
  { images: ['/uploads/attachments/file.txt'] },
  { images: ['/uploads/anomalies/../private.png'] },
  { images: '[]' },
])('rejects malformed task/image input before a transaction: %j', async (extra) => {
  await expect(service.create(input(extra), 7, req)).rejects.toMatchObject({ statusCode: 400 });
  expect(pool.getConnection).not.toHaveBeenCalled();
});

test('task options enforce the same row scope for rows/count and search production context with bounded pagination', async () => {
  pool.query
    .mockResolvedValueOnce([[{ total: 1 }]])
    .mockResolvedValueOnce([[{ id: 23, plan_code: 'PP-01', product_name: '开关' }]]);
  const result = await service.getTaskOptions(
    { keyword: ' 开关 ', page: 2, pageSize: 500, taskId: '23' },
    req
  );
  expect(result).toMatchObject({ page: 2, pageSize: 50, total: 1 });
  expect(ScopeGuard.applyListScope.mock.calls[0][2]).not.toHaveProperty('accessMode', 'read');
  for (const [sql, values] of pool.query.mock.calls) {
    expect(sql).toContain('pt.deleted_at IS NULL');
    expect(sql).toContain('pt.id = ?');
    expect(sql).toContain('pt.created_by = ?');
    expect(sql).toContain('pl.code LIKE ?');
    expect(sql).toContain('m.name LIKE ?');
    expect(values).toEqual([23, ...Array(5).fill('%开关%'), 7]);
  }
  expect(pool.query.mock.calls[1][0]).toContain('LIMIT 50 OFFSET 50');
  expect(pool.query.mock.calls[1][0]).toContain('process_name');
});

test.each(['', '   ', undefined, null])(
  'rejects empty description %j before persisting',
  async (description) => {
    await expect(service.create(input({ description }), 7, req)).rejects.toMatchObject({
      statusCode: 400,
      message: '请填写异常描述',
    });
    expect(pool.getConnection).not.toHaveBeenCalled();
  }
);

test('report keyword searches task codes with matching joins and filters for rows and totals', async () => {
  pool.query
    .mockResolvedValueOnce([[{ total: 1 }]])
    .mockResolvedValueOnce([[{ id: 99, task_code: 'TASK-23' }]]);
  const result = await service.getList({ keyword: 'TASK-23', page: 1, pageSize: 20 });
  expect(result.total).toBe(1);
  for (const [sql] of pool.query.mock.calls) {
    expect(sql).toContain('LEFT JOIN production_tasks pt ON ar.task_id = pt.id');
    expect(sql).toContain('(ar.title LIKE ? OR ar.code LIKE ? OR pt.code LIKE ?)');
  }
  expect(pool.query.mock.calls[0][1]).toEqual(Array(3).fill('%TASK-23%'));
  expect(pool.query.mock.calls[1][1]).toEqual([...Array(3).fill('%TASK-23%'), 20, 0]);
});
