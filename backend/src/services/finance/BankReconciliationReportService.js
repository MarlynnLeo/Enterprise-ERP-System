/**
 * 银行余额调节表（简化版）
 * 账面余额 vs 银行对账单余额 + 未达账项列表
 */

const db = require('../../config/db');
const { roundMoney } = require('../../utils/money');

async function loadUnreconciled(accountId, asOfDate) {
  const [rows] = await db.pool.execute(
    `SELECT id, transaction_date, transaction_type, amount, description, reference_number, status
     FROM bank_transactions WHERE bank_account_id = ? AND transaction_date <= ?
       AND COALESCE(is_reconciled, 0) = 0 AND status = 'approved'
     ORDER BY transaction_date, id`, [accountId, asOfDate]
  );
  return rows;
}

async function loadStatementBalance(accountId, asOfDate) {
  const [rows] = await db.pool.execute(
    `SELECT balance FROM bank_statement_items
     WHERE bank_account_id = ? AND transaction_date <= ? AND balance IS NOT NULL
     ORDER BY transaction_date DESC, id DESC LIMIT 1`, [accountId, asOfDate]
  );
  return rows.length ? Number(rows[0].balance) : null;
}

class BankReconciliationReportService {
  /**
   * @param {object} query
   * @param {number} query.accountId 银行账户 ID
   * @param {string} query.asOfDate YYYY-MM-DD
   */
  static async getBalanceSheet(query = {}) {
    let accountId = parseInt(query.accountId, 10);
    const asOfDate = query.asOfDate || new Date().toISOString().slice(0, 10);

    // 前端打开页时可能尚未选账户：默认取第一个启用账户，避免裸请求 500
    if (!Number.isFinite(accountId) || accountId <= 0) {
      const [fallback] = await db.pool.execute(
        `SELECT id
         FROM bank_accounts
         WHERE COALESCE(is_active, 1) = 1
         ORDER BY id ASC
         LIMIT 1`
      );
      accountId = fallback[0]?.id ? Number(fallback[0].id) : null;
    }

    if (!accountId) {
      const err = new Error('请选择银行账户（accountId）');
      err.code = 'VALIDATION_ERROR';
      err.statusCode = 400;
      throw err;
    }

    const [accounts] = await db.pool.execute(
      `SELECT id, account_name, account_number, bank_name, current_balance, currency_code
       FROM bank_accounts WHERE id = ? LIMIT 1`,
      [accountId]
    );
    if (!accounts.length) {
      const err = new Error('银行账户不存在');
      err.code = 'NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }
    const account = accounts[0];

    const unreconciled = await loadUnreconciled(accountId, asOfDate);
    const statementBalance = await loadStatementBalance(accountId, asOfDate);

    const bookBalance = Number(account.current_balance || 0);
    const outstanding = (unreconciled || []).map((r) => ({
      id: r.id,
      date: r.transaction_date,
      type: r.transaction_type || null,
      amount: (['存款', '转入', '利息', 'income'].includes(r.transaction_type) ? 1 : -1) * Number(r.amount || 0),
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
