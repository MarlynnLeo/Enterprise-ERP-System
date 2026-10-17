/* global jest, beforeEach, afterEach, describe, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));

const PurchaseReceiveInspectionService = require('../../src/services/business/PurchaseReceiveInspectionService');
const migration = require('../../migrations/20261016000040_ensure_purchase_batch_number_rule');

describe('purchase batch number format', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 22, 10, 0, 0));
  });
  afterEach(() => jest.useRealTimers());

  test.each([
    ['G023', [{ sequence_length: 3 }], null, 'G023-260922001'],
    ['G002', [{ sequence_length: 4 }], '12', 'G002-2609220013'],
    ['G023', [], 2, 'G023-260922003'],
    ['G023', [{ sequence_length: 0 }], 2, 'G023-260922003'],
  ])(
    'uses the actual supplier and configured width: %s %j',
    async (supplier, rules, max, expected) => {
      const connection = {
        query: jest
          .fn()
          .mockResolvedValueOnce([rules])
          .mockResolvedValueOnce([[{ max_seq: max }]]),
      };
      expect(await PurchaseReceiveInspectionService.generateBatchNo(connection, supplier, 23)).toBe(
        expected
      );
      expect(connection.query).toHaveBeenNthCalledWith(2, expect.stringContaining('FOR UPDATE'), [
        `${supplier}-260922`.length + 1,
        23,
        `${supplier}-260922%`,
      ]);
    }
  );

  test('does not issue a guessed batch when reading its configuration fails', async () => {
    const connection = { query: jest.fn().mockRejectedValue(new Error('database unavailable')) };
    await expect(
      PurchaseReceiveInspectionService.generateBatchNo(connection, 'G023', 23)
    ).rejects.toThrow('database unavailable');
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
});

describe('purchase batch rule forward migration', () => {
  const database = (existing = []) => {
    const rules = structuredClone(existing);
    const knex = jest.fn((table) => {
      if (table !== 'coding_rules') throw new Error(`Unexpected table: ${table}`);
      return {
        insert: (row) => ({
          onConflict: (key) => ({
            ignore: async () => {
              if (!rules.some((rule) => rule[key] === row[key])) rules.push(row);
            },
          }),
        }),
      };
    });
    knex.schema = { hasTable: jest.fn(async () => true) };
    return { knex, rules };
  };

  test('adds the default once without accessing historical data or sequence counters', async () => {
    const { knex, rules } = database();
    await migration.up(knex);
    await migration.up(knex);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      business_type: 'batch_number',
      sequence_length: 3,
      separator: '',
    });
    expect(knex.mock.calls.every(([table]) => table === 'coding_rules')).toBe(true);
  });

  test('preserves an existing custom or disabled rule and does not remove it on rollback', async () => {
    const existing = {
      business_type: 'batch_number',
      prefix: 'CUSTOM',
      sequence_length: 6,
      is_active: 0,
    };
    const { knex, rules } = database([existing]);
    await migration.up(knex);
    await migration.down(knex);
    expect(rules).toEqual([existing]);
  });
});
