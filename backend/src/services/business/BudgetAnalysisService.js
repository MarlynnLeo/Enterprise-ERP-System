/**
 * 预算分析服务
 *
 * 提供预算执行分析、预算差异分析等功能
 *
 * @module services/business/BudgetAnalysisService
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');

class BudgetAnalysisService {
  /**
   * 获取预算执行率分析
   * @param {number} budgetId - 预算ID
   * @returns {Promise<Object>} 分析结果
   */
  static async getBudgetExecutionAnalysis(budgetId) {
    try {
      // 获取预算主表信息
      const [budgets] = await db.pool.execute(
        `
        SELECT * FROM budgets WHERE id = ?
      `,
        [budgetId]
      );

      if (budgets.length === 0) {
        throw new Error('预算不存在');
      }

      const budget = budgets[0];

      // 获取预算明细及执行情况（实时从gl_entries计算实际金额）
      const [details] = await db.pool.execute(
        `
        SELECT 
          bd.*,
          a.account_code as account_code,
          a.account_name as account_name,
          d.name as department_name,
          COALESCE(
            (
              SELECT SUM(gei.debit_amount - gei.credit_amount)
              FROM gl_entry_items gei
              JOIN gl_entries ge ON gei.entry_id = ge.id
              WHERE gei.account_id = bd.account_id
              AND ge.entry_date BETWEEN ? AND ?
              AND ge.is_posted = 1
            ), 0
          ) as actual_used,
          ROUND(
            COALESCE(
              (
                SELECT SUM(gei.debit_amount - gei.credit_amount)
                FROM gl_entry_items gei
                JOIN gl_entries ge ON gei.entry_id = ge.id
                WHERE gei.account_id = bd.account_id
                AND ge.entry_date BETWEEN ? AND ?
                AND ge.is_posted = 1
              ), 0
            ) / NULLIF(bd.budget_amount, 0) * 100, 2
          ) as execution_rate
        FROM budget_details bd
        LEFT JOIN gl_accounts a ON bd.account_id = a.id
        LEFT JOIN departments d ON bd.department_id = d.id
        WHERE bd.budget_id = ?
        ORDER BY execution_rate DESC
      `,
        [budget.start_date, budget.end_date, budget.start_date, budget.end_date, budgetId]
      );

      // 用实时数据覆盖used_amount
      const processedDetails = details.map(d => ({
        ...d,
        used_amount: parseFloat(d.actual_used) || 0,
        remaining_amount: parseFloat(d.budget_amount || 0) - (parseFloat(d.actual_used) || 0),
      }));

      // 计算总体执行率
      const totalBudgetAmount = processedDetails.reduce((sum, d) => sum + parseFloat(d.budget_amount), 0);
      const totalUsedAmount = processedDetails.reduce((sum, d) => sum + parseFloat(d.used_amount), 0);
      const overallExecutionRate =
        totalBudgetAmount > 0 ? (totalUsedAmount / totalBudgetAmount) * 100 : 0;

      // 分类统计
      const overBudget = processedDetails.filter((d) => d.execution_rate > 100);
      const nearBudget = processedDetails.filter((d) => d.execution_rate >= 80 && d.execution_rate <= 100);
      const normalBudget = processedDetails.filter((d) => d.execution_rate < 80);

      return {
        budget: budget,
        overallExecutionRate: overallExecutionRate.toFixed(2),
        totalBudgetAmount: totalBudgetAmount,
        totalUsedAmount: totalUsedAmount,
        totalRemainingAmount: totalBudgetAmount - totalUsedAmount,
        details: processedDetails,
        statistics: {
          overBudget: overBudget.length,
          nearBudget: nearBudget.length,
          normalBudget: normalBudget.length,
        },
      };
    } catch (error) {
      logger.error('获取预算执行率分析失败:', error);
      throw error;
    }
  }

  /**
   * 获取预算差异分析
   * @param {number} budgetId - 预算ID
   * @param {string} startDate - 开始日期
   * @param {string} endDate - 结束日期
   * @returns {Promise<Object>} 分析结果
   */
  static async getBudgetVarianceAnalysis(budgetId, startDate, endDate) {
    try {
      // 获取预算主表以取日期范围
      const [budgets] = await db.pool.execute('SELECT * FROM budgets WHERE id = ?', [budgetId]);
      if (budgets.length === 0) throw new Error('预算不存在');
      const budget = budgets[0];

      // 获取预算明细（带实时实际金额）
      const [details] = await db.pool.execute(
        `
        SELECT 
          bd.*,
          a.account_code as account_code,
          a.account_name as account_name,
          d.name as department_name,
          COALESCE(
            (
              SELECT SUM(gei.debit_amount - gei.credit_amount)
              FROM gl_entry_items gei
              JOIN gl_entries ge ON gei.entry_id = ge.id
              WHERE gei.account_id = bd.account_id
              AND ge.entry_date BETWEEN ? AND ?
              AND ge.is_posted = 1
            ), 0
          ) as actual_used
        FROM budget_details bd
        LEFT JOIN gl_accounts a ON bd.account_id = a.id
        LEFT JOIN departments d ON bd.department_id = d.id
        WHERE bd.budget_id = ?
      `,
        [budget.start_date, budget.end_date, budgetId]
      );

      // 批量获取所有明细的执行情况（消除 N+1）
      const analysisResults = [];
      let execMap = new Map();
      if (details.length > 0) {
        const detailIds = details.map(d => d.id);
        const detailPh = detailIds.map(() => '?').join(',');
        const [allExecs] = await db.pool.execute(
          `SELECT budget_detail_id,
                  SUM(execution_amount) as period_amount,
                  COUNT(*) as execution_count
           FROM budget_execution
           WHERE budget_detail_id IN (${detailPh})
             AND execution_date >= ? AND execution_date <= ?
           GROUP BY budget_detail_id`,
          [...detailIds, startDate, endDate]
        );
        execMap = new Map(allExecs.map(r => [r.budget_detail_id, r]));
      }

      for (const detail of details) {
        const exec = execMap.get(detail.id) || { period_amount: 0, execution_count: 0 };
        const periodAmount = exec.period_amount || 0;
        const executionCount = exec.execution_count || 0;
        const actualUsed = parseFloat(detail.actual_used) || 0;

        // 计算差异（使用实时数据）
        const variance = parseFloat(detail.budget_amount) - actualUsed;
        const varianceRate =
          detail.budget_amount > 0 ? (variance / parseFloat(detail.budget_amount)) * 100 : 0;

        analysisResults.push({
          ...detail,
          used_amount: actualUsed,
          remaining_amount: parseFloat(detail.budget_amount) - actualUsed,
          period_amount: periodAmount,
          execution_count: executionCount,
          variance: variance,
          variance_rate: varianceRate.toFixed(2),
          status: variance < 0 ? '超支' : variance < detail.budget_amount * 0.2 ? '接近' : '正常',
        });
      }

      return {
        budgetId: budgetId,
        period: { startDate, endDate },
        details: analysisResults,
      };
    } catch (error) {
      logger.error('获取预算差异分析失败:', error);
      throw error;
    }
  }

  /**
   * 获取部门预算对比分析
   * @param {number} budgetYear - 预算年度
   * @returns {Promise<Array>} 分析结果
   */
  static async getDepartmentBudgetComparison(budgetYear) {
    try {
      const [departments] = await db.pool.execute(
        `
        SELECT 
          d.id,
          d.name as department_name,
          SUM(bd.budget_amount) as total_budget,
          SUM(bd.used_amount) as total_used,
          SUM(bd.remaining_amount) as total_remaining,
          ROUND(SUM(bd.used_amount) / SUM(bd.budget_amount) * 100, 2) as execution_rate
        FROM departments d
        LEFT JOIN budget_details bd ON d.id = bd.department_id
        LEFT JOIN budgets b ON bd.budget_id = b.id
        WHERE b.budget_year = ?
          AND b.status IN ('已审批', '执行中', '已完成')
        GROUP BY d.id, d.name
        HAVING total_budget > 0
        ORDER BY execution_rate DESC
      `,
        [budgetYear]
      );

      return departments;
    } catch (error) {
      logger.error('获取部门预算对比分析失败:', error);
      throw error;
    }
  }

  /**
   * 获取科目预算趋势分析
   * @param {number} accountId - 会计科目ID
   * @param {number} startYear - 开始年度
   * @param {number} endYear - 结束年度
   * @returns {Promise<Array>} 趋势数据
   */
  static async getAccountBudgetTrend(accountId, startYear, endYear) {
    try {
      const [trends] = await db.pool.execute(
        `
        SELECT 
          b.budget_year,
          SUM(bd.budget_amount) as budget_amount,
          SUM(bd.used_amount) as used_amount,
          ROUND(SUM(bd.used_amount) / SUM(bd.budget_amount) * 100, 2) as execution_rate
        FROM budgets b
        JOIN budget_details bd ON b.id = bd.budget_id
        WHERE bd.account_id = ?
          AND b.budget_year >= ?
          AND b.budget_year <= ?
        GROUP BY b.budget_year
        ORDER BY b.budget_year
      `,
        [accountId, startYear, endYear]
      );

      return trends;
    } catch (error) {
      logger.error('获取科目预算趋势分析失败:', error);
      throw error;
    }
  }
}

module.exports = BudgetAnalysisService;
