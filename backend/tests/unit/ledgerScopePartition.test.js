const { buildGlReport } = require('../../src/services/business/financialLedgers/glMethods');
const { normalizeFilters } = require('../../src/services/business/financialLedgers/helpers');

const filters = normalizeFilters('general', { startMonth: '2026-09', endMonth: '2026-10' });
const account = (id) => ({ id, account_code: String(id), account_name: `科目${id}` });
const entry = (id, accountId, debit, date = '2026-09-01') => ({
  id, entry_id: id, account_id: accountId, date, debit, credit: 0,
});
const scope = (...accounts) => ({ account: accounts[0], accounts });

test('partitions sources once per account without scanning every row for every scope', () => {
  const accounts = Array.from({ length: 100 }, (_, index) => account(index + 1));
  let sourceAccountReads = 0;
  const entries = Array.from({ length: 1000 }, (_, index) => {
    const row = entry(index + 1, index % 100 + 1, 0.01);
    Object.defineProperty(row, 'account_id', {
      enumerable: true,
      get: () => { sourceAccountReads++; return index % 100 + 1; },
    });
    return Object.freeze(row);
  });
  const result = buildGlReport('general', filters, accounts.map(a => scope(a)), {
    beforeYear: [], entries,
  }, {});
  expect(sourceAccountReads).toBeLessThanOrEqual(entries.length * 3);
  expect(result.summary).toMatchObject({ totalDebit: 10, closingBalance: 10, entryCount: 1000, groupCount: 100 });
  expect(result.rows).toHaveLength(500);
});

test('overlapping scopes receive their rows once even when a scope repeats an account', () => {
  const parent = account(1), child = account(2);
  const result = buildGlReport('general', filters, [scope(parent, child, child), scope(child)], {
    beforeYear: [], entries: [entry(1, 1, 5), entry(2, 2, 12), entry(3, 99, 999)],
  }, {});
  expect(result.rows.filter(r => r.rowType === 'subtotal' && r.period === '2026-09').map(r => r.debit)).toEqual([17, 12]);
  expect(result.summary).toMatchObject({ totalDebit: 29, closingBalance: 29, entryCount: 3, groupCount: 2 });
});

test('separates earlier-year opening and current-year carryover without mutating sources', () => {
  const a = account(1), b = account(2);
  const prior = Object.freeze({ account_id: 1, debit: 100, credit: 0 });
  const carry = Object.freeze({ account_id: 1, debit: 5, credit: 0 });
  const result = buildGlReport('general', filters, [scope(a), scope(b)], {
    beforeYear: [prior], beforePeriod: [carry], entries: [entry(1, 1, 2), entry(2, 2, 3)],
  }, {});
  expect(result.summary).toMatchObject({ openingBalance: 105, totalDebit: 5, closingBalance: 110 });
  expect(result.rows.find(r => r.accountCode === '1' && r.rowType === 'cumulative')).toMatchObject({ debit: 7, balance: 107 });
  expect(result.rows.find(r => r.accountCode === '2' && r.rowType === 'opening').balance).toBe(0);
  expect(carry).not.toHaveProperty('date');
});

test('empty and unrelated scopes do not acquire phantom activity', () => {
  const result = buildGlReport('general', filters, [scope(account(1))], {
    beforeYear: [{ account_id: 9, debit: 100 }], entries: [entry(1, 9, 20)],
  }, {});
  expect(result.rows).toEqual([]);
  expect(result.summary).toMatchObject({ totalDebit: 0, closingBalance: 0, entryCount: 0, groupCount: 0 });
});
