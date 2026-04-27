/**
 * cash/index.js
 * @description 现金管理模块统一入口
 * @date 2026-01-23
 * @version 2.0.0 (Refactored)
 */

const Account = require('./Account');
const Transaction = require('./Transaction');
const Transfer = require('./Transfer');
const Reconciliation = require('./Reconciliation');
const Reports = require('./Reports');
const CashTransaction = require('./CashTransaction');
const SequelizeModels = require('./SequelizeModels');
const logger = require('../../utils/logger');

// 额外的辅助方法
const extraMethods = {
  /**
   * @deprecated 银行账户表结构已迁移至 Knex 迁移文件 20260312000008 管理，此函数保留为空操作
   */
  initializeBankTables: async () => {
    // 表结构由 migrations/20260312000008_baseline_asset_bank_tables.js 管理
    return true;
  },

  /**
   * 重新计算并修复所有银行账户余额
   */
  recalculateAllBankAccountBalances: async () => {
    const db = require('../../config/db');
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取所有银行账户
      const [accounts] = await connection.execute('SELECT id, account_name FROM bank_accounts');

      logger.info(`开始重新计算 ${accounts.length} 个银行账户的余额...`);

      for (const account of accounts) {
        // 计算该账户的正确余额
        const [balanceResult] = await connection.execute(
          `
          SELECT COALESCE(SUM(CASE
            WHEN transaction_type IN ('存款', '转入', '利息') THEN amount
            WHEN transaction_type IN ('取款', '转出', '费用') THEN -amount
            ELSE 0
          END), 0) as correct_balance
          FROM bank_transactions
          WHERE bank_account_id = ?
        `,
          [account.id]
        );

        const correctBalance = parseFloat(balanceResult[0].correct_balance) || 0;

        // 更新账户余额
        await connection.execute('UPDATE bank_accounts SET current_balance = ? WHERE id = ?', [
          correctBalance,
          account.id,
        ]);

        logger.info(
          `账户 ${account.account_name} (ID: ${account.id}) 余额已更新为: ${correctBalance}`
        );
      }

      await connection.commit();
      logger.info('所有银行账户余额重新计算完成');

      return { success: true, message: `成功重新计算了 ${accounts.length} 个银行账户的余额` };
    } catch (error) {
      await connection.rollback();
      logger.error('重新计算银行账户余额失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },
};

// 聚合所有方法
// 辅助函数：复制类的静态方法
const copyStaticMethods = (target, source) => {
  Object.getOwnPropertyNames(source).forEach((prop) => {
    if (['length', 'prototype', 'name'].includes(prop)) return;
    const descriptor = Object.getOwnPropertyDescriptor(source, prop);
    Object.defineProperty(target, prop, descriptor);
    logger.debug(`[CashModel] Copied property: ${prop}`);
  });
};

const cashModel = {};

// 聚合所有方法
const models = [Account, Transaction, Transfer, Reconciliation, Reports, CashTransaction];

models.forEach((model) => {
  // logger.info(`[CashModel] Processing model: ${model.name}`);
  copyStaticMethods(cashModel, model);
});
Object.assign(cashModel, extraMethods);

// 导出 - 显式添加Account方法以确保它们可用
module.exports = {
  ...cashModel,
  // 显式导出Account的方法，确保它们可用
  getBankAccountById: Account.getBankAccountById,
  getBankAccounts: Account.getBankAccounts,
  createBankAccount: Account.createBankAccount,
  updateBankAccount: Account.updateBankAccount,
  updateBankAccountStatus: Account.updateBankAccountStatus,
  updateBankAccountBalance: Account.updateBankAccountBalance,
  // 显式导出CashTransaction的审核方法
  submitForAudit: CashTransaction.submitForAudit,
  approveTransaction: CashTransaction.approveTransaction,
  rejectTransaction: CashTransaction.rejectTransaction,
  // Sequelize模型
  Transaction: SequelizeModels.Transaction,
  Reconciliation: SequelizeModels.Reconciliation,
  ReconciliationItem: SequelizeModels.ReconciliationItem,
};
