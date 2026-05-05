/**
 * FinancialReportsService.js
 * @description 企业级财务报表服务 - 基于真实总账数据生成标准财务报表
 * @author ERP System
 * @date 2025-09-17
 * @version 2.0.0
 *
 * 功能特性:
 * - 符合企业会计准则的财务报表生成
 * - 基于真实总账数据的动态计算
 * - 支持多期间对比分析
 * - 完整的数据验证和错误处理
 * - 高性能的数据库查询优化
 * - 灵活的报表格式和单位配置
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');

/**
 * 企业级财务报表服务
 * 提供符合会计准则的标准财务报表功能
 */
class FinancialReportsService {
  /**
   * 计算科目余额
   * @param {string} accountType 科目类型（资产、负债、所有者权益、收入、成本、费用）
   * @param {string} reportDate 报表日期 (YYYY-MM-DD)
   * @param {string} compareDate 对比日期（可选）
   * @returns {Promise<Object>} 科目余额数据
   * @throws {Error} 当数据库操作失败时抛出错误
   */
  static async calculateAccountBalance(accountType, reportDate, compareDate = null) {
    const startTime = Date.now();
    let connection = null;

    try {
      // 参数验证
      this.validateAccountType(accountType);
      this.validateDateFormat(reportDate);
      if (compareDate) {
        this.validateDateFormat(compareDate);
      }

      connection = await db.pool.getConnection();

      // 获取指定类型的所有科目（优化查询，只获取必要字段）
      const [accounts] = await connection.execute(
        `SELECT id, account_code as code, account_name as name, account_type as type,
                parent_id, is_debit, currency_code
         FROM gl_accounts
         WHERE account_type = ? AND is_active = 1
         ORDER BY account_code`,
        [accountType]
      );

      if (accounts.length === 0) {
        logger.warn(`未找到科目类型为 ${accountType} 的活跃科目`);
        return this.createEmptyAccountBalanceResult(accountType, reportDate, compareDate);
      }

      // 批量计算科目余额（优化性能）
      const accountBalances = await this.batchCalculateAccountBalances(
        connection,
        accounts,
        reportDate,
        compareDate
      );

      // 计算汇总数据
      const totalBalance = accountBalances.reduce((sum, acc) => sum + acc.currentBalance, 0);
      const totalCompareBalance = compareDate
        ? accountBalances.reduce((sum, acc) => sum + (acc.compareBalance || 0), 0)
        : null;

      const result = {
        accountType,
        reportDate,
        compareDate,
        accounts: accountBalances,
        totalBalance,
        totalCompareBalance,
        accountCount: accounts.length,
        calculationTime: Date.now() - startTime,
      };

      logger.info(
        `科目余额计算完成: ${accountType}, 科目数量: ${accounts.length}, 耗时: ${result.calculationTime}ms`
      );
      return result;
    } catch (error) {
      logger.error('计算科目余额失败:', {
        accountType,
        reportDate,
        compareDate,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`计算科目余额失败: ${error.message}`, { cause: error });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * 批量计算科目余额（性能优化）
   * @param {Object} connection 数据库连接
   * @param {Array} accounts 科目列表
   * @param {string} reportDate 报表日期
   * @param {string} compareDate 对比日期
   * @returns {Promise<Array>} 科目余额数组
   */
  static async batchCalculateAccountBalances(connection, accounts, reportDate, compareDate) {
    const accountBalances = [];

    // 批量查询所有科目的余额（优化数据库查询）
    const accountIds = accounts.map((acc) => acc.id);
    const balanceData = await this.getBatchAccountBalances(
      connection,
      accountIds,
      reportDate,
      compareDate
    );

    for (const account of accounts) {
      const currentBalance = balanceData.current[account.id] || 0;
      const compareBalance = compareDate ? balanceData.compare[account.id] || 0 : null;

      accountBalances.push({
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        parentId: account.parent_id,
        isDebit: Boolean(account.is_debit),
        currencyCode: account.currency_code || 'CNY',
        currentBalance: this.roundAmount(currentBalance),
        compareBalance: compareBalance ? this.roundAmount(compareBalance) : null,
        change: compareBalance ? this.roundAmount(currentBalance - compareBalance) : null,
        changePercent: this.calculateChangePercent(currentBalance, compareBalance),
      });
    }

    return accountBalances;
  }

  /**
   * 批量获取科目余额（单次查询优化）
   * @param {Object} connection 数据库连接
   * @param {Array} accountIds 科目ID数组
   * @param {string} reportDate 报表日期
   * @param {string} compareDate 对比日期
   * @returns {Promise<Object>} 余额数据
   */
  static async getBatchAccountBalances(connection, accountIds, reportDate, compareDate) {
    const result = { current: {}, compare: {} };

    if (accountIds.length === 0) return result;

    // 查询当期余额
    const [currentBalances] = await connection.execute(
      `SELECT
         ei.account_id,
         ga.is_debit,
         COALESCE(SUM(ei.debit_amount), 0) as total_debit,
         COALESCE(SUM(ei.credit_amount), 0) as total_credit
       FROM gl_entry_items ei
       JOIN gl_entries e ON ei.entry_id = e.id
       JOIN gl_accounts ga ON ei.account_id = ga.id
       WHERE ei.account_id IN (${accountIds.map(() => '?').join(',')})
         AND e.entry_date <= ?
         AND e.is_posted = 1
       GROUP BY ei.account_id, ga.is_debit`,
      [...accountIds, reportDate]
    );

    // 计算当期余额
    currentBalances.forEach((row) => {
      const balance = row.is_debit
        ? row.total_debit - row.total_credit
        : row.total_credit - row.total_debit;
      result.current[row.account_id] = balance;
    });

    // 查询对比期余额
    if (compareDate) {
      const [compareBalances] = await connection.execute(
        `SELECT
           ei.account_id,
           ga.is_debit,
           COALESCE(SUM(ei.debit_amount), 0) as total_debit,
           COALESCE(SUM(ei.credit_amount), 0) as total_credit
         FROM gl_entry_items ei
         JOIN gl_entries e ON ei.entry_id = e.id
         JOIN gl_accounts ga ON ei.account_id = ga.id
         WHERE ei.account_id IN (${accountIds.map(() => '?').join(',')})
           AND e.entry_date <= ?
           AND e.is_posted = 1
         GROUP BY ei.account_id, ga.is_debit`,
        [...accountIds, compareDate]
      );

      compareBalances.forEach((row) => {
        const balance = row.is_debit
          ? row.total_debit - row.total_credit
          : row.total_credit - row.total_debit;
        result.compare[row.account_id] = balance;
      });
    }

    return result;
  }

  /**
   * 获取指定日期的科目余额（单个科目）
   * @param {Object} connection 数据库连接
   * @param {number} accountId 科目ID
   * @param {string} date 日期
   * @returns {Promise<number>} 科目余额
   */
  static async getAccountBalanceAtDate(connection, accountId, date) {
    try {
      const [result] = await connection.execute(
        `SELECT
           ga.is_debit,
           COALESCE(SUM(ei.debit_amount), 0) as total_debit,
           COALESCE(SUM(ei.credit_amount), 0) as total_credit
         FROM gl_accounts ga
         LEFT JOIN gl_entry_items ei ON ga.id = ei.account_id
         LEFT JOIN gl_entries e ON ei.entry_id = e.id AND e.entry_date <= ? AND e.is_posted = 1
         WHERE ga.id = ?
         GROUP BY ga.id, ga.is_debit`,
        [date, accountId]
      );

      if (result.length === 0) return 0;

      const { is_debit, total_debit, total_credit } = result[0];
      const totalDebit = parseFloat(total_debit || 0);
      const totalCredit = parseFloat(total_credit || 0);

      return is_debit ? totalDebit - totalCredit : totalCredit - totalDebit;
    } catch (error) {
      logger.error('获取科目余额失败:', { accountId, date, error: error.message });
      throw error;
    }
  }

  /**
   * 生成资产负债表
   * @param {string} reportDate 报表日期 (YYYY-MM-DD)
   * @param {string} compareDate 对比日期（可选）
   * @param {number} unit 金额单位（1=元, 1000=千元, 10000=万元）
   * @returns {Promise<Object>} 标准资产负债表数据
   * @throws {Error} 当参数验证失败或数据库操作失败时抛出错误
   */
  static async generateBalanceSheet(reportDate, compareDate = null, unit = 1) {
    const startTime = Date.now();

    try {
      // 参数验证
      this.validateReportParams({ reportDate, compareDate, unit });

      logger.info('开始生成资产负债表', { reportDate, compareDate, unit });

      // 并行计算各类科目余额（性能优化）
      const [assets, liabilities, equity] = await Promise.all([
        this.calculateAccountBalance('资产', reportDate, compareDate),
        this.calculateAccountBalance('负债', reportDate, compareDate),
        this.calculateAccountBalance('所有者权益', reportDate, compareDate),
      ]);

      // 计算本年利润（从年初到报表日期的收入-成本-费用）
      const yearStart = `${reportDate.substring(0, 4)}-01-01`;
      let currentYearProfit = 0;
      let compareYearProfit = null;

      try {
        const [income, cost, expenses] = await Promise.all([
          this.calculatePeriodAmount('收入', yearStart, reportDate, null, null),
          this.calculatePeriodAmount('成本', yearStart, reportDate, null, null),
          this.calculatePeriodAmount('费用', yearStart, reportDate, null, null),
        ]);
        currentYearProfit = income.totalAmount - cost.totalAmount - expenses.totalAmount;

        // 如果有对比日期，计算对比期的本年利润
        if (compareDate) {
          const compareYearStart = `${compareDate.substring(0, 4)}-01-01`;
          const [compareIncome, compareCost, compareExpenses] = await Promise.all([
            this.calculatePeriodAmount('收入', compareYearStart, compareDate, null, null),
            this.calculatePeriodAmount('成本', compareYearStart, compareDate, null, null),
            this.calculatePeriodAmount('费用', compareYearStart, compareDate, null, null),
          ]);
          compareYearProfit =
            compareIncome.totalAmount - compareCost.totalAmount - compareExpenses.totalAmount;
        }
      } catch (err) {
        logger.warn('计算本年利润时出错，使用0代替:', err.message);
      }

      // 计算总额（所有者权益需要加上本年利润）
      const assetsTotal = this.roundAmount(assets.totalBalance / unit);
      const liabilitiesTotal = this.roundAmount(liabilities.totalBalance / unit);
      const equityBeforeProfit = this.roundAmount(equity.totalBalance / unit);
      const currentYearProfitAmount = this.roundAmount(currentYearProfit / unit);
      const equityTotal = this.roundAmount(equityBeforeProfit + currentYearProfitAmount);
      const liabilitiesAndEquityTotal = this.roundAmount(liabilitiesTotal + equityTotal);

      // 平衡验证（会计恒等式：资产 = 负债 + 所有者权益）
      const balanceDifference = Math.abs(assetsTotal - liabilitiesAndEquityTotal);
      const isBalanced = balanceDifference < 0.01;

      if (!isBalanced) {
        logger.warn('资产负债表不平衡', {
          assetsTotal,
          liabilitiesAndEquityTotal,
          difference: balanceDifference,
        });
      }

      // 将本年利润添加到权益科目列表
      const equityAccountsWithProfit = [...equity.accounts];
      equityAccountsWithProfit.push({
        id: 'current-year-profit',
        code: 'CYP',
        name: '本年利润',
        type: '所有者权益',
        currentBalance: currentYearProfit,
        compareBalance: compareYearProfit,
        isCalculated: true,
      });

      // 构建标准资产负债表结构
      const balanceSheet = {
        reportInfo: this.formatReportInfo({ reportDate, compareDate, unit }),
        summary: {
          assetsTotal,
          liabilitiesTotal,
          equityTotal,
          equityBeforeProfit,
          currentYearProfit: currentYearProfitAmount,
          liabilitiesAndEquityTotal,
          isBalanced,
          balanceDifference: this.roundAmount(balanceDifference),
          calculationTime: Date.now() - startTime,
        },
        assets: {
          title: '资产',
          code: 'ASSETS',
          totalAmount: assetsTotal,
          totalCompareAmount: assets.totalCompareBalance
            ? this.roundAmount(assets.totalCompareBalance / unit)
            : null,
          accountCount: assets.accountCount,
          items: this.formatAccountsForReport(assets.accounts, unit),
          subCategories: this.categorizeAssets(assets.accounts, unit),
        },
        liabilities: {
          title: '负债',
          code: 'LIABILITIES',
          totalAmount: liabilitiesTotal,
          totalCompareAmount: liabilities.totalCompareBalance
            ? this.roundAmount(liabilities.totalCompareBalance / unit)
            : null,
          accountCount: liabilities.accountCount,
          items: this.formatAccountsForReport(liabilities.accounts, unit),
          subCategories: this.categorizeLiabilities(liabilities.accounts, unit),
        },
        equity: {
          title: '所有者权益',
          code: 'EQUITY',
          totalAmount: equityTotal,
          totalCompareAmount: equity.totalCompareBalance
            ? this.roundAmount((equity.totalCompareBalance + (compareYearProfit || 0)) / unit)
            : null,
          accountCount: equity.accountCount + 1, // 包含本年利润
          items: this.formatAccountsForReport(equityAccountsWithProfit, unit),
          subCategories: this.categorizeEquity(equityAccountsWithProfit, unit),
        },
      };

      logger.info('资产负债表生成完成', {
        reportDate,
        assetsTotal,
        liabilitiesTotal,
        equityTotal,
        currentYearProfit: currentYearProfitAmount,
        isBalanced,
        calculationTime: balanceSheet.summary.calculationTime,
      });

      return balanceSheet;
    } catch (error) {
      logger.error('生成资产负债表失败:', {
        reportDate,
        compareDate,
        unit,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`生成资产负债表失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 生成利润表
   * @param {string} startDate 开始日期
   * @param {string} endDate 结束日期
   * @param {string} compareStartDate 对比开始日期（可选）
   * @param {string} compareEndDate 对比结束日期（可选）
   * @param {number} unit 金额单位
   * @param {number} level 显示层级（0=所有明细，1-4=指定层级）
   * @returns {Array} 利润表数据数组
   */
  static async generateIncomeStatement(
    startDate,
    endDate,
    compareStartDate = null,
    compareEndDate = null,
    unit = 1
  ) {
    try {
      // 计算收入、成本和费用
      const income = await this.calculatePeriodAmount(
        '收入',
        startDate,
        endDate,
        compareStartDate,
        compareEndDate
      );
      const cost = await this.calculatePeriodAmount(
        '成本',
        startDate,
        endDate,
        compareStartDate,
        compareEndDate
      );
      const expenses = await this.calculatePeriodAmount(
        '费用',
        startDate,
        endDate,
        compareStartDate,
        compareEndDate
      );

      // 计算毛利润 = 收入 - 成本
      const grossProfit = income.totalAmount - cost.totalAmount;
      const compareGrossProfit =
        income.totalCompareAmount !== null && cost.totalCompareAmount !== null
          ? income.totalCompareAmount - cost.totalCompareAmount
          : null;

      // 计算净利润 = 毛利润 - 费用 = 收入 - 成本 - 费用
      const netIncome = grossProfit - expenses.totalAmount;
      const compareNetIncome =
        compareGrossProfit !== null && expenses.totalCompareAmount !== null
          ? compareGrossProfit - expenses.totalCompareAmount
          : null;

      // 构建前端期望的数组格式数据
      const reportData = [];
      let rowNum = 1;

      // 1. 营业收入部分
      const incomeItems = income.accounts
        .filter((acc) => acc.currentAmount !== 0 || (acc.compareAmount && acc.compareAmount !== 0))
        .map((acc) => ({
          id: `income-${acc.id}`,
          name: acc.name,
          code: acc.code,
          rowNum: rowNum++,
          amount: acc.currentAmount / unit,
          compareAmount: acc.compareAmount ? acc.compareAmount / unit : null,
          level: 1,
        }));

      if (incomeItems.length > 0 || income.totalAmount !== 0) {
        reportData.push({
          id: 'income-total',
          name: '一、营业收入',
          code: 'INCOME',
          rowNum: rowNum++,
          amount: income.totalAmount / unit,
          compareAmount: income.totalCompareAmount ? income.totalCompareAmount / unit : null,
          level: 0,
          children: incomeItems.length > 0 ? incomeItems : undefined,
        });
      }

      // 2. 营业成本部分（新增）
      const costItems = cost.accounts
        .filter((acc) => acc.currentAmount !== 0 || (acc.compareAmount && acc.compareAmount !== 0))
        .map((acc) => ({
          id: `cost-${acc.id}`,
          name: acc.name,
          code: acc.code,
          rowNum: rowNum++,
          amount: -acc.currentAmount / unit, // 成本显示为负数
          compareAmount: acc.compareAmount ? -acc.compareAmount / unit : null,
          level: 1,
        }));

      if (costItems.length > 0 || cost.totalAmount !== 0) {
        reportData.push({
          id: 'cost-total',
          name: '减：营业成本',
          code: 'COST',
          rowNum: rowNum++,
          amount: -cost.totalAmount / unit, // 成本显示为负数
          compareAmount: cost.totalCompareAmount ? -cost.totalCompareAmount / unit : null,
          level: 0,
          children: costItems.length > 0 ? costItems : undefined,
        });
      }

      // 3. 毛利润（新增）
      reportData.push({
        id: 'gross-profit',
        name: '二、毛利润',
        code: 'GROSS_PROFIT',
        rowNum: rowNum++,
        amount: grossProfit / unit,
        compareAmount: compareGrossProfit ? compareGrossProfit / unit : null,
        level: 0,
        isCalculated: true,
      });

      // 4. 营业费用部分
      const expenseItems = expenses.accounts
        .filter((acc) => acc.currentAmount !== 0 || (acc.compareAmount && acc.compareAmount !== 0))
        .map((acc) => ({
          id: `expense-${acc.id}`,
          name: acc.name,
          code: acc.code,
          rowNum: rowNum++,
          amount: -acc.currentAmount / unit, // 费用显示为负数
          compareAmount: acc.compareAmount ? -acc.compareAmount / unit : null,
          level: 1,
        }));

      if (expenseItems.length > 0 || expenses.totalAmount !== 0) {
        reportData.push({
          id: 'expense-total',
          name: '减：营业费用',
          code: 'EXPENSE',
          rowNum: rowNum++,
          amount: -expenses.totalAmount / unit, // 费用显示为负数
          compareAmount: expenses.totalCompareAmount ? -expenses.totalCompareAmount / unit : null,
          level: 0,
          children: expenseItems.length > 0 ? expenseItems : undefined,
        });
      }

      // 5. 净利润
      reportData.push({
        id: 'net-income',
        name: '三、净利润',
        code: 'NET_INCOME',
        rowNum: rowNum++,
        amount: netIncome / unit,
        compareAmount: compareNetIncome ? compareNetIncome / unit : null,
        level: 0,
        isCalculated: true,
      });

      return reportData;
    } catch (error) {
      logger.error('生成利润表失败:', error);
      throw error;
    }
  }

  /**
   * 计算期间发生额
   * @param {string} accountType 科目类型
   * @param {string} startDate 开始日期
   * @param {string} endDate 结束日期
   * @param {string} compareStartDate 对比开始日期
   * @param {string} compareEndDate 对比结束日期
   * @returns {Object} 期间发生额数据
   */
  static async calculatePeriodAmount(
    accountType,
    startDate,
    endDate,
    compareStartDate = null,
    compareEndDate = null
  ) {
    try {
      const connection = await db.pool.getConnection();

      try {
        // 获取指定类型的所有科目
        const [accounts] = await connection.execute(
          `SELECT id, account_code as code, account_name as name, account_type as type, is_debit
           FROM gl_accounts
           WHERE account_type = ? AND is_active = true
           ORDER BY account_code`,
          [accountType]
        );

        logger.debug(
          `calculatePeriodAmount: 账户类型=${accountType}, 找到${accounts.length}个科目, 日期范围=${startDate} 至 ${endDate}`
        );

        const accountAmounts = [];

        for (const account of accounts) {
          // 计算当期发生额（传入is_debit避免N+1查询）
          const currentAmount = await this.getAccountPeriodAmount(
            connection,
            account.id,
            startDate,
            endDate,
            account.is_debit
          );
          let compareAmount = null;

          if (compareStartDate && compareEndDate) {
            compareAmount = await this.getAccountPeriodAmount(
              connection,
              account.id,
              compareStartDate,
              compareEndDate,
              account.is_debit
            );
          }

          accountAmounts.push({
            id: account.id,
            code: account.code,
            name: account.name,
            type: account.type,
            isDebit: account.is_debit,
            currentAmount,
            compareAmount,
            change: compareAmount ? currentAmount - compareAmount : null,
            changePercent:
              compareAmount && compareAmount !== 0
                ? (((currentAmount - compareAmount) / Math.abs(compareAmount)) * 100).toFixed(2)
                : null,
          });
        }

        return {
          accountType,
          startDate,
          endDate,
          compareStartDate,
          compareEndDate,
          accounts: accountAmounts,
          totalAmount: accountAmounts.reduce((sum, acc) => sum + acc.currentAmount, 0),
          totalCompareAmount: compareStartDate
            ? accountAmounts.reduce((sum, acc) => sum + (acc.compareAmount || 0), 0)
            : null,
        };
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('计算期间发生额失败:', error);
      throw error;
    }
  }

  /**
   * 获取科目期间发生额
   * @param {Object} connection 数据库连接
   * @param {number} accountId 科目ID
   * @param {string} startDate 开始日期
   * @param {string} endDate 结束日期
   * @param {boolean} isDebit 是否为借方科目（可选，传入可避免额外查询）
   * @returns {number} 期间发生额
   */
  static async getAccountPeriodAmount(connection, accountId, startDate, endDate, isDebit = null) {
    try {
      const [result] = await connection.execute(
        `SELECT
           COALESCE(SUM(debit_amount), 0) as total_debit,
           COALESCE(SUM(credit_amount), 0) as total_credit
         FROM gl_entry_items ei
         JOIN gl_entries e ON ei.entry_id = e.id
         WHERE ei.account_id = ?
           AND e.entry_date >= ?
           AND e.entry_date <= ?
           AND e.is_posted = 1`,
        [accountId, startDate, endDate]
      );

      const totalDebit = parseFloat(result[0].total_debit || 0);
      const totalCredit = parseFloat(result[0].total_credit || 0);

      // 如果未传入is_debit，则查询（保持向后兼容）
      let isDebitAccount = isDebit;
      if (isDebitAccount === null) {
        const [accountInfo] = await connection.execute(
          'SELECT is_debit FROM gl_accounts WHERE id = ?',
          [accountId]
        );
        isDebitAccount = accountInfo[0]?.is_debit;
      }

      // [M-7] 对于损益类科目，取净额而非单边发生额
      // 收入类(贷方科目) = 贷方 - 借方（冲销分录如销售退回记在借方，应被扣减）
      // 费用/成本类(借方科目) = 借方 - 贷方（费用冲回记在贷方，应被扣减）
      return isDebitAccount ? (totalDebit - totalCredit) : (totalCredit - totalDebit);
    } catch (error) {
      logger.error('获取科目期间发生额失败:', error);
      throw error;
    }
  }

  /**
   * 格式化科目数据用于报表显示
   * @param {Array} accounts 科目数组
   * @param {number} unit 金额单位
   * @returns {Array} 格式化后的科目数据
   */
  static formatAccountsForReport(accounts, unit) {
    return accounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      amount: account.currentBalance
        ? account.currentBalance / unit
        : account.currentAmount
          ? account.currentAmount / unit
          : 0,
      compareAmount: account.compareBalance
        ? account.compareBalance / unit
        : account.compareAmount
          ? account.compareAmount / unit
          : null,
      change: account.change ? account.change / unit : null,
      changePercent: account.changePercent,
    }));
  }

  /**
   * 获取金额单位文本
   * @param {number} unit 金额单位
   * @returns {string} 单位文本
   */
  static getUnitText(unit) {
    const unitMap = {
      1: '元',
      1000: '千元',
      10000: '万元',
      100000: '十万元',
      1000000: '百万元',
    };
    return unitMap[unit] || '元';
  }

  // ==================== 报表格式化方法 ====================

  // 重复的 formatAccountsForReport 方法已删除（保留第一个定义）

  /**
   * 资产分类
   * @param {Array} assets 资产科目数组
   * @param {number} unit 金额单位
   * @returns {Object} 分类后的资产
   */
  static categorizeAssets(assets, unit) {
    const categories = {
      currentAssets: { title: '流动资产', items: [], total: 0 },
      nonCurrentAssets: { title: '非流动资产', items: [], total: 0 },
    };

    assets.forEach((asset) => {
      const amount = this.roundAmount(asset.currentBalance / unit);
      const item = {
        code: asset.code,
        name: asset.name,
        amount,
        compareAmount: asset.compareBalance ? this.roundAmount(asset.compareBalance / unit) : null,
      };

      // 根据科目代码分类（简化分类逻辑）
      if (
        asset.code.startsWith('100') ||
        asset.code.startsWith('110') ||
        asset.code.startsWith('120') ||
        asset.code.startsWith('130')
      ) {
        categories.currentAssets.items.push(item);
        categories.currentAssets.total += amount;
      } else {
        categories.nonCurrentAssets.items.push(item);
        categories.nonCurrentAssets.total += amount;
      }
    });

    return categories;
  }

  /**
   * 负债分类
   * @param {Array} liabilities 负债科目数组
   * @param {number} unit 金额单位
   * @returns {Object} 分类后的负债
   */
  static categorizeLiabilities(liabilities, unit) {
    const categories = {
      currentLiabilities: { title: '流动负债', items: [], total: 0 },
      nonCurrentLiabilities: { title: '非流动负债', items: [], total: 0 },
    };

    liabilities.forEach((liability) => {
      const amount = this.roundAmount(liability.currentBalance / unit);
      const item = {
        code: liability.code,
        name: liability.name,
        amount,
        compareAmount: liability.compareBalance
          ? this.roundAmount(liability.compareBalance / unit)
          : null,
      };

      // 根据科目代码分类
      if (
        liability.code.startsWith('200') ||
        liability.code.startsWith('210') ||
        liability.code.startsWith('220')
      ) {
        categories.currentLiabilities.items.push(item);
        categories.currentLiabilities.total += amount;
      } else {
        categories.nonCurrentLiabilities.items.push(item);
        categories.nonCurrentLiabilities.total += amount;
      }
    });

    return categories;
  }

  /**
   * 所有者权益分类
   * @param {Array} equity 权益科目数组
   * @param {number} unit 金额单位
   * @returns {Object} 分类后的权益
   */
  static categorizeEquity(equity, unit) {
    const categories = {
      paidInCapital: { title: '实收资本', items: [], total: 0 },
      retainedEarnings: { title: '留存收益', items: [], total: 0 },
      other: { title: '其他权益', items: [], total: 0 },
    };

    equity.forEach((equityItem) => {
      const amount = this.roundAmount(equityItem.currentBalance / unit);
      const item = {
        code: equityItem.code,
        name: equityItem.name,
        amount,
        compareAmount: equityItem.compareBalance
          ? this.roundAmount(equityItem.compareBalance / unit)
          : null,
      };

      // 根据科目代码分类
      if (equityItem.code.startsWith('300') || equityItem.code.startsWith('310')) {
        categories.paidInCapital.items.push(item);
        categories.paidInCapital.total += amount;
      } else if (equityItem.code.startsWith('320') || equityItem.code.startsWith('330')) {
        categories.retainedEarnings.items.push(item);
        categories.retainedEarnings.total += amount;
      } else {
        categories.other.items.push(item);
        categories.other.total += amount;
      }
    });

    return categories;
  }

  // ==================== 验证和工具方法 ====================

  /**
   * 验证科目类型
   * @param {string} accountType 科目类型
   * @throws {Error} 无效的科目类型
   */
  static validateAccountType(accountType) {
    const validTypes = ['资产', '负债', '所有者权益', '收入', '成本', '费用'];
    if (!validTypes.includes(accountType)) {
      throw new Error(`无效的科目类型: ${accountType}，支持的类型: ${validTypes.join(', ')}`);
    }
  }

  /**
   * 验证日期格式
   * @param {string} dateString 日期字符串
   * @throws {Error} 无效的日期格式
   */
  static validateDateFormat(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) {
      throw new Error(`无效的日期格式: ${dateString}，请使用YYYY-MM-DD格式`);
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime()) || dateString !== date.toISOString().split('T')[0]) {
      throw new Error(`无效的日期: ${dateString}`);
    }
  }

  /**
   * 验证金额单位
   * @param {number} unit 金额单位
   * @throws {Error} 无效的金额单位
   */
  static validateUnit(unit) {
    const validUnits = [1, 1000, 10000, 100000, 1000000];
    if (!validUnits.includes(unit)) {
      throw new Error(`无效的金额单位: ${unit}，支持的单位: ${validUnits.join(', ')}`);
    }
  }

  /**
   * 金额四舍五入
   * @param {number} amount 金额
   * @param {number} precision 精度（小数位数）
   * @returns {number} 四舍五入后的金额
   */
  static roundAmount(amount, precision = 2) {
    if (typeof amount !== 'number' || isNaN(amount)) return 0;
    return Math.round(amount * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  /**
   * 计算变动百分比
   * @param {number} current 当前值
   * @param {number} compare 对比值
   * @returns {string|null} 变动百分比
   */
  static calculateChangePercent(current, compare) {
    if (!compare || compare === 0) return null;
    const change = ((current - compare) / Math.abs(compare)) * 100;
    return this.roundAmount(change, 2).toFixed(2);
  }

  /**
   * 创建空的科目余额结果
   * @param {string} accountType 科目类型
   * @param {string} reportDate 报表日期
   * @param {string} compareDate 对比日期
   * @returns {Object} 空结果对象
   */
  static createEmptyAccountBalanceResult(accountType, reportDate, compareDate) {
    return {
      accountType,
      reportDate,
      compareDate,
      accounts: [],
      totalBalance: 0,
      totalCompareBalance: compareDate ? 0 : null,
      accountCount: 0,
      calculationTime: 0,
    };
  }

  /**
   * 创建空的期间发生额结果
   * @param {string} accountType 科目类型
   * @param {string} startDate 开始日期
   * @param {string} endDate 结束日期
   * @param {string} compareStartDate 对比开始日期
   * @param {string} compareEndDate 对比结束日期
   * @returns {Object} 空结果对象
   */
  static createEmptyPeriodAmountResult(
    accountType,
    startDate,
    endDate,
    compareStartDate,
    compareEndDate
  ) {
    return {
      accountType,
      startDate,
      endDate,
      compareStartDate,
      compareEndDate,
      accounts: [],
      totalAmount: 0,
      totalCompareAmount: compareStartDate ? 0 : null,
      accountCount: 0,
      calculationTime: 0,
    };
  }

  /**
   * 验证报表生成参数
   * @param {Object} params 参数对象
   * @throws {Error} 参数验证失败
   */
  static validateReportParams(params) {
    const { reportDate, compareDate, unit, startDate, endDate } = params;

    if (reportDate) {
      this.validateDateFormat(reportDate);
    }

    if (compareDate) {
      this.validateDateFormat(compareDate);
    }

    if (startDate && endDate) {
      this.validateDateFormat(startDate);
      this.validateDateFormat(endDate);

      if (new Date(startDate) > new Date(endDate)) {
        throw new Error('开始日期不能大于结束日期');
      }
    }

    if (unit) {
      this.validateUnit(unit);
    }
  }

  /**
   * 格式化报表生成信息
   * @param {Object} params 参数对象
   * @returns {Object} 格式化的报表信息
   */
  static formatReportInfo(params) {
    const { reportDate, compareDate, startDate, endDate, unit = 1 } = params;

    return {
      reportDate,
      compareDate,
      startDate,
      endDate,
      unit,
      unitText: this.getUnitText(unit),
      generatedAt: new Date().toISOString(),
      generatedBy: 'FinancialReportsService v2.0.0',
    };
  }

  /**
   * 生成标准现金流量表（间接法）
   * @param {string} startDate 开始日期 (YYYY-MM-DD)
   * @param {string} endDate 结束日期 (YYYY-MM-DD)
   * @param {string} compareStartDate 对比开始日期（可选）
   * @param {string} compareEndDate 对比结束日期（可选）
   * @param {number} unit 金额单位（1=元, 1000=千元, 10000=万元）
   * @returns {Object} 现金流量表数据
   */
  static async generateCashFlowStatement(
    startDate,
    endDate,
    compareStartDate = null,
    compareEndDate = null,
    unit = 1
  ) {
    try {
      logger.info('开始生成现金流量表', {
        startDate,
        endDate,
        compareStartDate,
        compareEndDate,
        unit,
      });
      const connection = await db.pool.getConnection();

      try {
        // 1. 获取期初期末资产负债表数据用于计算变动
        const periodStartDate = new Date(startDate);
        periodStartDate.setDate(periodStartDate.getDate() - 1);
        const periodStart = periodStartDate.toISOString().slice(0, 10);

        // 2. 计算净利润（从利润表）
        const incomeData = await this.calculatePeriodAmount('收入', startDate, endDate);
        const costData = await this.calculatePeriodAmount('成本', startDate, endDate);
        const expenseData = await this.calculatePeriodAmount('费用', startDate, endDate);
        const netProfit = incomeData.totalAmount - costData.totalAmount - expenseData.totalAmount;

        // 3. 获取资产负债表项目的期初期末余额用于计算变动


        // 4. 计算各项目变动
        // 经营活动现金流项目
        const depreciation = await this.getAccountChangeByCode(
          connection,
          '1602',
          periodStart,
          endDate
        ); // 累计折旧
        const amortization = await this.getAccountChangeByCode(
          connection,
          '1702',
          periodStart,
          endDate
        ); // 累计摊销
        const receivablesChange = await this.getAccountChangeByCode(
          connection,
          '1122',
          periodStart,
          endDate
        ); // 应收账款
        const inventoryChange = await this.getAccountChangeByCode(
          connection,
          '1403',
          periodStart,
          endDate
        ); // 库存商品
        const payablesChange = await this.getAccountChangeByCode(
          connection,
          '2202',
          periodStart,
          endDate
        ); // 应付账款
         // 预付账款
         // 预收账款

        // 投资活动现金流项目
        const fixedAssetChange = await this.getAccountChangeByCode(
          connection,
          '1601',
          periodStart,
          endDate
        ); // 固定资产
        const intangibleAssetChange = await this.getAccountChangeByCode(
          connection,
          '1701',
          periodStart,
          endDate
        ); // 无形资产

        // 筹资活动现金流项目
        const shortLoanChange = await this.getAccountChangeByCode(
          connection,
          '2001',
          periodStart,
          endDate
        ); // 短期借款
        const longLoanChange = await this.getAccountChangeByCode(
          connection,
          '2501',
          periodStart,
          endDate
        ); // 长期借款
        const paidInCapitalChange = await this.getAccountChangeByCode(
          connection,
          '4001',
          periodStart,
          endDate
        ); // 实收资本

        // 5. 构建现金流量表数据
        const reportData = [];
        let rowNum = 1;

        // 一、经营活动产生的现金流量
        reportData.push({
          id: 'operating-header',
          name: '一、经营活动产生的现金流量',
          code: 'OPERATING',
          rowNum: null,
          amount: null,
          compareAmount: null,
          level: 0,
          isHeader: true,
        });

        // 净利润
        reportData.push({
          id: 'net-profit',
          name: '净利润',
          code: 'NET_PROFIT',
          rowNum: rowNum++,
          amount: this.roundAmount(netProfit / unit),
          compareAmount: null,
          level: 1,
        });

        // 加：资产减值准备
        reportData.push({
          id: 'depreciation',
          name: '加：资产折旧、摊销',
          code: 'DEPRECIATION',
          rowNum: rowNum++,
          amount: this.roundAmount(Math.abs(depreciation + amortization) / unit),
          compareAmount: null,
          level: 1,
        });

        // 经营性应收项目的减少
        reportData.push({
          id: 'receivables-decrease',
          name: '经营性应收项目的减少（增加以"-"号填列）',
          code: 'RECEIVABLES_CHANGE',
          rowNum: rowNum++,
          amount: this.roundAmount(-receivablesChange / unit),
          compareAmount: null,
          level: 1,
        });

        // 存货的减少
        reportData.push({
          id: 'inventory-decrease',
          name: '存货的减少（增加以"-"号填列）',
          code: 'INVENTORY_CHANGE',
          rowNum: rowNum++,
          amount: this.roundAmount(-inventoryChange / unit),
          compareAmount: null,
          level: 1,
        });

        // 经营性应付项目的增加
        reportData.push({
          id: 'payables-increase',
          name: '经营性应付项目的增加（减少以"-"号填列）',
          code: 'PAYABLES_CHANGE',
          rowNum: rowNum++,
          amount: this.roundAmount(payablesChange / unit),
          compareAmount: null,
          level: 1,
        });

        // 计算经营活动现金流量净额
        const operatingCashFlow =
          netProfit +
          Math.abs(depreciation + amortization) -
          receivablesChange -
          inventoryChange +
          payablesChange;
        reportData.push({
          id: 'operating-total',
          name: '经营活动产生的现金流量净额',
          code: 'OPERATING_NET',
          rowNum: rowNum++,
          amount: this.roundAmount(operatingCashFlow / unit),
          compareAmount: null,
          level: 0,
          isTotal: true,
        });

        // 二、投资活动产生的现金流量
        reportData.push({
          id: 'investing-header',
          name: '二、投资活动产生的现金流量',
          code: 'INVESTING',
          rowNum: null,
          amount: null,
          compareAmount: null,
          level: 0,
          isHeader: true,
        });

        // 购建固定资产等支付的现金
        reportData.push({
          id: 'fixed-asset-purchase',
          name: '购建固定资产、无形资产支付的现金',
          code: 'FIXED_ASSET_PURCHASE',
          rowNum: rowNum++,
          amount: this.roundAmount(-Math.max(0, fixedAssetChange + intangibleAssetChange) / unit),
          compareAmount: null,
          level: 1,
        });

        // 处置固定资产等收回的现金
        reportData.push({
          id: 'fixed-asset-disposal',
          name: '处置固定资产、无形资产收回的现金',
          code: 'FIXED_ASSET_DISPOSAL',
          rowNum: rowNum++,
          amount: this.roundAmount(Math.max(0, -(fixedAssetChange + intangibleAssetChange)) / unit),
          compareAmount: null,
          level: 1,
        });

        const investingCashFlow = -(fixedAssetChange + intangibleAssetChange);
        reportData.push({
          id: 'investing-total',
          name: '投资活动产生的现金流量净额',
          code: 'INVESTING_NET',
          rowNum: rowNum++,
          amount: this.roundAmount(investingCashFlow / unit),
          compareAmount: null,
          level: 0,
          isTotal: true,
        });

        // 三、筹资活动产生的现金流量
        reportData.push({
          id: 'financing-header',
          name: '三、筹资活动产生的现金流量',
          code: 'FINANCING',
          rowNum: null,
          amount: null,
          compareAmount: null,
          level: 0,
          isHeader: true,
        });

        // 取得借款收到的现金
        const loanIncrease = Math.max(0, shortLoanChange + longLoanChange);
        reportData.push({
          id: 'loan-received',
          name: '取得借款收到的现金',
          code: 'LOAN_RECEIVED',
          rowNum: rowNum++,
          amount: this.roundAmount(loanIncrease / unit),
          compareAmount: null,
          level: 1,
        });

        // 偿还债务支付的现金
        const loanRepaid = Math.max(0, -(shortLoanChange + longLoanChange));
        reportData.push({
          id: 'loan-repaid',
          name: '偿还债务支付的现金',
          code: 'LOAN_REPAID',
          rowNum: rowNum++,
          amount: this.roundAmount(-loanRepaid / unit),
          compareAmount: null,
          level: 1,
        });

        // 吸收投资收到的现金
        reportData.push({
          id: 'capital-received',
          name: '吸收投资收到的现金',
          code: 'CAPITAL_RECEIVED',
          rowNum: rowNum++,
          amount: this.roundAmount(Math.max(0, paidInCapitalChange) / unit),
          compareAmount: null,
          level: 1,
        });

        const financingCashFlow = shortLoanChange + longLoanChange + paidInCapitalChange;
        reportData.push({
          id: 'financing-total',
          name: '筹资活动产生的现金流量净额',
          code: 'FINANCING_NET',
          rowNum: rowNum++,
          amount: this.roundAmount(financingCashFlow / unit),
          compareAmount: null,
          level: 0,
          isTotal: true,
        });

        // 四、现金及现金等价物净增加额
        const totalCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;
        reportData.push({
          id: 'cash-increase',
          name: '四、现金及现金等价物净增加额',
          code: 'CASH_NET_INCREASE',
          rowNum: rowNum++,
          amount: this.roundAmount(totalCashFlow / unit),
          compareAmount: null,
          level: 0,
          isTotal: true,
        });

        // 获取期初现金余额
        const beginningCash = await this.getCashBalance(connection, periodStart);
        reportData.push({
          id: 'cash-beginning',
          name: '加：期初现金及现金等价物余额',
          code: 'CASH_BEGINNING',
          rowNum: rowNum++,
          amount: this.roundAmount(beginningCash / unit),
          compareAmount: null,
          level: 0,
        });

        reportData.push({
          id: 'cash-ending',
          name: '五、期末现金及现金等价物余额',
          code: 'CASH_ENDING',
          rowNum: rowNum++,
          amount: this.roundAmount((beginningCash + totalCashFlow) / unit),
          compareAmount: null,
          level: 0,
          isTotal: true,
        });

        logger.info('现金流量表生成完成', {
          startDate,
          endDate,
          operatingCashFlow: this.roundAmount(operatingCashFlow / unit),
          investingCashFlow: this.roundAmount(investingCashFlow / unit),
          financingCashFlow: this.roundAmount(financingCashFlow / unit),
        });

        return {
          reportInfo: this.formatReportInfo({
            startDate,
            endDate,
            compareStartDate,
            compareEndDate,
            unit,
          }),
          summary: {
            operatingCashFlow: this.roundAmount(operatingCashFlow / unit),
            investingCashFlow: this.roundAmount(investingCashFlow / unit),
            financingCashFlow: this.roundAmount(financingCashFlow / unit),
            netCashIncrease: this.roundAmount(totalCashFlow / unit),
            beginningCash: this.roundAmount(beginningCash / unit),
            endingCash: this.roundAmount((beginningCash + totalCashFlow) / unit),
          },
          items: reportData,
        };
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('生成现金流量表失败:', error);
      throw error;
    }
  }

  /**
   * 获取科目期初期末余额变动
   * @param {Object} connection 数据库连接
   * @param {string} accountType 科目类型
   * @param {string} beginDate 期初日期
   * @param {string} endDate 期末日期
   * @returns {Object} 余额变动数据
   */
  static async getBalanceChanges(connection, accountType, beginDate, endDate) {
    try {
      const [accounts] = await connection.execute(
        `SELECT id, account_code, account_name, is_debit
         FROM gl_accounts
         WHERE account_type = ? AND is_active = 1`,
        [accountType]
      );

      let totalBeginBalance = 0;
      let totalEndBalance = 0;

      for (const account of accounts) {
        const beginBalance = await this.getAccountBalanceAtDate(connection, account.id, beginDate);
        const endBalance = await this.getAccountBalanceAtDate(connection, account.id, endDate);
        totalBeginBalance += beginBalance;
        totalEndBalance += endBalance;
      }

      return {
        beginBalance: totalBeginBalance,
        endBalance: totalEndBalance,
        change: totalEndBalance - totalBeginBalance,
      };
    } catch (error) {
      logger.error('获取余额变动失败:', error);
      return { beginBalance: 0, endBalance: 0, change: 0 };
    }
  }

  /**
   * 根据科目代码获取余额变动
   * @param {Object} connection 数据库连接
   * @param {string} accountCode 科目代码
   * @param {string} beginDate 期初日期
   * @param {string} endDate 期末日期
   * @returns {number} 余额变动
   */
  static async getAccountChangeByCode(connection, accountCode, beginDate, endDate) {
    try {
      const [accounts] = await connection.execute(
        `SELECT id FROM gl_accounts 
         WHERE account_code LIKE ? AND is_active = 1`,
        [accountCode + '%']
      );

      if (accounts.length === 0) {
        return 0;
      }

      let totalChange = 0;
      for (const account of accounts) {
        const beginBalance = await this.getAccountBalanceAtDate(connection, account.id, beginDate);
        const endBalance = await this.getAccountBalanceAtDate(connection, account.id, endDate);
        totalChange += endBalance - beginBalance;
      }

      return totalChange;
    } catch (error) {
      logger.error('获取科目变动失败:', { accountCode, error: error.message });
      return 0;
    }
  }

  /**
   * 获取现金及现金等价物余额
   * @param {Object} connection 数据库连接
   * @param {string} date 日期
   * @returns {number} 现金余额
   */
  static async getCashBalance(connection, date) {
    try {
      // 获取现金类科目（1001库存现金，1002银行存款）
      const [accounts] = await connection.execute(
        `SELECT id FROM gl_accounts 
         WHERE (account_code LIKE '1001%' OR account_code LIKE '1002%') AND is_active = 1`
      );

      let totalCash = 0;
      for (const account of accounts) {
        const balance = await this.getAccountBalanceAtDate(connection, account.id, date);
        totalCash += balance;
      }

      return totalCash;
    } catch (error) {
      logger.error('获取现金余额失败:', error);
      return 0;
    }
  }
}

module.exports = FinancialReportsService;
