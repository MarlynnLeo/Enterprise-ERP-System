/**
 * PeriodEndService — yearEnd methods (mixin)
 * @module periodEnd/yearEndMethods
 */

const runtime = require('./runtime');
const {
  logger,
  db,
  financeModel,
  DOCUMENT_TYPE_MAPPING,
  TAX_RELATED_DOCUMENT_TYPES,
  taxRelatedDocumentTypeMatchList,
  accountingConfig,
  CostClosingService,
  resolveActorUserId,
} = runtime;


module.exports = {
  /**
     * 年度结转 - 将本年利润结转到未分配利润
     * @param {Object} yearData 年度结转数据
     * @param {number} yearData.year 会计年度
     * @param {string} yearData.transferred_by 操作人
     * @returns {Object} 结转结果
     */
    async yearEndTransfer(yearData) {
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
  
        const { year, transferred_by } = yearData;
  
        if (!year) {
          throw new Error('会计年度不能为空');
        }
  
        // 1. 检查该年度所有期间是否已关闭
        const [openPeriods] = await connection.execute(
          `SELECT COUNT(*) as count FROM gl_periods
           WHERE fiscal_year = ? AND is_closed = false`,
          [year]
        );
  
        if (openPeriods[0].count > 0) {
          throw new Error(
            `${year}年度还有 ${openPeriods[0].count} 个未关闭的会计期间，请先关闭所有期间`
          );
        }
  
        // 2. 检查该年度是否有未过账分录
        const [unpostedEntries] = await connection.execute(
          `SELECT COUNT(*) as count FROM gl_entries e
           JOIN gl_periods p ON e.period_id = p.id
           WHERE p.fiscal_year = ? AND e.is_posted = false`,
          [year]
        );
  
        if (unpostedEntries[0].count > 0) {
          throw new Error(`${year}年度还有 ${unpostedEntries[0].count} 条未过账分录，请先过账`);
        }
  
        // 3. 检查是否已经执行过年度结转
        const [existingTransfer] = await connection.execute(
          `SELECT
             (
               SELECT COUNT(*)
               FROM gl_entries
               WHERE document_type = ? AND YEAR(entry_date) = ?
             ) + (
               SELECT COUNT(*)
               FROM operation_logs
               WHERE module = 'finance'
                 AND operation = 'year_end_transfer'
                 AND JSON_VALID(request_data)
                 AND JSON_UNQUOTE(JSON_EXTRACT(request_data, '$.year')) = ?
             ) as count`,
          [DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER, year, String(year)]
        );
  
        if (existingTransfer[0].count > 0) {
          throw new Error(`${year}年度已执行过年度结转`);
        }
  
        // 4. 获取本年利润科目余额
        const profitAccountId = await this.getCurrentYearProfitAccountId(connection);
        const [profitBalance] = await connection.execute(
          `
          SELECT COALESCE(SUM(gei.credit_amount - gei.debit_amount), 0) as balance
          FROM gl_entry_items gei
          JOIN gl_entries ge ON gei.entry_id = ge.id
          JOIN gl_periods p ON ge.period_id = p.id
          WHERE gei.account_id = ? AND p.fiscal_year = ? AND ge.is_posted = true
        `,
          [profitAccountId, year]
        );
  
        const netProfit = parseFloat(profitBalance[0].balance) || 0;
  
        // 5. 获取最后一个期间ID用于记录分录
        const [lastPeriod] = await connection.execute(
          'SELECT id, end_date FROM gl_periods WHERE fiscal_year = ? ORDER BY end_date DESC LIMIT 1',
          [year]
        );
  
        if (lastPeriod.length === 0) {
          throw new Error(`${year}年度没有会计期间`);
        }
  
        const periodId = lastPeriod[0].id;
        const [laterClosedPeriods] = await connection.execute(
          'SELECT COUNT(*) as count FROM gl_periods WHERE start_date > ? AND is_closed = true',
          [lastPeriod[0].end_date]
        );
  
        if ((parseInt(laterClosedPeriods[0].count, 10) || 0) > 0) {
          throw new Error('存在已关闭的后续会计期间，不能再执行上一年度结转');
        }
  
        // 6. 创建年度结转分录
        const entryNumber = await this.generateYearEndEntryNumber(year);
        const retainedEarningsAccountId = await this.getRetainedEarningsAccountId(connection);
  
        const yearActorId = await resolveActorUserId(connection, transferred_by);
        const entryData = {
          entry_number: entryNumber,
          entry_date: `${year}-12-31`,
          posting_date: `${year}-12-31`,
          document_type: DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER,
          document_number: `YE-${year}`,
          period_id: periodId,
          description: `${year}年度利润结转`,
          created_by: yearActorId,
          status: 'posted',
          is_posted: 1,
          allow_closed_period: true,
        };
  
        const entryItems = [];
  
        if (Math.abs(netProfit) >= 0.01) {
          if (netProfit > 0) {
            // 盈利：借记本年利润，贷记未分配利润
            entryItems.push(
              {
                account_id: profitAccountId,
                debit_amount: netProfit,
                credit_amount: 0,
                description: `${year}年度结转本年利润`,
              },
              {
                account_id: retainedEarningsAccountId,
                debit_amount: 0,
                credit_amount: netProfit,
                description: `${year}年度转入未分配利润`,
              }
            );
          } else {
            // 亏损：借记未分配利润，贷记本年利润
            entryItems.push(
              {
                account_id: retainedEarningsAccountId,
                debit_amount: Math.abs(netProfit),
                credit_amount: 0,
                description: `${year}年度转入未分配利润（亏损）`,
              },
              {
                account_id: profitAccountId,
                debit_amount: 0,
                credit_amount: Math.abs(netProfit),
                description: `${year}年度结转本年利润（亏损）`,
              }
            );
          }
  
          await financeModel.createEntry(entryData, entryItems, connection);
          await this.calculatePeriodEndBalances(connection, periodId, {
            end_date: lastPeriod[0].end_date,
          });
        }
  
        // 7. 记录年度结转日志
        await connection.execute(
          `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [
            'finance',
            'year_end_transfer',
            String(yearActorId),
            JSON.stringify({ year, netProfit, transferred_by: yearActorId }),
          ]
        );
  
        await connection.commit();
  
        logger.info(`${year}年度结转完成，净利润: ${netProfit}`);
  
        return {
          year,
          netProfit,
          entryNumber: entryItems.length > 0 ? entryNumber : null,
          message:
            netProfit >= 0
              ? `${year}年度结转完成，净利润 ${netProfit.toFixed(2)} 元已转入未分配利润`
              : `${year}年度结转完成，净亏损 ${Math.abs(netProfit).toFixed(2)} 元已转入未分配利润`,
        };
      } catch (error) {
        await connection.rollback();
        logger.error('年度结转失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },

  /**
     * 获取年度结转状态
     * @param {number} year 会计年度
     * @returns {Object} 年度结转状态信息
     */
    async getYearEndStatus(year) {
      try {
        // 获取期间状态
        const [periods] = await db.pool.execute(
          `SELECT id, period_name, start_date, end_date, is_closed
           FROM gl_periods WHERE fiscal_year = ? ORDER BY start_date`,
          [year]
        );
  
        const closedCount = periods.filter((p) => p.is_closed).length;
        const totalCount = periods.length;
  
        // 检查是否已执行年度结转
        const [transfers] = await db.pool.execute(
          `SELECT
             (
               SELECT COUNT(*)
               FROM gl_entries
               WHERE document_type = ? AND YEAR(entry_date) = ?
             ) + (
               SELECT COUNT(*)
               FROM operation_logs
               WHERE module = 'finance'
                 AND operation = 'year_end_transfer'
                 AND JSON_VALID(request_data)
                 AND JSON_UNQUOTE(JSON_EXTRACT(request_data, '$.year')) = ?
             ) as count`,
          [DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER, year, String(year)]
        );
  
        const isTransferred = transfers[0].count > 0;
  
        // 获取本年利润余额
        await accountingConfig.loadFromDatabase(db);
        const currentYearProfitCode = accountingConfig.getAccountCode('CURRENT_YEAR_PROFIT');
        let profitAccounts = [];
        if (currentYearProfitCode) {
          [profitAccounts] = await db.pool.execute(
            'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1 LIMIT 1',
            [currentYearProfitCode]
          );
        }
        if (profitAccounts.length === 0) {
          // 科目不存在时直接返回，而不是用错误的兜底 id
          return {
            year,
            periods,
            closedCount,
            totalCount,
            allPeriodsClosed: closedCount === totalCount && totalCount > 0,
            isTransferred,
            netProfit: 0,
            warning: `未找到本年利润科目(${currentYearProfitCode || 'CURRENT_YEAR_PROFIT'})，无法计算年度利润`,
          };
        }
        const profitAccountId = profitAccounts[0].id;
  
        const [profitBalance] = await db.pool.execute(
          `
          SELECT COALESCE(SUM(gei.credit_amount - gei.debit_amount), 0) as balance
          FROM gl_entry_items gei
          JOIN gl_entries ge ON gei.entry_id = ge.id
          JOIN gl_periods p ON ge.period_id = p.id
          WHERE gei.account_id = ? AND p.fiscal_year = ? AND ge.is_posted = true
        `,
          [profitAccountId, year]
        );
  
        return {
          year,
          periods,
          closedCount,
          totalCount,
          allPeriodsClosed: closedCount === totalCount && totalCount > 0,
          isTransferred,
          netProfit: parseFloat(profitBalance[0].balance) || 0,
        };
      } catch (error) {
        logger.error('获取年度结转状态失败:', error);
        throw error;
      }
    },
};
