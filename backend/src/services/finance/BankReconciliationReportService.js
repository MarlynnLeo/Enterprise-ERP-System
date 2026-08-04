/**
 * 银行余额调节表（简化版）
 * 账面余额 vs 银行对账单余额 + 未达账项列表
 */

const db = require('../../config/db');
const { roundMoney } = require('../../utils/money');

async function loadUnreconciled(accountId, asOfDate) {
  const attempts = [
    {
      sql: `SELECT id, transaction_date, transaction_type, amount, description, reference_number, status
            FROM bank_transactions
            WHERE account_id = ?
              AND transaction_date <= ?
              AND COALESCE(is_reconciled, 0) = 0
              AND (status IN ('approved', '已审核', 'posted', '已过账') OR status IS NULL)
            ORDER BY transaction_date, id`,
      params: [accountId, asOfDate],
    },
    {
      sql: `SELECT id, transaction_date, transaction_type, amount, description, reference_number, status
            FROM bank_transactions
            WHERE bank_account_id = ?
              AND transaction_date <= ?
              AND COALESCE(reconciled, 0) = 0
            ORDER BY transaction_date, id`,
      params: [accountId, asOfDate],
    },
    {
      sql: `SELECT id, transaction_date, amount, description, status
            FROM bank_transactions
            WHERE account_id = ?
            ORDER BY transaction_date DESC
            LIMIT 100`,
      params: [accountId],
    },
  ];

  for (const attempt of attempts) {
    try {
      const [rows] = await db.pool.execute(attempt.sql, attempt.params);
      return rows || [];
    } catch {
      /* try next shape */
    }
  }
  return [];
}

async function loadStatementBalance(accountId, asOfDate) {
  const attempts = [
    {
      sql: `SELECT ending_balance, statement_date
            FROM bank_statements
            WHERE account_id = ? AND statement_date <= ?
            ORDER BY statement_date DESC LIMIT 1`,
      params: [accountId, asOfDate],
    },
    {
      sql: `SELECT ending_balance, statement_date
            FROM bank_statements
            WHERE bank_account_id = ? AND statement_date <= ?
            ORDER BY statement_date DESC LIMIT 1`,
      params: [accountId, asOfDate],
    },
  ];
  for (const attempt of attempts) {
    try {
      const [st] = await db.pool.execute(attempt.sql, attempt.params);
      if (st.length) return Number(st[0].ending_balance);
    } catch {
      /* try next */
    }
  }
  return null;
}

class BankReconciliationReportService {
  /**
   * @param {object} query
   * @param {number} query.accountId 银行账户 ID
   * @param {string} query.asOfDate YYYY-MM-DD
   */
  static async getBalanceSheet(query = {}) {
    const accountId = parseInt(query.accountId, 10);
    const asOfDate = query.asOfDate || new Date().toISOString().slice(0, 10);
    if (!accountId) throw new Error('accountId 必填');

    const [accounts] = await db.pool.execute(
      `SELECT id, account_name, account_number, bank_name, current_balance, currency_code
       FROM bank_accounts WHERE id = ? LIMIT 1`,
      [accountId]
    );
    if (!accounts.length) throw new Error('银行账户不存在');
    const account = accounts[0];

    const unreconciled = await loadUnreconciled(accountId, asOfDate);
    const statementBalance = await loadStatementBalance(accountId, asOfDate);

    const bookBalance = Number(account.current_balance || 0);
    const outstanding = (unreconciled || []).map((r) => ({
      id: r.id,
      date: r.transaction_date,
      type: r.transaction_type || null,
      amount: Number(r.amount || 0),
      description: r.description,
      reference: r.reference_number || null,
    }));
    const outstandingSum = roundMoney(
      outstanding.reduce((s, r) => s + Number(r.amount || 0), 0)
    );

    return {
      asOfDate,
      account: {
        id: account.id,
        name: account.account_name,
        number: account.account_number,
        bankName: account.bank_name,
        currency: account.currency_code || 'CNY',
      },
      bookBalance,
      statementBalance,
      outstandingItems: outstanding,
      outstandingSum,
      adjustedBookBalance: roundMoney(bookBalance),
      difference:
        statementBalance == null
          ? null
          : roundMoney(bookBalance - statementBalance - outstandingSum),
      note:
        '简化调节表：账面取账户余额；未达为未对账已审核流水。完整对账单导入后 statementBalance 更准。',
    };
  }
}

module.exports = BankReconciliationReportService;
