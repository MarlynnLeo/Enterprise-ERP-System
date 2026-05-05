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

      const [result] = await connection.execute(
        `INSERT INTO bank_transactions 
        (transaction_number, bank_account_id, transaction_date, transaction_type, 
         amount, reference_number, description, is_reconciled, 
         reconciliation_date, related_party, category, payment_method, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transactionData.transaction_number,
          bankAccountId,
          transactionData.transaction_date,
          transactionData.transaction_type,
          transactionData.amount,
          transactionData.reference_number || null,
          transactionData.description || null,
          transactionData.is_reconciled || false,
          transactionData.reconciliation_date || null,
          transactionData.related_party || null,
          transactionData.category || null,
          transactionData.payment_method || null,
          createdBy,
        ]
      );

      const transactionId = result.insertId;

      // 检查银行账户是否存在
      const [bankAccounts] = await connection.execute(
        'SELECT id, bank_name, account_name FROM bank_accounts WHERE id = ?',
        [bankAccountId]
      );
      if (bankAccounts.length === 0) {
        throw new Error(`银行账户ID ${bankAccountId} 不存在`);
      }
      const bankAccount = bankAccounts[0];

      // 原子更新银行账户余额
      let updateBalanceSql = '';

      switch (transactionData.transaction_type) {
        case '存款':
        case '转入':
        case '利息':
          updateBalanceSql =
            'UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?';
          break;
        case '取款':
        case '转出':
        case '费用':
          updateBalanceSql =
            'UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?';
          break;
        default:
          logger.error(`未知的银行交易类型: ${transactionData.transaction_type}`);
          throw new Error(`不支持的交易类型: ${transactionData.transaction_type}`);
      }

      await connection.execute(updateBalanceSql, [
        transactionData.amount,
        bankAccountId,
      ]);

      // 获取更新后的最新余额返回
      const [updatedAccount] = await connection.execute(
        'SELECT current_balance FROM bank_accounts WHERE id = ?',
        [bankAccountId]
      );
      const newBalance = parseFloat(updatedAccount[0].current_balance);

      // 如果提供了会计分录信息，创建相应的会计分录
      if (transactionData.gl_entry && typeof transactionData.gl_entry === 'object') {
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
                debit_amount: transactionData.amount,
                credit_amount: 0,
                description: `银行${transactionData.transaction_type} - ${bankAccount.bank_name} ${bankAccount.account_name}`,
              },
              // 贷：来源账户（如现金、其他银行等）
              {
                account_id: transactionData.gl_entry.contra_account_id,
                debit_amount: 0,
                credit_amount: transactionData.amount,
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
                debit_amount: transactionData.amount,
                credit_amount: 0,
                description: `银行${transactionData.transaction_type}目标 - ${transactionData.related_party || ''}`,
              },
              // 贷：银行账户
              {
                account_id: transactionData.gl_entry.bank_account_id,
                debit_amount: 0,
                credit_amount: transactionData.amount,
                description: `银行${transactionData.transaction_type} - ${bankAccount.bank_name} ${bankAccount.account_name}`,
              },
            ];
            break;

          case '利息':
            // 借：银行账户
            entryItems = [
              {
                account_id: transactionData.gl_entry.bank_account_id,
                debit_amount: transactionData.amount,
                credit_amount: 0,
                description: `银行利息 - ${bankAccount.bank_name} ${bankAccount.account_name}`,
              },
              // 贷：利息收入
              {
                account_id: transactionData.gl_entry.interest_account_id,
                debit_amount: 0,
                credit_amount: transactionData.amount,
                description: '银行利息收入',
              },
            ];
            break;

          case '费用':
            // 借：银行费用
            entryItems = [
              {
                account_id: transactionData.gl_entry.expense_account_id,
                debit_amount: transactionData.amount,
                credit_amount: 0,
                description: `银行费用 - ${bankAccount.bank_name} ${bankAccount.account_name}`,
              },
              // 贷：银行账户
              {
                account_id: transactionData.gl_entry.bank_account_id,
                debit_amount: 0,
                credit_amount: transactionData.amount,
                description: '银行费用支出',
              },
            ];
            break;

          default:
            // 自定义或其他类型交易
            if (parseFloat(transactionData.amount) >= 0) {
              entryItems = [
                {
                  account_id: transactionData.gl_entry.bank_account_id,
                  debit_amount: Math.abs(transactionData.amount),
                  credit_amount: 0,
                  description: `银行交易 - ${bankAccount.bank_name} ${bankAccount.account_name}`,
                },
                {
                  account_id: transactionData.gl_entry.contra_account_id,
                  debit_amount: 0,
                  credit_amount: Math.abs(transactionData.amount),
                  description: `银行交易对方 - ${transactionData.related_party || ''}`,
                },
              ];
            } else {
              entryItems = [
                {
                  account_id: transactionData.gl_entry.contra_account_id,
                  debit_amount: Math.abs(transactionData.amount),
                  credit_amount: 0,
                  description: `银行交易对方 - ${transactionData.related_party || ''}`,
                },
                {
                  account_id: transactionData.gl_entry.bank_account_id,
                  debit_amount: 0,
                  credit_amount: Math.abs(transactionData.amount),
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

      if (filters.bank_account_id) {
        whereClause += ' AND t.bank_account_id = ?';
        params.push(parseInt(filters.bank_account_id, 10));
      }

      if (filters.transaction_type) {
        whereClause += ' AND t.transaction_type = ?';
        params.push(filters.transaction_type);
      }

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

      if (filters.is_reconciled !== undefined) {
        whereClause += ' AND t.is_reconciled = ?';
        params.push(filters.is_reconciled ? 1 : 0);
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
        'SELECT bank_account_id, transaction_type, amount FROM bank_transactions WHERE id = ?',
        [transactionId]
      );

      if (oldTransactions.length === 0) {
        throw new Error('交易记录不存在');
      }

      const oldTx = oldTransactions[0];
      const bankAccountId = targetBankAccountId || oldTx.bank_account_id;

      const [bankAccounts] = await connection.execute(
        'SELECT id FROM bank_accounts WHERE id = ?',
        [bankAccountId]
      );
      if (bankAccounts.length === 0) {
        throw new Error(`bank_account_id ${bankAccountId} does not exist`);
      }

      // 2. 回滚旧金额对余额的影响
      let rollbackSql = '';
      switch (oldTx.transaction_type) {
        case '存款':
        case '转入':
        case '利息':
          // 之前增加了余额，现在减回去
          rollbackSql =
            'UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?';
          break;
        case '取款':
        case '转出':
        case '费用':
          // 之前减少了余额，现在加回去
          rollbackSql =
            'UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?';
          break;
      }

      if (rollbackSql) {
        await connection.execute(rollbackSql, [oldTx.amount, oldTx.bank_account_id]);
      }

      // 3. 更新交易记录
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
                updated_by = ?
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

      // 4. 应用新金额对余额的影响
      let applySql = '';
      switch (transactionData.transaction_type) {
        case '存款':
        case '转入':
        case '利息':
          applySql = 'UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?';
          break;
        case '取款':
        case '转出':
        case '费用':
          applySql = 'UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?';
          break;
      }

      if (applySql) {
        await connection.execute(applySql, [transactionData.amount, bankAccountId]);
      }

      const [updatedAccount] = await connection.execute(
        'SELECT current_balance FROM bank_accounts WHERE id = ?',
        [bankAccountId]
      );
      const newBalance = parseFloat(updatedAccount[0]?.current_balance || 0);

      await connection.commit();
      logger.info(`银行交易更新成功，余额已重新计算: ID=${transactionId}`);
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
        'SELECT bank_account_id, transaction_type, amount FROM bank_transactions WHERE id = ?',
        [id]
      );

      if (transactions.length === 0) {
        throw new Error('交易记录不存在');
      }

      const tx = transactions[0];

      // 2. 回滚余额
      let rollbackSql = '';
      switch (tx.transaction_type) {
        case '存款':
        case '转入':
        case '利息':
          // 之前增加了余额，现在减回去
          rollbackSql =
            'UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?';
          break;
        case '取款':
        case '转出':
        case '费用':
          // 之前减少了余额，现在加回去
          rollbackSql =
            'UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?';
          break;
      }

      if (rollbackSql) {
        await connection.execute(rollbackSql, [tx.amount, tx.bank_account_id]);
      }

      // 3. 删除交易记录
      const [result] = await connection.execute('DELETE FROM bank_transactions WHERE id = ?', [id]);

      await connection.commit();
      logger.info(`银行交易删除成功，余额已回滚: ID=${id}`);
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
      const [current] = await db.pool.execute('SELECT status FROM bank_transactions WHERE id = ?', [
        id,
      ]);

      if (current.length === 0) {
        throw new Error('银行交易不存在');
      }

      const currentStatus = current[0].status || 'draft';
      if (['pending', 'approved'].includes(currentStatus)) {
        throw new Error(`交易当前状态为 ${currentStatus}，无法重复提交审核`);
      }

      // 更新状态为待审核
      const [result] = await db.pool.execute(
        `UPDATE bank_transactions
                 SET status = 'pending'
                 WHERE id = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
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
    try {
      const [result] = await db.pool.execute(
        `UPDATE bank_transactions
                 SET status = 'approved', approved_by = ?, approved_at = NOW()
                 WHERE id = ?`,
        [userId, id]
      );

      if (result.affectedRows === 0) {
        throw new Error('银行交易不存在');
      }

      logger.info(`银行交易 ${id} 审核通过`);
      return true;
    } catch (error) {
      logger.error('审核通过失败:', error);
      throw error;
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
                 WHERE id = ?`,
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
