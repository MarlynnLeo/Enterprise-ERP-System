'use strict';

/** Base financial data only. Never creates completed business documents or ledger entries. */
async function prepareFinanceFixture(db, fixture) {
  const [[database]] = await db.query('SELECT DATABASE() AS name');
  if (!/^erp_purchase_audit_test_\d{8}_chain$/.test(database.name || '')) {
    throw new Error(`Financial E2E fixture refuses non-isolated database: ${database.name}`);
  }
  const today = fixture.today || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const startDate = `${today.slice(0, 7)}-01`;
  const endDate = `${today.slice(0, 7)}-${new Date(year, month, 0).getDate()}`;
  let [periods] = await db.query(
    'SELECT id, period_name, is_closed, is_locked FROM gl_periods WHERE start_date <= ? AND end_date >= ?',
    [today, today]
  );
  if (periods.length > 1) throw new Error('Overlapping financial periods in isolated fixture');
  if (!periods.length) {
    const [result] = await db.execute(
      'INSERT INTO gl_periods (period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year) VALUES (?, ?, ?, 0, 0, ?)',
      [`${year}年${month}月`, startDate, endDate, year]
    );
    periods = [{ id: result.insertId, period_name: `${year}年${month}月`, is_closed: 0, is_locked: 0 }];
  }
  if (periods[0].is_closed || periods[0].is_locked) {
    throw new Error('Current isolated GL period is closed/locked; do not rewrite its status');
  }
  const accountNumber = `CHAIN-E2E-${today.replaceAll('-', '')}`;
  let [banks] = await db.query('SELECT * FROM bank_accounts WHERE account_number = ?', [accountNumber]);
  if (!banks.length) {
    const [created] = await db.execute(
      `INSERT INTO bank_accounts
       (account_number, account_name, bank_name, current_balance, opening_balance,
        currency_code, is_active, notes, created_by)
       VALUES (?, ?, ?, 0, 0, 'CNY', 1, ?, ?)`,
      [accountNumber, '全链路测试银行账户', '隔离测试银行',
        '仅供隔离 E2E：期初余额为零，先收款后付款；不连接实际银行。',
        fixture.actors?.finance?.id || fixture.actors?.business?.id || null]
    );
    [banks] = await db.query('SELECT * FROM bank_accounts WHERE id = ?', [created.insertId]);
  }
  const [accounts] = await db.query(
    `SELECT id, account_code, account_name, is_active FROM gl_accounts
     WHERE account_code IN ('1002', '1122', '2202', '220201', '1403', '1405', '1406',
       '4001', '5001', '5401', '222101001', '222101005') ORDER BY account_code`
  );
  const required = ['1002', '1122', '2202', '220201', '222101001', '222101005'];
  const missing = required.filter(code => !accounts.some(row => row.account_code === code && row.is_active));
  if (missing.length) throw new Error(`Missing active base chart of accounts: ${missing.join(', ')}`);
  fixture.today = today;
  fixture.finance = {
    period: { id: periods[0].id, name: periods[0].period_name, startDate, endDate },
    bank: { id: banks[0].id, accountName: banks[0].account_name, accountNumber,
      openingBalance: Number(banks[0].opening_balance), initialBalance: Number(banks[0].current_balance) },
    accounts,
  };
  return fixture.finance;
}

module.exports = { prepareFinanceFixture };
