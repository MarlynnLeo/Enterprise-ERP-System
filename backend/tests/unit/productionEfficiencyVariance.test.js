jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/services/business/costAccounting/runtime', () => ({
  db: require('../../src/config/db'),
  logger: require('../../src/utils/logger').logger,
  Precision: require('../../src/utils/precision'),
  globalConfigManager: { getConfig: () => ({ cost: { laborRate: 50 } }) },
}));
const db = require('../../src/config/db');
const { calculateProcessEfficiency } = require('../../src/utils/productionEfficiency');
const {
  calculateEfficiencyVariance,
} = require('../../src/services/business/costAccounting/varianceMethods');
const CostLedgerService = require('../../src/services/business/CostLedgerService');
const processRow = (extra = {}) => ({
  id: 1,
  process_name: '装配',
  quantity: 100,
  standard_hours: 0.1,
  actual_hours: 10,
  status: 'completed',
  ...extra,
});

test('compares batch hours, without writing calculated values during a report read', async () => {
  const connection = { execute: jest.fn().mockResolvedValue([[processRow()]]), release: jest.fn() };
  db.pool.getConnection.mockResolvedValue(connection);
  const result = await calculateEfficiencyVariance(42);
  expect(result.summary).toMatchObject({
    totalStandardHours: 10,
    totalActualHours: 10,
    hoursVariance: 0,
    efficiencyRate: 1,
    efficiencyVarianceAmount: 0,
    comparableProcessCount: 1,
  });
  expect(result.processDetails[0]).toMatchObject({
    standardHours: 10,
    actualHours: 10,
    favorable: true,
  });
  expect(connection.execute).toHaveBeenCalledTimes(1);
  expect(connection.execute.mock.calls[0][0].trim()).toMatch(/^SELECT/);
  expect(connection.release).toHaveBeenCalled();
});

test('uses process quantities and weights the aggregate by batch standards', async () => {
  const connection = {
    execute: jest
      .fn()
      .mockResolvedValue([
        [
          processRow({ quantity: 50, actual_hours: 4 }),
          processRow({ id: 2, quantity: 200, actual_hours: 25 }),
          processRow({ id: 3, status: 'cancelled', actual_hours: 999 }),
        ],
      ]),
    release: jest.fn(),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  const result = await calculateEfficiencyVariance(42);
  expect(result.summary).toMatchObject({
    totalStandardHours: 25,
    totalActualHours: 29,
    hoursVariance: 4,
    efficiencyRate: 1.16,
    efficiencyVarianceAmount: 200,
    comparableProcessCount: 2,
  });
  expect(result.processDetails[0].efficiencyRate).toBe(0.8);
  expect(result.processDetails[2].comparable).toBe(false);
});

test.each([
  { status: 'pending' },
  { actual_hours: null },
  { actual_hours: -1 },
  { standard_hours: 0 },
  { quantity: 0 },
  { status: 'cancelled' },
])('does not represent incomplete or invalid evidence as a favorable efficiency: %o', (extra) => {
  expect(calculateProcessEfficiency(processRow(extra))).toMatchObject({
    comparable: false,
    hoursVariance: null,
    efficiencyRate: null,
  });
});

test('cost drilldown ignores stale stored ratios and shows the same batch calculation', async () => {
  db.pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM production_tasks'))
      return [[{ id: 42, quantity: 100, actual_cost: 500 }]];
    if (sql.includes('FROM production_processes')) return [[processRow({ efficiency_rate: 100 })]];
    if (sql.includes('FROM inventory_outbound') || sql.includes('FROM gl_entries')) return [[]];
    throw new Error(`Unexpected SQL ${sql}`);
  });
  const result = await CostLedgerService.getTaskCostDrilldown(42);
  expect(result.processes[0]).toMatchObject({
    standard_hours: 10,
    actual_hours: 10,
    efficiency_rate: 1,
  });
  expect(db.pool.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});
