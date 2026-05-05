/**
 * enhancedReportsController.js
 * @description 增强的财务报表控制器 - 基于真实数据
 * @author 系统
 * @date 2025-09-17
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const FinancialReportsService = require('../../services/business/FinancialReportsService');
const { validationResult } = require('express-validator');

/**
 * 增强的财务报表控制器
 * 提供基于真实总账数据的财务报表功能
 */
const enhancedReportsController = {
  /**
   * 获取资产负债表（基于真实数据）
   */
  getBalanceSheet: async (req, res) => {
    try {
      // 验证输入参数
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '参数验证失败', 'BAD_REQUEST', 400);
      }

      const { reportDate, compareDate, unit = 1 } = req.query;

      if (!reportDate) {
        return ResponseHandler.error(res, '请提供报表日期', 'BAD_REQUEST', 400);
      }

      // 验证日期格式
      if (!enhancedReportsController.isValidDate(reportDate)) {
        return ResponseHandler.error(
          res,
          '报表日期格式不正确，请使用YYYY-MM-DD格式',
          'BAD_REQUEST',
          400
        );
      }

      if (compareDate && !enhancedReportsController.isValidDate(compareDate)) {
        return ResponseHandler.error(
          res,
          '对比日期格式不正确，请使用YYYY-MM-DD格式',
          'BAD_REQUEST',
          400
        );
      }

      // 验证金额单位
      const validUnits = [1, 1000, 10000, 100000, 1000000];
      const unitValue = parseInt(unit);
      if (!validUnits.includes(unitValue)) {
        return ResponseHandler.error(
          res,
          '金额单位不正确，支持的单位：1(元), 1000(千元), 10000(万元), 100000(十万元), 1000000(百万元)',
          'BAD_REQUEST',
          400
        );
      }

      // 生成资产负债表
      const balanceSheet = await FinancialReportsService.generateBalanceSheet(
        reportDate,
        compareDate,
        unitValue
      );

      ResponseHandler.success(res, balanceSheet, '资产负债表生成成功');
    } catch (error) {
      logger.error('获取资产负债表失败:', error);
      ResponseHandler.error(res, '获取资产负债表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取利润表（基于真实数据）
   */
  getIncomeStatement: async (req, res) => {
    try {
      // 验证输入参数
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '参数验证失败', 'BAD_REQUEST', 400);
      }

      const {
        startDate,
        endDate,
        compareStartDate,
        compareEndDate,
        unit = 1,
        level = 0,
      } = req.query;

      if (!startDate || !endDate) {
        return ResponseHandler.error(res, '请提供开始日期和结束日期', 'BAD_REQUEST', 400);
      }

      // 验证日期格式
      if (
        !enhancedReportsController.isValidDate(startDate) ||
        !enhancedReportsController.isValidDate(endDate)
      ) {
        return ResponseHandler.error(
          res,
          '日期格式不正确，请使用YYYY-MM-DD格式',
          'BAD_REQUEST',
          400
        );
      }

      // 验证日期逻辑
      if (new Date(startDate) > new Date(endDate)) {
        return ResponseHandler.error(res, '开始日期不能大于结束日期', 'BAD_REQUEST', 400);
      }

      // 验证对比期间日期
      if (compareStartDate && compareEndDate) {
        if (
          !enhancedReportsController.isValidDate(compareStartDate) ||
          !enhancedReportsController.isValidDate(compareEndDate)
        ) {
          return ResponseHandler.error(
            res,
            '对比期间日期格式不正确，请使用YYYY-MM-DD格式',
            'BAD_REQUEST',
            400
          );
        }

        if (new Date(compareStartDate) > new Date(compareEndDate)) {
          return ResponseHandler.error(res, '对比期间开始日期不能大于结束日期', 'BAD_REQUEST', 400);
        }
      }

      // 验证金额单位
      const validUnits = [1, 1000, 10000, 100000, 1000000];
      const unitValue = parseInt(unit);
      if (!validUnits.includes(unitValue)) {
        return ResponseHandler.error(res, '金额单位不正确', 'BAD_REQUEST', 400);
      }

      // 验证显示层级
      const levelValue = parseInt(level);
      if (levelValue < 0 || levelValue > 4) {
        return ResponseHandler.error(res, '显示层级不正确', 'BAD_REQUEST', 400);
      }

      // 生成利润表
      const incomeStatement = await FinancialReportsService.generateIncomeStatement(
        startDate,
        endDate,
        compareStartDate,
        compareEndDate,
        unitValue,
        levelValue
      );

      ResponseHandler.success(res, incomeStatement, '利润表生成成功');
    } catch (error) {
      logger.error('获取利润表失败:', error);
      ResponseHandler.error(res, '获取利润表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取出纳报表/现金流量表（基于真实数据）
   */
  getCashFlowStatement: async (req, res) => {
    try {
      const { startDate, endDate, unit = 1 } = req.query;

      if (!startDate || !endDate) {
        return ResponseHandler.error(res, '请提供开始日期和结束日期', 'BAD_REQUEST', 400);
      }

      // 验证日期格式
      if (
        !enhancedReportsController.isValidDate(startDate) ||
        !enhancedReportsController.isValidDate(endDate)
      ) {
        return ResponseHandler.error(
          res,
          '日期格式不正确，请使用YYYY-MM-DD格式',
          'BAD_REQUEST',
          400
        );
      }

      const unitValue = parseInt(unit) || 1;
      const db = require('../../config/db');

      // 计算上月日期范围（用于获取上月结存）
      const startDateObj = new Date(startDate);
      const lastMonthEnd = new Date(startDateObj);
      lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);


      // 获取所有银行账户
      const [accounts] = await db.pool.execute(
        `SELECT id, account_name, bank_name, current_balance
         FROM bank_accounts
         WHERE is_active = 1
         ORDER BY bank_name, account_name`
      );

      // 构建报表数据（批量查询消除 N+1）
      if (accounts.length === 0) {
        return ResponseHandler.success(res, { list: [], totals: {} });
      }

      const accountIds = accounts.map(a => a.id);
      const ph = accountIds.map(() => '?').join(',');
      const incomeTypes = "('存款', '转入', '利息', 'income', '收入', 'deposit', 'transfer_in', 'interest')";
      const expenseTypes = "('取款', '转出', '费用', 'expense', '支出', 'withdrawal', 'transfer_out', 'fee')";

      // 一次性查出本月收入
      const [incomeRows] = await db.pool.execute(
        `SELECT bank_account_id, COALESCE(SUM(amount), 0) as total
         FROM bank_transactions
         WHERE bank_account_id IN (${ph}) AND transaction_date BETWEEN ? AND ?
           AND transaction_type IN ${incomeTypes}
         GROUP BY bank_account_id`,
        [...accountIds, startDate, endDate]
      );
      const incomeMap = new Map(incomeRows.map(r => [r.bank_account_id, parseFloat(r.total) || 0]));

      // 一次性查出本月支出
      const [expenseRows] = await db.pool.execute(
        `SELECT bank_account_id, COALESCE(SUM(amount), 0) as total
         FROM bank_transactions
         WHERE bank_account_id IN (${ph}) AND transaction_date BETWEEN ? AND ?
           AND transaction_type IN ${expenseTypes}
         GROUP BY bank_account_id`,
        [...accountIds, startDate, endDate]
      );
      const expenseMap = new Map(expenseRows.map(r => [r.bank_account_id, parseFloat(r.total) || 0]));

      // 一次性查出历史总收入（startDate 之前）
      const [histIncomeRows] = await db.pool.execute(
        `SELECT bank_account_id, COALESCE(SUM(amount), 0) as total
         FROM bank_transactions
         WHERE bank_account_id IN (${ph}) AND transaction_date < ?
           AND transaction_type IN ${incomeTypes}
         GROUP BY bank_account_id`,
        [...accountIds, startDate]
      );
      const histIncomeMap = new Map(histIncomeRows.map(r => [r.bank_account_id, parseFloat(r.total) || 0]));

      // 一次性查出历史总支出（startDate 之前）
      const [histExpenseRows] = await db.pool.execute(
        `SELECT bank_account_id, COALESCE(SUM(amount), 0) as total
         FROM bank_transactions
         WHERE bank_account_id IN (${ph}) AND transaction_date < ?
           AND transaction_type IN ${expenseTypes}
         GROUP BY bank_account_id`,
        [...accountIds, startDate]
      );
      const histExpenseMap = new Map(histExpenseRows.map(r => [r.bank_account_id, parseFloat(r.total) || 0]));

      const reportData = [];
      for (const account of accounts) {
        const currentIncome = incomeMap.get(account.id) || 0;
        const currentExpense = expenseMap.get(account.id) || 0;
        const histIncome = histIncomeMap.get(account.id) || 0;
        const histExpense = histExpenseMap.get(account.id) || 0;
        const lastBalance = histIncome - histExpense;
        const currentBalance = lastBalance + currentIncome - currentExpense;

        reportData.push({
          id: account.id,
          name: `${account.bank_name} - ${account.account_name}`,
          type: 'account',
          lastMonthBalance: lastBalance / unitValue,
          currentMonthIncome: currentIncome / unitValue,
          currentMonthExpense: currentExpense / unitValue,
          currentMonthBalance: currentBalance / unitValue,
        });
      }

      // 添加合计行
      const totals = reportData.reduce(
        (acc, item) => ({
          lastMonthBalance: acc.lastMonthBalance + (item.lastMonthBalance || 0),
          currentMonthIncome: acc.currentMonthIncome + (item.currentMonthIncome || 0),
          currentMonthExpense: acc.currentMonthExpense + (item.currentMonthExpense || 0),
          currentMonthBalance: acc.currentMonthBalance + (item.currentMonthBalance || 0),
        }),
        {
          lastMonthBalance: 0,
          currentMonthIncome: 0,
          currentMonthExpense: 0,
          currentMonthBalance: 0,
        }
      );

      reportData.push({
        id: 'total',
        name: '合计',
        type: 'total',
        ...totals,
      });

      ResponseHandler.success(res, reportData, '出纳报表生成成功');
    } catch (error) {
      logger.error('获取出纳报表失败:', error);
      ResponseHandler.error(res, '获取出纳报表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取标准现金流量表（间接法）
   * 符合企业会计准则的标准现金流量表
   */
  getStandardCashFlowStatement: async (req, res) => {
    try {
      const { startDate, endDate, compareStartDate, compareEndDate, unit = 1 } = req.query;

      if (!startDate || !endDate) {
        return ResponseHandler.error(res, '请提供开始日期和结束日期', 'BAD_REQUEST', 400);
      }

      // 验证日期格式
      if (
        !enhancedReportsController.isValidDate(startDate) ||
        !enhancedReportsController.isValidDate(endDate)
      ) {
        return ResponseHandler.error(
          res,
          '日期格式不正确，请使用YYYY-MM-DD格式',
          'BAD_REQUEST',
          400
        );
      }

      // 验证日期逻辑
      if (new Date(startDate) > new Date(endDate)) {
        return ResponseHandler.error(res, '开始日期不能大于结束日期', 'BAD_REQUEST', 400);
      }

      // 验证对比期间日期
      if (compareStartDate && compareEndDate) {
        if (
          !enhancedReportsController.isValidDate(compareStartDate) ||
          !enhancedReportsController.isValidDate(compareEndDate)
        ) {
          return ResponseHandler.error(
            res,
            '对比期间日期格式不正确，请使用YYYY-MM-DD格式',
            'BAD_REQUEST',
            400
          );
        }

        if (new Date(compareStartDate) > new Date(compareEndDate)) {
          return ResponseHandler.error(res, '对比期间开始日期不能大于结束日期', 'BAD_REQUEST', 400);
        }
      }

      // 验证金额单位
      const validUnits = [1, 1000, 10000, 100000, 1000000];
      const unitValue = parseInt(unit);
      if (!validUnits.includes(unitValue)) {
        return ResponseHandler.error(res, '金额单位不正确', 'BAD_REQUEST', 400);
      }

      // 生成标准现金流量表
      const cashFlowStatement = await FinancialReportsService.generateCashFlowStatement(
        startDate,
        endDate,
        compareStartDate,
        compareEndDate,
        unitValue
      );

      ResponseHandler.success(res, cashFlowStatement, '现金流量表生成成功');
    } catch (error) {
      logger.error('获取现金流量表失败:', error);
      ResponseHandler.error(res, '获取现金流量表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取财务报表汇总信息
   */
  getReportsSummary: async (req, res) => {
    try {
      const { reportDate } = req.query;

      if (!reportDate) {
        return ResponseHandler.error(res, '请提供报表日期', 'BAD_REQUEST', 400);
      }

      // 获取基础财务数据汇总
      const assets = await FinancialReportsService.calculateAccountBalance('资产', reportDate);
      const liabilities = await FinancialReportsService.calculateAccountBalance('负债', reportDate);
      const equity = await FinancialReportsService.calculateAccountBalance(
        '所有者权益',
        reportDate
      );

      // 计算关键财务指标
      const totalAssets = assets.totalBalance;
      const totalLiabilities = liabilities.totalBalance;
      const totalEquity = equity.totalBalance;

      const summary = {
        reportDate,
        generatedAt: new Date().toISOString(),
        keyMetrics: {
          totalAssets: totalAssets,
          totalLiabilities: totalLiabilities,
          totalEquity: totalEquity,
          debtToAssetRatio:
            totalAssets > 0 ? ((totalLiabilities / totalAssets) * 100).toFixed(2) : 0,
          equityRatio: totalAssets > 0 ? ((totalEquity / totalAssets) * 100).toFixed(2) : 0,
          isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
        },
        accountCounts: {
          assetsCount: assets.accounts.length,
          liabilitiesCount: liabilities.accounts.length,
          equityCount: equity.accounts.length,
        },
      };

      ResponseHandler.success(res, summary, '财务报表汇总信息获取成功');
    } catch (error) {
      logger.error('获取财务报表汇总失败:', error);
      ResponseHandler.error(res, '获取财务报表汇总失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 验证日期格式
   * @param {string} dateString 日期字符串
   * @returns {boolean} 是否为有效日期
   */
  isValidDate: (dateString) => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) {
      return false;
    }

    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && dateString === date.toISOString().split('T')[0];
  },
};

module.exports = enhancedReportsController;
