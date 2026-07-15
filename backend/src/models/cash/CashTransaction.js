/**
 * cash/CashTransaction.js
 * @description 现金交易管理模型
 * @date 2026-01-23
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const CodeGeneratorService = require('../../services/business/CodeGeneratorService');
const financeModel = require('../finance');
const { accountingConfig } = require('../../config/accountingConfig');
const { DOCUMENT_TYPE_MAPPING } = require('../../constants/financeConstants');
const DocumentLinkService = require('../../services/business/DocumentLinkService');
const { parsePagination } = require('../../utils/safePagination');
const { toLocalDateString } = require('../../utils/dateUtils');

const EDITABLE_CASH_STATUSES = new Set(['draft', 'rejected']);
const AUDITABLE_CASH_STATUSES = new Set(['pending', 'reviewed']);
const CASH_INFLOW_TYPES = new Set(['income', 'receipt', 'cash_income', '收入', '现金收入']);
const CASH_OUTFLOW_TYPES = new Set(['expense', 'payment', 'cash_expense', '支出', '现金支出']);

function normalizeStatus(status) {
  return status || 'draft';
}

function ensureEditableCashTransaction(transaction) {
  const currentStatus = normalizeStatus(transaction.status);
  if (!EDITABLE_CASH_STATUSES.has(currentStatus)) {
    throw new Error(`Cash transaction status ${currentStatus} cannot be edited or deleted`);
  }
}

function ensureAuditableCashTransaction(transaction) {
  const currentStatus = normalizeStatus(transaction.status);
  if (!AUDITABLE_CASH_STATUSES.has(currentStatus)) {
    throw new Error(`Cash transaction status ${currentStatus} cannot be audited`);
  }
}

function normalizePositiveAmount(value, fieldName) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be greater than 0`);
  }
  return Math.round(amount * 100) / 100;
}

function formatDateOnly(value) {
  const text = toLocalDateString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Cash transaction date must use YYYY-MM-DD format');
  }
  return text;
}

async function getOpenAccountingPeriodId(connection, accountingDate) {
  const [periods] = await connection.execute(
    `SELECT id, period_name
     FROM gl_periods
     WHERE start_date <= ?
       AND end_date >= ?
       AND is_closed = 0
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

async function getActiveGlAccountId(connection, accountCode, accountLabel) {
  if (!accountCode) {
    throw new Error(`${accountLabel} account code is not configured`);
  }

  const [accounts] = await connection.execute(
    'SELECT id FROM gl_accounts WHERE account_code = ? AND (is_active = 1 OR is_active IS NULL) LIMIT 1',
    [accountCode]
  );

  if (accounts.length === 0) {
    throw new Error(`${accountLabel} account ${accountCode} does not exist or is inactive`);
  }

  return accounts[0].id;
}

function resolveProvidedAccountId(glEntry, ...keys) {
  if (!glEntry || typeof glEntry !== 'object') return null;
  for (const key of keys) {
    const value = Number.parseInt(glEntry[key], 10);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return null;
}

function getCashContraAccountKey(transaction) {
  const type = transaction.transaction_type;
  const category = transaction.category || '';

  if (category === 'sales' || category === 'sales_income') {
    return 'SALES_REVENUE';
  }

  if (category === 'other_income' || CASH_INFLOW_TYPES.has(type)) {
    return 'OTHER_REVENUE';
  }

  if (category === 'purchase_expense') {
    return 'PURCHASE_COST';
  }

  if (category === 'finance_fee') {
    return 'FINANCE_EXPENSE';
  }

  if (CASH_OUTFLOW_TYPES.has(type)) {
    return 'ADMIN_EXPENSE';
  }

  throw new Error(`Unsupported cash transaction type: ${type}`);
}

function getCashDocumentType(transactionType) {
  if (CASH_INFLOW_TYPES.has(transactionType)) {
    return DOCUMENT_TYPE_MAPPING.CASH_RECEIPT;
  }
  if (CASH_OUTFLOW_TYPES.has(transactionType)) {
    return DOCUMENT_TYPE_MAPPING.CASH_PAYMENT;
  }
  throw new Error(`Unsupported cash transaction type: ${transactionType}`);
}

async function createApprovedCashTransactionGlEntry(connection, transaction, operatorId) {
  if (transaction.gl_entry_id) {
    const [existing] = await connection.execute(
      'SELECT id, entry_number FROM gl_entries WHERE id = ? LIMIT 1',
      [transaction.gl_entry_id]
    );
    if (existing.length > 0) {
      return { entryId: existing[0].id, entryNumber: existing[0].entry_number };
    }
  }

  const transactionNumber = String(transaction.transaction_number || '').trim();
  if (!transactionNumber) {
    throw new Error('Cash transaction number is required to generate a voucher');
  }

  const amount = normalizePositiveAmount(transaction.amount, 'amount');
  const transactionDate = formatDateOnly(transaction.transaction_date);
  const documentType = getCashDocumentType(transaction.transaction_type);

  const [existingEntries] = await connection.execute(
    `SELECT id, entry_number
     FROM gl_entries
     WHERE document_type = ?
       AND document_number = ?
       AND (is_reversed IS NULL OR is_reversed = 0)
     LIMIT 1
     FOR UPDATE`,
    [documentType, transactionNumber]
  );

  if (existingEntries.length > 0) {
    await connection.execute('UPDATE cash_transactions SET gl_entry_id = ? WHERE id = ?', [
      existingEntries[0].id,
      transaction.id,
    ]);
    await DocumentLinkService.tryAutoLink(
      'cash_transaction',
      transaction.id,
      transactionNumber,
      'finance_voucher',
      existingEntries[0].id,
      existingEntries[0].entry_number,
      operatorId || transaction.created_by || null,
      connection
    );
    return { entryId: existingEntries[0].id, entryNumber: existingEntries[0].entry_number };
  }

  await accountingConfig.loadFromDatabase(db);
  const providedGlEntry =
    transaction.gl_entry && typeof transaction.gl_entry === 'object' ? transaction.gl_entry : {};
  const periodId =
    resolveProvidedAccountId(providedGlEntry, 'period_id') ||
    (await getOpenAccountingPeriodId(connection, transactionDate));
  const cashAccountId =
    resolveProvidedAccountId(providedGlEntry, 'cash_gl_account_id', 'cash_account_id') ||
    (await getActiveGlAccountId(
      connection,
      accountingConfig.getAccountCode('CASH'),
      'Cash'
    ));
  const contraAccountKey = getCashContraAccountKey(transaction);
  const contraAccountId =
    resolveProvidedAccountId(
      providedGlEntry,
      'contra_account_id',
      'counterparty_account_id',
      'income_account_id',
      'expense_account_id'
    ) ||
    (await getActiveGlAccountId(
      connection,
      accountingConfig.getAccountCode(contraAccountKey),
      contraAccountKey
    ));

  const isInflow = CASH_INFLOW_TYPES.has(transaction.transaction_type);
  const entryItems = isInflow
    ? [
      {
        account_id: cashAccountId,
        debit_amount: amount,
        credit_amount: 0,
        description: `Cash receipt - ${transaction.description || transactionNumber}`,
      },
      {
        account_id: contraAccountId,
        debit_amount: 0,
        credit_amount: amount,
        description: `Cash receipt contra - ${transaction.counterparty || transaction.category || ''}`,
      },
    ]
    : [
      {
        account_id: contraAccountId,
        debit_amount: amount,
        credit_amount: 0,
        description: `Cash payment contra - ${transaction.counterparty || transaction.category || ''}`,
      },
      {
        account_id: cashAccountId,
        debit_amount: 0,
        credit_amount: amount,
        description: `Cash payment - ${transaction.description || transactionNumber}`,
      },
    ];

  const entryId = await financeModel.createEntry(
    {
      entry_number: providedGlEntry.entry_number,
      entry_date: transactionDate,
      posting_date: transactionDate,
      document_type: documentType,
      document_number: transactionNumber,
      period_id: periodId,
      description: transaction.description || `Cash transaction: ${transaction.transaction_type}`,
      created_by: providedGlEntry.created_by || operatorId || transaction.created_by,
      status: 'posted',
      is_posted: 1,
    },
    entryItems,
    connection
  );

  const [entries] = await connection.execute(
    'SELECT entry_number FROM gl_entries WHERE id = ?',
    [entryId]
  );
  const entryNumber = entries[0]?.entry_number || providedGlEntry.entry_number || null;

  await connection.execute('UPDATE cash_transactions SET gl_entry_id = ? WHERE id = ?', [
    entryId,
    transaction.id,
  ]);
  await DocumentLinkService.tryAutoLink(
    'cash_transaction',
    transaction.id,
    transactionNumber,
    'finance_voucher',
    entryId,
    entryNumber,
    operatorId || transaction.created_by || null,
    connection
  );

  return { entryId, entryNumber };
}

class CashTransactionModel {
  /**
   * 创建现金交易
   */
  static async createCashTransaction(transactionData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const transactionNumber = await CodeGeneratorService.nextCode('cash_transaction', connection);

      // 插入现金交易记录
      const [result] = await connection.execute(
        `INSERT INTO cash_transactions
        (transaction_type, transaction_date, amount, category,
         counterparty, description, reference_number, transaction_number,
         status, created_by, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NOW(), NOW())`,
        [
          transactionData.transaction_type,
          transactionData.transaction_date,
          parseFloat(transactionData.amount),
          transactionData.category,
          transactionData.counterparty || '',
          transactionData.description,
          transactionData.reference_number || '',
          transactionNumber,
          transactionData.created_by || null,
          transactionData.created_by || null,
        ]
      );

      const transactionId = result.insertId;

      // 提交事务
      await connection.commit();

      return {
        transactionId,
        transactionNumber,
        success: true,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('现金交易创建失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取现金交易列表
   */
  static async getCashTransactions(filters = {}) {
    try {
      const pagination = parsePagination(filters.page, filters.pageSize || filters.limit, {
        defaultPageSize: 10,
        maxPageSize: 100,
      });
      const scopeClause = filters.scopeClause || { join: '', where: '', params: [] };

      let whereClause = 'WHERE 1=1';
      const params = [];

      if (filters.type) {
        whereClause += ' AND t.transaction_type = ?';
        params.push(filters.type);
      }

      if (filters.category) {
        whereClause += ' AND t.category = ?';
        params.push(filters.category);
      }

      if (filters.startDate) {
        whereClause += ' AND t.transaction_date >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND t.transaction_date <= ?';
        params.push(filters.endDate);
      }

      if (filters.search) {
        whereClause += ` AND (
          t.transaction_number LIKE ?
          OR t.counterparty LIKE ?
          OR t.description LIKE ?
          OR t.reference_number LIKE ?
        )`;
        const keyword = `%${filters.search}%`;
        params.push(keyword, keyword, keyword, keyword);
      }

      if (scopeClause.where) {
        whereClause += scopeClause.where;
        params.push(...(scopeClause.params || []));
      }

      const [countResult] = await db.pool.execute(
        `SELECT COUNT(*) as total FROM cash_transactions t ${scopeClause.join || ''} ${whereClause}`,
        params
      );
      const total = parseInt(countResult[0].total) || 0;

      // 查询数据
      const dataQuery = `
        SELECT
          t.id,
          t.transaction_date as transactionDate,
          t.transaction_type as type,
          t.amount,
          t.category,
          t.counterparty,
          t.description,
          t.reference_number as referenceNumber,
          t.transaction_number as transactionNumber,
          t.status,
          t.gl_entry_id as glEntryId,
          t.approved_by as approvedBy,
          t.approved_at as approvedAt,
          t.reject_reason as rejectReason,
          t.created_by as createdBy,
          t.created_at as createdAt,
          t.updated_at as updatedAt
        FROM cash_transactions t
        ${scopeClause.join || ''}
        ${whereClause}
        ORDER BY t.transaction_date DESC, t.created_at DESC
        LIMIT ${pagination.limit} OFFSET ${pagination.offset}
      `;

      const [rows] = await db.pool.execute(dataQuery, params);

      return {
        transactions: rows,
        pagination: {
          total,
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalPages: Math.ceil(total / pagination.pageSize),
        },
      };
    } catch (error) {
      logger.error('[现金交易] 获取现金交易列表失败:', error);
      throw error;
    }
  }

  static async getCashTransactionsForExport(filters = {}) {
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (filters.type) {
        whereClause += ' AND transaction_type = ?';
        params.push(filters.type);
      }
      if (filters.category) {
        whereClause += ' AND category = ?';
        params.push(filters.category);
      }
      if (filters.startDate) {
        whereClause += ' AND transaction_date >= ?';
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        whereClause += ' AND transaction_date <= ?';
        params.push(filters.endDate);
      }
      if (filters.search) {
        whereClause += ` AND (
          transaction_number LIKE ?
          OR counterparty LIKE ?
          OR description LIKE ?
          OR reference_number LIKE ?
        )`;
        const keyword = `%${filters.search}%`;
        params.push(keyword, keyword, keyword, keyword);
      }

      const [rows] = await db.pool.execute(
        `SELECT
          id,
          transaction_date as transactionDate,
          transaction_type as type,
          amount,
          category,
          counterparty,
          description,
          reference_number as referenceNumber,
          transaction_number as transactionNumber,
          status,
          gl_entry_id as glEntryId,
          approved_by as approvedBy,
          approved_at as approvedAt,
          reject_reason as rejectReason,
          created_by as createdBy,
          created_at as createdAt,
          updated_at as updatedAt
        FROM cash_transactions
        ${whereClause}
        ORDER BY transaction_date DESC, created_at DESC`,
        params
      );

      return { transactions: rows };
    } catch (error) {
      logger.error('[现金交易] 导出现金交易列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取现金交易统计
   */
  static async getCashTransactionStats(filters = {}) {
    try {
      let whereClause = "WHERE (status IS NULL OR status = 'approved')";
      const params = [];

      // 添加筛选条件
      if (filters.type) {
        whereClause += ' AND transaction_type = ?';
        params.push(filters.type);
      }

      if (filters.category) {
        whereClause += ' AND category = ?';
        params.push(filters.category);
      }

      if (filters.startDate) {
        whereClause += ' AND transaction_date >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND transaction_date <= ?';
        params.push(filters.endDate);
      }

      const query = `
        SELECT
          COUNT(*) as totalCount,
          COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0) as totalIncome,
          COALESCE(SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0) as totalExpense,
          COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE -amount END), 0) as netAmount
        FROM cash_transactions
        ${whereClause}
      `;

      const [rows] = await db.pool.execute(query, params);
      return rows[0];
    } catch (error) {
      logger.error('获取现金交易统计失败:', error);
      throw error;
    }
  }

  /**
   * 根据ID获取现金交易
   */
  static async getCashTransactionById(id) {
    try {
      const [transactions] = await db.pool.execute(
        `SELECT
          id,
          transaction_date as transactionDate,
          transaction_type as type,
          amount,
          category,
          counterparty,
          description,
          reference_number as referenceNumber,
          transaction_number as transactionNumber,
          status,
          gl_entry_id as glEntryId,
          approved_by as approvedBy,
          approved_at as approvedAt,
          reject_reason as rejectReason,
          created_by as createdBy,
          created_at as createdAt,
          updated_at as updatedAt
         FROM cash_transactions
         WHERE id = ?`,
        [id]
      );
      return transactions.length > 0 ? transactions[0] : null;
    } catch (error) {
      logger.error('获取现金交易失败:', error);
      throw error;
    }
  }

  /**
   * 更新现金交易
   */
  static async updateCashTransaction(id, transactionData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [current] = await connection.execute(
        'SELECT id, status FROM cash_transactions WHERE id = ? FOR UPDATE',
        [id]
      );
      if (current.length === 0) {
        throw new Error('现金交易不存在');
      }
      ensureEditableCashTransaction(current[0]);

      const [result] = await connection.execute(
        `UPDATE cash_transactions
         SET transaction_type = ?, transaction_date = ?, amount = ?, category = ?,
             counterparty = ?, description = ?, reference_number = ?,
             status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END,
             approved_by = CASE WHEN status = 'rejected' THEN NULL ELSE approved_by END,
             approved_at = CASE WHEN status = 'rejected' THEN NULL ELSE approved_at END,
             reject_reason = CASE WHEN status = 'rejected' THEN NULL ELSE reject_reason END,
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [
          transactionData.transaction_type,
          transactionData.transaction_date,
          parseFloat(transactionData.amount),
          transactionData.category,
          transactionData.counterparty || '',
          transactionData.description,
          transactionData.reference_number || '',
          transactionData.updated_by || transactionData.created_by || null,
          id,
        ]
      );

      if (result.affectedRows === 0) {
        throw new Error('现金交易不存在');
      }

      await connection.commit();
      logger.info('现金交易更新成功');

      return { success: true };
    } catch (error) {
      await connection.rollback();
      logger.error('现金交易更新失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 删除现金交易
   */
  static async deleteCashTransaction(id) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [current] = await connection.execute(
        'SELECT id, status FROM cash_transactions WHERE id = ? FOR UPDATE',
        [id]
      );
      if (current.length === 0) {
        throw new Error('现金交易不存在');
      }
      ensureEditableCashTransaction(current[0]);

      const [result] = await connection.execute('DELETE FROM cash_transactions WHERE id = ?', [id]);

      if (result.affectedRows === 0) {
        throw new Error('现金交易不存在');
      }

      await connection.commit();
      logger.info('现金交易删除成功');

      return { success: true };
    } catch (error) {
      await connection.rollback();
      logger.error('现金交易删除失败，事务已回滚:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 批量导入现金交易
   */
  static async batchCreateCashTransactions(transactionsData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const results = [];

      for (const transactionData of transactionsData) {
        const transactionNumber = await CodeGeneratorService.nextCode('cash_transaction', connection);

        const [result] = await connection.execute(
          `INSERT INTO cash_transactions
          (transaction_type, transaction_date, amount, category,
           counterparty, description, reference_number, transaction_number,
           status, created_by, updated_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NOW(), NOW())`,
          [
            transactionData.transaction_type,
            transactionData.transaction_date,
            parseFloat(transactionData.amount),
            transactionData.category,
            transactionData.counterparty || '',
            transactionData.description,
            transactionData.reference_number || '',
            transactionNumber,
            transactionData.created_by || null,
            transactionData.created_by || null,
          ]
        );

        results.push({
          transactionId: result.insertId,
          transactionNumber,
        });
      }

      await connection.commit();
      logger.info(`批量创建现金交易成功，共创建 ${results.length} 条记录`);

      return {
        success: true,
        count: results.length,
        results,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('批量创建现金交易失败，事务已回滚:', error);
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
  static async submitForAudit(id, userId = null) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [current] = await connection.execute(
        'SELECT status FROM cash_transactions WHERE id = ? FOR UPDATE',
        [id]
      );
      if (current.length === 0) {
        throw new Error('Cash transaction does not exist');
      }

      const currentStatus = normalizeStatus(current[0].status);
      if (!EDITABLE_CASH_STATUSES.has(currentStatus)) {
        throw new Error(`Cash transaction status ${currentStatus} cannot be submitted`);
      }

      const [result] = await connection.execute(
        `UPDATE cash_transactions
         SET status = 'pending',
             approved_by = NULL,
             approved_at = NULL,
             reject_reason = NULL,
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ? AND (status IS NULL OR status IN ('draft', 'rejected'))`,
        [userId || null, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('Cash transaction status changed during submit');
      }

      await connection.commit();
      logger.info(`Cash transaction ${id} submitted for audit`);
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('Submit cash transaction audit failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 审核通过
   * @param {number} id 交易ID
   * @param {number} userId 审核人ID
   */
  static async approveTransaction(id, userId = null) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [current] = await connection.execute(
        'SELECT id, transaction_type, transaction_date, amount, category, counterparty, description, reference_number, transaction_number, created_by, updated_by, approved_by, approved_at, reject_reason, created_at, updated_at, status, gl_entry_id FROM cash_transactions WHERE id = ? FOR UPDATE',
        [id]
      );

      if (current.length === 0) {
        throw new Error('Cash transaction does not exist');
      }
      ensureAuditableCashTransaction(current[0]);
      if (Number(current[0].created_by) === Number(userId)) {
        throw new Error('制单人不能审核自己的现金交易');
      }

      const entryInfo = await createApprovedCashTransactionGlEntry(
        connection,
        current[0],
        userId
      );

      const [result] = await connection.execute(
        `UPDATE cash_transactions
         SET status = 'approved',
             approved_by = ?,
             approved_at = COALESCE(approved_at, NOW()),
             updated_at = NOW()
         WHERE id = ? AND status IN ('pending', 'reviewed')`,
        [userId || null, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('Cash transaction status changed during approval');
      }

      await connection.commit();
      logger.info(`现金交易 ${id} 审核通过`);
      return {
        success: true,
        entryId: entryInfo.entryId,
        entryNumber: entryInfo.entryNumber,
      };
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
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [current] = await connection.execute(
        'SELECT status, created_by FROM cash_transactions WHERE id = ? FOR UPDATE',
        [id]
      );
      if (current.length === 0) {
        throw new Error('Cash transaction does not exist');
      }
      ensureAuditableCashTransaction(current[0]);
      if (Number(current[0].created_by) === Number(userId)) {
        throw new Error('制单人不能复核自己的现金交易');
      }

      const [result] = await connection.execute(
        `UPDATE cash_transactions
         SET status = 'rejected',
             approved_by = ?,
             approved_at = NOW(),
             reject_reason = ?,
             updated_by = ?,
             updated_at = NOW()
         WHERE id = ? AND status IN ('pending', 'reviewed')`,
        [userId || null, reason || null, userId || null, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('Cash transaction status changed during rejection');
      }

      await connection.commit();
      logger.info(`现金交易 ${id} 审核拒绝: ${reason || '无'}`);
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('审核拒绝失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = CashTransactionModel;
