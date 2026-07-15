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
const { accountingConfig } = require('../../config/accountingConfig');
const CostClosingService = require('./CostClosingService');

/**
 * 期末处理服务
 * 处理期末结账、结转等功能
 */
class PeriodEndService {
  static roundMoney(value) {
    return Math.round((parseFloat(value) || 0) * 100) / 100;
  }

  static async assertCoreClosingControls(connection, period) {
    const costChecks = await CostClosingService.collectChecks(connection, period);
    const failedCostChecks = costChecks.filter((check) => !check.passed);
    if (failedCostChecks.length > 0) {
      throw new Error(
        `成本结账检查未通过：${failedCostChecks.map((check) => `${check.title}(${check.count})`).join('、')}`
      );
    }

    const [[failedJobs]] = await connection.execute(
      `SELECT COUNT(*) AS count
         FROM sys_failed_jobs
        WHERE status IN ('pending','retrying','failed','ignored')
          AND LOWER(task_name) REGEXP 'finance|cost|voucher|tax|purchase|sales|production|财务|成本|凭证|税|采购|销售|生产'`
    );
    if (Number(failedJobs.count || 0) > 0) {
      throw new Error(`仍有 ${failedJobs.count} 个未解决的财务集成失败任务，不能关账`);
    }

    const [[invalidStock]] = await connection.execute(
      `SELECT COUNT(*) AS count
         FROM inventory_stock_balances
        WHERE (ABS(COALESCE(quantity, 0)) < 0.000001 AND ABS(COALESCE(total_value, 0)) > 0.01)
           OR (COALESCE(quantity, 0) > 0 AND COALESCE(total_value, 0) <= 0)
           OR (COALESCE(quantity, 0) < 0)
           OR (COALESCE(total_value, 0) < 0)`
    );
    if (Number(invalidStock.count || 0) > 0) {
      throw new Error(`存在 ${invalidStock.count} 条不可能的库存数量/价值余额，不能关账`);
    }

    const [[purchaseGaps]] = await connection.execute(
      `SELECT COUNT(*) AS count
         FROM purchase_receipts pr
        WHERE pr.deleted_at IS NULL
          AND pr.status = 'completed'
          AND pr.receipt_date BETWEEN ? AND ?
          AND (
            NOT EXISTS (
              SELECT 1 FROM ap_invoices ai
               WHERE ai.source_type = 'purchase_receipt' AND ai.source_id = pr.id
            )
            OR NOT EXISTS (
              SELECT 1 FROM tax_invoices ti
               WHERE ti.related_document_type = '采购入库单'
                 AND ti.related_document_id = pr.id
                 AND ti.invoice_type = '进项'
                 AND ti.status <> '已作废'
            )
          )`,
      [period.start_date, period.end_date]
    );
    if (Number(purchaseGaps.count || 0) > 0) {
      throw new Error(`本期有 ${purchaseGaps.count} 张采购收货单未完成应付/进项税闭环`);
    }

    const [[salesGaps]] = await connection.execute(
      `SELECT COUNT(*) AS count
         FROM sales_outbound so
        WHERE so.deleted_at IS NULL
          AND so.status = 'completed'
          AND so.delivery_date BETWEEN ? AND ?
          AND (
            NOT EXISTS (
              SELECT 1 FROM gl_entries ge
               WHERE ge.document_type = 'sales_outbound'
                 AND ge.document_number = so.outbound_no
                 AND COALESCE(ge.is_posted, 0) = 1
                 AND COALESCE(ge.is_reversed, 0) = 0
            )
            OR NOT EXISTS (
              SELECT 1 FROM tax_invoices ti
               WHERE ti.related_document_type = '销售出库单'
                 AND ti.related_document_id = so.id
                 AND ti.invoice_type = '销项'
                 AND ti.status <> '已作废'
            )
          )`,
      [period.start_date, period.end_date]
    );
    if (Number(salesGaps.count || 0) > 0) {
      throw new Error(`本期有 ${salesGaps.count} 张销售出库单未完成收入/销售成本闭环`);
    }

    const [[productionGaps]] = await connection.execute(
      `SELECT COUNT(*) AS count
         FROM production_tasks pt
        WHERE pt.deleted_at IS NULL
          AND pt.status = 'completed'
          AND DATE(COALESCE(pt.completed_at, pt.actual_end_date, pt.created_at)) BETWEEN ? AND ?
          AND (
            COALESCE(pt.actual_cost, 0) <= 0
            OR NOT EXISTS (
              SELECT 1 FROM gl_entries ge
               WHERE ge.transaction_id = pt.id
                 AND ge.transaction_type LIKE 'PRODUCTION_%'
                 AND COALESCE(ge.is_posted, 0) = 1
                 AND COALESCE(ge.is_reversed, 0) = 0
            )
          )`,
      [period.start_date, period.end_date]
    );
    if (Number(productionGaps.count || 0) > 0) {
      throw new Error(`本期有 ${productionGaps.count} 个完工任务未完成实际成本/成本凭证闭环`);
    }

    const [[depreciationGaps]] = await connection.execute(
      `SELECT COUNT(*) AS count
         FROM fixed_assets fa
        WHERE fa.audit_status = 'approved'
          AND fa.status NOT IN ('报废','已处置','已出售','已转让','已捐赠')
          AND fa.depreciation_method <> '不计提'
          AND fa.acquisition_date <= ?
          AND COALESCE(fa.current_value, fa.net_value, 0) > COALESCE(fa.salvage_value, 0)
          AND NOT EXISTS (
            SELECT 1 FROM asset_depreciation ad
             WHERE ad.asset_id = fa.id
               AND ad.period_id = ?
               AND COALESCE(ad.is_posted, 0) = 1
          )
          AND NOT EXISTS (
            SELECT 1 FROM fixed_asset_depreciation_details fadd
             WHERE fadd.asset_id = fa.id
               AND fadd.depreciation_date BETWEEN ? AND ?
               AND fadd.entry_id IS NOT NULL
          )`,
      [period.end_date, period.id, period.start_date, period.end_date]
    );
    if (Number(depreciationGaps.count || 0) > 0) {
      throw new Error(`本期有 ${depreciationGaps.count} 项固定资产未完成折旧过账`);
    }
  }

  static toDateString(value) {
    if (!value) return '';
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(value).slice(0, 10);
  }

  static normalizeDateInput(value, fieldName) {
    const dateString = this.toDateString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      throw new Error(`${fieldName}格式必须为YYYY-MM-DD`);
    }

    const [year, month, day] = dateString.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() + 1 !== month ||
      parsed.getUTCDate() !== day
    ) {
      throw new Error(`${fieldName}不是有效日期`);
    }

    return dateString;
  }

  static isDateWithinPeriod(date, period) {
    const startDate = this.toDateString(period.start_date);
    const endDate = this.toDateString(period.end_date);
    return date >= startDate && date <= endDate;
  }

  static isClosed(value) {
    if (value === true || value === 1 || value === 1n) return true;
    if (Buffer.isBuffer(value)) {
      return value.some((byte) => byte !== 0);
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    return false;
  }

  static async getAccountIdByConfigKey(connection, configKey, accountLabel) {
    await accountingConfig.loadFromDatabase(db);
    const accountCode = accountingConfig.getAccountCode(configKey);

    if (!accountCode) {
      throw new Error(`未配置${accountLabel}科目(${configKey})，无法生成期末结转凭证`);
    }

    const [accounts] = await connection.execute(
      'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1 LIMIT 1',
      [accountCode]
    );

    if (accounts.length === 0) {
      throw new Error(`未找到${accountLabel}科目(${accountCode})，无法生成期末结转凭证`);
    }

    return accounts[0].id;
  }

  static async getIncomeStatementCostCodes() {
    await accountingConfig.loadFromDatabase(db);
    return [
      accountingConfig.getAccountCode('SALES_COST'),
      accountingConfig.getAccountCode('COST_OF_GOODS_SOLD'),
      accountingConfig.getAccountCode('OTHER_COST'),
      '6401',
      '6402',
    ].filter(Boolean);
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
         AND COALESCE(is_reversed, 0) = 0
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

  static async getUnpostedEntries(periodId) {
    const connection = await db.pool.getConnection();
    try {
      const [periodInfo] = await connection.execute('SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE id = ?', [
        periodId,
      ]);

      if (periodInfo.length === 0) {
        throw new Error('会计期间不存在');
      }

      const period = periodInfo[0];
      const [entries] = await connection.execute(
        `SELECT
           e.id,
           e.entry_number,
           e.entry_date,
           e.posting_date,
           e.document_type,
           e.document_number,
           e.description,
           e.period_id,
           p.period_name AS original_period_name,
           ? AS effective_period_id,
           ? AS period_name,
           ? AS period_start_date,
           ? AS period_end_date,
           ? AS period_is_closed,
           e.created_at,
           u.real_name AS creator_name,
           u.username AS creator_username
         FROM gl_entries e
         LEFT JOIN gl_periods p ON p.id = e.period_id
         LEFT JOIN users u ON u.id = e.created_by
         WHERE COALESCE(e.is_posted, 0) = 0
           AND COALESCE(e.is_reversed, 0) = 0
           AND (
             e.period_id = ?
             OR e.entry_date BETWEEN ? AND ?
             OR e.posting_date BETWEEN ? AND ?
           )
         ORDER BY e.entry_date ASC, e.id ASC`,
        [
          periodId,
          period.period_name,
          period.start_date,
          period.end_date,
          period.is_closed,
          periodId,
          period.start_date,
          period.end_date,
          period.start_date,
          period.end_date,
        ]
      );

      const postingDiagnostics = await financeModel.getEntryPostingDiagnostics(
        entries.map((entry) => entry.id),
        connection
      );

      const normalizedEntries = entries.map((entry) => {
        const diagnostic = postingDiagnostics[entry.id] || {};
        const entryDate = this.toDateString(entry.entry_date);
        const postingDate = this.toDateString(entry.posting_date || entry.entry_date);
        const targetPeriodRange = {
          start_date: entry.period_start_date,
          end_date: entry.period_end_date,
        };
        const entryDateValid = this.isDateWithinPeriod(entryDate, targetPeriodRange);
        const postingDateValid = this.isDateWithinPeriod(postingDate, targetPeriodRange);
        const totalDebit = this.roundMoney(diagnostic.total_debit);
        const totalCredit = this.roundMoney(diagnostic.total_credit);
        const lineCount = Number(diagnostic.line_count || 0);
        const invalidAccountCount = Number(diagnostic.invalid_account_count || 0);
        const invalidAmountCount = Number(diagnostic.invalid_amount_count || 0);
        const amountBalanced = Boolean(diagnostic.amount_balanced);
        let postingIssue = null;

        if (!entryDateValid || !postingDateValid) {
          postingIssue = `凭证日期或过账日期不在所属会计期间 [${entry.period_name || '-'}] 内`;
        } else if (!diagnostic.posting_ready) {
          postingIssue = diagnostic.posting_issue || '凭证不满足过账条件';
        }

        return {
          ...entry,
          entry_date: entryDate,
          posting_date: postingDate,
          period_start_date: this.toDateString(entry.period_start_date),
          period_end_date: this.toDateString(entry.period_end_date),
          line_count: lineCount,
          invalid_account_count: invalidAccountCount,
          invalid_amount_count: invalidAmountCount,
          amount_balanced: amountBalanced,
          total_debit: totalDebit,
          total_credit: totalCredit,
          date_valid: entryDateValid && postingDateValid,
          entry_date_valid: entryDateValid,
          posting_date_valid: postingDateValid,
          posting_ready:
            entryDateValid && postingDateValid && Boolean(diagnostic.posting_ready),
          posting_issue: postingIssue,
          date_issue: entryDateValid && postingDateValid ? null : postingIssue,
          invalid_lines: diagnostic.invalid_lines || [],
        };
      });

      return {
        period,
        entries: normalizedEntries,
        total: normalizedEntries.length,
      };
    } finally {
      connection.release();
    }
  }

  static async updateUnpostedEntryDates(entryId, payload) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const requestedPeriodId = payload.period_id ? Number.parseInt(payload.period_id, 10) : null;
      const [entries] = await connection.execute(
        `SELECT e.id, e.entry_number, e.is_posted, e.is_reversed, e.period_id,
                p.period_name, p.start_date, p.end_date, p.is_closed
         FROM gl_entries e
         LEFT JOIN gl_periods p ON p.id = e.period_id
         WHERE e.id = ?
         FOR UPDATE`,
        [entryId]
      );

      if (entries.length === 0) {
        throw new Error('凭证不存在');
      }

      const entry = entries[0];
      if (entry.is_posted) {
        throw new Error('已过账凭证不能修改日期');
      }
      if (entry.is_reversed) {
        throw new Error('已冲销凭证不能修改日期');
      }
      if (!entry.period_id && !requestedPeriodId) {
        throw new Error('凭证未归属会计期间，请先指定会计期间');
      }

      if (requestedPeriodId && Number(entry.period_id) !== requestedPeriodId) {
        const [periods] = await connection.execute(
          `SELECT id, period_name, start_date, end_date, is_closed
           FROM gl_periods
           WHERE id = ?
           FOR UPDATE`,
          [requestedPeriodId]
        );
        if (periods.length === 0) {
          throw new Error('会计期间不存在');
        }
        Object.assign(entry, {
          period_id: periods[0].id,
          period_name: periods[0].period_name,
          start_date: periods[0].start_date,
          end_date: periods[0].end_date,
          is_closed: periods[0].is_closed,
        });
      }

      if (this.isClosed(entry.is_closed)) {
        throw new Error(`不能修改已关闭期间 [${entry.period_name}] 的凭证日期`);
      }

      const entryDate = this.normalizeDateInput(payload.entry_date, '凭证日期');
      const postingDate = this.normalizeDateInput(payload.posting_date || payload.entry_date, '过账日期');

      if (!this.isDateWithinPeriod(entryDate, entry) || !this.isDateWithinPeriod(postingDate, entry)) {
        throw new Error(
          `凭证日期 ${entryDate} 或过账日期 ${postingDate} 不在所属会计期间 [${entry.period_name}] 内`
        );
      }

      await connection.execute(
        `UPDATE gl_entries
         SET entry_date = ?, posting_date = ?, period_id = ?
         WHERE id = ?`,
        [entryDate, postingDate, entry.period_id, entryId]
      );

      await connection.commit();
      return {
        id: entryId,
        entry_number: entry.entry_number,
        entry_date: entryDate,
        posting_date: postingDate,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getPeriodBankReconciliationStatus(connection, period) {
    const [unreconciled] = await connection.execute(
      `SELECT COUNT(*) as count
       FROM bank_transactions bt
       WHERE bt.status = 'approved'
         AND COALESCE(bt.is_reconciled, 0) = 0
         AND bt.transaction_date BETWEEN ? AND ?`,
      [period.start_date, period.end_date]
    );

    const [manualReconciled] = await connection.execute(
      `SELECT COUNT(*) as count
       FROM bank_transactions bt
       WHERE bt.status = 'approved'
         AND COALESCE(bt.is_reconciled, 0) = 1
         AND bt.transaction_date BETWEEN ? AND ?
         AND NOT EXISTS (
           SELECT 1 FROM bank_reconciliation_matches m WHERE m.bank_transaction_id = bt.id
         )`,
      [period.start_date, period.end_date]
    );

    return {
      unreconciledCount: Number(unreconciled[0]?.count || 0),
      manualReconciledCount: Number(manualReconciled[0]?.count || 0),
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
      const [periodInfo] = await connection.execute('SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE id = ?', [
        periodId,
      ]);

      if (periodInfo.length === 0) {
        throw new Error('会计期间不存在');
      }

      const period = periodInfo[0];
      const priorOpenPeriod = await this.findPriorOpenPeriod(connection, periodId, period);
      const entryIntegrity = await this.getPeriodEntryIntegrity(connection, periodId, period);
      const bankReconciliation = await this.getPeriodBankReconciliationStatus(connection, period);

      const [existingClosingEntries] = await connection.execute(
        `SELECT COUNT(*) as count FROM gl_entries
         WHERE period_id = ? AND document_type = ?`,
        [periodId, DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER]
      );

      await accountingConfig.loadFromDatabase(db);
      const currentYearProfitCode = accountingConfig.getAccountCode('CURRENT_YEAR_PROFIT');
      let profitAccounts = [];
      if (currentYearProfitCode) {
        [profitAccounts] = await connection.execute(
          'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1 LIMIT 1',
          [currentYearProfitCode]
        );
      }

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
          key: 'bank_reconciliation_closed',
          name: '银行流水已对账',
          passed:
            bankReconciliation.unreconciledCount === 0 &&
            bankReconciliation.manualReconciledCount === 0,
          message:
            bankReconciliation.unreconciledCount > 0
              ? `本期还有 ${bankReconciliation.unreconciledCount} 笔已审核银行流水未完成银行对账`
              : bankReconciliation.manualReconciledCount > 0
                ? `本期还有 ${bankReconciliation.manualReconciledCount} 笔银行流水缺少银行对账单匹配证据`
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
              ? `未配置本年利润科目(${currentYearProfitCode || 'CURRENT_YEAR_PROFIT'})`
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
        bankReconciliation,
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
      const [periodInfo] = await connection.execute(
        'SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE id = ? FOR UPDATE',
        [period_id]
      );

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
      const bankReconciliation = await this.getPeriodBankReconciliationStatus(connection, period);

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

      if (bankReconciliation.unreconciledCount > 0) {
        throw new Error(
          `本期间还有 ${bankReconciliation.unreconciledCount} 笔已审核银行流水未完成银行对账，请先导入银行对账单并确认匹配`
        );
      }

      if (bankReconciliation.manualReconciledCount > 0) {
        throw new Error(
          `本期间还有 ${bankReconciliation.manualReconciledCount} 笔银行流水缺少银行对账单匹配证据，请先重新对账`
        );
      }

      await this.assertCoreClosingControls(connection, period);

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

      // 4. 更新期间状态（status 虚拟列由 is_closed/is_locked 生成 → closed）
      await connection.execute(
        `UPDATE gl_periods
         SET is_closed = true,
             is_locked = 1,
             closed_by = ?,
             closed_at = ?,
             closing_date = ?
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
    const incomeStatementCostCodes = new Set(await this.getIncomeStatementCostCodes());
    const nonProfitLossCostCodes = new Set([
      accountingConfig.getAccountCode('PRODUCTION_COST'),
      accountingConfig.getAccountCode('MANUFACTURING_EXPENSE'),
      '4101',
      '5001',
      '5101',
    ].filter(Boolean));
    const profitLossExpenseAccounts = expenseAccounts.filter(
      (account) =>
        incomeStatementCostCodes.has(account.account_code) ||
        !nonProfitLossCostCodes.has(account.account_code)
    );

    const totalIncome = incomeAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
    const totalExpense = profitLossExpenseAccounts.reduce(
      (sum, acc) => sum + parseFloat(acc.balance),
      0
    );
    const netProfit = totalIncome - totalExpense;

    if (totalIncome === 0 && totalExpense === 0) {
      return {
        totalIncome: 0,
        totalExpense: 0,
        netProfit: 0,
        entryId: null,
      };
    }

    const profitAccountId = await this.getCurrentYearProfitAccountId(connection);

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
    for (const account of profitLossExpenseAccounts) {
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
  /**
   * 硬锁定已关闭期间（status → locked），禁止记账与重开
   */
  static async lockPeriod({ period_id, locked_by }) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [periodInfo] = await connection.execute(
        'SELECT id, period_name, is_closed, is_locked FROM gl_periods WHERE id = ? FOR UPDATE',
        [period_id]
      );
      if (periodInfo.length === 0) throw new Error('会计期间不存在');
      if (!periodInfo[0].is_closed) {
        throw new Error('仅已关闭的期间可以硬锁定，请先结账');
      }
      if (Number(periodInfo[0].is_locked) === 1) {
        await connection.commit();
        return { periodId: period_id, message: '期间已是锁定状态' };
      }
      await connection.execute(
        'UPDATE gl_periods SET is_locked = 1, updated_at = NOW() WHERE id = ?',
        [period_id]
      );
      await connection.commit();
      logger.info(
        `[期间] ${periodInfo[0].period_name} 已硬锁定 by ${locked_by || 'system'}`
      );
      return { periodId: period_id, periodName: periodInfo[0].period_name, message: '期间已硬锁定' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 解除硬锁定（仍保持 closed，需 reopen 才能记账）
   */
  static async unlockPeriod({ period_id, unlocked_by }) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [periodInfo] = await connection.execute(
        'SELECT id, period_name, is_locked FROM gl_periods WHERE id = ? FOR UPDATE',
        [period_id]
      );
      if (periodInfo.length === 0) throw new Error('会计期间不存在');
      await connection.execute(
        'UPDATE gl_periods SET is_locked = 0, updated_at = NOW() WHERE id = ?',
        [period_id]
      );
      await connection.commit();
      logger.info(
        `[期间] ${periodInfo[0].period_name} 已解锁 by ${unlocked_by || 'system'}`
      );
      return { periodId: period_id, periodName: periodInfo[0].period_name, message: '期间已解锁' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async reopenPeriod(periodData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const { period_id, reopened_by } = periodData;

      // 检查期间状态
      const [periodInfo] = await connection.execute(
        'SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE id = ? FOR UPDATE',
        [period_id]
      );

      if (periodInfo.length === 0) {
        throw new Error('会计期间不存在');
      }

      if (!periodInfo[0].is_closed) {
        throw new Error('会计期间未关闭，无需重新开启');
      }

      const period = periodInfo[0];
      if (Number(period.is_locked) === 1 || period.is_locked === true) {
        throw new Error('会计期间已硬锁定(locked)，禁止重开。请先解锁后再操作。');
      }

      // 检查是否有后续期间已关闭
      const [laterPeriods] = await connection.execute(
        'SELECT COUNT(*) as count FROM gl_periods WHERE start_date > ? AND is_closed = true',
        [period.end_date]
      );

      if (laterPeriods[0].count > 0) {
        throw new Error('存在已关闭的后续期间，不能重新开启此期间');
      }

      const [closingEntries] = await connection.execute(
        `SELECT id, entry_number, is_reversed
         FROM gl_entries
         WHERE period_id = ?
           AND document_type = ?
           AND COALESCE(is_reversed, 0) = 0
         FOR UPDATE`,
        [period_id, DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER]
      );

      // 先打开期间，再冲销结转凭证（冲销需要开放期间）；status 虚拟列 → open
      await connection.execute(
        `UPDATE gl_periods
         SET is_closed = false,
             is_locked = 0,
             closed_by = NULL,
             closed_at = NULL,
             closing_date = NULL,
             reopened_by = ?,
             reopened_at = ?
         WHERE id = ?`,
        [reopened_by, new Date(), period_id]
      );

      // 冲销损益结转凭证（保留审计轨迹，禁止硬删）
      const reverseDate = this.toDateString(period.end_date) || this.toDateString(new Date());
      for (const entry of closingEntries) {
        await financeModel.reverseEntry(
          entry.id,
          {
            entry_date: reverseDate,
            posting_date: reverseDate,
            period_id,
            description: `期间重新开启，冲销损益结转 ${entry.entry_number || entry.id}`,
            created_by: reopened_by,
          },
          connection
        );
      }

      // 期末余额快照在反结账后失效，删除后由再次关账重建
      await connection.execute('DELETE FROM gl_period_balances WHERE period_id = ?', [period_id]);

      await connection.commit();

      return {
        periodId: period_id,
        periodName: period.period_name,
        reversedClosingEntries: closingEntries.length,
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
      const [periodInfo] = await db.pool.execute('SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status FROM gl_periods WHERE id = ?', [
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

      const entryData = {
        entry_number: entryNumber,
        entry_date: `${year}-12-31`,
        posting_date: `${year}-12-31`,
        document_type: DOCUMENT_TYPE_MAPPING.YEAR_END_TRANSFER,
        document_number: `YE-${year}`,
        period_id: periodId,
        description: `${year}年度利润结转`,
        created_by: transferred_by || 'system',
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
   * 获取本年利润科目ID
   */
  static async getCurrentYearProfitAccountId(connection) {
    return this.getAccountIdByConfigKey(connection, 'CURRENT_YEAR_PROFIT', '本年利润');
  }

  /**
   * 获取利润分配-未分配利润科目ID
   */
  static async getRetainedEarningsAccountId(connection) {
    return this.getAccountIdByConfigKey(connection, 'RETAINED_EARNINGS', '利润分配-未分配利润');
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
