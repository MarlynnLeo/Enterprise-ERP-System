/**
 * FinancialReportsService — income methods (mixin)
 * @module financialReports/incomeMethods
 */

const runtime = require('./runtime');
const {
  db,
  logger,
} = runtime;


module.exports = {
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
    async generateIncomeStatement(
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
          .filter(
            (acc) =>
              acc.currentAmount !== 0 || (acc.compareAmount !== null && acc.compareAmount !== 0)
          )
          .map((acc) => ({
            id: `income-${acc.id}`,
            name: acc.name,
            code: acc.code,
            rowNum: rowNum++,
            amount: acc.currentAmount / unit,
            compareAmount: acc.compareAmount !== null ? acc.compareAmount / unit : null,
            level: 1,
          }));
  
        if (incomeItems.length > 0 || income.totalAmount !== 0) {
          reportData.push({
            id: 'income-total',
            name: '一、营业收入',
            code: 'INCOME',
            rowNum: rowNum++,
            amount: income.totalAmount / unit,
            compareAmount:
              compareStartDate && compareEndDate ? income.totalCompareAmount / unit : null,
            level: 0,
            children: incomeItems.length > 0 ? incomeItems : undefined,
          });
        }
  
        // 2. 营业成本部分（新增）
        const costItems = cost.accounts
          .filter(
            (acc) =>
              acc.currentAmount !== 0 || (acc.compareAmount !== null && acc.compareAmount !== 0)
          )
          .map((acc) => ({
            id: `cost-${acc.id}`,
            name: acc.name,
            code: acc.code,
            rowNum: rowNum++,
            amount: -acc.currentAmount / unit, // 成本显示为负数
            compareAmount: acc.compareAmount !== null ? -acc.compareAmount / unit : null,
            level: 1,
          }));
  
        if (costItems.length > 0 || cost.totalAmount !== 0) {
          reportData.push({
            id: 'cost-total',
            name: '减：营业成本',
            code: 'COST',
            rowNum: rowNum++,
            amount: -cost.totalAmount / unit, // 成本显示为负数
            compareAmount:
              compareStartDate && compareEndDate ? -cost.totalCompareAmount / unit : null,
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
          compareAmount: compareGrossProfit !== null ? compareGrossProfit / unit : null,
          level: 0,
          isCalculated: true,
        });
  
        // 4. 营业费用部分
        const expenseItems = expenses.accounts
          .filter(
            (acc) =>
              acc.currentAmount !== 0 || (acc.compareAmount !== null && acc.compareAmount !== 0)
          )
          .map((acc) => ({
            id: `expense-${acc.id}`,
            name: acc.name,
            code: acc.code,
            rowNum: rowNum++,
            amount: -acc.currentAmount / unit, // 费用显示为负数
            compareAmount: acc.compareAmount !== null ? -acc.compareAmount / unit : null,
            level: 1,
          }));
  
        if (expenseItems.length > 0 || expenses.totalAmount !== 0) {
          reportData.push({
            id: 'expense-total',
            name: '减：营业费用',
            code: 'EXPENSE',
            rowNum: rowNum++,
            amount: -expenses.totalAmount / unit, // 费用显示为负数
            compareAmount:
              compareStartDate && compareEndDate ? -expenses.totalCompareAmount / unit : null,
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
          compareAmount: compareNetIncome !== null ? compareNetIncome / unit : null,
          level: 0,
          isCalculated: true,
        });
  
        return reportData;
      } catch (error) {
        logger.error('生成利润表失败:', error);
        throw error;
      }
    },

  /**
     * 计算期间发生额
     * @param {string} accountType 科目类型
     * @param {string} startDate 开始日期
     * @param {string} endDate 结束日期
     * @param {string} compareStartDate 对比开始日期
     * @param {string} compareEndDate 对比结束日期
     * @returns {Object} 期间发生额数据
     */
    async calculatePeriodAmount(
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
          const usageClauses = [
            `EXISTS (
              SELECT 1
              FROM gl_entry_items gei
              JOIN gl_entries ge ON ge.id = gei.entry_id
              WHERE gei.account_id = gl_accounts.id
                AND ge.is_posted = 1
                AND ge.entry_date BETWEEN ? AND ?
              LIMIT 1
            )`,
          ];
          const usageParams = [startDate, endDate];
          if (compareStartDate && compareEndDate) {
            usageClauses.push(
              `EXISTS (
                SELECT 1
                FROM gl_entry_items gei
                JOIN gl_entries ge ON ge.id = gei.entry_id
                WHERE gei.account_id = gl_accounts.id
                  AND ge.is_posted = 1
                  AND ge.entry_date BETWEEN ? AND ?
                LIMIT 1
              )`
            );
            usageParams.push(compareStartDate, compareEndDate);
          }
  
          const accountFilter = await this.buildPeriodAccountFilter(accountType);
          const [accounts] = await connection.execute(
            `SELECT id, account_code as code, account_name as name, account_type as type, is_debit
             FROM gl_accounts
             WHERE ${accountFilter.whereSql}
               AND (is_active = true OR ${usageClauses.join(' OR ')})
             ORDER BY account_code`,
            [...accountFilter.params, ...usageParams]
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
              change: compareAmount !== null ? currentAmount - compareAmount : null,
              changePercent:
                compareAmount !== null && compareAmount !== 0
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
            totalCompareAmount:
              compareStartDate && compareEndDate
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
    },

  /**
     * 获取科目期间发生额
     * @param {Object} connection 数据库连接
     * @param {number} accountId 科目ID
     * @param {string} startDate 开始日期
     * @param {string} endDate 结束日期
     * @param {boolean} isDebit 是否为借方科目（可选，传入可避免额外查询）
     * @returns {number} 期间发生额
     */
    async getAccountPeriodAmount(connection, accountId, startDate, endDate, isDebit = null) {
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
        return isDebitAccount ? totalDebit - totalCredit : totalCredit - totalDebit;
      } catch (error) {
        logger.error('获取科目期间发生额失败:', error);
        throw error;
      }
    },
};
