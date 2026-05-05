/**
 * cash/Reports.js
 * @description 现金和银行报表统计模型
 * @date 2026-01-23
 * @version 1.0.0
 */

const logger = require('../../utils/logger');
const db = require('../../config/db');

class CashReportsModel {
  /**
   * 现金流预测
   */
  static async getCashFlowForecast(startDate, endDate) {
    // 获取当前银行账户余额
    const [bankAccounts] = await db.pool.execute(
      'SELECT id, bank_name, account_name, account_number, currency_code, current_balance FROM bank_accounts WHERE is_active = true'
    );

    // 获取未来期间的应收账款
    const [receivables] = await db.pool.execute(
      `SELECT 
        DATE(due_date) as date,
        SUM(balance_amount) as amount,
        'AR' as type,
        '应收账款' as description
      FROM ar_invoices
      WHERE status != '已付款' AND status != '已取消' AND due_date BETWEEN ? AND ?
      GROUP BY DATE(due_date)`,
      [startDate, endDate]
    );

    // 获取未来期间的应付账款
    const [payables] = await db.pool.execute(
      `SELECT 
        DATE(due_date) as date,
        SUM(balance_amount) as amount,
        'AP' as type,
        '应付账款' as description
      FROM ap_invoices
      WHERE status != '已付款' AND status != '已取消' AND due_date BETWEEN ? AND ?
      GROUP BY DATE(due_date)`,
      [startDate, endDate]
    );

    // 获取已知的未来现金流，如计划的交易
    // 注意：需确保 planned_transactions 表存在，否则这一步可能会报错
    // 这里保留原逻辑，假设表存在或后续会添加
    let plannedTransactions = [];
    try {
      const [pt] = await db.pool.execute(
        `SELECT 
          DATE(transaction_date) as date,
          amount,
          transaction_type as type,
          description
        FROM planned_transactions
        WHERE transaction_date BETWEEN ? AND ?`,
        [startDate, endDate]
      );
      plannedTransactions = pt;
    } catch (e) {
      // 忽略表不存在错误
      logger.warn('获取 planned_transactions 失败，可能是表不存在，跳过:', e.message);
    }

    // 合并所有现金流数据
    const cashFlows = [...receivables, ...payables, ...plannedTransactions].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    // 计算每日现金流余额
    let currentBalance = bankAccounts.reduce(
      (sum, account) => sum + parseFloat(account.current_balance),
      0
    );

    const dailyCashFlows = [];
    const currentDate = new Date(startDate);
    const endDateObj = new Date(endDate);

    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().slice(0, 10);
      const dayFlows = cashFlows.filter((flow) => flow.date === dateStr);

      let inflow = 0;
      let outflow = 0;

      dayFlows.forEach((flow) => {
        if (
          flow.type === 'AR' ||
          flow.type === '存款' ||
          flow.type === '转入' ||
          flow.type === '利息'
        ) {
          inflow += parseFloat(flow.amount);
        } else {
          outflow += parseFloat(flow.amount);
        }
      });

      const netFlow = inflow - outflow;
      currentBalance += netFlow;

      dailyCashFlows.push({
        date: dateStr,
        inflow,
        outflow,
        netFlow,
        balance: currentBalance,
        details: dayFlows,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      startDate,
      endDate,
      initialBalance: bankAccounts.reduce(
        (sum, account) => sum + parseFloat(account.current_balance),
        0
      ),
      finalBalance: currentBalance,
      accounts: bankAccounts,
      dailyCashFlows,
    };
  }

  /**
   * 获取交易统计
   */
  static async getTransactionStatistics(filters = {}) {
    try {
      const params = [];
      let whereClause = '';

      // 构建WHERE子句
      if (filters.startDate && filters.endDate) {
        whereClause += ' AND t.transaction_date BETWEEN ? AND ?';
        params.push(filters.startDate, filters.endDate);
      } else if (filters.startDate) {
        whereClause += ' AND t.transaction_date >= ?';
        params.push(filters.startDate);
      } else if (filters.endDate) {
        whereClause += ' AND t.transaction_date <= ?';
        params.push(filters.endDate);
      }

      if (filters.accountId) {
        whereClause += ' AND t.bank_account_id = ?';
        params.push(filters.accountId);
      }

      if (filters.transactionType) {
        whereClause += ' AND t.transaction_type = ?';
        params.push(filters.transactionType);
      }

      // 查询交易笔数
      const [countResult] = await db.pool.execute(
        `SELECT COUNT(*) as total_count 
         FROM bank_transactions t
         WHERE 1=1 ${whereClause}`,
        params
      );

      // 查询收入、支出和净额 - 同时支持中文和英文类型
      const [amountResult] = await db.pool.execute(
        `SELECT 
         SUM(CASE 
           WHEN transaction_type IN ('存款', '转入', '利息', 'income', '收入', 'deposit', 'transfer_in', 'interest') 
           THEN amount 
           ELSE 0 
         END) as total_income,
         
         SUM(CASE 
           WHEN transaction_type IN ('取款', '转出', '费用', 'expense', '支出', 'withdrawal', 'transfer_out', 'fee') 
           THEN amount 
           ELSE 0 
         END) as total_expense,
         
         SUM(CASE 
           WHEN transaction_type IN ('存款', '转入', '利息', 'income', '收入', 'deposit', 'transfer_in', 'interest') 
           THEN amount 
           WHEN transaction_type IN ('取款', '转出', '费用', 'expense', '支出', 'withdrawal', 'transfer_out', 'fee') 
           THEN -amount 
           ELSE 0 
         END) as net_amount
         FROM bank_transactions t
         WHERE 1=1 ${whereClause}`,
        params
      );

      // 查询按交易类型分组的统计
      const [typeStats] = await db.pool.execute(
        `SELECT 
         transaction_type,
         COUNT(*) as transaction_count,
         SUM(amount) as total_amount,
         AVG(amount) as avg_amount,
         MIN(amount) as min_amount,
         MAX(amount) as max_amount
         FROM bank_transactions t
         WHERE 1=1 ${whereClause}
         GROUP BY transaction_type
         ORDER BY SUM(amount) DESC`,
        params
      );

      // 查询按日期分组的统计数据
      const [timeSeriesStats] = await db.pool.execute(
        `SELECT 
         DATE(transaction_date) as date,
         transaction_type,
         COUNT(*) as transaction_count,
         SUM(amount) as total_amount
         FROM bank_transactions t
         WHERE 1=1 ${whereClause}
         GROUP BY DATE(transaction_date), transaction_type
         ORDER BY date`,
        params
      );

      // 确保数值不为null
      const totalCount = parseInt(countResult[0].total_count || 0);
      const totalIncome = parseFloat(amountResult[0].total_income || 0);
      const totalExpense = parseFloat(amountResult[0].total_expense || 0);
      const netAmount = parseFloat(amountResult[0].net_amount || 0);

      // 构建返回数据
      return {
        summary: {
          totalCount,
          totalIncome,
          totalExpense,
          netAmount,
        },
        byType: typeStats,
        timeSeries: timeSeriesStats,
      };
    } catch (error) {
      logger.error('获取交易统计失败:', error);
      throw error;
    }
  }

  /**
   * 获取银行账户统计信息
   */
  static async getBankAccountsStats() {
    try {
      // 获取所有银行账户的合计数据
      const [totalResult] = await db.pool.execute(`
        SELECT 
          COUNT(*) as total_accounts,
          SUM(current_balance) as total_balance,
          COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_accounts,
          COUNT(CASE WHEN is_active = 0 THEN 1 END) as inactive_accounts,
          (SELECT COUNT(DISTINCT currency_code) FROM bank_accounts) as total_currencies
        FROM bank_accounts
      `);

      // 计算本月的开始和结束日期
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);

      // 获取本月的收入和支出统计
      const [monthlyStats] = await db.pool.execute(
        `
        SELECT
          SUM(CASE 
            WHEN transaction_type IN ('存款', '转入', '利息') THEN amount 
            ELSE 0 
          END) as total_in_month,
          SUM(CASE 
            WHEN transaction_type IN ('取款', '转出', '费用') THEN amount 
            ELSE 0 
          END) as total_out_month
        FROM bank_transactions
        WHERE transaction_date BETWEEN ? AND ?
      `,
        [firstDayOfMonth, lastDayOfMonth]
      );

      // 按货币类型统计余额
      const [currencyStats] = await db.pool.execute(`
        SELECT 
          currency_code,
          COUNT(*) as account_count,
          SUM(current_balance) as total_balance
        FROM bank_accounts
        GROUP BY currency_code
        ORDER BY SUM(current_balance) DESC
      `);

      // 按银行名称统计
      const [bankStats] = await db.pool.execute(`
        SELECT 
          bank_name,
          COUNT(*) as account_count,
          SUM(current_balance) as total_balance
        FROM bank_accounts
        GROUP BY bank_name
        ORDER BY COUNT(*) DESC
      `);

      return {
        summary: {
          ...totalResult[0],
          total_in_last_month: parseFloat(monthlyStats[0].total_in_month || 0),
          total_out_last_month: parseFloat(monthlyStats[0].total_out_month || 0),
        },
        currency_stats: currencyStats,
        bank_stats: bankStats,
      };
    } catch (error) {
      logger.error('获取银行账户统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 获取现金交易分类统计
   */
  static async getCashTransactionCategoryStats(filters = {}) {
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (filters.startDate) {
        whereClause += ' AND transaction_date >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND transaction_date <= ?';
        params.push(filters.endDate);
      }

      const query = `
        SELECT
          category,
          transaction_type,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM cash_transactions
        ${whereClause}
        GROUP BY category, transaction_type
        ORDER BY total_amount DESC
      `;

      const [rows] = await db.pool.execute(query, params);
      return rows;
    } catch (error) {
      logger.error('获取现金交易分类统计失败:', error);
      throw error;
    }
  }
}

module.exports = CashReportsModel;
