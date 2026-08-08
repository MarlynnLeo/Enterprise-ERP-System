/**
 * FinancialReportsService — balance methods (mixin)
 * @module financialReports/balanceMethods
 */

const runtime = require('./runtime');
const {
  db,
  logger,
  accountingConfig,
  toLocalDateString,
  financeConfig,
} = runtime;


module.exports = {
  /**
     * 计算科目余额
     * @param {string} accountType 科目类型（资产、负债、所有者权益、收入、成本、费用）
     * @param {string} reportDate 报表日期 (YYYY-MM-DD)
     * @param {string} compareDate 对比日期（可选）
     * @returns {Promise<Object>} 科目余额数据
     * @throws {Error} 当数据库操作失败时抛出错误
     */
    async calculateAccountBalance(accountType, reportDate, compareDate = null) {
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
        const accountUsageEndDate = compareDate && compareDate > reportDate ? compareDate : reportDate;
        const [accounts] = await connection.execute(
          `SELECT id, account_code as code, account_name as name, account_type as type,
                  parent_id, is_debit, currency_code
           FROM gl_accounts
           WHERE account_type = ?
             AND (
               is_active = 1
               OR COALESCE(opening_debit, 0) <> 0
               OR COALESCE(opening_credit, 0) <> 0
               OR EXISTS (
                 SELECT 1
                 FROM gl_entry_items gei
                 JOIN gl_entries ge ON ge.id = gei.entry_id
                 WHERE gei.account_id = gl_accounts.id
                   AND ge.is_posted = 1
                   AND ge.entry_date <= ?
                 LIMIT 1
               )
             )
           ORDER BY account_code`,
          [accountType, accountUsageEndDate]
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
    },

  /**
     * 批量计算科目余额（性能优化）
     * @param {Object} connection 数据库连接
     * @param {Array} accounts 科目列表
     * @param {string} reportDate 报表日期
     * @param {string} compareDate 对比日期
     * @returns {Promise<Array>} 科目余额数组
     */
    async batchCalculateAccountBalances(connection, accounts, reportDate, compareDate) {
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
          currencyCode: account.currency_code || financeConfig.get('invoice.defaultCurrency', 'CNY'),
          currentBalance: this.roundAmount(currentBalance),
          compareBalance: compareDate ? this.roundAmount(compareBalance) : null,
          change: compareDate ? this.roundAmount(currentBalance - compareBalance) : null,
          changePercent: this.calculateChangePercent(currentBalance, compareBalance),
        });
      }
  
      return accountBalances;
    },

  /**
     * 批量获取科目余额（单次查询优化）
     * @param {Object} connection 数据库连接
     * @param {Array} accountIds 科目ID数组
     * @param {string} reportDate 报表日期
     * @param {string} compareDate 对比日期
     * @returns {Promise<Object>} 余额数据
     */
    async getBatchAccountBalances(connection, accountIds, reportDate, compareDate) {
      const result = { current: {}, compare: {} };
  
      if (accountIds.length === 0) return result;
  
      // 查询当期余额。余额必须包含科目期初余额，且只累计已过账、日期不晚于报表日的凭证。
      const [currentBalances] = await connection.execute(
        `SELECT
           ga.is_debit,
           ga.account_type,
           ga.id as account_id,
           COALESCE(ga.opening_debit, 0) as opening_debit,
           COALESCE(ga.opening_credit, 0) as opening_credit,
           COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN ei.debit_amount ELSE 0 END), 0) as total_debit,
           COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN ei.credit_amount ELSE 0 END), 0) as total_credit
         FROM gl_accounts ga
         LEFT JOIN gl_entry_items ei ON ga.id = ei.account_id
         LEFT JOIN gl_entries e
           ON ei.entry_id = e.id
          AND e.entry_date <= ?
          AND e.is_posted = 1
         WHERE ga.id IN (${accountIds.map(() => '?').join(',')})
         GROUP BY ga.id, ga.is_debit, ga.account_type, ga.opening_debit, ga.opening_credit`,
        [reportDate, ...accountIds]
      );
  
      // 计算当期余额
      currentBalances.forEach((row) => {
        result.current[row.account_id] = this.calculateSignedBalance(row);
      });
  
      // 查询对比期余额
      if (compareDate) {
        const [compareBalances] = await connection.execute(
          `SELECT
             ga.is_debit,
             ga.account_type,
             ga.id as account_id,
             COALESCE(ga.opening_debit, 0) as opening_debit,
             COALESCE(ga.opening_credit, 0) as opening_credit,
             COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN ei.debit_amount ELSE 0 END), 0) as total_debit,
             COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN ei.credit_amount ELSE 0 END), 0) as total_credit
           FROM gl_accounts ga
           LEFT JOIN gl_entry_items ei ON ga.id = ei.account_id
           LEFT JOIN gl_entries e
             ON ei.entry_id = e.id
            AND e.entry_date <= ?
            AND e.is_posted = 1
           WHERE ga.id IN (${accountIds.map(() => '?').join(',')})
           GROUP BY ga.id, ga.is_debit, ga.account_type, ga.opening_debit, ga.opening_credit`,
          [compareDate, ...accountIds]
        );
  
        compareBalances.forEach((row) => {
          result.compare[row.account_id] = this.calculateSignedBalance(row);
        });
      }
  
      return result;
    },

  calculateSignedBalance(row) {
      const openingNet = parseFloat(row.opening_debit || 0) - parseFloat(row.opening_credit || 0);
      const movementNet = parseFloat(row.total_debit || 0) - parseFloat(row.total_credit || 0);
      const netBalance = openingNet + movementNet;
  
      if (['资产', '成本', '费用'].includes(row.account_type)) {
        return netBalance;
      }
  
      if (['负债', '所有者权益', '收入'].includes(row.account_type)) {
        return -netBalance;
      }
  
      return row.is_debit ? netBalance : -netBalance;
    },

  /**
     * 获取指定日期的科目余额（单个科目）
     * @param {Object} connection 数据库连接
     * @param {number} accountId 科目ID
     * @param {string} date 日期
     * @returns {Promise<number>} 科目余额
     */
    async getAccountBalanceAtDate(connection, accountId, date) {
      try {
        const [result] = await connection.execute(
          `SELECT
             ga.is_debit,
             ga.account_type,
             COALESCE(ga.opening_debit, 0) as opening_debit,
             COALESCE(ga.opening_credit, 0) as opening_credit,
             COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN ei.debit_amount ELSE 0 END), 0) as total_debit,
             COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN ei.credit_amount ELSE 0 END), 0) as total_credit
           FROM gl_accounts ga
           LEFT JOIN gl_entry_items ei ON ga.id = ei.account_id
           LEFT JOIN gl_entries e ON ei.entry_id = e.id AND e.entry_date <= ? AND e.is_posted = 1
           WHERE ga.id = ?
           GROUP BY ga.id, ga.is_debit, ga.account_type, ga.opening_debit, ga.opening_credit`,
          [date, accountId]
        );
  
        if (result.length === 0) return 0;
  
        return this.calculateSignedBalance(result[0]);
      } catch (error) {
        logger.error('获取科目余额失败:', { accountId, date, error: error.message });
        throw error;
      }
    },

  async getIncomeStatementCostCodes() {
      await accountingConfig.loadFromDatabase(db);
      return [
        accountingConfig.getAccountCode('SALES_COST'),
        accountingConfig.getAccountCode('COST_OF_GOODS_SOLD'),
        accountingConfig.getAccountCode('OTHER_COST'),
        '6401',
        '6402',
      ].filter(Boolean);
    },

  async buildPeriodAccountFilter(accountType) {
      const costCodes = [...new Set(await this.getIncomeStatementCostCodes())];
      if (accountType === '成本') {
        return {
          whereSql: `account_code IN (${costCodes.map(() => '?').join(',')})`,
          params: costCodes,
        };
      }
  
      if (accountType === '费用') {
        return {
          whereSql: `account_type = ? AND account_code NOT IN (${costCodes
            .map(() => '?')
            .join(',')})`,
          params: [accountType, ...costCodes],
        };
      }
  
      return {
        whereSql: 'account_type = ?',
        params: [accountType],
      };
    },
};
