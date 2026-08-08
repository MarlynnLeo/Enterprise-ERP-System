/**
 * FinancialReportsService — cashFlow methods (mixin)
 * @module financialReports/cashFlowMethods
 */

const runtime = require('./runtime');
const {
  db,
  logger,
  toLocalDateString,
} = runtime;


module.exports = {
  /**
     * 生成标准现金流量表（间接法）
     * @param {string} startDate 开始日期 (YYYY-MM-DD)
     * @param {string} endDate 结束日期 (YYYY-MM-DD)
     * @param {string} compareStartDate 对比开始日期（可选）
     * @param {string} compareEndDate 对比结束日期（可选）
     * @param {number} unit 金额单位（1=元, 1000=千元, 10000=万元）
     * @returns {Object} 现金流量表数据
     */
    async generateCashFlowStatement(
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
          const periodStart = toLocalDateString(periodStartDate);
  
          // 2. 计算净利润（从利润表）
          const incomeData = await this.calculatePeriodAmount('收入', startDate, endDate);
          const costData = await this.calculatePeriodAmount('成本', startDate, endDate);
          const expenseData = await this.calculatePeriodAmount('费用', startDate, endDate);
          const netProfit = incomeData.totalAmount - costData.totalAmount - expenseData.totalAmount;
  
          // 3. 获取资产负债表项目的期初期末余额用于计算变动
          const accountCodes = await this.getCashFlowAccountCodes();
  
          // 4. 计算各项目变动
          // 经营活动现金流项目
          const depreciation = await this.getAccountChangeByCodes(
            connection,
            accountCodes.depreciation,
            periodStart,
            endDate
          ); // 累计折旧
          const amortization = await this.getAccountChangeByCodes(
            connection,
            accountCodes.amortization,
            periodStart,
            endDate
          ); // 累计摊销
          const receivablesChange = await this.getAccountChangeByCodes(
            connection,
            accountCodes.receivables,
            periodStart,
            endDate
          ); // 应收账款
          const inventoryChange = await this.getAccountChangeByCodes(
            connection,
            accountCodes.inventory,
            periodStart,
            endDate
          ); // 库存商品
          const payablesChange = await this.getAccountChangeByCodes(
            connection,
            accountCodes.payables,
            periodStart,
            endDate
          ); // 应付账款
          // 预付账款
          // 预收账款
  
          // 投资活动现金流项目
          const fixedAssetChange = await this.getAccountChangeByCodes(
            connection,
            accountCodes.fixedAssets,
            periodStart,
            endDate
          ); // 固定资产
          const intangibleAssetChange = await this.getAccountChangeByCodes(
            connection,
            accountCodes.intangibleAssets,
            periodStart,
            endDate
          ); // 无形资产
  
          // 筹资活动现金流项目
          const shortLoanChange = await this.getAccountChangeByCodes(
            connection,
            accountCodes.shortLoans,
            periodStart,
            endDate
          ); // 短期借款
          const longLoanChange = await this.getAccountChangeByCodes(
            connection,
            accountCodes.longLoans,
            periodStart,
            endDate
          ); // 长期借款
          const paidInCapitalChange = await this.getAccountChangeByCodes(
            connection,
            accountCodes.paidInCapital,
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
          const beginningCash = await this.getCashBalance(connection, periodStart, accountCodes);
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
    },

  async getCashFlowAccountCodes() {
      return {
        depreciation: await this.getConfiguredAccountCodes(['ACCUMULATED_DEPRECIATION']),
        amortization: await this.getConfiguredAccountCodes(['ACCUMULATED_AMORTIZATION']),
        receivables: await this.getConfiguredAccountCodes(['ACCOUNTS_RECEIVABLE']),
        inventory: await this.getConfiguredAccountCodes([
          'MATERIAL_PURCHASE',
          'RAW_MATERIALS',
          'INVENTORY_GOODS',
          'FINISHED_GOODS',
          'WORK_IN_PROCESS',
          'WIP',
          'OUTSOURCED_MATERIALS',
          'INVENTORY',
        ]),
        payables: await this.getConfiguredAccountCodes(['ACCOUNTS_PAYABLE']),
        fixedAssets: await this.getConfiguredAccountCodes(['FIXED_ASSETS']),
        fixedAssetImpairment: await this.getConfiguredAccountCodes([
          'FIXED_ASSET_IMPAIRMENT_ALLOWANCE',
        ]),
        intangibleAssets: await this.getConfiguredAccountCodes(['INTANGIBLE_ASSETS']),
        shortLoans: await this.getConfiguredAccountCodes(['SHORT_TERM_LOANS']),
        longLoans: await this.getConfiguredAccountCodes(['LONG_TERM_LOANS']),
        paidInCapital: await this.getConfiguredAccountCodes(['PAID_IN_CAPITAL']),
        cashEquivalents: await this.getConfiguredAccountCodes([
          'CASH',
          'BANK_DEPOSIT',
          'OTHER_MONETARY_ASSETS',
        ]),
      };
    },

  /**
     * 获取科目期初期末余额变动
     * @param {Object} connection 数据库连接
     * @param {string} accountType 科目类型
     * @param {string} beginDate 期初日期
     * @param {string} endDate 期末日期
     * @returns {Object} 余额变动数据
     */
    async getBalanceChanges(connection, accountType, beginDate, endDate) {
      try {
        const [accounts] = await connection.execute(
          `SELECT id, account_code, account_name, is_debit
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
             )`,
          [accountType, endDate]
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
    },

  /**
     * 根据科目代码获取余额变动
     * @param {Object} connection 数据库连接
     * @param {string} accountCode 科目代码
     * @param {string} beginDate 期初日期
     * @param {string} endDate 期末日期
     * @returns {number} 余额变动
     */
    async getAccountChangeByCode(connection, accountCode, beginDate, endDate) {
      return this.getAccountChangeByCodes(connection, [accountCode], beginDate, endDate);
    },

  /**
     * 根据科目代码集合获取余额变动
     * @param {Object} connection 数据库连接
     * @param {string[]} accountCodes 科目代码前缀
     * @param {string} beginDate 期初日期
     * @param {string} endDate 期末日期
     * @returns {number} 余额变动
     */
    async getAccountChangeByCodes(connection, accountCodes, beginDate, endDate) {
      try {
        const codes = [...new Set((accountCodes || []).filter(Boolean).map((code) => String(code)))];
        if (codes.length === 0) {
          return 0;
        }
  
        const [accounts] = await connection.execute(
          `SELECT id FROM gl_accounts
           WHERE (${codes.map(() => 'account_code LIKE ?').join(' OR ')})
             AND (
               is_active = 1
               OR EXISTS (
                 SELECT 1
                 FROM gl_entry_items gei
                 JOIN gl_entries ge ON ge.id = gei.entry_id
                 WHERE gei.account_id = gl_accounts.id
                   AND ge.is_posted = 1
                   AND ge.entry_date <= ?
                 LIMIT 1
               )
             )`,
          [...codes.map((code) => `${code}%`), endDate]
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
        logger.error('获取科目变动失败:', { accountCodes, error: error.message });
        return 0;
      }
    },

  /**
     * 获取现金及现金等价物余额
     * @param {Object} connection 数据库连接
     * @param {string} date 日期
     * @returns {number} 现金余额
     */
    async getCashBalance(connection, date, preloadedCodes = null) {
      try {
        const accountCodes =
          preloadedCodes?.cashEquivalents || (await this.getCashFlowAccountCodes()).cashEquivalents;
  
        if (accountCodes.length === 0) {
          return 0;
        }
  
        // 获取现金及现金等价物科目
        const [accounts] = await connection.execute(
          `SELECT id FROM gl_accounts
           WHERE (${accountCodes.map(() => 'account_code LIKE ?').join(' OR ')})
             AND (
               is_active = 1
               OR EXISTS (
                 SELECT 1
                 FROM gl_entry_items gei
                 JOIN gl_entries ge ON ge.id = gei.entry_id
                 WHERE gei.account_id = gl_accounts.id
                   AND ge.is_posted = 1
                   AND ge.entry_date <= ?
                 LIMIT 1
               )
             )`,
          [...accountCodes.map((code) => `${code}%`), date]
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
    },
};
