/**
 * AdvancedReportsService.js
 * @description 服务层文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

/**
 * 高级财务报表服务
 * 提供财务比率分析、趋势分析、预算对比等高级报表功能
 */
class AdvancedReportsService {
  /**
   * 财务比率分析
   * @param {Object} params 分析参数
   * @returns {Object} 财务比率分析结果
   */
  static async generateFinancialRatioAnalysis(params) {
    try {
      const { startDate, endDate, compareWithPreviousPeriod = true } = params;

      // 获取当期财务数据
      const currentPeriodData = await this.getFinancialData(startDate, endDate);

      // 获取对比期财务数据（如果需要）
      let previousPeriodData = null;
      if (compareWithPreviousPeriod) {
        const periodDays = Math.ceil(
          (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
        );
        const previousStartDate = new Date(
          new Date(startDate).getTime() - periodDays * 24 * 60 * 60 * 1000
        );
        const previousEndDate = new Date(new Date(startDate).getTime() - 24 * 60 * 60 * 1000);

        previousPeriodData = await this.getFinancialData(
          previousStartDate.toISOString().split('T')[0],
          previousEndDate.toISOString().split('T')[0]
        );
      }

      // 计算财务比率
      const ratios = this.calculateFinancialRatios(currentPeriodData);

      // 计算对比比率（如果有对比期数据）
      let previousRatios = null;
      let ratioChanges = null;
      if (previousPeriodData) {
        previousRatios = this.calculateFinancialRatios(previousPeriodData);
        ratioChanges = this.calculateRatioChanges(ratios, previousRatios);
      }

      return {
        period: {
          startDate,
          endDate,
        },
        currentPeriod: {
          data: currentPeriodData,
          ratios,
        },
        previousPeriod: previousPeriodData
          ? {
              data: previousPeriodData,
              ratios: previousRatios,
            }
          : null,
        changes: ratioChanges,
        analysis: this.generateRatioAnalysis(ratios, ratioChanges),
      };
    } catch (error) {
      logger.error('生成财务比率分析失败:', error);
      throw error;
    }
  }

  /**
   * 获取财务数据
   * @param {string} startDate 开始日期
   * @param {string} endDate 结束日期
   * @returns {Object} 财务数据
   */
  static async getFinancialData(startDate, endDate) {
    // 获取资产数据
    const [assets] = await db.pool.execute(
      `
      SELECT 
        SUM(CASE WHEN a.account_type = '资产' AND a.account_code LIKE '1001%' THEN pb.debit_balance ELSE 0 END) as cash_and_equivalents,
        SUM(CASE WHEN a.account_type = '资产' AND a.account_code LIKE '1122%' THEN pb.debit_balance ELSE 0 END) as accounts_receivable,
        SUM(CASE WHEN a.account_type = '资产' AND a.account_code LIKE '1123%' THEN pb.debit_balance ELSE 0 END) as inventory,
        SUM(CASE WHEN a.account_type = '资产' AND a.account_code LIKE '11%' THEN pb.debit_balance ELSE 0 END) as current_assets,
        SUM(CASE WHEN a.account_type = '资产' AND a.account_code LIKE '15%' THEN pb.debit_balance ELSE 0 END) as fixed_assets,
        SUM(CASE WHEN a.account_type = '资产' THEN pb.debit_balance ELSE 0 END) as total_assets
      FROM gl_accounts a
      LEFT JOIN gl_period_balances pb ON a.id = pb.account_id
      LEFT JOIN gl_periods p ON pb.period_id = p.id
      WHERE p.end_date BETWEEN ? AND ?
    `,
      [startDate, endDate]
    );

    // 获取负债数据
    const [liabilities] = await db.pool.execute(
      `
      SELECT 
        SUM(CASE WHEN a.account_type = '负债' AND a.account_code LIKE '2001%' THEN pb.credit_balance ELSE 0 END) as accounts_payable,
        SUM(CASE WHEN a.account_type = '负债' AND a.account_code LIKE '20%' THEN pb.credit_balance ELSE 0 END) as current_liabilities,
        SUM(CASE WHEN a.account_type = '负债' AND a.account_code LIKE '25%' THEN pb.credit_balance ELSE 0 END) as long_term_liabilities,
        SUM(CASE WHEN a.account_type = '负债' THEN pb.credit_balance ELSE 0 END) as total_liabilities
      FROM gl_accounts a
      LEFT JOIN gl_period_balances pb ON a.id = pb.account_id
      LEFT JOIN gl_periods p ON pb.period_id = p.id
      WHERE p.end_date BETWEEN ? AND ?
    `,
      [startDate, endDate]
    );

    // 获取权益数据
    const [equity] = await db.pool.execute(
      `
      SELECT 
        SUM(CASE WHEN a.account_type = '权益' THEN pb.credit_balance ELSE 0 END) as total_equity
      FROM gl_accounts a
      LEFT JOIN gl_period_balances pb ON a.id = pb.account_id
      LEFT JOIN gl_periods p ON pb.period_id = p.id
      WHERE p.end_date BETWEEN ? AND ?
    `,
      [startDate, endDate]
    );

    // 获取收入费用数据
    const [incomeExpense] = await db.pool.execute(
      `
      SELECT 
        SUM(CASE WHEN a.account_type = '收入' THEN ei.credit_amount - ei.debit_amount ELSE 0 END) as total_revenue,
        SUM(CASE WHEN a.account_type = '费用' AND a.account_code LIKE '5001%' THEN ei.debit_amount - ei.credit_amount ELSE 0 END) as cost_of_sales,
        SUM(CASE WHEN a.account_type = '费用' THEN ei.debit_amount - ei.credit_amount ELSE 0 END) as total_expenses
      FROM gl_accounts a
      LEFT JOIN gl_entry_items ei ON a.id = ei.account_id
      LEFT JOIN gl_entries e ON ei.entry_id = e.id
      WHERE e.entry_date BETWEEN ? AND ? AND e.is_posted = true
    `,
      [startDate, endDate]
    );

    const assetData = assets[0] || {};
    const liabilityData = liabilities[0] || {};
    const equityData = equity[0] || {};
    const incomeData = incomeExpense[0] || {};

    // 计算净利润
    const netIncome = (incomeData.total_revenue || 0) - (incomeData.total_expenses || 0);
    const grossProfit = (incomeData.total_revenue || 0) - (incomeData.cost_of_sales || 0);

    return {
      assets: {
        cashAndEquivalents: parseFloat(assetData.cash_and_equivalents || 0),
        accountsReceivable: parseFloat(assetData.accounts_receivable || 0),
        inventory: parseFloat(assetData.inventory || 0),
        currentAssets: parseFloat(assetData.current_assets || 0),
        fixedAssets: parseFloat(assetData.fixed_assets || 0),
        totalAssets: parseFloat(assetData.total_assets || 0),
      },
      liabilities: {
        accountsPayable: parseFloat(liabilityData.accounts_payable || 0),
        currentLiabilities: parseFloat(liabilityData.current_liabilities || 0),
        longTermLiabilities: parseFloat(liabilityData.long_term_liabilities || 0),
        totalLiabilities: parseFloat(liabilityData.total_liabilities || 0),
      },
      equity: {
        totalEquity: parseFloat(equityData.total_equity || 0),
      },
      income: {
        totalRevenue: parseFloat(incomeData.total_revenue || 0),
        costOfSales: parseFloat(incomeData.cost_of_sales || 0),
        totalExpenses: parseFloat(incomeData.total_expenses || 0),
        grossProfit,
        netIncome,
      },
    };
  }

  /**
   * 计算财务比率
   * @param {Object} data 财务数据
   * @returns {Object} 财务比率
   */
  static calculateFinancialRatios(data) {
    const { assets, liabilities, equity, income } = data;

    // 流动性比率
    const currentRatio =
      assets.currentAssets > 0 && liabilities.currentLiabilities > 0
        ? assets.currentAssets / liabilities.currentLiabilities
        : 0;

    const quickRatio =
      assets.currentAssets > 0 && assets.inventory >= 0 && liabilities.currentLiabilities > 0
        ? (assets.currentAssets - assets.inventory) / liabilities.currentLiabilities
        : 0;

    const cashRatio =
      assets.cashAndEquivalents > 0 && liabilities.currentLiabilities > 0
        ? assets.cashAndEquivalents / liabilities.currentLiabilities
        : 0;

    // 杠杆比率
    const debtToAssetRatio =
      assets.totalAssets > 0 && liabilities.totalLiabilities > 0
        ? liabilities.totalLiabilities / assets.totalAssets
        : 0;

    const debtToEquityRatio =
      equity.totalEquity > 0 && liabilities.totalLiabilities > 0
        ? liabilities.totalLiabilities / equity.totalEquity
        : 0;

    const equityRatio =
      assets.totalAssets > 0 && equity.totalEquity > 0
        ? equity.totalEquity / assets.totalAssets
        : 0;

    // 盈利能力比率
    const grossProfitMargin =
      income.totalRevenue > 0 ? (income.grossProfit / income.totalRevenue) * 100 : 0;

    const netProfitMargin =
      income.totalRevenue > 0 ? (income.netIncome / income.totalRevenue) * 100 : 0;

    const returnOnAssets =
      assets.totalAssets > 0 ? (income.netIncome / assets.totalAssets) * 100 : 0;

    const returnOnEquity =
      equity.totalEquity > 0 ? (income.netIncome / equity.totalEquity) * 100 : 0;

    // 效率比率
    const assetTurnover = assets.totalAssets > 0 ? income.totalRevenue / assets.totalAssets : 0;

    const receivablesTurnover =
      assets.accountsReceivable > 0 ? income.totalRevenue / assets.accountsReceivable : 0;

    const inventoryTurnover = assets.inventory > 0 ? income.costOfSales / assets.inventory : 0;

    return {
      liquidity: {
        currentRatio: parseFloat(currentRatio.toFixed(2)),
        quickRatio: parseFloat(quickRatio.toFixed(2)),
        cashRatio: parseFloat(cashRatio.toFixed(2)),
      },
      leverage: {
        debtToAssetRatio: parseFloat(debtToAssetRatio.toFixed(4)),
        debtToEquityRatio: parseFloat(debtToEquityRatio.toFixed(2)),
        equityRatio: parseFloat(equityRatio.toFixed(4)),
      },
      profitability: {
        grossProfitMargin: parseFloat(grossProfitMargin.toFixed(2)),
        netProfitMargin: parseFloat(netProfitMargin.toFixed(2)),
        returnOnAssets: parseFloat(returnOnAssets.toFixed(2)),
        returnOnEquity: parseFloat(returnOnEquity.toFixed(2)),
      },
      efficiency: {
        assetTurnover: parseFloat(assetTurnover.toFixed(2)),
        receivablesTurnover: parseFloat(receivablesTurnover.toFixed(2)),
        inventoryTurnover: parseFloat(inventoryTurnover.toFixed(2)),
      },
    };
  }

  /**
   * 计算比率变化
   * @param {Object} currentRatios 当期比率
   * @param {Object} previousRatios 前期比率
   * @returns {Object} 比率变化
   */
  static calculateRatioChanges(currentRatios, previousRatios) {
    const calculateChange = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return parseFloat((((current - previous) / previous) * 100).toFixed(2));
    };

    return {
      liquidity: {
        currentRatio: calculateChange(
          currentRatios.liquidity.currentRatio,
          previousRatios.liquidity.currentRatio
        ),
        quickRatio: calculateChange(
          currentRatios.liquidity.quickRatio,
          previousRatios.liquidity.quickRatio
        ),
        cashRatio: calculateChange(
          currentRatios.liquidity.cashRatio,
          previousRatios.liquidity.cashRatio
        ),
      },
      leverage: {
        debtToAssetRatio: calculateChange(
          currentRatios.leverage.debtToAssetRatio,
          previousRatios.leverage.debtToAssetRatio
        ),
        debtToEquityRatio: calculateChange(
          currentRatios.leverage.debtToEquityRatio,
          previousRatios.leverage.debtToEquityRatio
        ),
        equityRatio: calculateChange(
          currentRatios.leverage.equityRatio,
          previousRatios.leverage.equityRatio
        ),
      },
      profitability: {
        grossProfitMargin: calculateChange(
          currentRatios.profitability.grossProfitMargin,
          previousRatios.profitability.grossProfitMargin
        ),
        netProfitMargin: calculateChange(
          currentRatios.profitability.netProfitMargin,
          previousRatios.profitability.netProfitMargin
        ),
        returnOnAssets: calculateChange(
          currentRatios.profitability.returnOnAssets,
          previousRatios.profitability.returnOnAssets
        ),
        returnOnEquity: calculateChange(
          currentRatios.profitability.returnOnEquity,
          previousRatios.profitability.returnOnEquity
        ),
      },
      efficiency: {
        assetTurnover: calculateChange(
          currentRatios.efficiency.assetTurnover,
          previousRatios.efficiency.assetTurnover
        ),
        receivablesTurnover: calculateChange(
          currentRatios.efficiency.receivablesTurnover,
          previousRatios.efficiency.receivablesTurnover
        ),
        inventoryTurnover: calculateChange(
          currentRatios.efficiency.inventoryTurnover,
          previousRatios.efficiency.inventoryTurnover
        ),
      },
    };
  }

  /**
   * 生成比率分析结论
   * @param {Object} ratios 当期比率
   * @param {Object} changes 比率变化
   * @returns {Object} 分析结论
   */
  static generateRatioAnalysis(ratios) {
    const analysis = {
      liquidity: {
        status: 'normal',
        message: '',
        recommendations: [],
      },
      leverage: {
        status: 'normal',
        message: '',
        recommendations: [],
      },
      profitability: {
        status: 'normal',
        message: '',
        recommendations: [],
      },
      efficiency: {
        status: 'normal',
        message: '',
        recommendations: [],
      },
    };

    // 流动性分析
    if (ratios.liquidity.currentRatio < 1) {
      analysis.liquidity.status = 'warning';
      analysis.liquidity.message = '流动比率低于1，短期偿债能力不足';
      analysis.liquidity.recommendations.push('增加流动资产或减少流动负债');
    } else if (ratios.liquidity.currentRatio > 3) {
      analysis.liquidity.status = 'attention';
      analysis.liquidity.message = '流动比率过高，资金利用效率可能不佳';
      analysis.liquidity.recommendations.push('考虑投资或扩大经营规模');
    } else {
      analysis.liquidity.message = '流动性状况良好';
    }

    // 杠杆分析
    if (ratios.leverage.debtToAssetRatio > 0.7) {
      analysis.leverage.status = 'warning';
      analysis.leverage.message = '资产负债率过高，财务风险较大';
      analysis.leverage.recommendations.push('降低负债水平，增强财务稳定性');
    } else if (ratios.leverage.debtToAssetRatio < 0.3) {
      analysis.leverage.status = 'attention';
      analysis.leverage.message = '资产负债率较低，可能未充分利用财务杠杆';
      analysis.leverage.recommendations.push('适当增加负债，提高资金使用效率');
    } else {
      analysis.leverage.message = '财务杠杆运用合理';
    }

    // 盈利能力分析
    if (ratios.profitability.netProfitMargin < 0) {
      analysis.profitability.status = 'warning';
      analysis.profitability.message = '净利润率为负，企业处于亏损状态';
      analysis.profitability.recommendations.push('控制成本，提高收入');
    } else if (ratios.profitability.netProfitMargin < 5) {
      analysis.profitability.status = 'attention';
      analysis.profitability.message = '净利润率较低，盈利能力有待提升';
      analysis.profitability.recommendations.push('优化产品结构，提高毛利率');
    } else {
      analysis.profitability.message = '盈利能力良好';
    }

    // 效率分析
    if (ratios.efficiency.assetTurnover < 0.5) {
      analysis.efficiency.status = 'attention';
      analysis.efficiency.message = '资产周转率较低，资产利用效率不高';
      analysis.efficiency.recommendations.push('提高资产使用效率，加快资产周转');
    } else {
      analysis.efficiency.message = '资产运营效率良好';
    }

    return analysis;
  }

  /**
   * 趋势分析
   * @param {Object} params 分析参数
   * @returns {Object} 趋势分析结果
   */
  static async generateTrendAnalysis(params) {
    try {
      const { startDate, endDate, periodType = 'month' } = params;

      // 生成期间列表
      const periods = this.generatePeriods(startDate, endDate, periodType);

      // 获取各期间的财务数据
      const trendData = [];
      for (const period of periods) {
        const data = await this.getFinancialData(period.startDate, period.endDate);
        const ratios = this.calculateFinancialRatios(data);

        trendData.push({
          period: period.name,
          startDate: period.startDate,
          endDate: period.endDate,
          data,
          ratios,
        });
      }

      // 计算趋势指标
      const trends = this.calculateTrends(trendData);

      return {
        periodType,
        periods: trendData.length,
        data: trendData,
        trends,
        analysis: this.generateTrendAnalysisConclusion(trends),
      };
    } catch (error) {
      logger.error('生成趋势分析失败:', error);
      throw error;
    }
  }

  /**
   * 生成期间列表
   * @param {string} startDate 开始日期
   * @param {string} endDate 结束日期
   * @param {string} periodType 期间类型
   * @returns {Array} 期间列表
   */
  static generatePeriods(startDate, endDate, periodType) {
    const periods = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    let current = new Date(start);

    while (current <= end) {
      let periodEnd;
      let periodName;

      if (periodType === 'month') {
        periodEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
        periodName = `${current.getFullYear()}年${(current.getMonth() + 1).toString().padStart(2, '0')}月`;
      } else if (periodType === 'quarter') {
        const quarter = Math.floor(current.getMonth() / 3) + 1;
        periodEnd = new Date(current.getFullYear(), quarter * 3, 0);
        periodName = `${current.getFullYear()}年Q${quarter}`;
      } else if (periodType === 'year') {
        periodEnd = new Date(current.getFullYear(), 11, 31);
        periodName = `${current.getFullYear()}年`;
      }

      if (periodEnd > end) {
        periodEnd = new Date(end);
      }

      periods.push({
        name: periodName,
        startDate: current.toISOString().split('T')[0],
        endDate: periodEnd.toISOString().split('T')[0],
      });

      // 移动到下一个期间
      if (periodType === 'month') {
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      } else if (periodType === 'quarter') {
        current = new Date(current.getFullYear(), current.getMonth() + 3, 1);
      } else if (periodType === 'year') {
        current = new Date(current.getFullYear() + 1, 0, 1);
      }
    }

    return periods;
  }

  /**
   * 计算趋势指标
   * @param {Array} trendData 趋势数据
   * @returns {Object} 趋势指标
   */
  static calculateTrends(trendData) {
    if (trendData.length < 2) {
      return null;
    }

    const calculateGrowthRate = (values) => {
      if (values.length < 2) return 0;
      const first = values[0];
      const last = values[values.length - 1];
      if (first === 0) return last > 0 ? 100 : 0;
      return parseFloat((((last - first) / first) * 100).toFixed(2));
    };

    const calculateAverage = (values) => {
      if (values.length === 0) return 0;
      const sum = values.reduce((acc, val) => acc + val, 0);
      return parseFloat((sum / values.length).toFixed(2));
    };

    // 提取各项指标的值
    const revenues = trendData.map((d) => d.data.income.totalRevenue);
    const netIncomes = trendData.map((d) => d.data.income.netIncome);
    const totalAssets = trendData.map((d) => d.data.assets.totalAssets);
    const currentRatios = trendData.map((d) => d.ratios.liquidity.currentRatio);
    const netProfitMargins = trendData.map((d) => d.ratios.profitability.netProfitMargin);

    return {
      revenue: {
        growthRate: calculateGrowthRate(revenues),
        average: calculateAverage(revenues),
        trend:
          revenues.length > 1
            ? revenues[revenues.length - 1] > revenues[0]
              ? 'increasing'
              : 'decreasing'
            : 'stable',
      },
      netIncome: {
        growthRate: calculateGrowthRate(netIncomes),
        average: calculateAverage(netIncomes),
        trend:
          netIncomes.length > 1
            ? netIncomes[netIncomes.length - 1] > netIncomes[0]
              ? 'increasing'
              : 'decreasing'
            : 'stable',
      },
      totalAssets: {
        growthRate: calculateGrowthRate(totalAssets),
        average: calculateAverage(totalAssets),
        trend:
          totalAssets.length > 1
            ? totalAssets[totalAssets.length - 1] > totalAssets[0]
              ? 'increasing'
              : 'decreasing'
            : 'stable',
      },
      currentRatio: {
        average: calculateAverage(currentRatios),
        trend:
          currentRatios.length > 1
            ? currentRatios[currentRatios.length - 1] > currentRatios[0]
              ? 'improving'
              : 'declining'
            : 'stable',
      },
      netProfitMargin: {
        average: calculateAverage(netProfitMargins),
        trend:
          netProfitMargins.length > 1
            ? netProfitMargins[netProfitMargins.length - 1] > netProfitMargins[0]
              ? 'improving'
              : 'declining'
            : 'stable',
      },
    };
  }

  /**
   * 生成趋势分析结论
   * @param {Object} trends 趋势数据
   * @returns {Object} 分析结论
   */
  static generateTrendAnalysisConclusion(trends) {
    if (!trends) {
      return {
        summary: '数据不足，无法进行趋势分析',
        recommendations: ['请确保有足够的历史数据进行分析'],
      };
    }

    const analysis = {
      summary: '',
      recommendations: [],
      highlights: [],
    };

    // 收入趋势分析
    if (trends.revenue.trend === 'increasing') {
      analysis.highlights.push(`收入呈上升趋势，增长率为 ${trends.revenue.growthRate}%`);
    } else if (trends.revenue.trend === 'decreasing') {
      analysis.highlights.push(`收入呈下降趋势，下降率为 ${Math.abs(trends.revenue.growthRate)}%`);
      analysis.recommendations.push('关注收入下降原因，制定增收措施');
    }

    // 盈利能力分析
    if (trends.netIncome.trend === 'increasing') {
      analysis.highlights.push(`净利润呈上升趋势，增长率为 ${trends.netIncome.growthRate}%`);
    } else if (trends.netIncome.trend === 'decreasing') {
      analysis.highlights.push(
        `净利润呈下降趋势，下降率为 ${Math.abs(trends.netIncome.growthRate)}%`
      );
      analysis.recommendations.push('分析成本结构，优化盈利能力');
    }

    // 资产规模分析
    if (trends.totalAssets.trend === 'increasing') {
      analysis.highlights.push(`资产规模持续增长，增长率为 ${trends.totalAssets.growthRate}%`);
    }

    // 流动性分析
    if (trends.currentRatio.trend === 'improving') {
      analysis.highlights.push('流动比率呈改善趋势，短期偿债能力增强');
    } else if (trends.currentRatio.trend === 'declining') {
      analysis.highlights.push('流动比率呈下降趋势，需关注短期偿债能力');
      analysis.recommendations.push('优化资产结构，提高流动性');
    }

    // 生成总结
    if (analysis.highlights.length > 0) {
      analysis.summary = `基于趋势分析，企业财务状况${trends.revenue.trend === 'increasing' && trends.netIncome.trend === 'increasing' ? '整体向好' : '需要关注'}。`;
    } else {
      analysis.summary = '财务指标相对稳定，建议持续监控关键指标变化。';
    }

    if (analysis.recommendations.length === 0) {
      analysis.recommendations.push('继续保持良好的财务管理水平');
    }

    return analysis;
  }
}

module.exports = AdvancedReportsService;
