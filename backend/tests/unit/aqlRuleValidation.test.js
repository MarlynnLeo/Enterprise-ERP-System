jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
const { pool } = require('../../src/config/db');
const AqlService = require('../../src/services/quality/aqlService');
const { validateAqlRule } = require('../../src/utils/quality/aqlValidation');
const rule = {
  code: 'GB-II-J',
  name: '正常一次抽样',
  batch_min: 501,
  batch_max: 1200,
  sample_size: 80,
  aql_level: 1,
  accept_limit: 2,
  reject_limit: 3,
  status: 'active',
};

let connection;
let overlaps;
beforeEach(() => {
  jest.resetAllMocks();
  overlaps = false;
  connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    destroy: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.includes('RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.startsWith('SELECT id FROM')) return [overlaps ? [{ id: 4 }] : []];
      if (sql.startsWith('SELECT')) return [[rule]];
      if (sql.includes('INSERT INTO')) return [{ insertId: 3 }];
      if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
  pool.getConnection.mockResolvedValue(connection);
});

const writes = () => connection.query.mock.calls.filter(([sql]) => /^(INSERT|UPDATE)/.test(sql));

test.each([
  { batch_min: 0 },
  { batch_min: 1.5 },
  { batch_max: 500 },
  { sample_size: -1 },
  { sample_size: true },
  { sample_size: 2.5 },
  { accept_limit: -1 },
  { reject_limit: 4 },
  { accept_limit: 80, reject_limit: 81 },
  { aql_level: 'GB/T 2828.1 II' },
  { aql_level: 0 },
  { aql_level: 0.000001 },
  { status: 'unknown' },
  { status: null },
  { name: '  ' },
  { name: 'a'.repeat(101) },
  { code: 'a'.repeat(51) },
])('rejects invalid rule fields %p without writing', async (change) => {
  await expect(AqlService.createStandard({ ...rule, ...change }, 1)).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(writes()).toHaveLength(0);
  expect(connection.rollback).toHaveBeenCalledTimes(1);
});

test('keeps CR AQL 0.065 without rounding', async () => {
  const critical = {
    ...rule,
    aql_level: '0.065',
    sample_size: 200,
    accept_limit: 0,
    reject_limit: 1,
  };
  expect(() => validateAqlRule(critical)).not.toThrow();
  await AqlService.createStandard(critical, 7);
  expect(writes()[0][1]).toEqual([
    rule.code,
    rule.name,
    501,
    1200,
    200,
    '0.065',
    0,
    1,
    'active',
    7,
  ]);
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(connection.query.mock.calls.at(-1)[0]).toContain('RELEASE_LOCK');
  expect(connection.release).toHaveBeenCalledTimes(1);
});

test('validates partial updates against the existing full rule', async () => {
  await expect(AqlService.updateStandard(3, { batch_min: 1201 })).rejects.toMatchObject({
    statusCode: 400,
  });
  expect(writes()).toHaveLength(0);
});

test('rejects overlapping active ranges on save', async () => {
  overlaps = true;
  await expect(AqlService.createStandard(rule, 1)).rejects.toMatchObject({
    statusCode: 409,
    code: 'AQL_RULE_CONFLICT',
  });
  expect(writes()).toHaveLength(0);
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(connection.query.mock.calls.at(-1)[0]).toContain('RELEASE_LOCK');
});

test('excludes the edited rule from its overlap check within the write transaction', async () => {
  await AqlService.updateStandard(3, { name: '新名称' });
  expect(connection.query).toHaveBeenCalledWith(
    expect.stringContaining('AND id <> ?'),
    [1, 1200, 501, 3]
  );
  expect(connection.beginTransaction.mock.invocationCallOrder[0]).toBeLessThan(
    connection.query.mock.invocationCallOrder[1]
  );
  expect(writes()).toHaveLength(1);
});

test('allows deactivating an overlapping rule to repair an existing conflict', async () => {
  overlaps = true;
  await AqlService.updateStandard(3, { status: 'inactive' });
  expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('SELECT id FROM'))).toBe(false);
  expect(writes()).toHaveLength(1);
});

test('does not write when another connection owns the rule lock', async () => {
  connection.query.mockResolvedValueOnce([[{ acquired: 0 }]]);
  await expect(AqlService.createStandard(rule, 1)).rejects.toMatchObject({
    code: 'AQL_RULE_BUSY',
    statusCode: 409,
  });
  expect(connection.beginTransaction).not.toHaveBeenCalled();
  expect(writes()).toHaveLength(0);
  expect(connection.release).toHaveBeenCalledTimes(1);
});

test('destroys a connection if releasing its rule lock fails', async () => {
  const query = connection.query.getMockImplementation();
  connection.query.mockImplementation((sql, values) => {
    if (sql.includes('RELEASE_LOCK')) throw new Error('connection lost');
    return query(sql, values);
  });
  await AqlService.createStandard(rule, 1);
  expect(connection.destroy).toHaveBeenCalledTimes(1);
  expect(connection.release).not.toHaveBeenCalled();
});

test('does not delete rules referenced by historical inspection evidence', async () => {
  const query = connection.query.getMockImplementation();
  connection.query.mockImplementation((sql, values) => {
    if (sql.includes('WHERE id = ? FOR UPDATE')) return [[{ id: 3 }]];
    if (sql.includes('FROM quality_inspections')) return [[{ id: 7 }]];
    return query(sql, values);
  });
  await expect(AqlService.deleteStandard(3)).rejects.toMatchObject({
    code: 'AQL_RULE_IN_USE',
    statusCode: 409,
  });
  expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false);
  expect(connection.rollback).toHaveBeenCalledTimes(1);
});
