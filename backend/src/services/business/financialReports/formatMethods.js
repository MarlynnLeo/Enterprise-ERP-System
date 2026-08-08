/**
 * FinancialReportsService — format methods (mixin)
 * @module financialReports/formatMethods
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
     * 格式化科目数据用于报表显示
     * @param {Array} accounts 科目数组
     * @param {number} unit 金额单位
     * @returns {Array} 格式化后的科目数据
     */
    formatAccountsForReport(accounts, unit) {
      return accounts.map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        amount:
          account.currentBalance !== undefined && account.currentBalance !== null
            ? account.currentBalance / unit
            : account.currentAmount !== undefined && account.currentAmount !== null
              ? account.currentAmount / unit
              : 0,
        compareAmount:
          account.compareBalance !== undefined && account.compareBalance !== null
            ? account.compareBalance / unit
            : account.compareAmount !== undefined && account.compareAmount !== null
              ? account.compareAmount / unit
              : null,
        change:
          account.change !== undefined && account.change !== null ? account.change / unit : null,
        changePercent: account.changePercent,
      }));
    },

  /**
     * 获取金额单位文本
     * @param {number} unit 金额单位
     * @returns {string} 单位文本
     */
    getUnitText(unit) {
      const unitMap = {
        1: '元',
        1000: '千元',
        10000: '万元',
        100000: '十万元',
        1000000: '百万元',
      };
      return unitMap[unit] || '元';
    },

  /**
     * 验证科目类型
     * @param {string} accountType 科目类型
     * @throws {Error} 无效的科目类型
     */
    validateAccountType(accountType) {
      const validTypes = ['资产', '负债', '所有者权益', '收入', '成本', '费用'];
      if (!validTypes.includes(accountType)) {
        throw new Error(`无效的科目类型: ${accountType}，支持的类型: ${validTypes.join(', ')}`);
      }
    },

  /**
     * 验证日期格式
     * @param {string} dateString 日期字符串
     * @throws {Error} 无效的日期格式
     */
    validateDateFormat(dateString) {
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      if (!regex.test(dateString)) {
        throw new Error(`无效的日期格式: ${dateString}，请使用YYYY-MM-DD格式`);
      }
  
      const date = new Date(dateString);
      if (isNaN(date.getTime()) || dateString !== date.toISOString().split('T')[0]) {
        throw new Error(`无效的日期: ${dateString}`);
      }
    },

  /**
     * 验证金额单位
     * @param {number} unit 金额单位
     * @throws {Error} 无效的金额单位
     */
    validateUnit(unit) {
      const validUnits = [1, 1000, 10000, 100000, 1000000];
      if (!validUnits.includes(unit)) {
        throw new Error(`无效的金额单位: ${unit}，支持的单位: ${validUnits.join(', ')}`);
      }
    },

  /**
     * 金额四舍五入
     * @param {number} amount 金额
     * @param {number} precision 精度（小数位数）
     * @returns {number} 四舍五入后的金额
     */
    roundAmount(amount, precision = 2) {
      if (typeof amount !== 'number' || isNaN(amount)) return 0;
      return Math.round(amount * Math.pow(10, precision)) / Math.pow(10, precision);
    },

  /**
     * 计算变动百分比
     * @param {number} current 当前值
     * @param {number} compare 对比值
     * @returns {string|null} 变动百分比
     */
    calculateChangePercent(current, compare) {
      if (!compare || compare === 0) return null;
      const change = ((current - compare) / Math.abs(compare)) * 100;
      return this.roundAmount(change, 2).toFixed(2);
    },

  /**
     * 创建空的科目余额结果
     * @param {string} accountType 科目类型
     * @param {string} reportDate 报表日期
     * @param {string} compareDate 对比日期
     * @returns {Object} 空结果对象
     */
    createEmptyAccountBalanceResult(accountType, reportDate, compareDate) {
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
    },

  /**
     * 创建空的期间发生额结果
     * @param {string} accountType 科目类型
     * @param {string} startDate 开始日期
     * @param {string} endDate 结束日期
     * @param {string} compareStartDate 对比开始日期
     * @param {string} compareEndDate 对比结束日期
     * @returns {Object} 空结果对象
     */
    createEmptyPeriodAmountResult(
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
    },

  /**
     * 验证报表生成参数
     * @param {Object} params 参数对象
     * @throws {Error} 参数验证失败
     */
    validateReportParams(params) {
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
    },

  /**
     * 格式化报表生成信息
     * @param {Object} params 参数对象
     * @returns {Object} 格式化的报表信息
     */
    formatReportInfo(params) {
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
    },

  async getConfiguredAccountCodes(keys) {
      await accountingConfig.loadFromDatabase(db);
      return [
        ...new Set(
          keys
            .map((key) => accountingConfig.getAccountCode(key))
            .filter(Boolean)
            .map((code) => String(code))
        ),
      ];
    },

  async getReportAccountGroups() {
      return {
        currentAssets: await this.getConfiguredAccountCodes([
          'CASH',
          'BANK_DEPOSIT',
          'OTHER_MONETARY_ASSETS',
          'ACCOUNTS_RECEIVABLE',
          'PREPAYMENTS',
          'MATERIAL_PURCHASE',
          'RAW_MATERIALS',
          'INVENTORY_GOODS',
          'FINISHED_GOODS',
          'WORK_IN_PROCESS',
          'WIP',
          'OUTSOURCED_MATERIALS',
          'INVENTORY',
          'PURCHASE_COST',
        ]),
        nonCurrentAssets: await this.getConfiguredAccountCodes([
          'FIXED_ASSETS',
          'ACCUMULATED_DEPRECIATION',
          'FIXED_ASSET_IMPAIRMENT_ALLOWANCE',
          'CONSTRUCTION_IN_PROGRESS',
          'FIXED_ASSET_CLEARING',
          'INTANGIBLE_ASSETS',
          'ACCUMULATED_AMORTIZATION',
        ]),
        currentLiabilities: await this.getConfiguredAccountCodes([
          'SHORT_TERM_LOANS',
          'ACCOUNTS_PAYABLE',
          'GR_IR',
          'ADVANCE_RECEIPTS',
          'EMPLOYEE_PAYABLE',
          'TAX_PAYABLE',
          'VAT_INPUT_TAX',
          'VAT_OUTPUT_TAX',
          'VAT_PAYABLE',
        ]),
        nonCurrentLiabilities: await this.getConfiguredAccountCodes(['LONG_TERM_LOANS']),
        paidInCapital: await this.getConfiguredAccountCodes(['PAID_IN_CAPITAL', 'CAPITAL_RESERVE']),
        retainedEarnings: await this.getConfiguredAccountCodes([
          'SURPLUS_RESERVE',
          'CURRENT_YEAR_PROFIT',
          'RETAINED_EARNINGS',
        ]),
      };
    },

  codeMatchesConfiguredPrefixes(code, prefixes = []) {
      const accountCode = String(code || '');
      return prefixes.some((prefix) => accountCode.startsWith(String(prefix)));
    },
};
