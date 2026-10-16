/* global jest, beforeEach, test, expect */
const mockExecute = jest.fn();
jest.mock('../../src/config/db', () => ({ pool: { execute: mockExecute } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock('../../src/services/business/DLQService', () => ({ recordFailedJob: jest.fn() }));
const Bus = require('../../src/events/EventBus');
const Domain = require('../../src/services/business/DomainEventService');
const DLQ = require('../../src/services/business/DLQService');
const { DatabaseSync } = require('node:sqlite');
beforeEach(() => { Bus.removeAllListeners(); mockExecute.mockReset().mockResolvedValue([{ affectedRows: 1 }]); });

test('a failing durable event owns one retry record and never creates per-attempt dead letters', async () => {
  Bus.on('INVENTORY_POSTING_APPROVED', async () => { throw new Error('not ready'); });
  for (const attempts of [1, 2, 1024, 100000]) {
    await expect(Domain.dispatchEvent({ id: 9, attempts, event_name: 'INVENTORY_POSTING_APPROVED', payload: { postingDocumentId: 7 } })).rejects.toThrow('not ready');
  }
  expect(DLQ.recordFailedJob).not.toHaveBeenCalled();
  expect(mockExecute).toHaveBeenCalledTimes(4);
  for (const [sql, params] of mockExecute.mock.calls) {
    expect(sql).toContain('POWER(2, LEAST(GREATEST(attempts, 1), 12))');
    expect(sql).toContain("AND status = 'processing' AND attempts = ?");
    expect(params[1]).toBe(9);
  }
});

test('non-outbox events still persist a retry job and asynchronous emit waits for persistence', async () => {
  let stored = false;
  DLQ.recordFailedJob.mockImplementation(async () => { await Promise.resolve(); stored = true; });
  Bus.on('AD_HOC', async () => { throw new Error('failed'); });
  await expect(Bus.emitAsync('AD_HOC', { id: 1 })).rejects.toThrow('failed');
  expect(stored).toBe(true);
  expect(DLQ.recordFailedJob).toHaveBeenCalledTimes(1);
});

test('missing listeners use bounded backoff and successful writes retain the claim version', async () => {
  const event = { id: 9, attempts: 1023, event_name: 'MISSING', payload: {} };
  await expect(Domain.dispatchEvent(event)).rejects.toThrow('No listener');
  expect(mockExecute.mock.calls[0][1]).toEqual(['No listener registered for MISSING', 9, 1024]);
  Bus.on('MISSING', async () => {});
  await Domain.dispatchEvent(event);
  expect(mockExecute.mock.calls[1][1]).toEqual(['processed', 'processed', null, 9, 1024]);
});

test('actual claim predicates preserve compensation and later claims, with bounded high-attempt retry time', async () => {
  const database = new DatabaseSync(':memory:');
  database.function('LEAST', (a, b) => Math.min(a, b));
  database.function('GREATEST', (a, b) => Math.max(a, b));
  database.function('POWER', (base, exponent) => {
    const value = Math.pow(base, exponent);
    if (!Number.isFinite(value)) throw new Error('numeric overflow');
    return value;
  });
  database.exec(`CREATE TABLE domain_events (id INTEGER, status TEXT, attempts INTEGER,
    error_message TEXT, available_at TEXT, locked_at TEXT, updated_at TEXT, processed_at TEXT);
    INSERT INTO domain_events VALUES (9,'processed',1024,NULL,NULL,NULL,NULL,NULL);`);
  mockExecute.mockImplementation(async (sql, params) => {
    const sqlite = sql.replace(/DATE_ADD\(NOW\(\), INTERVAL (.*?) SECOND\)/g, "datetime('now', '+' || $1 || ' seconds')")
      .replace(/NOW\(\)/g, "datetime('now')");
    return [{ affectedRows: Number(database.prepare(sqlite).run(...params).changes) }];
  });
  Bus.on('FAIL', async () => { throw new Error('late worker'); });
  try {
    const event = { id: 9, attempts: 1023, event_name: 'FAIL', payload: {} };
    await expect(Domain.dispatchEvent(event)).rejects.toThrow('late worker');
    expect(database.prepare('SELECT status FROM domain_events').get().status).toBe('processed');
    database.exec("UPDATE domain_events SET status='processing', attempts=1025");
    await expect(Domain.dispatchEvent(event)).rejects.toThrow('late worker');
    expect(database.prepare('SELECT status FROM domain_events').get().status).toBe('processing');
    await expect(Domain.dispatchEvent({ ...event, attempts: 1024 })).rejects.toThrow('late worker');
    const row = database.prepare("SELECT status, CAST(strftime('%s', available_at) AS INTEGER) - CAST(strftime('%s','now') AS INTEGER) AS delay FROM domain_events").get();
    expect(row.status).toBe('failed');
    expect(row.delay).toBe(3600);
  } finally { database.close(); }
});
