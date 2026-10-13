/* global beforeEach, afterEach, describe, expect, it, jest */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/services/business/CostAccountingService', () => ({
  calculateWIPCost: jest.fn(),
  generateWIPVoucher: jest.fn(),
  allocateVariance: jest.fn(),
}));
const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const Closing = require('../../src/services/business/CostClosingService');
const Accounting = require('../../src/services/business/CostAccountingService');

describe('cost closing period-end WIP readiness', () => {
  let database, connection;
  const period = {
    id: 10,
    period_name: '2026-10',
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    is_closed: 0,
  };
  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.function('CONCAT', { varargs: true }, (...values) => values.join(''));
    database.exec(`
      CREATE TABLE gl_periods (id INTEGER, end_date TEXT);
      CREATE TABLE wip_snapshots (period_id INTEGER, snapshot_date TEXT, wip_total_cost NUMERIC);
      CREATE TABLE production_tasks (id INTEGER, code TEXT, status TEXT, progress NUMERIC,
        created_at TEXT, deleted_at TEXT, completed_at TEXT, actual_end_date TEXT);
      CREATE TABLE gl_entries (id INTEGER, period_id INTEGER, document_type TEXT, document_number TEXT,
        transaction_type TEXT, transaction_id INTEGER, status TEXT, is_posted INTEGER, is_reversed INTEGER);
      CREATE TABLE gl_entry_items (entry_id INTEGER, debit_amount NUMERIC, credit_amount NUMERIC);
      INSERT INTO gl_periods VALUES (10, '2026-10-31');
      INSERT INTO wip_snapshots VALUES (10, '2026-10-15', 500);
    `);
    connection = {
      release: jest.fn(),
      execute: jest.fn(async (sql, params = []) => {
        if (
          sql.includes('COUNT(*) AS snapshot_count') ||
          /^\s*SELECT gp.id AS period_id/.test(sql) ||
          /^\s*SELECT pt.id, pt.code, pt.status, pt.progress/.test(sql)
        ) {
          return [database.prepare(sql).all(...params)];
        }
        // Other cost chains have their own fixtures; this suite executes WIP SQL.
        return [[]];
      }),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    jest.spyOn(Closing, 'getPeriod').mockResolvedValue(period);
  });
  afterEach(() => database.close());

  function snapshot(value = 500) {
    database.prepare('INSERT INTO wip_snapshots VALUES (10, ?, ?)').run('2026-10-31', value);
  }
  function voucher({
    id = 1,
    value = 500,
    reversed = 0,
    status = 'posted',
    type = '期末WIP结转',
    number = 'WIP-10',
  } = {}) {
    database
      .prepare('INSERT INTO gl_entries VALUES (?, 10, ?, ?, ?, 10, ?, 1, ?)')
      .run(id, type, number, type, status, reversed);
    database
      .prepare('INSERT INTO gl_entry_items VALUES (?, ?, 0), (?, 0, ?)')
      .run(id, value, id, value);
  }
  async function checks() {
    const result = await Closing.collectChecks(connection, period);
    return Object.fromEntries(result.map((check) => [check.key, check]));
  }

  it('compares a single period-end amount with its voucher instead of adding daily snapshots', async () => {
    snapshot();
    voucher();
    const result = await checks();
    expect(result.wip.passed).toBe(true);
    expect(result.voucher.passed).toBe(true);
  });

  it('requires an end-date snapshot for a task completed after that date, even if a midmonth snapshot exists', async () => {
    database.exec(
      "INSERT INTO production_tasks VALUES (7, 'TASK-7', 'completed', 100, '2026-10-01', NULL, '2026-11-01', NULL)"
    );
    voucher();
    const result = await checks();
    expect(result.wip).toMatchObject({ passed: false, count: 1 });
    expect(result.wip.sampleRows[0].id).toBe(7);
    expect(result.voucher.passed).toBe(true); // Value is unknown until calculation.
  });

  it('accepts a genuine empty period-end set without reusing midmonth WIP', async () => {
    database.exec(
      "INSERT INTO production_tasks VALUES (7, 'TASK-7', 'warehoused', 100, '2026-10-01', NULL, '2026-10-20', NULL)"
    );
    const result = await checks();
    expect(result.wip.passed).toBe(true);
    expect(result.voucher.passed).toBe(true);
  });

  it('keeps closing actionable until a stale voucher is released after WIP becomes empty', async () => {
    snapshot();
    voucher();
    Accounting.calculateWIPCost.mockImplementation(async () => {
      database.exec("DELETE FROM wip_snapshots WHERE snapshot_date = '2026-10-31'");
      return { summary: { totalWIPCost: 0 } };
    });
    Accounting.generateWIPVoucher.mockImplementation(async () => {
      const beforeRelease = await checks();
      expect(beforeRelease.voucher).toMatchObject({ passed: false, count: 1 });
      database.exec("UPDATE gl_entries SET is_reversed = 1, status = 'reversed'");
      return { skipped: true };
    });
    const result = await Closing.executeClosing(10);
    expect(result.after.canClose).toBe(true);
    expect(Accounting.calculateWIPCost).toHaveBeenCalledWith(10);
    expect(Accounting.generateWIPVoucher).toHaveBeenCalledWith(10);
  });

  it.each([
    { reversed: 1, status: 'reversed' },
    { status: 'draft' },
    { type: 'invoice', number: 'OTHER-10' },
  ])(
    'does not use an inactive or unrelated same-period document as the WIP voucher: %j',
    async (options) => {
      snapshot();
      voucher(options);
      expect((await checks()).voucher).toMatchObject({ passed: false, count: 1 });
    }
  );

  it('requires voucher repair when the newly calculated period-end amount changes', async () => {
    snapshot(400);
    voucher({ value: 500 });
    expect((await checks()).voucher).toMatchObject({ passed: false, count: 1 });
  });

  it('detects duplicate active WIP vouchers even when their combined amount matches the snapshot', async () => {
    snapshot(500);
    voucher({ id: 1, value: 250 });
    voucher({ id: 2, value: 250 });
    expect((await checks()).voucher).toMatchObject({ passed: false, count: 1 });
  });

  it('requires recalculation for invalid snapshot values before comparing vouchers', async () => {
    snapshot(-100);
    voucher();
    const result = await checks();
    expect(result.wip).toMatchObject({ passed: false, count: 1 });
    expect(result.voucher.passed).toBe(true);
  });
});
