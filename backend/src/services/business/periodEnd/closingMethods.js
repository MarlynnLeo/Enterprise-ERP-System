/**
 * PeriodEndService — closing methods (mixin)
 * @module periodEnd/closingMethods
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
     * 获取期末关账预览
     * @param {number} periodId 会计期间ID
     * @returns {Object} 关账预览
     */
    async getClosingPreview(periodId) {
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
  
        // 正规模型：仅未冲销的「原」损益结转（排除冲销分录 itself）
        const [existingClosingEntries] = await connection.execute(
          `SELECT COUNT(*) as count FROM gl_entries
           WHERE ${this.sqlActiveOriginalClosingEntries()}`,
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
  
        // 与 closePeriod 共用核心业财闭环检查（不抛错，转成 checks 行）
        let coreControlCheck = {
          key: 'core_business_controls',
          name: '业财/成本/库存闭环',
          passed: true,
          message: null,
        };
        try {
          await this.assertCoreClosingControls(connection, period);
        } catch (coreErr) {
          coreControlCheck = {
            key: 'core_business_controls',
            name: '业财/成本/库存闭环',
            passed: false,
            message: coreErr.message || '核心关账检查未通过',
          };
        }
  
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
          coreControlCheck,
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
    },

  /**
     * 期末结账
     * @param {Object} periodData 期间数据
     * @returns {Object} 结账结果
     */
    async closePeriod(periodData) {
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
  
        const period_id = periodData.period_id;
        if (period_id == null) {
          throw new Error('period_id 不能为空');
        }
        const closed_by = await resolveActorUserId(
          connection,
          periodData.closed_by,
          periodData.userId,
          periodData.user_id
        );
        let closing_date = periodData.closing_date;
        if (!closing_date) {
          closing_date = new Date().toISOString().slice(0, 10);
        } else if (closing_date instanceof Date) {
          closing_date = closing_date.toISOString().slice(0, 10);
        } else {
          closing_date = String(closing_date).slice(0, 10);
        }
  
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
  
        // 2. 执行损益结转（正规：仅未冲销的原结转挡再次关账）
        const [existingClosingEntries] = await connection.execute(
          `SELECT id FROM gl_entries
           WHERE ${this.sqlActiveOriginalClosingEntries()}
           LIMIT 1
           FOR UPDATE`,
          [period_id, DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER]
        );
        if (existingClosingEntries.length > 0) {
          throw new Error('本期已存在未冲销的损益结转凭证，不能重复结账；请先重开期间冲销后再关');
        }
  
        const transferResult = await this.transferProfitAndLoss(
          connection,
          period_id,
          period,
          closed_by
        );
  
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
    },

  /**
     * 自动执行完整的期末结转流程
     * @param {number} periodId 会计期间ID
     */
    async executeAutoClosing(periodId, options = {}) {
      // 旧自动化入口统一收敛到正式关账流程，避免绕过未过账校验、余额快照和期间锁定。
      return await this.closePeriod({
        period_id: periodId,
        closed_by: options.closed_by ?? options.userId ?? options.user_id,
        closing_date: options.closing_date || new Date().toISOString().slice(0, 10),
      });
    },

  /**
     * 损益结转
     * @param {Object} connection 数据库连接
     * @param {number} periodId 期间ID
     * @param {Object} period 期间信息
     * @returns {Object} 结转结果
     */
    async transferProfitAndLoss(connection, periodId, period, createdBy = null) {
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
  
      const actorId = await resolveActorUserId(connection, createdBy);
      const entryData = {
        entry_number: entryNumber,
        entry_date: period.end_date,
        posting_date: period.end_date,
        document_type: DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER,
        document_number: `PL-${periodName}`,
        period_id: periodId,
        description: `${periodName} 损益结转`,
        created_by: actorId,
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
    },

  /**
     * 计算期末余额
     * @param {Object} connection 数据库连接
     * @param {number} periodId 期间ID
     */
    async calculatePeriodEndBalances(connection, periodId, period) {
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
    },

  /**
     * 重新开启期间
     * @param {Object} periodData 期间数据
     * @returns {Object} 开启结果
     */
    /**
     * 硬锁定已关闭期间（status → locked），禁止记账与重开
     */
    async lockPeriod({ period_id, locked_by }) {
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
          `[期间] ${periodInfo[0].period_name} 已硬锁定 by ${locked_by ?? 'n/a'}`
        );
        return { periodId: period_id, periodName: periodInfo[0].period_name, message: '期间已硬锁定' };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

  /**
     * 解除硬锁定（仍保持 closed，需 reopen 才能记账）
     */
    async unlockPeriod({ period_id, unlocked_by }) {
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
          `[期间] ${periodInfo[0].period_name} 已解锁 by ${unlocked_by ?? 'n/a'}`
        );
        return { periodId: period_id, periodName: periodInfo[0].period_name, message: '期间已解锁' };
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },

  async reopenPeriod(periodData) {
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();
  
        // 支持 closePeriod 风格对象，或直接传 periodId
        const period_id =
          typeof periodData === 'object' && periodData != null
            ? periodData.period_id ?? periodData.periodId ?? periodData.id
            : periodData;
        const reopened_by =
          typeof periodData === 'object' && periodData != null
            ? periodData.reopened_by ?? periodData.reopenedBy ?? periodData.userId ?? periodData.user_id
            : null;
        if (period_id == null) {
          throw new Error('period_id 不能为空');
        }
  
        // 检查期间状态
        const [periodInfo] = await connection.execute(
          'SELECT id, period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, created_at, updated_at, closed_by, closed_at, closing_date, reopened_by, reopened_at, status, is_locked FROM gl_periods WHERE id = ? FOR UPDATE',
          [period_id]
        );
  
        if (periodInfo.length === 0) {
          throw new Error('会计期间不存在');
        }
  
        if (!periodInfo[0].is_closed) {
          throw new Error('会计期间未关闭，无需重新开启');
        }
  
        const period = periodInfo[0];
        // 重开 = 解锁 + 打开期间 + 冲销损益结转（专业反结账）
        // 不再要求调用方先手动 unlock
  
        // 检查是否有后续期间已关闭
        const [laterPeriods] = await connection.execute(
          'SELECT COUNT(*) as count FROM gl_periods WHERE start_date > ? AND is_closed = true',
          [period.end_date]
        );
  
        if (laterPeriods[0].count > 0) {
          throw new Error('存在已关闭的后续期间，不能重新开启此期间');
        }
  
        // 仅冲销「原」未冲销结转凭证（正规：is_reversed + reversal_entry_id 反查，不用 R- 字符串）
        const [closingEntries] = await connection.execute(
          `SELECT id, entry_number
           FROM gl_entries
           WHERE ${this.sqlActiveOriginalClosingEntries()}
           FOR UPDATE`,
          [period_id, DOCUMENT_TYPE_MAPPING.PROFIT_LOSS_TRANSFER]
        );
  
        const actorId = await resolveActorUserId(connection, reopened_by);
  
        // 先打开期间，再冲销结转凭证（冲销需要开放期间）
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
          [actorId, new Date(), period_id]
        );
  
        const reverseDate = this.toDateString(period.end_date) || this.toDateString(new Date());
        const reversed = [];
        for (const entry of closingEntries) {
          const reversalId = await financeModel.reverseEntry(
            entry.id,
            {
              entry_date: reverseDate,
              posting_date: reverseDate,
              period_id,
              description: `期间重新开启，冲销损益结转 ${entry.entry_number || entry.id}`,
              created_by: actorId,
            },
            connection
          );
          reversed.push({ originalId: entry.id, reversalId });
        }
  
        // 期末余额快照在反结账后失效，删除后由再次关账重建
        await connection.execute('DELETE FROM gl_period_balances WHERE period_id = ?', [period_id]);
  
        await connection.commit();
  
        return {
          periodId: period_id,
          periodName: period.period_name,
          reversedClosingEntries: reversed.length,
          reversed,
          message: '期间重新开启完成（已解锁并冲销损益结转）',
        };
      } catch (error) {
        await connection.rollback();
        logger.error('重新开启期间失败:', error);
        throw error;
      } finally {
        connection.release();
      }
    },

  /**
     * 获取期间结账状态
     * @param {number} periodId 期间ID
     * @returns {Object} 结账状态信息
     */
    async getPeriodClosingStatus(periodId) {
      try {
        // 与 getClosingPreview / closePeriod 使用同一套检查，避免 UI 误判 canClose
        const preview = await this.getClosingPreview(periodId);
        const period = preview.period;
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
            unpostedEntriesCount: preview.unpostedCount || 0,
            hasTransferEntries: !!preview.hasExistingClosing,
            canClose: !!preview.canClose,
            canReopen: !!period.is_closed,
          },
          profitLoss: {
            totalIncome: preview.summary?.totalIncome ?? 0,
            totalExpense: preview.summary?.totalExpense ?? 0,
            netProfit: preview.summary?.netProfit ?? 0,
          },
          checks: preview.checks || [],
        };
      } catch (error) {
        logger.error('获取期间结账状态失败:', error);
        throw error;
      }
    },
};
