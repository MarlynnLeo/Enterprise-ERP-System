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
const { logger } = require('../../utils/logger');

// 额外的辅助方法
const extraMethods = {
  /**
   * 重新计算并修复所有银行账户余额
   */
  recalculateAllBankAccountBalances: async () => {
    const db = require('../../config/db');
    const BankBalanceService = require('../../services/business/BankBalanceService');
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [accounts] = await connection.execute(
        'SELECT id, account_name FROM bank_accounts'
      );

      logger.info(`开始重新计算 ${accounts.length} 个银行账户的余额...`);

      for (const account of accounts) {
        const result = await BankBalanceService.syncAccountBalance(connection, account.id);
        logger.info(
          `账户 ${account.account_name} (ID: ${account.id}) 余额已更新为: ${result.balance}`
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
  getBankTransactionById: Transaction.getBankTransactionById,
  getBankTransactions: Transaction.getBankTransactions,
  createBankTransaction: Transaction.createBankTransaction,
  updateBankTransaction: Transaction.updateBankTransaction,
  deleteBankTransaction: Transaction.deleteBankTransaction,
  transferFunds: Transfer.transferFunds,
  // 显式导出CashTransaction的审核方法
  submitForAudit: CashTransaction.submitForAudit,
  approveTransaction: CashTransaction.approveTransaction,
  rejectTransaction: CashTransaction.rejectTransaction,
};
