/**
 * 银行账户余额 SSOT：以 opening_balance + 已审核 bank_transactions 重算 current_balance。
 * 业务写入银行流水后应调用 syncAccountBalance，避免仅依赖增量加减导致漂移。
 */
const { logger } = require('../../utils/logger');

const INCOME_TYPES = [
  '存款',
  '转入',
  '利息',
  '收入',
  'income',
  'deposit',
  'transfer_in',
  'interest',
];
const EXPENSE_TYPES = [
  '取款',
  '转出',
  '费用',
  '支出',
  'expense',
  'withdrawal',
  'transfer_out',
  'fee',
];

class BankBalanceService {
  /**
   * @param {import('mysql2/promise').PoolConnection} connection
   * @param {number} accountId
   * @returns {Promise<{accountId:number, balance:number, lastTransactionDate: string|null}>}
   */
  static async syncAccountBalance(connection, accountId) {
    if (!connection) {
      throw new Error('syncAccountBalance 必须在事务中调用');
    }
    if (!accountId) {
      throw new Error('accountId 无效');
    }

    const [accounts] = await connection.execute(
      `SELECT id, opening_balance, account_name
       FROM bank_accounts
       WHERE id = ?
       FOR UPDATE`,
      [accountId]
    );
    if (accounts.length === 0) {
      throw new Error(`银行账户不存在: ${accountId}`);
    }

    const incomeList = INCOME_TYPES.map((t) => `'${t}'`).join(',');
    const expenseList = EXPENSE_TYPES.map((t) => `'${t}'`).join(',');

    const [balanceResult] = await connection.execute(
      `SELECT
         COALESCE(SUM(CASE
           WHEN transaction_type IN (${incomeList}) THEN amount
           WHEN transaction_type IN (${expenseList}) THEN -amount
           ELSE 0
         END), 0) AS movement,
         MAX(transaction_date) AS last_transaction_date
       FROM bank_transactions
       WHERE bank_account_id = ?
         AND (status IS NULL OR status = 'approved')`,
      [accountId]
    );

    const opening = parseFloat(accounts[0].opening_balance) || 0;
    const movement = parseFloat(balanceResult[0]?.movement) || 0;
    const balance = Math.round((opening + movement) * 100) / 100;
    const lastDate = balanceResult[0]?.last_transaction_date || null;

    await connection.execute(
      `UPDATE bank_accounts
       SET current_balance = ?, last_transaction_date = COALESCE(?, last_transaction_date)
       WHERE id = ?`,
      [balance, lastDate, accountId]
    );

    logger.debug(
      `[BankBalance] 账户 ${accounts[0].account_name}(${accountId}) 余额重算=${balance}`
    );

    return {
      accountId,
      balance,
      lastTransactionDate: lastDate,
    };
  }
}

module.exports = BankBalanceService;
