/**
 * PeriodEndService.js
 * @description 服务层文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const financeModel = require('../../models/finance');
const { DOCUMENT_TYPE_MAPPING } = require('../../constants/financeConstants');

/**
 * 期末处理服务
 * 处理期末结账、结转等功能
 */
class PeriodEndService {
  static roundMoney(value) {
    return Math.round((parseFloat(value) || 0) * 100) / 100;
  }

  static isClosed(value) {
    return value === true || value === 1 || value === '1';
  }

  static async findPriorOpenPeriod(connection, periodId, period, lock = false) {
    const [rows] = await connection.execute(
      `SELECT id, period_name, end_date
       FROM gl_periods
       WHERE id <> ?
         AND fiscal_year <=> ?
         AND end_date < ?
         AND is_closed = 0
       ORDER BY end_date DESC, id DESC
       LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
      [periodId, period.fiscal_year, period.start_date]
    );
    return rows[0] || null;
  }

  static async getPeriodEntryIntegrity(connection, periodId, period) {
    const [unpostedEntries] = await connection.execute(
      `SELECT COUNT(DISTINCT id) as count
       FROM gl_entries
       WHERE COALESCE(is_posted, 0) = 0
         AND (
           period_id = ?
           OR entry_date BETWEEN ? AND ?
           OR posting_date BETWEEN ? AND ?
         )`,
      [periodId, period.start_date, period.end_date, period.start_date, period.end_date]
    );

    const [postedDateMismatches] = await connection.execute(
      `SELECT COUNT(*) as count
       FROM gl_entries
       WHERE COALESCE(is_posted, 0) = 1
         AND period_id = ?
         AND (
           entry_date NOT BETWEEN ? AND ?
           OR (
             posting_date IS NOT NULL
             AND posting_date NOT BETWEEN ? AND ?
           )
         )`,
      [periodId, period.start_date, period.end_date, period.start_date, period.end_date]
    );

    const [postedPeriodMismatches] = await connection.execute(
      `SELECT COUNT(*) as count
       FROM gl_entries
       WHERE COALESCE(is_posted, 0) = 1
         AND entry_date BETWEEN ? AND ?
         AND (period_id IS NULL OR period_id <> ?)`,
      [period.start_date, period.end_date, periodId]
    );

    return {
      unpostedCount: Number(unpostedEntries[0]?.count || 0),
      postedDateMismatchCount: Number(postedDateMismatches[0]?.count || 0),
      postedPeriodMismatchCount: Number(postedPeriodMismatches[0]?.count || 0),
    };
  }

  /**
   * 获取期末关账预览
   * @param {number} periodId 会计期间ID
   * @returns {Object} 关账预览
   */
  static async getClosingPreview(periodId) {
    const connection = await db.pool.getConnection();
    try {
      const [periodInfo] = await connection.execute('SELECT * FROM gl_periods WHERE id = ?', [
        periodId,
      ]);

      if (periodInfo.length === 0) {
        throw new Error('会计期间不存在');
      }

      const period = periodInfo[0];
      const priorOpenPeriod = await this.findPriorOpenPeriod(connection, periodId, period);
      const entryIntegrity = await this.getPeriodEntryIntegrity(connection, periodId, period);

      const [existingClosingEntries] = await connection.execute(
        `SELECT COUNT(*) as count FROM gl_entries
         WHERE period_id = ? AND document_type = ?`,
        [periodId, DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER]
      );

      const [profitAccounts] = await connection.execute(
        "SELECT id FROM gl_accounts WHERE account_code = '3103' LIMIT 1"
      );

      const [closingRows] = await connection.execute(
        `
        SELECT
          a.id,
          a.account_code,
          a.account_name,
          a.account_type,
          COALESCE(SUM(ei.debit_amount), 0) as total_debit,
          COALESCE(SUM(ei.credit_amount), 0) as total_credit,
          CASE
            WHEN a.account_type IN ('收入', 'revenue') THEN
              COALESCE(SUM(ei.credit_amount - ei.debit_amount), 0)
            ELSE
              COALESCE(SUM(ei.debit_amount - ei.credit_amount), 0)
          END as closing_amount
        FROM gl_accounts a
        JOIN gl_entry_items ei ON a.id = ei.account_id
        JOIN gl_entries e ON ei.entry_id = e.id
        WHERE e.period_id = ?
          AND e.is_posted = true
          AND a.is_active = true
          AND a.account_type IN ('收入', '费用', '成本', 'revenue', 'expense', 'cost')
        GROUP BY a.id, a.account_code, a.account_name, a.account_type
        HAVING ABS(closing_amount) >= 0.01
        ORDER BY a.account_code
      `,
        [periodId]
      );

      const closingItems = closingRows.map((row) => {
        const signedAmount = this.roundMoney(row.closing_amount);
        const isIncome = ['收入', 'revenue'].includes(row.account_type);
        return {
          ...row,
          total_debit: this.roundMoney(row.total_debit),
          total_credit: this.roundMoney(row.total_credit),
          raw_closing_amount: signedAmount,
          closing_amount: Math.abs(signedAmount),
          closing_direction: isIncome
            ? signedAmount >= 0
              ? '借方'
              : '贷方'
            : signedAmount >= 0
              ? '贷方'
              : '借方',
        };
      });

      const totalIncome = this.roundMoney(
        closingItems
          .filter((item) => ['收入', 'revenue'].includes(item.account_type))
          .reduce((sum, item) => sum + item.raw_closing_amount, 0)
      );
      const totalExpense = this.roundMoney(
        closingItems
          .filter((item) => !['收入', 'revenue'].includes(item.account_type))
          .reduce((sum, item) => sum + item.raw_closing_amount, 0)
      );
      const netProfit = this.roundMoney(totalIncome - totalExpense);

      const trialBalance = await financeModel.getTrialBalance(periodId);
      const checks = [
        {
          key: 'period_open',
          name: '会计期间未关闭',
          passed: !this.isClosed(period.is_closed),
          message: this.isClosed(period.is_closed) ? '该期间已关闭' : null,
        },
        {
          key: 'unposted_entries',
          name: '无未过账凭证',
          passed: entryIntegrity.unpostedCount === 0,
          message:
            entryIntegrity.unpostedCount > 0
              ? `本期还有 ${entryIntegrity.unpostedCount} 张未过账凭证`
              : null,
        },
        {
          key: 'prior_periods_closed',
          name: '前序期间已关闭',
          passed: !priorOpenPeriod,
          message: priorOpenPeriod
            ? `前序期间[${priorOpenPeriod.period_name}]尚未关闭，请按期间顺序结账`
            : null,
        },
        {
          key: 'entry_period_consistency',
          name: '凭证期间归属一致',
          passed:
            entryIntegrity.postedDateMismatchCount === 0 &&
            entryIntegrity.postedPeriodMismatchCount === 0,
          message:
            entryIntegrity.postedDateMismatchCount > 0
              ? `有 ${entryIntegrity.postedDateMismatchCount} 张已过账凭证的日期不在本期间范围内`
              : entryIntegrity.postedPeriodMismatchCount > 0
                ? `有 ${entryIntegrity.postedPeriodMismatchCount} 张已过账凭证日期落在本期间但期间归属不一致`
                : null,
        },
        {
          key: 'no_existing_closing',
          name: '未重复生成结转凭证',
          passed: existingClosingEntries[0].count === 0,
          message:
            existingClosingEntries[0].count > 0 ? '本期已存在损益结转凭证，不能重复结账' : null,
        },
        {
          key: 'trial_balance',
          name: '试算平衡',
          passed: trialBalance.isBalanced,
          message: trialBalance.isBalanced ? null : '试算平衡表借贷不平衡',
        },
        {
          key: 'profit_account',
          name: '本年利润科目配置',
          passed: profitAccounts.length > 0 || Math.abs(netProfit) < 0.01,
          message:
            profitAccounts.length === 0 && Math.abs(netProfit) >= 0.01
              ? '未配置本年利润科目(3103)'
              : null,
        },
      ];

      const canClose = checks.every((check) => check.passed);

      return {
        period,
        canClose,
        unpostedCount: entryIntegrity.unpostedCount,
        postedDateMismatchCount: entryIntegrity.postedDateMismatchCount,
        postedPeriodMismatchCount: entryIntegrity.postedPeriodMismatchCount,
        hasExistingClosing: existingClosingEntries[0].count > 0,
        checks,
        summary: {
          totalIncome,
          totalExpense,
          netProfit,
        },
        trialBalance: {
          isBalanced: trialBalance.isBalanced,
          summary: trialBalance.summary,
        },
        closingItems,
      };
    } catch (error) {
      logger.error('获取期末关账预览失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 期末结账
   * @param {Object} periodData 期间数据
   * @returns {Object} 结账结果
   */
  static async closePeriod(periodData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const { period_id, closed_by, closing_date } = periodData;

      // 检查期间状态
      const [periodInfo] = await connection.execute('SELECT * FROM gl_periods WHERE id = ? FOR UPDATE', [
        period_id,
      ]);

      if (periodInfo.length === 0) {
        throw new Error('会计期间不存在');
      }

      if (periodInfo[0].is_closed) {
        throw new Error('会计期间已经关闭');
      }

      const period = periodInfo[0];

      const priorOpenPeriod = await this.findPriorOpenPeriod(connection, period_id, period, true);
      if (priorOpenPeriod) {
        throw new Error(`前序会计期间[${priorOpenPeriod.period_name}]尚未关闭，请按期间顺序结账`);
      }

      // 1. 检查期间内未过账凭证，以及凭证日期与期间归属一致性
      const entryIntegrity = await this.getPeriodEntryIntegrity(connection, period_id, period);

      if (entryIntegrity.unpostedCount > 0) {
        throw new Error(`期间内还有 ${entryIntegrity.unpostedCount} 条未过账分录，请先过账`);
      }

      if (entryIntegrity.postedDateMismatchCount > 0) {
        throw new Error(
          `本期间有 ${entryIntegrity.postedDateMismatchCount} 张已过账凭证的日期不在期间范围内，请先修正凭证日期或期间归属`
        );
      }

      if (entryIntegrity.postedPeriodMismatchCount > 0) {
        throw new Error(
          `有 ${entryIntegrity.postedPeriodMismatchCount} 张已过账凭证日期落在本期间但期间归属不一致，请先修正凭证期间`
        );
      }

      const trialBalance = await financeModel.getTrialBalance(period_id);
      if (!trialBalance.isBalanced) {
        throw new Error('试算平衡表借贷不平衡，请先检查凭证或期初余额');
      }

      // 2. 执行损益结转
      const [existingClosingEntries] = await connection.execute(
        `SELECT id FROM gl_entries
         WHERE period_id = ? AND document_type = ?
         LIMIT 1
         FOR UPDATE`,
        [period_id, DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER]
      );
      if (existingClosingEntries.length > 0) {
        throw new Error('Profit/loss closing entry already exists for this period');
      }

      const transferResult = await this.transferProfitAndLoss(connection, period_id, period);

      // 3. 计算期末余额
      await this.calculatePeriodEndBalances(connection, period_id, period);

      // 4. 更新期间状态
      await connection.execute(
        `UPDATE gl_periods 
         SET is_closed = true, closed_by = ?, closed_at = ?, closing_date = ?
         WHERE id = ?`,
        [closed_by, new Date(), closing_date || new Date(), period_id]
      );

      await connection.commit();

      return {
        periodId: period_id,
        periodName: period.period_name,
        transferResult,
        message: '期末结账完成',
      };
    } catch (error) {
      await connection.rollback();
      logger.error('期末结账失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 自动执行完整的期末结转流程
   * @param {number} periodId 会计期间ID
   */
  static async executeAutoClosing(periodId, options = {}) {
    // 旧自动化入口统一收敛到正式关账流程，避免绕过未过账校验、余额快照和期间锁定。
    return await this.closePeriod({
      period_id: periodId,
      closed_by: options.closed_by || 'system',
      closing_date: options.closing_date || new Date().toISOString().slice(0, 10),
    });
  }

  /**
   * 损益结转
   * @param {Object} connection 数据库连接
   * @param {number} periodId 期间ID
   * @param {Object} period 期间信息
   * @returns {Object} 结转结果
   */
  static async transferProfitAndLoss(connection, periodId, period) {
    // 获取收入类科目余额
    const [incomeAccounts] = await connection.execute(
      `SELECT a.id, a.account_code, a.account_name,
              COALESCE(SUM(ei.credit_amount - ei.debit_amount), 0) as balance
       FROM gl_accounts a
       LEFT JOIN gl_entry_items ei ON a.id = ei.account_id
       LEFT JOIN gl_entries e ON ei.entry_id = e.id
       WHERE a.account_type IN ('收入', 'revenue')
       AND e.period_id = ?
       AND e.is_posted = true
       GROUP BY a.id, a.account_code, a.account_name
       HAVING balance != 0`,
      [periodId]
    );

    // 获取费用/成本类科目余额
    const [expenseAccounts] = await connection.execute(
      `SELECT a.id, a.account_code, a.account_name,
              COALESCE(SUM(ei.debit_amount - ei.credit_amount), 0) as balance
       FROM gl_accounts a
       LEFT JOIN gl_entry_items ei ON a.id = ei.account_id
       LEFT JOIN gl_entries e ON ei.entry_id = e.id
       WHERE a.account_type IN ('费用', '成本', 'expense', 'cost')
       AND e.period_id = ?
       AND e.is_posted = true
       GROUP BY a.id, a.account_code, a.account_name
       HAVING balance != 0`,
      [periodId]
    );

    // 计算本期损益
    const totalIncome = incomeAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
    const totalExpense = expenseAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
    const netProfit = totalIncome - totalExpense;

    if (totalIncome === 0 && totalExpense === 0) {
      return {
        totalIncome: 0,
        totalExpense: 0,
        netProfit: 0,
        entryId: null,
      };
    }

    // 获取本年利润科目
    const [profitAccount] = await connection.execute(
      'SELECT id FROM gl_accounts WHERE account_code = ? OR account_name = ?',
      ['3103', '本年利润']
    );

    if (profitAccount.length === 0) {
      throw new Error('找不到本年利润科目，请先创建');
    }

    const profitAccountId = profitAccount[0].id;

    // 生成结转分录
    const periodName = period.period_name || `期间${periodId}`;
    const entryNumber = await this.generateTransferEntryNumber(connection);

    const entryData = {
      entry_number: entryNumber,
      entry_date: period.end_date,
      posting_date: period.end_date,
      document_type: DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER,
      document_number: `PL-${periodName}`,
      period_id: periodId,
      description: `${periodName} 损益结转`,
      created_by: 'system',
      status: 'posted',
      is_posted: 1,
    };

    const entryItems = [];
    let profitDebit = 0;
    let profitCredit = 0;

    // 结转收入（借：收入科目，贷：本年利润）
    for (const account of incomeAccounts) {
      const balance = parseFloat(account.balance) || 0;
      if (Math.abs(balance) >= 0.01) {
        entryItems.push({
          account_id: account.id,
          debit_amount: balance > 0 ? balance : 0,
          credit_amount: balance < 0 ? Math.abs(balance) : 0,
          description: `结转${account.account_name}`,
        });
        if (balance > 0) {
          profitCredit += balance;
        } else {
          profitDebit += Math.abs(balance);
        }
      }
    }

    // 结转费用/成本（借：本年利润，贷：费用/成本科目）
    for (const account of expenseAccounts) {
      const balance = parseFloat(account.balance) || 0;
      if (Math.abs(balance) >= 0.01) {
        entryItems.push({
          account_id: account.id,
          debit_amount: balance < 0 ? Math.abs(balance) : 0,
          credit_amount: balance > 0 ? balance : 0,
          description: `结转${account.account_name}`,
        });
        if (balance > 0) {
          profitDebit += balance;
        } else {
          profitCredit += Math.abs(balance);
        }
      }
    }

    const profitNet = this.roundMoney(profitCredit - profitDebit);
    if (profitNet > 0) {
      entryItems.push({
        account_id: profitAccountId,
        debit_amount: 0,
        credit_amount: profitNet,
        description: '本期净利润',
      });
    } else if (profitNet < 0) {
      entryItems.push({
        account_id: profitAccountId,
        debit_amount: Math.abs(profitNet),
        credit_amount: 0,
        description: '本期净亏损',
      });
    }

    // 创建结转分录
    const entryId = await financeModel.createEntry(entryData, entryItems, connection);

    return {
      totalIncome,
      totalExpense,
      netProfit,
      entryId,
      entryNumber,
    };
  }

  /**
   * 计算期末余额
   * @param {Object} connection 数据库连接
   * @param {number} periodId 期间ID
   */
  static async calculatePeriodEndBalances(connection, periodId, period) {
    // 删除旧的期末余额记录
    await connection.execute('DELETE FROM gl_period_balances WHERE period_id = ?', [periodId]);

    // 计算并插入新的期末余额
    await connection.execute(
      `
      INSERT INTO gl_period_balances (period_id, account_id, debit_balance, credit_balance)
      SELECT 
        ? as period_id,
        a.id as account_id,
        GREATEST(
          COALESCE(a.opening_debit, 0) - COALESCE(a.opening_credit, 0)
          + COALESCE(SUM(
            CASE
              WHEN e.is_posted = true AND e.entry_date <= ? THEN ei.debit_amount - ei.credit_amount
              ELSE 0
            END
          ), 0),
          0
        ) as debit_balance,
        GREATEST(
          -(
            COALESCE(a.opening_debit, 0) - COALESCE(a.opening_credit, 0)
            + COALESCE(SUM(
              CASE
                WHEN e.is_posted = true AND e.entry_date <= ? THEN ei.debit_amount - ei.credit_amount
                ELSE 0
              END
            ), 0)
          ),
          0
        ) as credit_balance
      FROM gl_accounts a
      LEFT JOIN gl_entry_items ei ON a.id = ei.account_id
      LEFT JOIN gl_entries e ON ei.entry_id = e.id
      WHERE a.is_active = true
      GROUP BY a.id, a.opening_debit, a.opening_credit
      HAVING debit_balance != 0 OR credit_balance != 0
    `,
      [periodId, period.end_date, period.end_date]
    );
  }

  /**
   * 重新开启期间
   * @param {Object} periodData 期间数据
   * @returns {Object} 开启结果
   */
  static async reopenPeriod(periodData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const { period_id, reopened_by } = periodData;

      // 检查期间状态
      const [periodInfo] = await connection.execute('SELECT * FROM gl_periods WHERE id = ? FOR UPDATE', [
        period_id,
      ]);

      if (periodInfo.length === 0) {
        throw new Error('会计期间不存在');
      }

      if (!periodInfo[0].is_closed) {
        throw new Error('会计期间未关闭，无需重新开启');
      }

      const period = periodInfo[0];

      // 检查是否有后续期间已关闭
      const [laterPeriods] = await connection.execute(
        'SELECT COUNT(*) as count FROM gl_periods WHERE start_date > ? AND is_closed = true',
        [period.end_date]
      );

      if (laterPeriods[0].count > 0) {
        throw new Error('存在已关闭的后续期间，不能重新开启此期间');
      }

      const [closingEntries] = await connection.execute(
        `SELECT id FROM gl_entries
         WHERE period_id = ? AND document_type = ?
         FOR UPDATE`,
        [period_id, DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER]
      );

      if (closingEntries.length > 0) {
        const entryIds = closingEntries.map((entry) => entry.id);
        const placeholders = entryIds.map(() => '?').join(',');

        await connection.query(
          `DELETE FROM document_links
           WHERE (target_type = 'finance_voucher' AND target_id IN (${placeholders}))
              OR (source_type = 'finance_voucher' AND source_id IN (${placeholders}))`,
          [...entryIds, ...entryIds]
        );

        // 删除损益结转分录，明细由外键级联删除
        await connection.query(
          `DELETE FROM gl_entries WHERE id IN (${placeholders})`,
          entryIds
        );
      }

      // 删除期末余额
      await connection.execute('DELETE FROM gl_period_balances WHERE period_id = ?', [period_id]);

      // 更新期间状态
      await connection.execute(
        `UPDATE gl_periods 
         SET is_closed = false, closed_by = NULL, closed_at = NULL, 
             closing_date = NULL, reopened_by = ?, reopened_at = ?
         WHERE id = ?`,
        [reopened_by, new Date(), period_id]
      );

      await connection.commit();

      return {
        periodId: period_id,
        periodName: period.period_name,
        message: '期间重新开启完成',
      };
    } catch (error) {
      await connection.rollback();
      logger.error('重新开启期间失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成结转分录编号
   * @returns {string} 分录编号
   */
  static async generateTransferEntryNumber(connection = db.pool) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PL${dateStr}`;

    const [result] = await connection.execute(
      `SELECT entry_number
       FROM gl_entries
       WHERE entry_number LIKE ?
       ORDER BY entry_number DESC
       LIMIT 1
       FOR UPDATE`,
      [`${prefix}%`]
    );

    const lastSequence = result[0]?.entry_number?.startsWith(prefix)
      ? Number.parseInt(result[0].entry_number.slice(prefix.length), 10) || 0
      : 0;
    const sequence = (lastSequence + 1).toString().padStart(3, '0');
    return `${prefix}${sequence}`;
  }

  /**
   * 获取期间结账状态
   * @param {number} periodId 期间ID
   * @returns {Object} 结账状态信息
   */
  static async getPeriodClosingStatus(periodId) {
    try {
      const [periodInfo] = await db.pool.execute('SELECT * FROM gl_periods WHERE id = ?', [
        periodId,
      ]);

      if (periodInfo.length === 0) {
        throw new Error('会计期间不存在');
      }

      const period = periodInfo[0];

      // 检查未过账分录
      const [unpostedEntries] = await db.pool.execute(
        `SELECT COUNT(*) as count FROM gl_entries
         WHERE period_id = ? AND is_posted = false`,
        [periodId]
      );

      // 检查是否已有损益结转
      const [transferEntries] = await db.pool.execute(
        `SELECT COUNT(*) as count FROM gl_entries
         WHERE period_id = ? AND document_type = ?`,
        [periodId, DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER]
      );

      // 计算本期损益
      const [incomeSum] = await db.pool.execute(
        `SELECT COALESCE(SUM(ei.credit_amount - ei.debit_amount), 0) as total_income
         FROM gl_entry_items ei
         JOIN gl_entries e ON ei.entry_id = e.id
         JOIN gl_accounts a ON ei.account_id = a.id
         WHERE e.period_id = ? AND e.is_posted = true AND a.account_type = '收入'`,
        [periodId]
      );

      const [expenseSum] = await db.pool.execute(
        `SELECT COALESCE(SUM(ei.debit_amount - ei.credit_amount), 0) as total_expense
         FROM gl_entry_items ei
         JOIN gl_entries e ON ei.entry_id = e.id
         JOIN gl_accounts a ON ei.account_id = a.id
         WHERE e.period_id = ? AND e.is_posted = true AND a.account_type = '费用'`,
        [periodId]
      );

      const totalIncome = parseFloat(incomeSum[0].total_income);
      const totalExpense = parseFloat(expenseSum[0].total_expense);
      const netProfit = totalIncome - totalExpense;

      return {
        period: {
          id: period.id,
          name: period.period_name,
          startDate: period.start_date,
          endDate: period.end_date,
          isClosed: period.is_closed,
          closedBy: period.closed_by,
          closedAt: period.closed_at,
        },
        status: {
          unpostedEntriesCount: unpostedEntries[0].count,
          hasTransferEntries: transferEntries[0].count > 0,
          canClose: unpostedEntries[0].count === 0 && !period.is_closed,
          canReopen: period.is_closed,
        },
        profitLoss: {
          totalIncome,
          totalExpense,
          netProfit,
        },
      };
    } catch (error) {
      logger.error('获取期间结账状态失败:', error);
      throw error;
    }
  }

  /**
   * 年度结转 - 将本年利润结转到未分配利润
   * @param {Object} yearData 年度结转数据
   * @param {number} yearData.year 会计年度
   * @param {string} yearData.transferred_by 操作人
   * @returns {Object} 结转结果
   */
  static async yearEndTransfer(yearData) {
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
        `SELECT COUNT(*) as count FROM gl_entries
         WHERE document_type = ? AND YEAR(entry_date) = ?`,
        [DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER, year]
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
        'SELECT id FROM gl_periods WHERE fiscal_year = ? ORDER BY end_date DESC LIMIT 1',
        [year]
      );

      if (lastPeriod.length === 0) {
        throw new Error(`${year}年度没有会计期间`);
      }

      const periodId = lastPeriod[0].id;

      // 6. 创建年度结转分录
      const entryNumber = await this.generateYearEndEntryNumber(year);
      const retainedEarningsAccountId = await this.getRetainedEarningsAccountId(connection);

      const entryData = {
        entry_number: entryNumber,
        entry_date: `${year}-12-31`,
        posting_date: `${year}-12-31`,
        document_type: DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER,
        document_number: `YE-${year}`,
        period_id: periodId,
        description: `${year}年度利润结转`,
        created_by: transferred_by || 'system',
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

        // 创建并过账分录
        const entryId = await financeModel.createEntry(entryData, entryItems, connection);
        // 年度结转凭证在同一事务中立即过账（年度期间关闭状态已在事务开头校验）
        await connection.execute("UPDATE gl_entries SET is_posted = 1, status = 'posted' WHERE id = ?", [entryId]);
      }

      // 7. 记录年度结转日志
      await connection.execute(
        `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'finance',
          'year_end_transfer',
          transferred_by || 'system',
          JSON.stringify({ year, netProfit }),
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
  }

  /**
   * 获取年度结转状态
   * @param {number} year 会计年度
   * @returns {Object} 年度结转状态信息
   */
  static async getYearEndStatus(year) {
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
        `SELECT COUNT(*) as count FROM gl_entries
         WHERE document_type = ? AND YEAR(entry_date) = ?`,
        [DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER, year]
      );

      const isTransferred = transfers[0].count > 0;

      // 获取本年利润余额
      const [profitAccounts] = await db.pool.execute(
        "SELECT id FROM gl_accounts WHERE account_code = '3103' LIMIT 1"
      );
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
          warning: '未找到本年利润科目(3103)，无法计算年度利润',
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
  }

  /**
   * 生成年度结转分录编号
   * @param {number} year 年度
   * @returns {string} 分录编号
   */
  static async generateYearEndEntryNumber(year) {
    // 获取年度结转序号
    const [result] = await db.pool.execute(
      'SELECT COUNT(*) as count FROM gl_entries WHERE document_type = ? AND YEAR(entry_date) = ?',
      [DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER, year]
    );

    const sequence = (result[0].count + 1).toString().padStart(2, '0');
    return `YE${year}${sequence}`;
  }

  /**
   * 初始化期末处理相关表
   * @deprecated 表结构已迁移至 Knex migration 文件管理，此方法保留为空操作以兼容旧调用
   */
  static async initializePeriodEndTables() {
    logger.info('[PeriodEndService] 期末处理表已由 Knex migration 管理，跳过运行时创建');
  }

  /**
   * 结转收入类科目
   */
  static async closeRevenueAccounts(connection, periodId) {
    // 获取收入类科目余额（6开头的科目）
    const [revenueAccounts] = await connection.execute(
      `
      SELECT
        ga.id,
        ga.account_code,
        ga.account_name,
        COALESCE(SUM(gei.credit_amount - gei.debit_amount), 0) as balance
      FROM gl_accounts ga
      LEFT JOIN gl_entry_items gei ON ga.id = gei.account_id
      LEFT JOIN gl_entries ge ON gei.entry_id = ge.id
      WHERE (ga.account_type = '收入' OR ga.account_code LIKE '6%')
        AND ga.is_active = true
        AND (ge.period_id = ? OR ge.period_id IS NULL)
      GROUP BY ga.id, ga.account_code, ga.account_name
      HAVING balance != 0
    `,
      [periodId]
    );

    if (revenueAccounts.length === 0) {
      return;
    }

    // 生成结转分录
    const entryNumber = await this.generateEntryNumber('CLOSE');
    const entryData = {
      entry_number: entryNumber,
      entry_date: new Date().toISOString().split('T')[0],
      posting_date: new Date().toISOString().split('T')[0],
      document_type: DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER,
      document_number: `CLOSE-${periodId}`,
      period_id: periodId,
      description: '期末结转收入类科目',
      created_by: 'system',
    };

    const entryItems = [];
    let totalRevenue = 0;

    // 借记各收入科目（冲销余额）
    for (const account of revenueAccounts) {
      if (account.balance > 0) {
        entryItems.push({
          account_id: account.id,
          debit_amount: account.balance,
          credit_amount: 0,
          description: `结转${account.account_name}`,
        });
        totalRevenue += account.balance;
      }
    }

    // 贷记本年利润
    if (totalRevenue > 0) {
      const profitAccountId = await this.getCurrentYearProfitAccountId(connection);
      entryItems.push({
        account_id: profitAccountId,
        debit_amount: 0,
        credit_amount: totalRevenue,
        description: '结转收入至本年利润',
      });

      await financeModel.createEntry(entryData, entryItems, connection);
    }
  }

  /**
   * 结转费用类科目
   */
  static async closeExpenseAccounts(connection, periodId) {
    // 获取费用类科目余额（6开头的科目，但排除收入类）
    const [expenseAccounts] = await connection.execute(
      `
      SELECT
        ga.id,
        ga.account_code,
        ga.account_name,
        COALESCE(SUM(gei.debit_amount - gei.credit_amount), 0) as balance
      FROM gl_accounts ga
      LEFT JOIN gl_entry_items gei ON ga.id = gei.account_id
      LEFT JOIN gl_entries ge ON gei.entry_id = ge.id
      WHERE (ga.account_type = '费用' OR (ga.account_code LIKE '6%' AND ga.account_type != '收入'))
        AND ga.is_active = true
        AND (ge.period_id = ? OR ge.period_id IS NULL)
      GROUP BY ga.id, ga.account_code, ga.account_name
      HAVING balance != 0
    `,
      [periodId]
    );

    if (expenseAccounts.length === 0) {
      return;
    }

    // 生成结转分录
    const entryNumber = await this.generateEntryNumber('CLOSE');
    const entryData = {
      entry_number: entryNumber,
      entry_date: new Date().toISOString().split('T')[0],
      posting_date: new Date().toISOString().split('T')[0],
      document_type: DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER,
      document_number: `CLOSE-${periodId}`,
      period_id: periodId,
      description: '期末结转费用类科目',
      created_by: 'system',
    };

    const entryItems = [];
    let totalExpense = 0;

    // 贷记各费用科目（冲销余额）
    for (const account of expenseAccounts) {
      if (account.balance > 0) {
        entryItems.push({
          account_id: account.id,
          debit_amount: 0,
          credit_amount: account.balance,
          description: `结转${account.account_name}`,
        });
        totalExpense += account.balance;
      }
    }

    // 借记本年利润
    if (totalExpense > 0) {
      const profitAccountId = await this.getCurrentYearProfitAccountId(connection);
      entryItems.push({
        account_id: profitAccountId,
        debit_amount: totalExpense,
        credit_amount: 0,
        description: '结转费用至本年利润',
      });

      await financeModel.createEntry(entryData, entryItems, connection);
    }
  }

  /**
   * 结转成本类科目
   */
  static async closeCostAccounts(connection, periodId) {
    // 获取成本类科目余额（5开头的科目）
    const [costAccounts] = await connection.execute(
      `
      SELECT
        ga.id,
        ga.account_code,
        ga.account_name,
        COALESCE(SUM(gei.debit_amount - gei.credit_amount), 0) as balance
      FROM gl_accounts ga
      LEFT JOIN gl_entry_items gei ON ga.id = gei.account_id
      LEFT JOIN gl_entries ge ON gei.entry_id = ge.id
      WHERE (ga.account_type = '成本' OR ga.account_code LIKE '5%')
        AND ga.is_active = true
        AND (ge.period_id = ? OR ge.period_id IS NULL)
      GROUP BY ga.id, ga.account_code, ga.account_name
      HAVING balance != 0
    `,
      [periodId]
    );

    if (costAccounts.length === 0) {
      return;
    }

    // 生成结转分录
    const entryNumber = await this.generateEntryNumber('CLOSE');
    const entryData = {
      entry_number: entryNumber,
      entry_date: new Date().toISOString().split('T')[0],
      posting_date: new Date().toISOString().split('T')[0],
      document_type: DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER,
      document_number: `CLOSE-${periodId}`,
      period_id: periodId,
      description: '期末结转成本类科目',
      created_by: 'system',
    };

    const entryItems = [];
    let totalCost = 0;

    // 贷记各成本科目（冲销余额）
    for (const account of costAccounts) {
      if (account.balance > 0) {
        entryItems.push({
          account_id: account.id,
          debit_amount: 0,
          credit_amount: account.balance,
          description: `结转${account.account_name}`,
        });
        totalCost += account.balance;
      }
    }

    // 借记本年利润
    if (totalCost > 0) {
      const profitAccountId = await this.getCurrentYearProfitAccountId(connection);
      entryItems.push({
        account_id: profitAccountId,
        debit_amount: totalCost,
        credit_amount: 0,
        description: '结转成本至本年利润',
      });

      await financeModel.createEntry(entryData, entryItems, connection);
    }
  }

  /**
   * 结转本年利润
   */
  static async closeNetIncomeAccount(connection, periodId) {
    // 获取本年利润科目余额
    const profitAccountId = await this.getCurrentYearProfitAccountId(connection);
    const [profitBalance] = await connection.execute(
      `
      SELECT COALESCE(SUM(gei.credit_amount - gei.debit_amount), 0) as balance
      FROM gl_entry_items gei
      LEFT JOIN gl_entries ge ON gei.entry_id = ge.id
      WHERE gei.account_id = ? AND ge.period_id = ?
    `,
      [profitAccountId, periodId]
    );

    const netIncome = profitBalance[0].balance;

    if (Math.abs(netIncome) < 0.01) {
      return;
    }

    // 结转到利润分配-未分配利润
    const retainedEarningsAccountId = await this.getRetainedEarningsAccountId(connection);

    const entryNumber = await this.generateEntryNumber('CLOSE');
    const entryData = {
      entry_number: entryNumber,
      entry_date: new Date().toISOString().split('T')[0],
      posting_date: new Date().toISOString().split('T')[0],
      document_type: DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER,
      document_number: `CLOSE-${periodId}`,
      period_id: periodId,
      description: '结转本年利润',
      created_by: 'system',
    };

    const entryItems = [];

    if (netIncome > 0) {
      // 盈利：借记本年利润，贷记利润分配
      entryItems.push(
        {
          account_id: profitAccountId,
          debit_amount: netIncome,
          credit_amount: 0,
          description: '结转本年利润',
        },
        {
          account_id: retainedEarningsAccountId,
          debit_amount: 0,
          credit_amount: netIncome,
          description: '转入未分配利润',
        }
      );
    } else {
      // 亏损：借记利润分配，贷记本年利润
      entryItems.push(
        {
          account_id: retainedEarningsAccountId,
          debit_amount: Math.abs(netIncome),
          credit_amount: 0,
          description: '转入未分配利润（亏损）',
        },
        {
          account_id: profitAccountId,
          debit_amount: 0,
          credit_amount: Math.abs(netIncome),
          description: '结转本年利润（亏损）',
        }
      );
    }

    await financeModel.createEntry(entryData, entryItems, connection);
  }

  /**
   * 获取本年利润科目ID
   */
  static async getCurrentYearProfitAccountId(connection) {
    const [accounts] = await connection.execute(
      "SELECT id FROM gl_accounts WHERE account_code = '3103' LIMIT 1" // 本年利润
    );
    if (accounts.length === 0) {
      throw new Error('未配置本年利润科目(3103)，无法生成期末结转凭证');
    }
    return accounts[0].id;
  }

  /**
   * 获取利润分配-未分配利润科目ID
   */
  static async getRetainedEarningsAccountId(connection) {
    const [accounts] = await connection.execute(
      "SELECT id FROM gl_accounts WHERE account_code = '3104' LIMIT 1" // 利润分配-未分配利润
    );
    if (accounts.length === 0) {
      throw new Error('未配置利润分配-未分配利润科目(3104)，无法生成期末结转凭证');
    }
    return accounts[0].id;
  }

  /**
   * 生成分录编号
   */
  static async generateEntryNumber(prefix) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const [result] = await db.pool.execute(
      'SELECT MAX(entry_number) as max_no FROM gl_entries WHERE entry_number LIKE ?',
      [`${prefix}${dateStr}%`]
    );

    const maxNo = result[0].max_no || `${prefix}${dateStr}000`;
    const nextNo = `${prefix}${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;

    return nextNo;
  }
}

module.exports = PeriodEndService;
