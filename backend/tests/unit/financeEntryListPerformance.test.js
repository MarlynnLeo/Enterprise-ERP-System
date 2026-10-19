/* global jest, beforeEach, describe, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('../../src/config/financeConfig', () => ({ financeConfig: {} }));
jest.mock('../../src/models/finance/helpers', () => ({}));

const db = require('../../src/config/db');
const entriesModel = require('../../src/models/finance/entries');

function connectionFor(entries = [], details = [], stats = {}) {
  const connection = {
    execute: jest.fn().mockResolvedValueOnce([entries]),
    release: jest.fn(),
  };
  if (entries.length) connection.execute.mockResolvedValueOnce([details]);
  connection.execute.mockResolvedValueOnce([
    [{ total: 0, posted_count: 0, unposted_count: 0, total_amount: 0, ...stats }],
  ]);
  db.pool.getConnection.mockResolvedValue(connection);
  return connection;
}

beforeEach(() => jest.clearAllMocks());

describe('voucher list pagination and full-filter statistics', () => {
  test('reads amounts only for page IDs and enriches by ID without changing header order', async () => {
    const connection = connectionFor(
      [{ id: 23, entry_number: 'V23' }, { id: 21, entry_number: 'V21' }, { id: 20 }],
      [
        {
          id: 21,
          total_debit: '8.75',
          total_credit: '8.75',
          is_reversal_entry: 1,
          reversal_of_entry_id: 3,
        },
        {
          id: 23,
          total_debit: '45.50',
          total_credit: '45.50',
          is_reversal_entry: 0,
          reversal_of_entry_id: null,
        },
      ],
      { total: '31', posted_count: '20', unposted_count: '11', total_amount: '501.25' }
    );
    const result = await entriesModel.getEntries({ period_id: '7' }, 2, 3);
    expect(result.entries.map((entry) => entry.id)).toEqual([23, 21, 20]);
    expect(result.entries[0]).toMatchObject({
      entry_number: 'V23',
      total_debit: '45.50',
      total_credit: '45.50',
    });
    expect(result.entries[1]).toMatchObject({ is_reversal_entry: 1, reversal_of_entry_id: 3 });
    expect(result.entries[2]).toMatchObject({
      total_debit: 0,
      total_credit: 0,
      is_reversal_entry: 0,
      reversal_of_entry_id: null,
    });
    expect(result.pagination).toEqual({ total: 31, page: 2, pageSize: 3, totalPages: 11 });
    expect(result.statistics).toEqual({ total: 31, posted: 20, unposted: 11, totalAmount: 501.25 });
    expect(connection.execute).toHaveBeenCalledTimes(3);
    const [pageSql, pageParams] = connection.execute.mock.calls[0];
    expect(pageSql).not.toContain('gl_entry_items');
    expect(pageSql).not.toContain('source_entry');
    expect(pageSql).toContain('ORDER BY e.created_at DESC, e.id DESC LIMIT 3 OFFSET 3');
    expect(pageParams).toEqual([7]);
    const [detailsSql, detailsParams] = connection.execute.mock.calls[1];
    expect(detailsSql).toMatch(/WHERE entry_id IN \(\?,\?,\?\)\s+GROUP BY entry_id/);
    expect(detailsSql).toContain('MIN(id) AS source_id');
    expect(detailsSql).toContain('GROUP BY reversal_entry_id');
    expect(detailsParams).toEqual([23, 21, 20, 23, 21, 20, 23, 21, 20]);
    const [statsSql, statsParams] = connection.execute.mock.calls[2];
    expect(statsSql).toContain('COUNT(DISTINCT e.id)');
    expect(statsSql).toContain('COUNT(DISTINCT CASE WHEN e.is_posted = 1 THEN e.id END)');
    expect(statsSql).toContain('COUNT(DISTINCT CASE WHEN e.is_posted = 0 THEN e.id END)');
    expect(statsSql).toContain('LEFT JOIN gl_entry_items ei ON ei.entry_id = e.id');
    expect(statsSql).not.toMatch(/LIMIT|OFFSET/);
    expect(statsParams).toEqual([7]);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      {
        entry_number: '记%',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        document_type: 'manual',
        voucher_word: '记',
        period_id: '7',
        is_posted: false,
      },
      ['%记%%', '2026-10-01', '2026-10-31', 'manual', '记', 7, 0],
      [
        'e.entry_number LIKE ?',
        'e.entry_date BETWEEN ? AND ?',
        'e.document_type = ?',
        'e.voucher_word = ?',
        'e.period_id = ?',
        'e.is_posted = ?',
      ],
    ],
    [
      { start_date: '2026-10-01', is_posted: true },
      ['2026-10-01', 1],
      ['e.entry_date >= ?', 'e.is_posted = ?'],
    ],
    [{ end_date: '2026-10-31' }, ['2026-10-31'], ['e.entry_date <= ?']],
    [{}, [], ['WHERE 1=1']],
  ])('preserves filter and binding parity for %j', async (filters, params, predicates) => {
    const connection = connectionFor();
    await entriesModel.getEntries(filters);
    const [[pageSql, pageParams], [statsSql, statsParams]] = connection.execute.mock.calls;
    expect(pageParams).toEqual(params);
    expect(statsParams).toEqual(params);
    for (const predicate of predicates) {
      expect(pageSql).toContain(predicate);
      expect(statsSql).toContain(predicate);
    }
    expect(statsSql).not.toMatch(/LIMIT|OFFSET/);
  });

  test('applies owner scope to the amount sum as well as headers and counts', async () => {
    const scopeClause = {
      join: 'LEFT JOIN users gl_entry_owner_scope ON gl_entry_owner_scope.id = e.created_by',
      where: ' AND gl_entry_owner_scope.department_id IN (?, ?) AND e.created_by = ?',
      params: [4, 5, 9],
    };
    const connection = connectionFor([], [], {
      total: 2,
      posted_count: 1,
      unposted_count: 1,
      total_amount: '20.50',
    });
    const result = await entriesModel.getEntries({ period_id: '7', scopeClause });
    const [[pageSql, pageParams], [statsSql, statsParams]] = connection.execute.mock.calls;
    for (const sql of [pageSql, statsSql]) {
      expect(sql).toContain(scopeClause.join);
      expect(sql).toContain(scopeClause.where);
    }
    expect(pageParams).toEqual([7, 4, 5, 9]);
    expect(statsParams).toEqual([7, 4, 5, 9]);
    // A separate unscoped scalar sum previously exposed other owners' amounts.
    expect(statsSql).toContain('SUM(ei.debit_amount)');
    expect(statsSql).not.toContain('FROM gl_entries se');
    expect(result.statistics).toEqual({ total: 2, posted: 1, unposted: 1, totalAmount: 20.5 });
  });

  test.each([0, 17])(
    'an empty page skips enrichment and still returns all %s matching headers',
    async (total) => {
      const connection = connectionFor([], [], {
        total,
        posted_count: total,
        total_amount: total ? '86.25' : null,
      });
      const result = await entriesModel.getEntries({}, 20, 10);
      expect(result.entries).toEqual([]);
      expect(result.pagination).toEqual({
        total,
        page: 20,
        pageSize: 10,
        totalPages: Math.ceil(total / 10),
      });
      expect(result.statistics).toEqual({
        total,
        posted: total,
        unposted: 0,
        totalAmount: total ? 86.25 : 0,
      });
      expect(connection.execute).toHaveBeenCalledTimes(2);
      expect(connection.execute.mock.calls[0][0]).toContain('LIMIT 10 OFFSET 190');
      expect(connection.execute.mock.calls[1][0]).not.toMatch(/LIMIT|OFFSET|IN \(\)/);
    }
  );

  test('null enrichment values remain zero and page size stays bounded', async () => {
    const connection = connectionFor(
      [{ id: 8 }],
      [{ id: 8, total_debit: null, total_credit: null }],
      { total: 1 }
    );
    const result = await entriesModel.getEntries({}, -3, 1000000);
    expect(result.entries[0]).toMatchObject({
      total_debit: 0,
      total_credit: 0,
      is_reversal_entry: 0,
      reversal_of_entry_id: null,
    });
    expect(result.pagination).toEqual({ total: 1, page: 1, pageSize: 100, totalPages: 1 });
    expect(connection.execute.mock.calls[0][0]).toContain('LIMIT 100 OFFSET 0');
  });

  test.each([0, 1, 2])('query failure at step %s always releases its connection', async (step) => {
    const connection = { execute: jest.fn(), release: jest.fn() };
    for (let i = 0; i < step; i++) connection.execute.mockResolvedValueOnce([[{ id: 1 }]]);
    connection.execute.mockRejectedValueOnce(new Error('query unavailable'));
    db.pool.getConnection.mockResolvedValue(connection);
    await expect(entriesModel.getEntries()).rejects.toThrow('query unavailable');
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
