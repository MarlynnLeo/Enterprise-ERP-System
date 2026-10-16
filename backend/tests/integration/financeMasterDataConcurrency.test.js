const db = require('../../src/config/db');
const periods = require('../../src/models/finance/periods');
const accounts = require('../../src/models/finance/accounts');

describe('finance master data guards against MySQL', () => {
  const prefix = `AUD${Date.now().toString(36)}`;
  let year;
  const accountIds = [];
  const periodIds = [];
  const entryIds = [];

  beforeAll(async () => {
    const [rows] = await db.pool.query('SELECT MAX(fiscal_year) AS last_year FROM gl_periods');
    year = Math.max(8000, Number(rows[0].last_year || 2026) + 1);
    if (year > 9998) throw new Error('No isolated accounting year available for test');
  });

  afterAll(async () => {
    if (entryIds.length) {
      await db.pool.query('DELETE FROM gl_entry_items WHERE entry_id IN (?)', [entryIds]);
      await db.pool.query('DELETE FROM gl_entries WHERE id IN (?)', [entryIds]);
    }
    // Only delete fixtures created by this test; the integration environment is test/UAT-only.
    await db.pool.query('DELETE FROM gl_periods WHERE period_name = ?', [prefix]);
    if (accountIds.length)
      await db.pool.query('DELETE FROM gl_accounts WHERE id IN (?)', [accountIds]);
  });

  test('concurrent overlapping period creation commits only one calendar interval', async () => {
    const data = {
      period_name: prefix,
      start_date: `${year}-01-01`,
      end_date: `${year}-01-31`,
      fiscal_year: year,
    };
    const results = await Promise.allSettled([
      periods.createPeriod(data),
      periods.createPeriod(data),
    ]);
    const committed = results.filter((result) => result.status === 'fulfilled');
    expect(committed).toHaveLength(1);
    periodIds.push(committed[0].value);
    const [rows] = await db.pool.query('SELECT id FROM gl_periods WHERE period_name = ?', [prefix]);
    expect(rows).toHaveLength(1);
  });

  test('account deactivation uses valid locking SQL and allows an unused account', async () => {
    const [result] = await db.pool.query(
      "INSERT INTO gl_accounts (account_code, account_name, account_type, is_debit, is_active, currency_code) VALUES (?, ?, '资产', 1, 1, 'CNY')",
      [prefix, prefix]
    );
    accountIds.push(result.insertId);
    await expect(accounts.deactivateAccount(result.insertId)).resolves.toBe(true);
    const [[stored]] = await db.pool.query('SELECT is_active FROM gl_accounts WHERE id = ?', [
      result.insertId,
    ]);
    expect(Number(stored.is_active)).toBe(0);
  });

  test('a real journal prevents moving its period and changing its account classification', async () => {
    const [entry] = await db.pool.query(
      "INSERT INTO gl_entries (entry_number, entry_date, posting_date, period_id, document_type, status, is_posted) VALUES (?, ?, ?, ?, 'manual', 'draft', 0)",
      [prefix, `${year}-01-02`, `${year}-01-02`, periodIds[0]]
    );
    entryIds.push(entry.insertId);
    await db.pool.query(
      'INSERT INTO gl_entry_items (entry_id, line_number, account_id, debit_amount, credit_amount) VALUES (?, 1, ?, 1, 0)',
      [entry.insertId, accountIds[0]]
    );
    await expect(
      periods.updatePeriod(periodIds[0], {
        period_name: prefix,
        start_date: `${year}-01-01`,
        end_date: `${year}-01-30`,
        fiscal_year: year,
      })
    ).rejects.toThrow('已有凭证');
    await expect(accounts.updateAccount(accountIds[0], { account_type: '收入' })).rejects.toThrow(
      '凭证历史'
    );
    const [[stored]] = await db.pool.query('SELECT account_type FROM gl_accounts WHERE id = ?', [
      accountIds[0],
    ]);
    expect(stored.account_type).toBe('资产');
  });
});
