/* global beforeEach, afterEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const { DatabaseSync } = require('node:sqlite');
const db = require('../../src/config/db');
const DLQ = require('../../src/services/business/DLQService');

describe('DLQ retry lease recovery', () => {
  let database;
  beforeEach(() => {
    DLQ.handlers.clear();
    database = new DatabaseSync(':memory:');
    database.exec(`CREATE TABLE sys_failed_jobs (
      id INTEGER PRIMARY KEY, task_name TEXT, payload TEXT, status TEXT, attempts INTEGER,
      locked_at TEXT, next_retry_at TEXT, resolved_at TEXT, created_at TEXT, updated_at TEXT,
      error_message TEXT, error_stack TEXT
    );
    INSERT INTO sys_failed_jobs (id, task_name, payload, status, attempts, created_at)
      VALUES (1, 'Finance:Test', '{}', 'pending', 0, '2026-01-01');`);
    db.pool.query.mockImplementation(async (sql, params = []) => {
      const sqliteSql = sql
        .replace(
          /DATE_SUB\(NOW\(\), INTERVAL \? SECOND\)/g,
          "datetime('now', '-' || ? || ' seconds')"
        )
        .replace(
          /DATE_ADD\(NOW\(\), INTERVAL \? SECOND\)/g,
          "datetime('now', '+' || ? || ' seconds')"
        )
        .replace(/NOW\(\)/g, "datetime('now')");
      const statement = database.prepare(sqliteSql);
      return /^\s*SELECT/.test(sql)
        ? [statement.all(...params)]
        : [{ affectedRows: Number(statement.run(...params).changes) }];
    });
  });
  afterEach(() => database.close());

  const row = () => database.prepare('SELECT * FROM sys_failed_jobs WHERE id = 1').get();

  test('a worker crash on the final attempt becomes a visible failed job after its lease expires', async () => {
    database.exec(
      "UPDATE sys_failed_jobs SET status = 'retrying', attempts = 5, locked_at = '2026-01-01'"
    );
    const handler = jest.fn();
    DLQ.registerHandler('Finance:Test', handler);
    const result = await DLQ.retryPendingJobs({ maxAttempts: 5 });
    expect(row()).toMatchObject({ status: 'failed', attempts: 5, locked_at: null });
    expect(result.exhausted).toBe(1);
    expect(handler).not.toHaveBeenCalled();
  });

  test.each([true, false])(
    'an expired worker cannot overwrite the next worker (old attempt fails: %s)',
    async (fails) => {
      let started;
      const firstStarted = new Promise((resolve) => {
        started = resolve;
      });
      let finishFirst;
      const firstWork = new Promise((resolve, reject) => {
        finishFirst = () => (fails ? reject(new Error('old attempt failed')) : resolve());
      });
      DLQ.registerHandler(
        'Finance:Test',
        jest
          .fn()
          .mockImplementationOnce(() => {
            started();
            return firstWork;
          })
          .mockResolvedValueOnce(undefined)
      );
      const first = DLQ.retryJob(row());
      await firstStarted;
      database.exec("UPDATE sys_failed_jobs SET locked_at = '2026-01-01'");
      await expect(DLQ.retryJob(row())).resolves.toMatchObject({ resolved: true });
      finishFirst();
      await expect(first).resolves.toMatchObject({ resolved: false, reason: 'LOST_CLAIM' });
      expect(row()).toMatchObject({ status: 'resolved', attempts: 2, locked_at: null });
    }
  );

  test('a stale scanner cannot bypass another attempt and its scheduled backoff', async () => {
    const stale = row();
    database.exec("UPDATE sys_failed_jobs SET attempts = 1, next_retry_at = '2999-01-01'");
    const handler = jest.fn();
    DLQ.registerHandler('Finance:Test', handler);
    await expect(DLQ.retryJob(stale)).resolves.toEqual({ retried: false, reason: 'NOT_CLAIMED' });
    expect(row().attempts).toBe(1);
    expect(handler).not.toHaveBeenCalled();
  });
});
