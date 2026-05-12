/**
 * cash/Transaction.js
 * @description 银行交易管理模型
 * @date 2026-01-23
 * @version 1.0.0
 */

const logger = require('../../utils/logger');
const db = require('../../config/db');
const financeModel = require('../finance');
const { DOCUMENT_TYPE_MAPPING } = require('../../constants/financeConstants');

function requirePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(value).trim() !== String(parsed)) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

const EDITABLE_BANK_STATUSES = new Set(['draft', 'rejected']);
const AUDITABLE_BANK_STATUSES = new Set(['pending', 'reviewed']);
const BANK_INFLOW_TYPES = new Set(['存款', '转入', '利息', '收入', 'income', 'deposit', 'transfer_in', 'interest']);
const BANK_OUTFLOW_TYPES = new Set(['取款', '转出', '费用', '支出', 'expense', 'withdrawal', 'transfer_out', 'fee']);

function normalizeStatus(status) {
  return status || 'draft';
}

function normalizePositiveAmount(value, fieldName) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be greater than 0`);
  }
  return Math.round(amount * 100) / 100;
}

function getBankBalanceDelta(transactionType, amount) {
  if (BANK_INFLOW_TYPES.has(transactionType)) return amount;
  if (BANK_OUTFLOW_TYPES.has(transactionType)) return -amount;
  logger.error(`未知的银行交易类型: ${transactionType}`);
  throw new Error(`不支持的交易类型: ${transactionType}`);
}

async function applyApprovedTransactionToBalance(connection, transaction) {
  const amount = normalizePositiveAmount(transaction.amount, 'amount');
  const delta = getBankBalanceDelta(transaction.transaction_type, amount);

  const [accounts] = await connection.execute(
    'SELECT id, current_balance FROM bank_accounts WHERE id = ? AND is_active = 1 FOR UPDATE',
    [transaction.bank_account_id]
  );
  if (accounts.length === 0) {
    throw new Error(`银行账户ID ${transaction.bank_account_id} 不存在或已停用`);
  }

  const currentBalance = Number.parseFloat(accounts[0].current_balance || 0);
  if (delta < 0 && currentBalance < Math.abs(delta)) {
    throw new Error(
      `账户余额不足，当前余额: ${currentBalance.toFixed(2)}, 交易金额: ${amount.toFixed(2)}`
    );
  }

  await connection.execute(
    'UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?',
    [delta, transaction.bank_account_id]
  );

  const [updatedAccount] = await connection.execute(
    'SELECT current_balance FROM bank_accounts WHERE id = ?',
    [transaction.bank_account_id]
  );
  return Number.parseFloat(updatedAccount[0]?.current_balance || 0);
}

function appendTransactionTypeFilter(whereParts, params, alias, transactionType) {
  if (!transactionType) return;
  const qualifiedColumn = alias ? `${alias}.transaction_type` : 'transaction_type';
  if (Array.isArray(transactionType)) {
    const normalizedTypes = transactionType.filter(Boolean);
    if (normalizedTypes.length === 0) return;
    whereParts.value += ` AND ${qualifiedColumn} IN (${normalizedTypes.map(() => '?').join(',')})`;
    params.push(...normalizedTypes);
    return;
  }
  whereParts.value += ` AND ${qualifiedColumn} = ?`;
  params.push(transactionType);
}

function ensureEditableTransaction(transaction) {
  const currentStatus = normalizeStatus(transaction.status);
  if (!EDITABLE_BANK_STATUSES.has(currentStatus)) {
    throw new Error(`Bank transaction status ${currentStatus} cannot be edited or deleted`);
  }
  if (transaction.is_reconciled === true || transaction.is_reconciled === 1 || transaction.is_reconciled === '1') {
    throw new Error('Reconciled bank transactions cannot be edited or deleted');
  }
}

function ensureAuditableTransaction(transaction) {
  const currentStatus = normalizeStatus(transaction.status);
  if (!AUDITABLE_BANK_STATUSES.has(currentStatus)) {
    throw new Error(`Bank transaction status ${currentStatus} cannot be audited`);
  }
}

class BankTransactionModel {
  /**
   * 创建银行交易
   */
  static async createBankTransaction(transactionData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 插入银行交易
      const bankAccountId = requirePositiveInteger(
        transactionData.bank_account_id,
        'bank_account_id'
      );
      const createdBy = requirePositiveInteger(transactionData.created_by, 'created_by');
      const amount = normalizePositiveAmount(transactionData.amount, 'amount');
      const initialStatus = transactionData.status === 'approved' ? 'approved' : 'draft';

      const [result] = await connection.execute(
        `INSERT INTO bank_transactions
        (transaction_number, bank_account_id, transaction_date, transaction_type,
         amount, reference_number, description, is_reconciled,
         reconciliation_date, related_party, category, payment_method, created_by, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionData.transaction_number,
          bankAccountId,
          transactionData.transaction_date,
          transactionData.transaction_type,
          amount,
          transactionData.reference_number || null,
          transactionData.description || null,
          transactionData.is_reconciled || false,
          transactionData.reconciliation_date || null,
          transactionData.related_party || null,
          transactionData.category || null,
          transactionData.payment_method || null,
          createdBy,
          initialStatus,
        ]
      );

      const transactionId = result.insertId;

      // 检查银行账户是否存在
      const [bankAccounts] = await connection.execute(
        'SELECT id, bank_name, account_name, current_balance, is_active FROM bank_accounts WHERE id = ? FOR UPDATE',
        [bankAccountId]
      );
      if (bankAccounts.length === 0) {
        throw new Error(`银行账户ID ${bankAccountId} 不存在`);
      }
      const bankAccount = bankAccounts[0];
      if (bankAccount.is_active === 0) {
        throw new Error(`银行账户 "${bankAccount.account_name}" 已停用`);
      }

      let newBalance = Number.parseFloat(bankAccount.current_balance || 0);
      if (initialStatus === 'approved') {
        newBalance = await applyApprovedTransactionToBalance(connection, {
          bank_account_id: bankAccountId,
          transaction_type: transactionData.transaction_type,
          amount,
        });
      }

      // 如果提供了会计分录信息，创建相应的会计分录
      if (initialStatus === 'approved' && transactionData.gl_entry && typeof transactionData.gl_entry === 'object') {
        logger.info('处理会计分录数据:', transactionData.gl_entry);

        const entryData = {
          entry_number: transactionData.gl_entry.entry_number,
          entry_date: transactionData.transaction_date,
          posting_date: transactionData.transaction_date,
          document_type: DOCUMENT_TYPE_MAPPING.BANK_TRANSFER,
          document_number: transactionData.transaction_number,
          period_id: transactionData.gl_entry.period_id,
          description:
            transactionData.description || `银行交易: ${transactionData.transaction_type}`,
          created_by: transactionData.gl_entry.created_by,
        };

        // 根据交易类型创建不同的分录明细
        let entryItems = [];

        switch (transactionData.transaction_type) {
          case '存款':
          case '转入':
            // 借：银行账户
            entryItems = [
              {
                account_id: transactionData.gl_entry.bank_account_id,
                debit_amount: amount,
                credit_amount: 0,
                description: `银行${transactionData.transaction_type} - ${bankAccount.bank_name} ${bankAccount.account_name}`,
              },
              // 贷：来源账户（如现金、其他银行等）
              {
                account_id: transactionData.gl_entry.contra_account_id,
                debit_amount: 0,
                credit_amount: amount,
                description: `银行${transactionData.transaction_type}来源 - ${transactionData.related_party || ''}`,
              },
            ];
            break;

          case '取款':
          case '转出':
            // 借：目标账户（如现金、其他银行等）
            entryItems = [
              {
                account_id: transactionData.gl_entry.contra_account_id,
                debit_amount: amount,
                credit_amount: 0,
                description: `银行${transactionData.transaction_type}目标 - ${transactionData.related_party || ''}`,
              },
              // 贷：银行账户
              {
                account_id: transactionData.gl_entry.bank_account_id,
                debit_amount: 0,
                credit_amount: amount,
                description: `银行${transactionData.transaction_type} - ${bankAccount.bank_name} ${bankAccount.account_name}`,
              },
            ];
            break;

          case '利息':
            // 借：银行账户
            entryItems = [
              {
                account_id: transactionData.gl_entry.bank_account_id,
                debit_amount: amount,
                credit_amount: 0,
                description: `银行利息 - ${bankAccount.bank_name} ${bankAccount.account_name}`,
              },
              // 贷：利息收入
              {
                account_id: transactionData.gl_entry.interest_account_id,
                debit_amount: 0,
                credit_amount: amount,
                description: '银行利息收入',
              },
            ];
            break;

          case '费用':
            // 借：银行费用
            entryItems = [
              {
                account_id: transactionData.gl_entry.expense_account_id,
                debit_amount: amount,
                credit_amount: 0,
                description: `银行费用 - ${bankAccount.bank_name} ${bankAccount.account_name}`,
              },
              // 贷：银行账户
              {
                account_id: transactionData.gl_entry.bank_account_id,
                debit_amount: 0,
                credit_amount: amount,
                description: '银行费用支出',
              },
            ];
            break;

          default:
            // 自定义或其他类型交易
            if (parseFloat(amount) >= 0) {
              entryItems = [
                {
                  account_id: transactionData.gl_entry.bank_account_id,
                  debit_amount: Math.abs(amount),
                  credit_amount: 0,
                  description: `银行交易 - ${bankAccount.bank_name} ${bankAccount.account_name}`,
                },
                {
                  account_id: transactionData.gl_entry.contra_account_id,
                  debit_amount: 0,
                  credit_amount: Math.abs(amount),
                  description: `银行交易对方 - ${transactionData.related_party || ''}`,
                },
              ];
            } else {
              entryItems = [
                {
                  account_id: transactionData.gl_entry.contra_account_id,
                  debit_amount: Math.abs(amount),
                  credit_amount: 0,
                  description: `银行交易对方 - ${transactionData.related_party || ''}`,
                },
                {
                  account_id: transactionData.gl_entry.bank_account_id,
                  debit_amount: 0,
                  credit_amount: Math.abs(amount),
                  description: `银行交易 - ${bankAccount.bank_name} ${bankAccount.account_name}`,
                },
              ];
            }
        }

        try {
          // 创建会计分录
          await financeModel.createEntry(entryData, entryItems, connection);
          logger.info('会计分录创建成功');
        } catch (entryError) {
          logger.error('创建会计分录失败:', entryError);
          throw new Error(`Bank transaction GL entry creation failed: ${entryError.message}`, {
            cause: entryError,
          });
        }
      }

      await connection.commit();

      return {
        transactionId,
        newBalance,
        success: true,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('银行交易创建失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取银行交易
   */
  static async getBankTransactionById(id) {
    try {
      const [transactions] = await db.pool.execute(
        `SELECT t.*, b.account_name, b.bank_name
         FROM bank_transactions t
         LEFT JOIN bank_accounts b ON t.bank_account_id = b.id
         WHERE t.id = ?`,
        [id]
      );
      return transactions.length > 0 ? transactions[0] : null;
    } catch (error) {
      logger.error('获取银行交易失败:', error);
      throw error;
    }
  }

  /**
   * 获取银行交易列表
   */
  static async getBankTransactions(filters = {}, page = 1, pageSize = 20) {
    try {
      const pageInt = parseInt(page, 10);
      const pageSizeInt = parseInt(pageSize, 10);

      const fromClause = `
        FROM bank_transactions t
        LEFT JOIN bank_accounts b ON t.bank_account_id = b.id
        LEFT JOIN ar_invoices ar_inv ON t.related_invoice_id = ar_inv.id AND t.related_invoice_type = 'AR'
        LEFT JOIN ap_invoices ap_inv ON t.related_invoice_id = ap_inv.id AND t.related_invoice_type = 'AP'
      `;

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (filters.transaction_number) {
        whereClause += ' AND t.transaction_number LIKE ?';
        params.push(`%${filters.transaction_number}%`);
      }

      const bankAccountId = filters.bank_account_id || filters.accountId;
      if (bankAccountId) {
        whereClause += ' AND t.bank_account_id = ?';
        params.push(parseInt(bankAccountId, 10));
      }

      const whereParts = { value: whereClause };
      appendTransactionTypeFilter(whereParts, params, 't', filters.transaction_type);
      whereClause = whereParts.value;

      const startDate = filters.startDate || filters.start_date;
      const endDate = filters.endDate || filters.end_date;

      if (startDate && endDate) {
        whereClause += ' AND t.transaction_date BETWEEN ? AND ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        whereClause += ' AND t.transaction_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        whereClause += ' AND t.transaction_date <= ?';
        params.push(endDate);
      }

      const isReconciled =
        filters.is_reconciled !== undefined ? filters.is_reconciled : filters.isReconciled;
      if (isReconciled !== undefined) {
        whereClause += ' AND t.is_reconciled = ?';
        params.push(isReconciled ? 1 : 0);
      }

      if (filters.status) {
        whereClause += ' AND t.status = ?';
        params.push(filters.status);
      }

      if (filters.minAmount !== undefined && filters.minAmount !== null && filters.minAmount !== '') {
        whereClause += ' AND t.amount >= ?';
        params.push(parseFloat(filters.minAmount));
      }

      if (filters.maxAmount !== undefined && filters.maxAmount !== null && filters.maxAmount !== '') {
        whereClause += ' AND t.amount <= ?';
        params.push(parseFloat(filters.maxAmount));
      }

      if (filters.related_party) {
        whereClause += ' AND t.related_party LIKE ?';
        params.push(`%${filters.related_party}%`);
      }

      const countQuery = `SELECT COUNT(*) as total ${fromClause} ${whereClause}`;
      const [countResult] = await db.pool.execute(countQuery, params);
      const total = countResult[0].total;

      const offset = (pageInt - 1) * pageSizeInt;
      const dataQuery = `
        SELECT t.*,
               b.account_name,
               b.bank_name,
               CASE
                 WHEN t.related_invoice_type = 'AR' THEN ar_inv.invoice_number
                 WHEN t.related_invoice_type = 'AP' THEN ap_inv.invoice_number
                 ELSE NULL
               END as related_invoice_number,
               CASE
                 WHEN t.transaction_type IN ('转入', '存款') THEN 'sales_income'
                 WHEN t.transaction_type IN ('转出', '取款') THEN 'purchase_expense'
                 ELSE 'sales_income'
               END as transaction_category
        ${fromClause}
        ${whereClause}
        ORDER BY t.transaction_date DESC, t.id DESC
        LIMIT ${pageSizeInt} OFFSET ${offset}`;

      const [transactions] = await db.pool.query(dataQuery, params);

      return {
        transactions,
        pagination: {
          total,
          page: pageInt,
          pageSize: pageSizeInt,
          totalPages: Math.ceil(total / pageSizeInt),
        },
      };
    } catch (error) {
      logger.error('获取银行交易列表失败:', error);
      throw error;
    }
  }
  /**
   * 更新银行交易
   * 注意：会自动回滚旧金额对余额的影响，应用新金额
   */
  static async updateBankTransaction(id, transactionData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 获取旧交易信息
      const transactionId = requirePositiveInteger(id, 'id');
      const targetBankAccountId = transactionData.bank_account_id
        ? requirePositiveInteger(transactionData.bank_account_id, 'bank_account_id')
        : null;
      const updatedBy = transactionData.updated_by
        ? requirePositiveInteger(transactionData.updated_by, 'updated_by')
        : null;

      const [oldTransactions] = await connection.execute(
        'SELECT bank_account_id, transaction_type, amount, status, is_reconciled FROM bank_transactions WHERE id = ? FOR UPDATE',
        [transactionId]
      );

      if (oldTransactions.length === 0) {
        throw new Error('交易记录不存在');
      }

      const oldTx = oldTransactions[0];
      ensureEditableTransaction(oldTx);
      const bankAccountId = targetBankAccountId || oldTx.bank_account_id;

      const [bankAccounts] = await connection.execute(
        'SELECT id FROM bank_accounts WHERE id = ?',
        [bankAccountId]
      );
      if (bankAccounts.length === 0) {
        throw new Error(`bank_account_id ${bankAccountId} does not exist`);
      }

      // 2. 更新交易记录。草稿/驳回流水尚未入账，不调整银行余额。
      await connection.execute(
        `UPDATE bank_transactions SET
                bank_account_id = ?,
                transaction_date = ?,
                transaction_type = ?,
                amount = ?,
                description = ?,
                reference_number = ?,
                related_party = ?,
                category = ?,
                payment_method = ?,
                updated_by = ?,
                status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END,
                approved_by = CASE WHEN status = 'rejected' THEN NULL ELSE approved_by END,
                approved_at = CASE WHEN status = 'rejected' THEN NULL ELSE approved_at END,
                reject_reason = CASE WHEN status = 'rejected' THEN NULL ELSE reject_reason END
                WHERE id = ?`,
        [
          bankAccountId,
          transactionData.transaction_date,
          transactionData.transaction_type,
          transactionData.amount,
          transactionData.description,
          transactionData.reference_number || null,
          transactionData.related_party || null,
          transactionData.category || null,
          transactionData.payment_method || null,
          updatedBy,
          transactionId,
        ]
      );

      const [updatedAccount] = await connection.execute(
        'SELECT current_balance FROM bank_accounts WHERE id = ?',
        [bankAccountId]
      );
      const newBalance = parseFloat(updatedAccount[0]?.current_balance || 0);

      await connection.commit();
      logger.info(`银行交易更新成功: ID=${transactionId}`);
      return { transactionId, newBalance };
    } catch (error) {
      await connection.rollback();
      logger.error('更新银行交易失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 删除银行交易
   * 注意：会自动回滚该交易对余额的影响
   */
  static async deleteBankTransaction(id) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 获取交易信息用于回滚余额
      const [transactions] = await connection.execute(
        'SELECT bank_account_id, transaction_type, amount, status, is_reconciled FROM bank_transactions WHERE id = ? FOR UPDATE',
        [id]
      );

      if (transactions.length === 0) {
        throw new Error('交易记录不存在');
      }

      const tx = transactions[0];
      ensureEditableTransaction(tx);

      // 2. 删除草稿/驳回交易。此类流水尚未入账，不需要回滚余额。
      const [result] = await connection.execute('DELETE FROM bank_transactions WHERE id = ?', [id]);

      await connection.commit();
      logger.info(`银行交易删除成功: ID=${id}`);
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('删除银行交易失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
  /**
   * 提交审核
   * @param {number} id 交易ID
   * @param {number} userId 提交人ID
   */
  static async submitForAudit(id) {
    try {
      // status 及审核相关字段由 migrations/20260312000010 管理


      // 检查当前状态
      const [current] = await db.pool.execute('SELECT status, is_reconciled FROM bank_transactions WHERE id = ?', [
        id,
      ]);

      if (current.length === 0) {
        throw new Error('银行交易不存在');
      }

      const currentStatus = normalizeStatus(current[0].status);
      if (!EDITABLE_BANK_STATUSES.has(currentStatus)) {
        throw new Error(`交易当前状态为 ${currentStatus}，无法重复提交审核`);
      }

      // 更新状态为待审核
      if (current[0].is_reconciled === true || current[0].is_reconciled === 1 || current[0].is_reconciled === '1') {
        throw new Error('Reconciled bank transactions cannot be submitted for audit');
      }

      const [result] = await db.pool.execute(
        `UPDATE bank_transactions
                 SET status = 'pending', approved_by = NULL, approved_at = NULL, reject_reason = NULL
                 WHERE id = ? AND (status IS NULL OR status IN ('draft', 'rejected'))`,
        [id]
      );

      if (result.affectedRows === 0) {
        const [current] = await db.pool.execute(
          'SELECT status FROM bank_transactions WHERE id = ?',
          [id]
        );
        if (current.length > 0) {
          ensureAuditableTransaction(current[0]);
        }
        throw new Error('银行交易不存在');
      }

      logger.info(`银行交易 ${id} 已提交审核`);
      return true;
    } catch (error) {
      logger.error('提交审核失败:', error);
      throw error;
    }
  }

  /**
   * 审核通过
   * @param {number} id 交易ID
   * @param {number} userId 审核人ID
   */
  static async approveTransaction(id, userId) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [transactions] = await connection.execute(
        `SELECT id, bank_account_id, transaction_type, amount, status, is_reconciled
         FROM bank_transactions
         WHERE id = ?
         FOR UPDATE`,
        [id]
      );
      if (transactions.length === 0) {
        throw new Error('银行交易不存在');
      }

      const transaction = transactions[0];
      ensureAuditableTransaction(transaction);
      if (transaction.is_reconciled === true || transaction.is_reconciled === 1 || transaction.is_reconciled === '1') {
        throw new Error('Reconciled bank transactions cannot be approved');
      }

      const newBalance = await applyApprovedTransactionToBalance(connection, transaction);

      const [result] = await connection.execute(
        `UPDATE bank_transactions
                 SET status = 'approved', approved_by = ?, approved_at = NOW(), reject_reason = NULL
                 WHERE id = ? AND status IN ('pending', 'reviewed')`,
        [userId, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('银行交易不存在');
      }

      await connection.commit();
      logger.info(`银行交易 ${id} 审核通过`);
      return { success: true, newBalance };
    } catch (error) {
      await connection.rollback();
      logger.error('审核通过失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 审核拒绝
   * @param {number} id 交易ID
   * @param {number} userId 审核人ID
   * @param {string} reason 拒绝原因
   */
  static async rejectTransaction(id, userId, reason) {
    try {
      const [result] = await db.pool.execute(
        `UPDATE bank_transactions
                 SET status = 'rejected', approved_by = ?, approved_at = NOW(),
                     reject_reason = ?
                 WHERE id = ? AND status IN ('pending', 'reviewed')`,
        [userId, reason, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('银行交易不存在');
      }

      logger.info(`银行交易 ${id} 审核拒绝: ${reason}`);
      return true;
    } catch (error) {
      logger.error('审核拒绝失败:', error);
      throw error;
    }
  }
}

module.exports = BankTransactionModel;
