const logger = require('../../utils/logger');
const db = require('../../config/db');

function createReconciliationError(message, code = 'VALIDATION_ERROR', statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function requirePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(value).trim() !== String(parsed)) {
    throw createReconciliationError(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function toMoneyCents(value) {
  return Math.round((parseFloat(value) || 0) * 100);
}

function getBankTransactionDirection(type) {
  const incomeTypes = new Set(['\u5b58\u6b3e', '\u8f6c\u5165', '\u5229\u606f', 'income']);
  const expenseTypes = new Set(['\u53d6\u6b3e', '\u8f6c\u51fa', '\u8d39\u7528', 'expense']);

  if (incomeTypes.has(type)) return 'income';
  if (expenseTypes.has(type)) return 'expense';
  return null;
}

function isReconciledFlag(value) {
  return value === true || value === 1 || value === '1';
}

class ReconciliationModel {
  static async reconcileBankTransaction(id, reconciliationData = {}) {
    if (reconciliationData.reconciled === false || reconciliationData.is_reconciled === false) {
      return await this.cancelReconciliation(id);
    }

    try {
      const [result] = await db.pool.execute(
        `UPDATE bank_transactions
         SET is_reconciled = 1, reconciliation_date = ?
         WHERE id = ?
           AND status = 'approved'
           AND (is_reconciled = 0 OR is_reconciled IS NULL)`,
        [reconciliationData.reconciliation_date || new Date().toISOString().slice(0, 10), id]
      );
      if (result.affectedRows === 0) {
        const [current] = await db.pool.execute(
          'SELECT id, status, is_reconciled FROM bank_transactions WHERE id = ?',
          [id]
        );

        if (current.length === 0) {
          throw createReconciliationError('银行流水不存在', 'NOT_FOUND', 404);
        }

        if (current[0].status !== 'approved') {
          throw createReconciliationError('只有已审核的银行流水才能对账');
        }

        if (isReconciledFlag(current[0].is_reconciled)) {
          throw createReconciliationError('银行流水已完成对账，不能重复对账');
        }
      }
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('Reconcile bank transaction failed:', error);
      throw error;
    }
  }

  static async reconcileTransaction(id, reconciliationData) {
    return await this.reconcileBankTransaction(id, reconciliationData);
  }

  static async cancelReconciliation(id) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      await this.clearMatchesByBankTransaction(id, connection);

      const [result] = await connection.execute(
        'UPDATE bank_transactions SET is_reconciled = 0, reconciliation_date = NULL WHERE id = ?',
        [id]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('Cancel bank reconciliation failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async clearMatchesByBankTransaction(bankTransactionId, connection = null) {
    const executor = connection || db.pool;
    const [matches] = await executor.execute(
      'SELECT DISTINCT statement_item_id FROM bank_reconciliation_matches WHERE bank_transaction_id = ?',
      [bankTransactionId]
    );

    if (matches.length === 0) {
      return;
    }

    await executor.execute(
      'DELETE FROM bank_reconciliation_matches WHERE bank_transaction_id = ?',
      [bankTransactionId]
    );

    for (const match of matches) {
      const [remaining] = await executor.execute(
        'SELECT COUNT(*) AS count FROM bank_reconciliation_matches WHERE statement_item_id = ?',
        [match.statement_item_id]
      );
      if ((remaining[0]?.count || 0) === 0) {
        await executor.execute(
          "UPDATE bank_statement_items SET status = 'unmatched' WHERE id = ?",
          [match.statement_item_id]
        );
      }
    }
  }

  static formatTransaction(row) {
    return {
      id: row.id,
      transactionDate: row.transaction_date,
      type: row.transaction_type,
      amount: parseFloat(row.amount) || 0,
      counterparty: row.related_party || '',
      description: row.description || '',
      referenceNumber: row.reference_number || '',
      reconciliationDate: row.reconciliation_date || null,
    };
  }

  static formatStatementItem(row) {
    return {
      id: row.id,
      transactionDate: row.transaction_date,
      type: row.transaction_type,
      amount: parseFloat(row.amount) || 0,
      summary: row.summary || '',
      referenceNumber: row.reference_number || '',
      counterparty: row.counterparty || '',
      balance: row.balance === null || row.balance === undefined ? null : parseFloat(row.balance),
      status: row.status || 'unmatched',
    };
  }

  static async createStatementImport(importData, items) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const accountId = requirePositiveInteger(importData.bank_account_id, 'bank_account_id');
      const importedBy = importData.imported_by
        ? requirePositiveInteger(importData.imported_by, 'imported_by')
        : null;

      const [importResult] = await connection.execute(
        `INSERT INTO bank_statement_imports
          (bank_account_id, statement_start_date, statement_end_date, file_name, imported_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
          accountId,
          importData.statement_start_date || null,
          importData.statement_end_date || null,
          importData.file_name || null,
          importedBy,
        ]
      );

      const importId = importResult.insertId;
      const savedItems = [];

      for (const item of items) {
        const [itemResult] = await connection.execute(
          `INSERT INTO bank_statement_items
            (import_id, bank_account_id, transaction_date, transaction_type, amount,
             summary, reference_number, counterparty, balance, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unmatched')`,
          [
            importId,
            accountId,
            item.transaction_date,
            item.transaction_type,
            item.amount,
            item.summary || null,
            item.reference_number || null,
            item.counterparty || null,
            item.balance === undefined || item.balance === null ? null : item.balance,
          ]
        );

        savedItems.push({
          id: itemResult.insertId,
          transaction_date: item.transaction_date,
          transaction_type: item.transaction_type,
          amount: item.amount,
          summary: item.summary,
          reference_number: item.reference_number,
          counterparty: item.counterparty,
          balance: item.balance === undefined ? null : item.balance,
          status: 'unmatched',
        });
      }

      await connection.commit();
      return {
        importId,
        items: savedItems.map((row) => this.formatStatementItem(row)),
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Create bank statement import failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getMatchedTransactions(statementItemId) {
    const itemId = requirePositiveInteger(statementItemId, 'statementItemId');
    const [rows] = await db.pool.execute(
      `SELECT bt.*
       FROM bank_reconciliation_matches m
       JOIN bank_transactions bt ON bt.id = m.bank_transaction_id
       WHERE m.statement_item_id = ?
       ORDER BY bt.transaction_date DESC, bt.id DESC`,
      [itemId]
    );
    return rows.map((row) => this.formatTransaction(row));
  }

  static async getPossibleMatchingTransactions(statementItemId, accountId) {
    const itemId = requirePositiveInteger(statementItemId, 'statementItemId');
    const bankAccountId = requirePositiveInteger(accountId, 'accountId');

    const [items] = await db.pool.execute(
      'SELECT * FROM bank_statement_items WHERE id = ? AND bank_account_id = ?',
      [itemId, bankAccountId]
    );

    if (items.length === 0) {
      throw createReconciliationError(
        '银行对账单明细不存在或不属于该账户',
        'NOT_FOUND',
        404
      );
    }

    const item = items[0];
    const [rows] = await db.pool.execute(
      `SELECT bt.*
       FROM bank_transactions bt
       LEFT JOIN bank_reconciliation_matches m ON m.bank_transaction_id = bt.id
       WHERE bt.bank_account_id = ?
         AND bt.status = 'approved'
         AND (bt.is_reconciled = 0 OR bt.is_reconciled IS NULL)
         AND m.id IS NULL
         AND ABS(bt.amount - ?) < 0.01
         AND (
           (? = 'income' AND bt.transaction_type IN ('\u5b58\u6b3e', '\u8f6c\u5165', '\u5229\u606f', 'income'))
           OR (? = 'expense' AND bt.transaction_type IN ('\u53d6\u6b3e', '\u8f6c\u51fa', '\u8d39\u7528', 'expense'))
         )
         AND bt.transaction_date BETWEEN DATE_SUB(?, INTERVAL 7 DAY) AND DATE_ADD(?, INTERVAL 7 DAY)
       ORDER BY
         CASE WHEN bt.transaction_date = ? THEN 0 ELSE 1 END,
         bt.transaction_date DESC,
         bt.id DESC
       LIMIT 50`,
      [
        bankAccountId,
        item.amount,
        item.transaction_type,
        item.transaction_type,
        item.transaction_date,
        item.transaction_date,
        item.transaction_date,
      ]
    );

    return rows.map((row) => this.formatTransaction(row));
  }

  static async confirmTransactionMatch(statementItemId, bankTransactionIds, accountId, matchedBy) {
    const itemId = requirePositiveInteger(statementItemId, 'statementItemId');
    const bankAccountId = requirePositiveInteger(accountId, 'accountId');
    const userId = matchedBy ? requirePositiveInteger(matchedBy, 'matchedBy') : null;

    if (!Array.isArray(bankTransactionIds) || bankTransactionIds.length === 0) {
      throw createReconciliationError('bankTransactionIds is required');
    }

    const transactionIds = bankTransactionIds.map((id) =>
      requirePositiveInteger(id, 'bankTransactionId')
    );
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [items] = await connection.execute(
        'SELECT * FROM bank_statement_items WHERE id = ? AND bank_account_id = ? FOR UPDATE',
        [itemId, bankAccountId]
      );

      if (items.length === 0) {
        throw createReconciliationError(
          '银行对账单明细不存在或不属于该账户',
          'NOT_FOUND',
          404
        );
      }

      const statementItem = items[0];

      const [oldMatches] = await connection.execute(
        'SELECT bank_transaction_id FROM bank_reconciliation_matches WHERE statement_item_id = ? FOR UPDATE',
        [itemId]
      );

      if (oldMatches.length > 0) {
        const oldIds = oldMatches.map((match) => match.bank_transaction_id);
        const oldPlaceholders = oldIds.map(() => '?').join(',');
        await connection.execute(
          `UPDATE bank_transactions
           SET is_reconciled = 0, reconciliation_date = NULL
           WHERE id IN (${oldPlaceholders})`,
          oldIds
        );
        await connection.execute(
          'DELETE FROM bank_reconciliation_matches WHERE statement_item_id = ?',
          [itemId]
        );
      }

      const placeholders = transactionIds.map(() => '?').join(',');
      const [transactions] = await connection.execute(
        `SELECT bt.*, m.id AS existing_match_id
         FROM bank_transactions bt
         LEFT JOIN bank_reconciliation_matches m ON m.bank_transaction_id = bt.id
         WHERE bt.id IN (${placeholders}) AND bt.bank_account_id = ?
         FOR UPDATE`,
        [...transactionIds, bankAccountId]
      );

      if (transactions.length !== transactionIds.length) {
        throw createReconciliationError('部分银行流水不存在', 'NOT_FOUND', 404);
      }

      const occupied = transactions.find((transaction) => transaction.existing_match_id);
      if (occupied) {
        throw createReconciliationError(`银行流水 ${occupied.id} 已经完成匹配`);
      }

      const unapproved = transactions.find((transaction) => transaction.status !== 'approved');
      if (unapproved) {
        throw createReconciliationError(`银行流水 ${unapproved.id} 未审核通过，不能进行对账匹配`);
      }

      const reconciled = transactions.find((transaction) => isReconciledFlag(transaction.is_reconciled));
      if (reconciled) {
        throw createReconciliationError(`银行流水 ${reconciled.id} 已经对账，不能重复匹配`);
      }

      const directionMismatch = transactions.find(
        (transaction) =>
          getBankTransactionDirection(transaction.transaction_type) !== statementItem.transaction_type
      );
      if (directionMismatch) {
        throw createReconciliationError(
          `银行流水 ${directionMismatch.id} 的收支方向与对账单明细不一致`
        );
      }

      const transactionTotalCents = transactions.reduce(
        (sum, transaction) => sum + toMoneyCents(transaction.amount),
        0
      );
      const statementAmountCents = toMoneyCents(statementItem.amount);

      if (transactionTotalCents !== statementAmountCents) {
        throw createReconciliationError('匹配流水金额合计必须等于对账单明细金额');
      }

      for (const transactionId of transactionIds) {
        await connection.execute(
          `INSERT INTO bank_reconciliation_matches
            (statement_item_id, bank_transaction_id, matched_by)
           VALUES (?, ?, ?)`,
          [itemId, transactionId, userId]
        );
      }

      await connection.execute(
        `UPDATE bank_transactions
         SET is_reconciled = 1, reconciliation_date = ?
         WHERE id IN (${placeholders})`,
        [statementItem.transaction_date, ...transactionIds]
      );

      await connection.execute(
        "UPDATE bank_statement_items SET status = 'matched' WHERE id = ?",
        [itemId]
      );

      await connection.commit();

      return {
        statementItemId: itemId,
        bankTransactionIds: transactionIds,
        reconciliationDate: statementItem.transaction_date,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('Confirm bank reconciliation match failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getReconciliations(filters = {}) {
    try {
      let query = 'SELECT * FROM reconciliations WHERE 1=1';
      const params = [];

      if (filters.accountId) {
        query += ' AND account_id = ?';
        params.push(filters.accountId);
      }

      if (filters.status) {
        query += ' AND status = ?';
        params.push(filters.status);
      }

      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const offset = (page - 1) * limit;

      const countQuery = `SELECT COUNT(*) as total FROM reconciliations WHERE 1=1 ${
        filters.accountId ? 'AND account_id = ?' : ''
      } ${filters.status ? 'AND status = ?' : ''}`;
      const [countResult] = await db.pool.execute(countQuery, params.slice());
      const total = countResult[0].total;

      query += ` ORDER BY reconciliation_date DESC LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`;
      const [rows] = await db.pool.query(query, params);

      return {
        data: rows,
        total,
      };
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return { data: [], total: 0 };
      }
      logger.error('Get reconciliation list failed:', error);
      throw error;
    }
  }

  static async getReconciliationById(id) {
    try {
      const [rows] = await db.pool.execute('SELECT * FROM reconciliations WHERE id = ?', [id]);
      return rows.length > 0 ? rows[0] : null;
    } catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') return null;
      logger.error('Get reconciliation failed:', error);
      throw error;
    }
  }

  static async createReconciliation(data) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const createdBy = requirePositiveInteger(data.created_by, 'created_by');

      const [result] = await connection.execute(
        `INSERT INTO reconciliations
          (account_id, reconciliation_date, bank_statement_balance, book_balance, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.account_id,
          data.reconciliation_date,
          data.bank_statement_balance,
          data.book_balance,
          data.status || 'draft',
          data.notes,
          createdBy,
        ]
      );

      await connection.commit();
      return result.insertId;
    } catch (error) {
      await connection.rollback();
      logger.error('Create reconciliation failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateReconciliation(id, data) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.execute(
        `UPDATE reconciliations SET
          account_id = ?,
          reconciliation_date = ?,
          bank_statement_balance = ?,
          book_balance = ?,
          status = ?,
          notes = ?
         WHERE id = ?`,
        [
          data.account_id,
          data.reconciliation_date,
          data.bank_statement_balance,
          data.book_balance,
          data.status,
          data.notes,
          id,
        ]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('Update reconciliation failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = ReconciliationModel;
