jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(async () => true),
}));
jest.mock('../../src/services/quality/InspectionClosureService', () => ({
  closeIfTerminal: jest.fn(async () => ({})),
}));
const db = require('../../src/config/db');
const controller = require('../../src/controllers/business/quality/firstArticleController');
test('first article result stores complete standard and measurement evidence', async () => {
  const connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM quality_inspection_items')) return [[{ id: 12, item_name: '尺寸', type: 'dimension', standard: '10±0.1', method: '卡尺',
        dimension_value: 10, tolerance_upper: 0.1, tolerance_lower: -0.1, is_critical: 1 }]];
      if (sql.includes('FROM quality_inspections'))
        return [[{ id: 3, inspection_type: 'first_article', quantity: 1 }]];
      return [{ insertId: 12, affectedRows: 1 }];
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.updateFirstArticleResult(
    {
      params: { id: 3 },
      body: {
        firstArticleResult: 'passed',
        qualifiedQuantity: 1,
        unqualifiedQuantity: 0,
        items: [
          {
            itemName: '尺寸',
            type: 'dimension',
            standard: '10±0.1',
            method: '卡尺',
            dimensionValue: 10,
            toleranceUpper: 0.1,
            toleranceLower: -0.1,
            isCritical: true,
            measure1: '10.01',
            measure2: '',
            actualValue: '10.01',
            result: 'passed',
            measurements: [{ sampleNo: 1, measuredValue: 10.01 }],
          },
        ],
      },
    },
    res
  );
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.commit).toHaveBeenCalled();
  const insert = connection.query.mock.calls.find(([sql]) =>
    sql.includes('UPDATE quality_inspection_items')
  );
  expect(insert[1].slice(7, -2)).toEqual([1, 10, 0.1, -0.1, 10.01, null, null, null, null, null]);
  const measurements = connection.query.mock.calls.find(([sql]) =>
    sql.includes('INSERT INTO quality_inspection_measurements')
  );
  expect(measurements[1]).toEqual([12, 1, 10.01, null]);
});

const runSampling = async (body) => {
  const connection = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM quality_inspections'))
        return [
          [
            {
              id: 4,
              inspection_type: 'first_article',
              status: 'pending',
              quantity: 100,
              is_aql: 0,
              is_full_inspection: 0,
              sample_quantity: null,
            },
          ],
        ];
      if (sql.includes('FROM quality_inspection_items')) return [[{ id: 13, item_name: '外观', type: 'visual' }]];
      if (sql.includes('FROM quality_aql_standards'))
        return [
          [
            {
              id: 2,
              name: 'AQL1.0',
              batch_min: 51,
              batch_max: 150,
              sample_size: 20,
              aql_level: 1,
              accept_limit: 1,
              reject_limit: 2,
            },
          ],
        ];
      return [{ insertId: 13, affectedRows: 1 }];
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.updateFirstArticleResult(
    {
      params: { id: 4 },
      body: {
        firstArticleResult: 'passed',
        qualifiedQuantity: 100,
        unqualifiedQuantity: 0,
        items: [{ itemName: '外观', type: 'visual', result: 'passed' }],
        ...body,
      },
    },
    res
  );
  return { connection, res };
};
test('first article dedicated result resolves and persists trusted AQL snapshot in its transaction', async () => {
  const closure = require('../../src/services/quality/InspectionClosureService');
  closure.closeIfTerminal.mockClear();
  const { connection } = await runSampling({
    isAql: true,
    aqlStandardId: 2,
    aqlLevel: 1,
    sampleQuantity: 999,
    rejectLimit: 999,
  });
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.commit).toHaveBeenCalledTimes(1);
  const snapshot = connection.query.mock.calls.find(([sql]) => sql.includes('sample_quantity = ?'));
  expect(snapshot[1]).toEqual([0, 1, 2, 1, 20, 'AQL1.0', 1, 2, 4]);
  expect(closure.closeIfTerminal).toHaveBeenCalledTimes(1);
  expect(closure.closeIfTerminal.mock.calls[0][0]).toMatchObject({
    status: 'pending',
    sample_quantity: 20,
    reject_limit: 2,
  });
});
test('first article dedicated result cannot bypass AQL rejection with conditional release', async () => {
  const { connection, res } = await runSampling({
    isAql: true,
    aqlStandardId: 2,
    aqlLevel: 1,
    firstArticleResult: 'conditional',
    qualifiedQuantity: 98,
    unqualifiedQuantity: 2,
    items: [{ itemName: '外观', result: 'failed' }],
  });
  expect(res.status).toHaveBeenCalledWith(400);
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
});
test('first article result rejects enabled AQL with no resolved sampling rule', async () => {
  const { connection, res } = await runSampling({ isAql: true, aqlLevel: 1 });
  expect(res.status).toHaveBeenCalledWith(400);
  expect(connection.commit).not.toHaveBeenCalled();
});
