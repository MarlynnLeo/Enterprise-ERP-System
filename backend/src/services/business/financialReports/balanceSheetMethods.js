/**
 * FinancialReportsService — balanceSheet methods (mixin)
 * @module financialReports/balanceSheetMethods
 */

const runtime = require('./runtime');
const {
  logger,
} = runtime;


module.exports = {
  /**
     * 生成资产负债表
     * @param {string} reportDate 报表日期 (YYYY-MM-DD)
     * @param {string} compareDate 对比日期（可选）
     * @param {number} unit 金额单位（1=元, 1000=千元, 10000=万元）
     * @returns {Promise<Object>} 标准资产负债表数据
     * @throws {Error} 当参数验证失败或数据库操作失败时抛出错误
     */
    async generateBalanceSheet(reportDate, compareDate = null, unit = 1) {
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
  
        const reportAccountGroups = await this.getReportAccountGroups();
  
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
            totalCompareAmount: compareDate
              ? this.roundAmount(assets.totalCompareBalance / unit)
              : null,
            accountCount: assets.accountCount,
            items: this.formatAccountsForReport(assets.accounts, unit),
            subCategories: this.categorizeAssets(assets.accounts, unit, reportAccountGroups),
          },
          liabilities: {
            title: '负债',
            code: 'LIABILITIES',
            totalAmount: liabilitiesTotal,
            totalCompareAmount: compareDate
              ? this.roundAmount(liabilities.totalCompareBalance / unit)
              : null,
            accountCount: liabilities.accountCount,
            items: this.formatAccountsForReport(liabilities.accounts, unit),
            subCategories: this.categorizeLiabilities(
              liabilities.accounts,
              unit,
              reportAccountGroups
            ),
          },
          equity: {
            title: '所有者权益',
            code: 'EQUITY',
            totalAmount: equityTotal,
            totalCompareAmount: compareDate
              ? this.roundAmount((equity.totalCompareBalance + (compareYearProfit || 0)) / unit)
              : null,
            accountCount: equity.accountCount + 1, // 包含本年利润
            items: this.formatAccountsForReport(equityAccountsWithProfit, unit),
            subCategories: this.categorizeEquity(
              equityAccountsWithProfit,
              unit,
              reportAccountGroups
            ),
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
    },

  /**
     * 资产分类
     * @param {Array} assets 资产科目数组
     * @param {number} unit 金额单位
     * @returns {Object} 分类后的资产
     */
    categorizeAssets(assets, unit, accountGroups = {}) {
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
          compareAmount:
            asset.compareBalance !== null && asset.compareBalance !== undefined
              ? this.roundAmount(asset.compareBalance / unit)
              : null,
        };
  
        if (this.codeMatchesConfiguredPrefixes(asset.code, accountGroups.currentAssets)) {
          categories.currentAssets.items.push(item);
          categories.currentAssets.total += amount;
        } else {
          categories.nonCurrentAssets.items.push(item);
          categories.nonCurrentAssets.total += amount;
        }
      });
  
      return categories;
    },

  /**
     * 负债分类
     * @param {Array} liabilities 负债科目数组
     * @param {number} unit 金额单位
     * @returns {Object} 分类后的负债
     */
    categorizeLiabilities(liabilities, unit, accountGroups = {}) {
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
          compareAmount:
            liability.compareBalance !== null && liability.compareBalance !== undefined
              ? this.roundAmount(liability.compareBalance / unit)
              : null,
        };
  
        if (this.codeMatchesConfiguredPrefixes(liability.code, accountGroups.currentLiabilities)) {
          categories.currentLiabilities.items.push(item);
          categories.currentLiabilities.total += amount;
        } else {
          categories.nonCurrentLiabilities.items.push(item);
          categories.nonCurrentLiabilities.total += amount;
        }
      });
  
      return categories;
    },

  /**
     * 所有者权益分类
     * @param {Array} equity 权益科目数组
     * @param {number} unit 金额单位
     * @returns {Object} 分类后的权益
     */
    categorizeEquity(equity, unit, accountGroups = {}) {
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
          compareAmount:
            equityItem.compareBalance !== null && equityItem.compareBalance !== undefined
              ? this.roundAmount(equityItem.compareBalance / unit)
              : null,
        };
  
        if (this.codeMatchesConfiguredPrefixes(equityItem.code, accountGroups.paidInCapital)) {
          categories.paidInCapital.items.push(item);
          categories.paidInCapital.total += amount;
        } else if (
          this.codeMatchesConfiguredPrefixes(equityItem.code, accountGroups.retainedEarnings) ||
          equityItem.isCalculated
        ) {
          categories.retainedEarnings.items.push(item);
          categories.retainedEarnings.total += amount;
        } else {
          categories.other.items.push(item);
          categories.other.total += amount;
        }
      });
  
      return categories;
    },
};
