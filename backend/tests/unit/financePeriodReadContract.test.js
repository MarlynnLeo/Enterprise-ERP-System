/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));

const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const periods = require('../../src/models/finance/periods');
const { ResponseHandler } = require('../../src/utils/responseHandler');
let fixture;

beforeEach(() => {
  jest.clearAllMocks();
  fixture = new DatabaseSync(':memory:');
  fixture.exec(`CREATE TABLE gl_periods (
    id INTEGER PRIMARY KEY, period_name TEXT, start_date TEXT, end_date TEXT,
    is_closed INTEGER, is_locked INTEGER, is_adjusting INTEGER, fiscal_year INTEGER,
    created_at TEXT, updated_at TEXT, closed_by INTEGER, closed_at TEXT,
    closing_date TEXT, reopened_by INTEGER, reopened_at TEXT, status TEXT
  );
  INSERT INTO gl_periods (id, period_name, start_date, end_date, is_closed, is_locked, is_adjusting, fiscal_year, status) VALUES
    (1, '2026年08月', '2026-08-01', '2026-08-31', 1, 0, 0, 2026, 'closed'),
    (2, '2026年09月', '2026-09-01', '2026-09-30', 0, 0, 0, 2026, 'open'),
    (3, '2026年10月', '2026-10-01', '2026-10-31', 0, 1, 0, 2026, 'open');`);
  const query = async (sql, params = []) => [fixture.prepare(sql).all(...params)];
  db.pool.query.mockImplementation(query);
  db.pool.execute.mockImplementation(query);
});

afterEach(() => fixture.close());

const apiData = data => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  ResponseHandler.success(res, data);
  return res.json.mock.calls[0][0].data;
};

test('all-period and paginated read APIs retain locked independently from closed', async () => {
  const all = apiData(await periods.getAllPeriods());
  expect(all.periods.map(row => [row.id, row.periodName, row.isClosed, row.isLocked])).toEqual([
    [3, '2026年10月', 0, 1], [2, '2026年09月', 0, 0], [1, '2026年08月', 1, 0],
  ]);
  const page = apiData(await periods.getAllPeriods({ isClosed: false, page: 1, pageSize: 1 }));
  expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 });
  expect(page.periods).toEqual([expect.objectContaining({ id: 3, isClosed: 0, isLocked: 1 })]);
});

test('individual and current-period reads expose the true lock flag without rewriting stored status', async () => {
  const single = apiData(await periods.getPeriodById(3));
  const current = apiData(await periods.getCurrentPeriod());
  expect(single).toMatchObject({ id: 3, isClosed: 0, isLocked: 1, status: 'open' });
  expect(current).toEqual(single);
  expect(apiData(await periods.getPeriodById(2))).toMatchObject({ isClosed: 0, isLocked: 0 });
  expect(await periods.getPeriodById(999)).toBeNull();
});
