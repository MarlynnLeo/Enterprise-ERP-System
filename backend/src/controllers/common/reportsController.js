/**
 * reportsController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const db = require('../../config/db');

/**
 * 财务报表控制器
 */
const reportsController = {
  /**
   * 获取资产负债表
   */
  getBalanceSheet: async (req, res) => {
    try {
      const { reportDate, compareDate, level = 0, unit = 1 } = req.query;

      if (!reportDate) {
        return ResponseHandler.error(res, '请提供报表日期', 'BAD_REQUEST', 400);
      }

      // 这里原本是造假的静态数字，现根据整站审查原则被移除
      // 财务统计需结合企业特定科目动态计算，不应由写死的数据顶替
      return ResponseHandler.error(res, '资产负债表功能核心级开发中，暂时不支持查询', 'NOT_IMPLEMENTED', 501);
    } catch (error) {
      ResponseHandler.error(res, '获取资产负债表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取利润表
   */
  getIncomeStatement: async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        compareStartDate,
        compareEndDate,
        level = 0,
        unit = 1,
      } = req.query;

      if (!startDate || !endDate) {
        return ResponseHandler.error(res, '请提供开始日期和结束日期', 'BAD_REQUEST', 400);
      }

      // 这里原本是造假的静态数字，现根据整站审查原则被移除。
      return ResponseHandler.error(res, '利润表功能核心级开发中，暂时不支持查询', 'NOT_IMPLEMENTED', 501);
    } catch (error) {
      ResponseHandler.error(res, '获取利润表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取出纳报表（现金流量表改为出纳报表）
   */
  getCashFlow: async (req, res) => {
    try {
      const { reportMonth, unit = 1 } = req.query;

      if (!reportMonth) {
        return ResponseHandler.error(res, '请提供报表月份', 'BAD_REQUEST', 400);
      }

      // 解析报表月份 (格式: 2025-08)
      const [year, month] = reportMonth.split('-');
      const reportYear = parseInt(year);
      const reportMonthNum = parseInt(month);

      // 计算上月和本月的日期范围
      const currentMonthStartStr = `${reportYear}-${month.padStart(2, '0')}-01`;

      // 计算当月最后一天
      const nextMonth = reportMonthNum === 12 ? 1 : reportMonthNum + 1;
      const nextYear = reportMonthNum === 12 ? reportYear + 1 : reportYear;
      const currentMonthEndStr = new Date(nextYear, nextMonth - 1, 0).toISOString().split('T')[0];

      // 计算上月日期范围
      const lastMonth = reportMonthNum === 1 ? 12 : reportMonthNum - 1;
      const lastYear = reportMonthNum === 1 ? reportYear - 1 : reportYear;
      const lastMonthStartStr = `${lastYear}-${lastMonth.toString().padStart(2, '0')}-01`;
      const lastMonthEndStr = new Date(reportYear, reportMonthNum - 1, 0)
        .toISOString()
        .split('T')[0];

      logger.info('日期范围:', {
        lastMonthStart: lastMonthStartStr,
        lastMonthEnd: lastMonthEndStr,
        currentMonthStart: currentMonthStartStr,
        currentMonthEnd: currentMonthEndStr,
      });

      const cashierReportData = [];

      // 1. 获取现金数据
      const cashData = await reportsController.getCashData(
        lastMonthStartStr,
        lastMonthEndStr,
        currentMonthStartStr,
        currentMonthEndStr
      );
      cashierReportData.push(cashData);

      // 2. 获取银行账户数据
      const bankData = await reportsController.getBankAccountsData(
        lastMonthStartStr,
        lastMonthEndStr,
        currentMonthStartStr,
        currentMonthEndStr
      );
      cashierReportData.push(...bankData);

      ResponseHandler.success(res, cashierReportData, '操作成功');
    } catch (error) {
      logger.error('获取出纳报表失败:', error);
      ResponseHandler.error(res, '获取出纳报表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取现金数据
   */
  getCashData: async (lastMonthStart, lastMonthEnd, currentMonthStart, currentMonthEnd) => {
    try {
      // 获取上月末现金余额（上月所有现金交易的累计）
      const [lastMonthResult] = await db.pool.execute(
        `
        SELECT
          COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE -amount END), 0) as balance
        FROM cash_transactions
        WHERE transaction_date <= ?
      `,
        [lastMonthEnd]
      );

      // 获取本月现金收入
      const [currentMonthIncome] = await db.pool.execute(
        `
        SELECT COALESCE(SUM(amount), 0) as income
        FROM cash_transactions
        WHERE transaction_type = 'income'
        AND transaction_date >= ? AND transaction_date <= ?
      `,
        [currentMonthStart, currentMonthEnd]
      );

      // 获取本月现金支出
      const [currentMonthExpense] = await db.pool.execute(
        `
        SELECT COALESCE(SUM(amount), 0) as expense
        FROM cash_transactions
        WHERE transaction_type = 'expense'
        AND transaction_date >= ? AND transaction_date <= ?
      `,
        [currentMonthStart, currentMonthEnd]
      );

      const lastMonthBalance = parseFloat(lastMonthResult[0].balance) || 0;
      const monthIncome = parseFloat(currentMonthIncome[0].income) || 0;
      const monthExpense = parseFloat(currentMonthExpense[0].expense) || 0;
      const currentBalance = lastMonthBalance + monthIncome - monthExpense;

      logger.info('现金数据:', {
        lastMonthBalance,
        monthIncome,
        monthExpense,
        currentBalance,
      });

      return {
        id: 1,
        name: '现金',
        type: 'cash',
        lastMonthBalance: lastMonthBalance,
        currentMonthIncome: monthIncome,
        currentMonthExpense: monthExpense,
        currentMonthBalance: currentBalance,
      };
    } catch (error) {
      logger.error('获取现金数据失败:', error);
      // 返回默认值
      return {
        id: 1,
        name: '现金',
        type: 'cash',
        lastMonthBalance: 0,
        currentMonthIncome: 0,
        currentMonthExpense: 0,
        currentMonthBalance: 0,
      };
    }
  },

  /**
   * 获取银行账户数据
   */
  getBankAccountsData: async (lastMonthStart, lastMonthEnd, currentMonthStart, currentMonthEnd) => {
    try {
      // 获取所有活跃的银行账户
      const [bankAccounts] = await db.pool.execute(`
        SELECT id, account_name, bank_name, currency_code, current_balance
        FROM bank_accounts
        WHERE is_active = true
        ORDER BY bank_name, account_name
      `);

      const bankData = [];
      let accountIndex = 2; // 从2开始，因为现金是1

      for (const account of bankAccounts) {
        // 获取上月末银行账户余额
        const [lastMonthBalance] = await db.pool.execute(
          `
          SELECT
            COALESCE(SUM(CASE WHEN transaction_type IN ('存款', '转入', '利息') THEN amount
                             WHEN transaction_type IN ('取款', '转出', '费用') THEN -amount
                             ELSE 0 END), 0) as balance
          FROM bank_transactions
          WHERE bank_account_id = ? AND transaction_date <= ?
        `,
          [account.id, lastMonthEnd]
        );

        // 获取本月银行收入
        const [currentMonthIncome] = await db.pool.execute(
          `
          SELECT COALESCE(SUM(amount), 0) as income
          FROM bank_transactions
          WHERE bank_account_id = ?
          AND transaction_type IN ('存款', '转入', '利息')
          AND transaction_date >= ? AND transaction_date <= ?
        `,
          [account.id, currentMonthStart, currentMonthEnd]
        );

        // 获取本月银行支出
        const [currentMonthExpense] = await db.pool.execute(
          `
          SELECT COALESCE(SUM(amount), 0) as expense
          FROM bank_transactions
          WHERE bank_account_id = ?
          AND transaction_type IN ('取款', '转出', '费用')
          AND transaction_date >= ? AND transaction_date <= ?
        `,
          [account.id, currentMonthStart, currentMonthEnd]
        );

        const lastBalance = parseFloat(lastMonthBalance[0].balance) || 0;
        const monthIncome = parseFloat(currentMonthIncome[0].income) || 0;
        const monthExpense = parseFloat(currentMonthExpense[0].expense) || 0;
        const currentBalance = lastBalance + monthIncome - monthExpense;

        // 构建账户名称
        let accountDisplayName = `银行存款（${account.bank_name}`;
        if (account.currency_code && account.currency_code !== 'CNY') {
          accountDisplayName += ` ${account.currency_code}`;
        }
        if (account.account_name && account.account_name !== account.bank_name) {
          accountDisplayName += ` ${account.account_name}`;
        }
        accountDisplayName += '）';

        bankData.push({
          id: accountIndex++,
          name: accountDisplayName,
          type: 'bank',
          bank: account.bank_name,
          currency: account.currency_code || 'CNY',
          lastMonthBalance: lastBalance,
          currentMonthIncome: monthIncome,
          currentMonthExpense: monthExpense,
          currentMonthBalance: currentBalance,
        });
      }

      return bankData;
    } catch (error) {
      logger.error('获取银行账户数据失败:', error);
      // 返回空数组
      return [];
    }
  },
};

module.exports = reportsController;
