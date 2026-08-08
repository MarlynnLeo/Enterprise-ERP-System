/**
 * cash/Transfer.js
 * @description 资金调拨管理模型
 * @date 2026-01-23
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const financeModel = require('../finance');
const { accountingConfig } = require('../../config/accountingConfig');
const { DOCUMENT_TYPE_MAPPING } = require('../../constants/financeConstants');
const DocumentLinkService = require('../../services/business/DocumentLinkService');
const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');
const { toLocalDateString } = require('../../utils/dateUtils');
const { financeConfig } = require('../../config/financeConfig');

function requirePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(value).trim() !== String(parsed)) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function getOpenAccountingPeriodId(connection, accountingDate) {
  const [periods] = await connection.execute(
    `SELECT id
     FROM gl_periods
     WHERE is_closed = false
       AND start_date <= ?
       AND end_date >= ?
     ORDER BY start_date DESC
     LIMIT 1
     FOR UPDATE`,
    [accountingDate, accountingDate]
  );

  if (periods.length === 0) {
    throw new Error(`No open accounting period found for ${accountingDate}`);
  }

  return periods[0].id;
}

async function getActiveGlAccountId(connection, accountCode, accountName) {
  if (!accountCode) {
    throw new Error(`资金调拨${accountName}科目编码未配置`);
  }

  const [accounts] = await connection.execute(
    'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true LIMIT 1',
    [accountCode]
  );

  if (accounts.length === 0) {
    throw new Error(`资金调拨缺少${accountName}科目(${accountCode})`);
  }

  return accounts[0].id;
}

class FundTransferModel {
  /**
   * 资金调拨（从一个银行账户转账到另一个银行账户）
   */
  static async transferFunds(transferData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const fromAccountId = requirePositiveInteger(transferData.from_account_id, 'from_account_id');
      const toAccountId = requirePositiveInteger(transferData.to_account_id, 'to_account_id');
      const createdBy = requirePositiveInteger(transferData.created_by, 'created_by');
      const amount = roundMoney(transferData.amount);
      const transactionNumber = String(transferData.transaction_number || '').trim();
      const transactionDate = toLocalDateString(transferData.transaction_date);

      if (!transactionNumber) {
        throw new Error('资金调拨缺少交易编号');
      }
      if (fromAccountId === toAccountId) {
        throw new Error('源账户和目标账户不能相同');
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('调拨金额必须大于0');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
        throw new Error('资金调拨日期格式不正确');
      }

      const [duplicates] = await connection.execute(
        `SELECT transaction_number
         FROM bank_transactions
         WHERE transaction_number IN (?, ?)
         LIMIT 1
         FOR UPDATE`,
        [`${transactionNumber}-OUT`, `${transactionNumber}-IN`]
      );
      if (duplicates.length > 0) {
        throw new Error(`资金调拨单号 ${transactionNumber} 已生成银行流水，不能重复调拨`);
      }

      const [existingEntries] = await connection.execute(
        `SELECT id
         FROM gl_entries
         WHERE document_type = ?
           AND document_number = ?
           AND COALESCE(is_reversed, 0) = 0
         LIMIT 1
         FOR UPDATE`,
        [DOCUMENT_TYPE_MAPPING.BANK_TRANSFER, transactionNumber]
      );
      if (existingEntries.length > 0) {
        throw new Error(`资金调拨单号 ${transactionNumber} 已生成会计凭证，不能重复调拨`);
      }

      const orderedAccountIds = [fromAccountId, toAccountId].sort((a, b) => a - b);
      const [lockedAccounts] = await connection.execute(
        `SELECT id, account_number, account_name, bank_name, branch_name, currency_code, current_balance, opening_balance, account_type, is_active, contact_person, contact_phone, notes, created_at, updated_at, created_by, updated_by, last_transaction_date FROM bank_accounts
         WHERE id IN (?, ?)
         ORDER BY id
         FOR UPDATE`,
        orderedAccountIds
      );

      if (lockedAccounts.length !== 2) {
        throw new Error('源银行账户或目标银行账户不存在');
      }

      const accountMap = new Map(lockedAccounts.map(account => [Number(account.id), account]));
      const sourceAccount = accountMap.get(fromAccountId);
      const targetAccount = accountMap.get(toAccountId);

      if (!sourceAccount || !targetAccount) {
        throw new Error('源银行账户或目标银行账户不存在');
      }
      if (!sourceAccount.is_active || !targetAccount.is_active) {
        throw new Error('源银行账户或目标银行账户已停用');
      }
      if ((sourceAccount.currency_code || financeConfig.get('account.defaultCurrency', 'CNY')) !== (targetAccount.currency_code || financeConfig.get('account.defaultCurrency', 'CNY'))) {
        throw new Error('不同币种银行账户不能直接调拨');
      }
      if (roundMoney(sourceAccount.current_balance) < amount) {
        throw new Error('源账户余额不足');
      }

      const bankAccountCode = accountingConfig.getAccountCode('BANK_DEPOSIT');
      const bankGlAccountId = await getActiveGlAccountId(connection, bankAccountCode, '银行存款');
      const periodId = await getOpenAccountingPeriodId(connection, transactionDate);

      const entryNumber = `${transactionNumber}-GL`;
      const entryData = {
        entry_number: entryNumber,
        entry_date: transactionDate,
        posting_date: transactionDate,
        document_type: DOCUMENT_TYPE_MAPPING.BANK_TRANSFER,
        document_number: transactionNumber,
        period_id: periodId,
        description: `资金调拨: ${sourceAccount.bank_name} ${sourceAccount.account_name} -> ${targetAccount.bank_name} ${targetAccount.account_name}`,
        created_by: createdBy,
        status: 'posted',
        is_posted: 1,
      };

      const entryItems = [
        {
          account_id: bankGlAccountId,
          debit_amount: amount,
          credit_amount: 0,
          description: `转入 ${targetAccount.bank_name} ${targetAccount.account_name}`,
        },
        {
          account_id: bankGlAccountId,
          debit_amount: 0,
          credit_amount: amount,
          description: `转出 ${sourceAccount.bank_name} ${sourceAccount.account_name}`,
        },
      ];
      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      const [fromResult] = await connection.execute(
        `INSERT INTO bank_transactions
         (transaction_number, bank_account_id, transaction_date, transaction_type,
          amount, reference_number, description, is_reconciled, related_party, created_by, status, gl_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `${transactionNumber}-OUT`,
          fromAccountId,
          transactionDate,
          '转出',
          amount,
          transferData.reference_number || null,
          `资金调拨到 ${targetAccount.bank_name} ${targetAccount.account_name}${transferData.description ? ': ' + transferData.description : ''}`,
          false,
          `${targetAccount.bank_name} ${targetAccount.account_name}`,
          createdBy,
          'approved',
          entryId,
        ]
      );

      const [toResult] = await connection.execute(
        `INSERT INTO bank_transactions
         (transaction_number, bank_account_id, transaction_date, transaction_type,
          amount, reference_number, description, is_reconciled, related_party, created_by, status, gl_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `${transactionNumber}-IN`,
          toAccountId,
          transactionDate,
          '转入',
          amount,
          transferData.reference_number || null,
          `资金调拨自 ${sourceAccount.bank_name} ${sourceAccount.account_name}${transferData.description ? ': ' + transferData.description : ''}`,
          false,
          `${sourceAccount.bank_name} ${sourceAccount.account_name}`,
          createdBy,
          'approved',
          entryId,
        ]
      );

      await connection.execute(
        'UPDATE bank_accounts SET current_balance = current_balance - ?, last_transaction_date = ? WHERE id = ?',
        [amount, transactionDate, fromAccountId]
      );

      await connection.execute(
        'UPDATE bank_accounts SET current_balance = current_balance + ?, last_transaction_date = ? WHERE id = ?',
        [amount, transactionDate, toAccountId]
      );

      await DocumentLinkService.tryAutoLink(DocType.BANK_TRANSFER,
        fromResult.insertId,
        transactionNumber,
        DocType.FINANCE_VOUCHER,
        entryId,
        entryNumber,
        createdBy,
        connection
      );
      await DocumentLinkService.tryAutoLink(DocType.BANK_TRANSFER,
        fromResult.insertId,
        transactionNumber,
        DocType.BANK_TRANSACTION,
        fromResult.insertId,
        `${transactionNumber}-OUT`,
        createdBy,
        connection
      );
      await DocumentLinkService.tryAutoLink(DocType.BANK_TRANSFER,
        fromResult.insertId,
        transactionNumber,
        DocType.BANK_TRANSACTION,
        toResult.insertId,
        `${transactionNumber}-IN`,
        createdBy,
        connection
      );
      await DocumentLinkService.tryAutoLink(DocType.BANK_TRANSACTION,
        fromResult.insertId,
        `${transactionNumber}-OUT`,
        DocType.FINANCE_VOUCHER,
        entryId,
        entryNumber,
        createdBy,
        connection
      );
      await DocumentLinkService.tryAutoLink(DocType.BANK_TRANSACTION,
        toResult.insertId,
        `${transactionNumber}-IN`,
        DocType.FINANCE_VOUCHER,
        entryId,
        entryNumber,
        createdBy,
        connection
      );
      await DocumentLinkService.createLink(
        {
          source_type: DocType.BANK_TRANSACTION,
          source_id: fromResult.insertId,
          source_code: `${transactionNumber}-OUT`,
          target_type: DocType.BANK_TRANSACTION,
          target_id: toResult.insertId,
          target_code: `${transactionNumber}-IN`,
          link_type: 'related',
          remark: '资金调拨对应流水',
          created_by: createdBy,
        },
        connection
      );

      await connection.commit();
      return {
        from_transaction_id: fromResult.insertId,
        to_transaction_id: toResult.insertId,
        entry_id: entryId,
        entry_number: entryNumber,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('资金调拨失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = FundTransferModel;
