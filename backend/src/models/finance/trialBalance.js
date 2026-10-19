/**
 * finance/trialBalance.js
 * @description 试算平衡表相关方法
 *              从 models/finance.js L1648-1782 提取
 * @date 2026-06-11
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

module.exports = {
  /**
   * 获取试算平衡表
   * @param {number} periodId - 会计期间ID（可选，不传则查询所有期间）
   * @returns {Object} 试算平衡表数据
   */
  getTrialBalance: async (periodId = null, connection = null) => {
    try {
      const executor = connection || db.pool;
      let periodStartDate = null;
      let periodEndDate = null;
      const params = [];

      // 1. 获取期间日期范围
      if (periodId) {
        const [periods] = await executor.execute(
          'SELECT start_date, end_date FROM gl_periods WHERE id = ?',
          [periodId]
        );
        if (periods.length > 0) {
          periodStartDate = periods[0].start_date;
          periodEndDate = periods[0].end_date;
        } else {
          throw new Error('会计期间不存在');
        }
      }

      // 2. 构建查询
      const query = `
        SELECT
          a.id,
          a.account_code,
          a.account_name,
          a.account_type,
          a.is_debit,

          -- 期初净额 (借-贷)，包含科目期初余额和本期前已过账凭证
          CASE WHEN ${periodStartDate ? 'a.opening_balance_date IS NULL OR a.opening_balance_date <= ?' : '1=1'}
            THEN COALESCE(a.opening_debit, 0) - COALESCE(a.opening_credit, 0)
            ELSE 0 END + COALESCE(SUM(CASE
            WHEN e.is_posted = 1 AND ${periodStartDate ? 'e.entry_date < ?' : '1=0'} THEN (ei.debit_amount - ei.credit_amount)
            ELSE 0
          END), 0) as opening_net,

          -- 本期内启用的期初余额单列，不冒充期初余额或凭证发生额
          CASE WHEN ${periodStartDate && periodEndDate ? 'a.opening_balance_date > ? AND a.opening_balance_date <= ?' : '1=0'}
            THEN COALESCE(a.opening_debit, 0) - COALESCE(a.opening_credit, 0)
            ELSE 0 END as opening_adjustment,

          -- 本期发生额（使用日期范围过滤）
          COALESCE(SUM(CASE
            WHEN e.is_posted = 1 AND ${periodStartDate && periodEndDate ? 'e.entry_date >= ? AND e.entry_date <= ?' : '1=1'} THEN ei.debit_amount
            ELSE 0
          END), 0) as period_debit,

          COALESCE(SUM(CASE
            WHEN e.is_posted = 1 AND ${periodStartDate && periodEndDate ? 'e.entry_date >= ? AND e.entry_date <= ?' : '1=1'} THEN ei.credit_amount
            ELSE 0
          END), 0) as period_credit

        FROM gl_accounts a
        LEFT JOIN gl_entry_items ei ON a.id = ei.account_id
        LEFT JOIN gl_entries e ON ei.entry_id = e.id
        WHERE a.is_active = 1
        GROUP BY a.id, a.account_code, a.account_name, a.account_type, a.is_debit,
          a.opening_debit, a.opening_credit, a.opening_balance_date
        ORDER BY a.account_code
      `;

      // 构建参数列表 — 按 SQL 中占位符顺序依次推入
      if (periodStartDate) {
        params.push(periodStartDate); // opening effective at the start
        params.push(periodStartDate); // opening_net 条件
      }
      if (periodStartDate && periodEndDate) {
        params.push(periodStartDate, periodEndDate); // opening activated in this period
        params.push(periodStartDate, periodEndDate); // period_debit 条件
        params.push(periodStartDate, periodEndDate); // period_credit 条件
      }

      const [rows] = await executor.query(query, params);

      // 辅助函数：保留两位小数
      const round2 = (num) => Math.round((parseFloat(num) || 0) * 100) / 100;

      // 3. 计算最终余额
      const accounts = rows.map((row) => {
        const openingNet = round2(row.opening_net);
        const openingAdjustment = round2(row.opening_adjustment);
        const periodDebit = round2(row.period_debit);
        const periodCredit = round2(row.period_credit);

        // 期末净额 = 期初净额 + 本期借方 - 本期贷方
        const endingNet = round2(openingNet + openingAdjustment + periodDebit - periodCredit);

        return {
          id: row.id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type,
          is_debit: row.is_debit,

          // 期初余额显示
          opening_balance: row.is_debit ? openingNet : -openingNet,
          opening_adjustment_debit: Math.max(0, openingAdjustment),
          opening_adjustment_credit: Math.max(0, -openingAdjustment),

          // 本期发生
          total_debit: periodDebit,
          total_credit: periodCredit,

          // 期末余额显示 (分借贷列)
          debit_balance: endingNet > 0 ? endingNet : 0,
          credit_balance: endingNet < 0 ? Math.abs(endingNet) : 0,
        };
      });

      // 4. 计算汇总
      const summary = accounts.reduce(
        (acc, item) => {
          acc.total_debit = round2(acc.total_debit + item.total_debit);
          acc.total_credit = round2(acc.total_credit + item.total_credit);
          acc.total_opening_adjustment_debit = round2(
            acc.total_opening_adjustment_debit + item.opening_adjustment_debit
          );
          acc.total_opening_adjustment_credit = round2(
            acc.total_opening_adjustment_credit + item.opening_adjustment_credit
          );
          acc.total_debit_balance = round2(acc.total_debit_balance + item.debit_balance);
          acc.total_credit_balance = round2(acc.total_credit_balance + item.credit_balance);
          return acc;
        },
        {
          total_debit: 0,
          total_credit: 0,
          total_opening_adjustment_debit: 0,
          total_opening_adjustment_credit: 0,
          total_debit_balance: 0,
          total_credit_balance: 0,
        }
      );

      // 简单判断平衡 (允许微小误差)
      const isBalanced =
        Math.abs(summary.total_debit_balance - summary.total_credit_balance) < 0.01;

      return {
        trialBalance: accounts,
        summary,
        isBalanced,
      };
    } catch (error) {
      logger.error('获取试算平衡表失败:', error);
      throw error;
    }
  },
};
