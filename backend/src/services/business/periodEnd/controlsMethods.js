/**
 * PeriodEndService — controls methods (mixin)
 * @module periodEnd/controlsMethods
 */

const runtime = require('./runtime');
const {
  db,
  financeModel,
  TAX_RELATED_DOCUMENT_TYPES,
  taxRelatedDocumentTypeMatchList,
  CostClosingService,
} = runtime;


module.exports = {
  async assertCoreClosingControls(connection, period) {
      const costChecks = await CostClosingService.collectChecks(connection, period);
      // 仅 blocker 阻断关账；warning（如 WIP 快照提示）进入预览但不阻止 canClose
      const failedCostChecks = costChecks.filter(
        (check) => !check.passed && check.severity === 'blocker'
      );
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
  
      const purchaseTaxTypes = taxRelatedDocumentTypeMatchList(
        TAX_RELATED_DOCUMENT_TYPES.PURCHASE_RECEIPT
      );
      const purchaseTaxPlaceholders = purchaseTaxTypes.map(() => '?').join(', ');
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
                 WHERE ti.related_document_type IN (${purchaseTaxPlaceholders})
                   AND ti.related_document_id = pr.id
                   AND ti.invoice_type = '进项'
                   AND ti.status <> '已作废'
              )
            )`,
        [period.start_date, period.end_date, ...purchaseTaxTypes]
      );
      if (Number(purchaseGaps.count || 0) > 0) {
        throw new Error(`本期有 ${purchaseGaps.count} 张采购收货单未完成应付/进项税闭环`);
      }
  
      const salesTaxTypes = taxRelatedDocumentTypeMatchList(
        TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND
      );
      const salesTaxPlaceholders = salesTaxTypes.map(() => '?').join(', ');
      const [[salesGaps]] = await connection.execute(
        `SELECT COUNT(*) AS count
           FROM sales_outbound so
          WHERE so.deleted_at IS NULL
            AND so.status = 'completed'
            AND so.delivery_date BETWEEN ? AND ?
            AND (
              -- 销售成本凭证
              NOT EXISTS (
                SELECT 1 FROM gl_entries ge
                 WHERE ge.document_type = 'sales_outbound'
                   AND ge.document_number = so.outbound_no
                   AND COALESCE(ge.is_posted, 0) = 1
                   AND COALESCE(ge.is_reversed, 0) = 0
              )
              -- 销项税票
              OR NOT EXISTS (
                SELECT 1 FROM tax_invoices ti
                 WHERE ti.related_document_type IN (${salesTaxPlaceholders})
                   AND ti.related_document_id = so.id
                   AND ti.invoice_type = '销项'
                   AND ti.status <> '已作废'
              )
              -- 应收发票：出库级 或 历史订单级（防关账误杀旧数据）
              OR (
                NOT EXISTS (
                  SELECT 1 FROM ar_invoices ar
                   WHERE ar.source_type = 'sales_outbound'
                     AND ar.source_id = so.id
                     AND ar.status NOT IN ('已取消', 'cancelled', 'void', '作废', '草稿')
                )
                AND NOT EXISTS (
                  SELECT 1 FROM ar_invoices ar2
                   WHERE ar2.source_type = 'sales_order'
                     AND ar2.source_id = so.order_id
                     AND so.order_id IS NOT NULL
                     AND ar2.status NOT IN ('已取消', 'cancelled', 'void', '作废', '草稿')
                )
              )
            )`,
        [period.start_date, period.end_date, ...salesTaxTypes]
      );
      if (Number(salesGaps.count || 0) > 0) {
        throw new Error(
          `本期有 ${salesGaps.count} 张销售出库单未完成应收/成本/销项税闭环（请先从「销售出库单」生成应收凭证）`
        );
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
  
      // 仅要求「折旧年限覆盖本期间」的在用资产完成本期折旧；
      // 避免未来沙箱期间被历史资产误伤，也避免已过折旧期的资产反复拦截关账。
      const [[depreciationGaps]] = await connection.execute(
        `SELECT COUNT(*) AS count
           FROM fixed_assets fa
          WHERE fa.audit_status = 'approved'
            AND fa.status NOT IN ('报废','已处置','已出售','已转让','已捐赠')
            AND fa.depreciation_method <> '不计提'
            AND COALESCE(fa.depreciation_start_date, fa.acquisition_date) <= ?
            AND (
              fa.depreciation_end_date IS NULL
              OR fa.depreciation_end_date >= ?
            )
            AND DATE_ADD(
                  COALESCE(fa.depreciation_start_date, fa.acquisition_date),
                  INTERVAL GREATEST(COALESCE(fa.useful_life, 0), 0) MONTH
                ) > ?
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
        [
          period.end_date,
          period.start_date,
          period.start_date,
          period.id,
          period.start_date,
          period.end_date,
        ]
      );
      if (Number(depreciationGaps.count || 0) > 0) {
        throw new Error(`本期有 ${depreciationGaps.count} 项固定资产未完成折旧过账`);
      }
    },

  async findPriorOpenPeriod(connection, periodId, period, lock = false) {
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
    },

  async getPeriodEntryIntegrity(connection, periodId, period) {
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
    },

  async getUnpostedEntries(periodId) {
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
    },

  async updateUnpostedEntryDates(entryId, payload) {
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
    },

  async getPeriodBankReconciliationStatus(connection, period) {
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
    },
};
