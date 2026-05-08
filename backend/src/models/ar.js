/**
 * ar.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const db = require('../config/db');
const financeModel = require('./finance');
const { accountingConfig } = require('../config/accountingConfig');
const { financeConfig } = require('../config/financeConfig');
const {
  DOCUMENT_TYPE_MAPPING,
  INVOICE_STATUS,
  MANUAL_INVOICE_STATUS_TRANSITIONS,
  BANK_BACKED_PAYMENT_METHODS,
} = require('../constants/financeConstants');
const { getUserIdByIdentifier } = require('../utils/userUtils');
const DocumentLinkService = require('../services/business/DocumentLinkService');

const toCents = value => Math.round((parseFloat(value) || 0) * 100);
const fromCents = value => value / 100;

const SETTLEMENT_STATUSES = new Set([
  INVOICE_STATUS.CONFIRMED,
  INVOICE_STATUS.PARTIAL_PAID,
  INVOICE_STATUS.OVERDUE,
]);

const getOpenPeriodIdByDate = async (connection, entryDate) => {
  const date = entryDate || new Date().toISOString().slice(0, 10);
  const [periods] = await connection.execute(
    `SELECT id, period_name
     FROM gl_periods
     WHERE start_date <= ? AND end_date >= ? AND is_closed = 0
     ORDER BY start_date DESC
     LIMIT 1`,
    [date, date]
  );

  if (periods.length === 0) {
    throw new Error(`日期 ${date} 没有可用的开放会计期间，请先维护会计期间`);
  }

  return periods[0].id;
};

const getAccountIdByCode = async (connection, accountCode, accountLabel) => {
  if (!accountCode) {
    throw new Error(`${accountLabel}科目编码未配置`);
  }

  const [accounts] = await connection.execute(
    'SELECT id FROM gl_accounts WHERE account_code = ? AND (is_active = 1 OR is_active IS NULL) LIMIT 1',
    [accountCode]
  );

  if (accounts.length === 0) {
    throw new Error(`${accountLabel}科目 ${accountCode} 不存在或未启用`);
  }

  return accounts[0].id;
};

const assertManualStatusTransition = (currentStatus, nextStatus) => {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedTargets = MANUAL_INVOICE_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowedTargets.includes(nextStatus)) {
    throw new Error(
      `不允许从"${currentStatus}"手工变更为"${nextStatus}"；收款状态只能由收款/作废流程自动维护`
    );
  }
};

const ensureNoActiveInvoiceEntry = async (connection, documentNumber) => {
  const [entries] = await connection.execute(
    `SELECT id
     FROM gl_entries
     WHERE document_type = ?
       AND document_number = ?
       AND (is_reversed IS NULL OR is_reversed = 0)
     LIMIT 1`,
    [DOCUMENT_TYPE_MAPPING.SALES_INVOICE, documentNumber]
  );

  return entries.length === 0;
};

const getEntryNumberById = async (connection, entryId) => {
  if (!entryId) return null;
  const [entries] = await connection.execute(
    'SELECT entry_number FROM gl_entries WHERE id = ?',
    [entryId]
  );
  return entries[0]?.entry_number || null;
};

const linkDocumentToVoucher = async (
  connection,
  sourceType,
  sourceId,
  sourceCode,
  entryId,
  createdBy
) => {
  if (!sourceId || !entryId) return null;
  const entryNumber = await getEntryNumberById(connection, entryId);
  await DocumentLinkService.tryAutoLink(
    sourceType,
    sourceId,
    sourceCode,
    'finance_voucher',
    entryId,
    entryNumber,
    createdBy || null,
    connection
  );
  return entryNumber;
};

const linkBankTransactionToVoucher = async (
  connection,
  bankTransactionId,
  bankTransactionNumber,
  entryId,
  createdBy
) => {
  if (!bankTransactionId || !entryId) return null;
  return await linkDocumentToVoucher(
    connection,
    'bank_transaction',
    bankTransactionId,
    bankTransactionNumber,
    entryId,
    createdBy
  );
};

const createInvoiceConfirmationEntry = async (connection, invoice, createdBy = 'system') => {
  const shouldCreateEntry = await ensureNoActiveInvoiceEntry(connection, invoice.invoice_number);
  if (!shouldCreateEntry) {
    return null;
  }

  await accountingConfig.loadFromDatabase(db);
  await financeConfig.loadFromDatabase(db);
  const receivableAccountId = await getAccountIdByCode(
    connection,
    accountingConfig.getAccountCode('ACCOUNTS_RECEIVABLE') || '1122',
    '应收账款'
  );
  const incomeAccountId = await getAccountIdByCode(
    connection,
    accountingConfig.getAccountCode('SALES_REVENUE') || '6001',
    '销售收入'
  );
  const periodId = await getOpenPeriodIdByDate(connection, invoice.invoice_date);

  const entryId = await financeModel.createEntry(
    {
      entry_date: invoice.invoice_date,
      posting_date: invoice.invoice_date,
      document_type: DOCUMENT_TYPE_MAPPING.SALES_INVOICE,
      document_number: invoice.invoice_number,
      period_id: periodId,
      description: `客户 ${invoice.customer_name || '未知客户'} 应收账款`,
      created_by: createdBy,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: receivableAccountId,
        debit_amount: invoice.total_amount,
        credit_amount: 0,
        currency_code: invoice.currency_code || 'CNY',
        exchange_rate: invoice.exchange_rate || 1,
        description: `应收账款 - 发票号: ${invoice.invoice_number}`,
      },
      {
        account_id: incomeAccountId,
        debit_amount: 0,
        credit_amount: invoice.total_amount,
        currency_code: invoice.currency_code || 'CNY',
        exchange_rate: invoice.exchange_rate || 1,
        description: `销售收入 - 发票号: ${invoice.invoice_number}`,
      },
    ],
    connection
  );

  const entryNumber = await linkDocumentToVoucher(
    connection,
    'ar_invoice',
    invoice.id,
    invoice.invoice_number,
    entryId,
    createdBy
  );

  return { entryId, entryNumber };
};

const buildReceiptGlEntry = async (connection, receiptData) => {
  if (receiptData.gl_entry) {
    return receiptData.gl_entry;
  }

  await accountingConfig.loadFromDatabase(db);
  const receivableAccountId = await getAccountIdByCode(
    connection,
    accountingConfig.getAccountCode('ACCOUNTS_RECEIVABLE') || '1122',
    '应收账款'
  );
  const cashOrBankCode =
    receiptData.payment_method === '现金'
      ? accountingConfig.getAccountCode('CASH') || '1001'
      : accountingConfig.getAccountCode('BANK_DEPOSIT') || '1002';
  const bankAccountId = await getAccountIdByCode(connection, cashOrBankCode, '银行/现金');
  const periodId = await getOpenPeriodIdByDate(connection, receiptData.receipt_date);

  return {
    period_id: periodId,
    created_by: financeConfig.get('system.defaultCreator', 'system'),
    receivable_account_id: receivableAccountId,
    bank_account_id: bankAccountId,
  };
};

/**
 * 应收账款模块数据库操作
 */
const arModel = {
  /**
   * 创建应收账款发票
   */
  createInvoice: async (invoiceData, externalConnection = null) => {
    const isExternalTransaction = !!externalConnection;
    let connection = externalConnection;
    try {
      if (!isExternalTransaction) {
        connection = await db.getConnection();
        await connection.beginTransaction();
      }

      // 计算余额
      const balanceAmount = invoiceData.total_amount;

      // 插入应收账款发票
      const [result] = await connection.query(
        `INSERT INTO ar_invoices 
        (invoice_number, customer_id, invoice_date, due_date, 
         total_amount, paid_amount, balance_amount, 
         currency_code, exchange_rate, status, terms, notes, source_type, source_id) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceData.invoice_number,
          invoiceData.customer_id,
          invoiceData.invoice_date,
          invoiceData.due_date,
          invoiceData.total_amount,
          0, // 初始已付金额为0
          balanceAmount,
          invoiceData.currency_code || 'CNY',
          invoiceData.exchange_rate || 1,
          invoiceData.status || '草稿',
          invoiceData.terms || null,
          invoiceData.notes || null,
          invoiceData.source_type || null,
          invoiceData.source_id || null,
        ]
      );

      const invoiceId = result.insertId;

      // 批量插入发票明细项（1次SQL替代N次）
      if (invoiceData.items && Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
        const itemValues = invoiceData.items.map(item => [
          invoiceId,
          item.product_id || null,
          item.description || item.product_name || '',
          item.quantity || 0,
          item.unit_price || 0,
          item.amount || item.quantity * item.unit_price || 0,
        ]);
        await connection.query(
          `INSERT INTO ar_invoice_items 
           (invoice_id, product_id, description, quantity, unit_price, amount) 
           VALUES ?`,
          [itemValues]
        );
        logger.info(
          `[arModel] 已插入 ${invoiceData.items.length} 条发票明细 - 发票ID: ${invoiceId}`
        );
      }

      // 如果发票状态为"已确认"，则创建会计分录
      if (invoiceData.status === '已确认' && invoiceData.gl_entry) {
        // 转换 created_by 为用户ID
        const createdById = await getUserIdByIdentifier(
          connection,
          invoiceData.gl_entry.created_by ?? 'system'
        );

        // 由于 invoiceData 可能没有携带 customer_name，我们需要查询出来
        let actualCustomerName = invoiceData.customer_name;
        if (!actualCustomerName && invoiceData.customer_id) {
          const [customers] = await connection.query(
            'SELECT name FROM customers WHERE id = ? AND deleted_at IS NULL',
            [invoiceData.customer_id]
          );
          if (customers.length > 0) {
            actualCustomerName = customers[0].name;
          }
        }

        const entryData = {
          entry_number: invoiceData.gl_entry.entry_number ?? null,
          entry_date: invoiceData.invoice_date ?? null,
          posting_date: invoiceData.invoice_date ?? null,
          document_type: '发票',
          document_number: invoiceData.invoice_number ?? null,
          period_id: invoiceData.gl_entry.period_id ?? null,
          description: `客户 ${actualCustomerName || '未知客户'} 应收账款`,
          created_by: createdById,
          status: 'posted',
          is_posted: 1,
        };

        // 应收账款分录明细
        const entryItems = [
          // 借：应收账款
          {
            account_id: invoiceData.gl_entry.receivable_account_id ?? null,
            debit_amount: invoiceData.total_amount ?? 0,
            credit_amount: 0,
            currency_code: invoiceData.currency_code ?? 'CNY',
            exchange_rate: invoiceData.exchange_rate ?? 1,
            description: `应收账款 - 发票号: ${invoiceData.invoice_number}`,
          },
          // 贷：销售收入
          {
            account_id: invoiceData.gl_entry.income_account_id ?? null,
            debit_amount: 0,
            credit_amount: invoiceData.total_amount ?? 0,
            currency_code: invoiceData.currency_code ?? 'CNY',
            exchange_rate: invoiceData.exchange_rate ?? 1,
            description: `销售收入 - 发票号: ${invoiceData.invoice_number}`,
          },
        ];

        // 创建会计分录并写入单据链
        const entryId = await financeModel.createEntry(entryData, entryItems, connection);
        await linkDocumentToVoucher(
          connection,
          'ar_invoice',
          invoiceId,
          invoiceData.invoice_number,
          entryId,
          createdById
        );
      }

      if (!isExternalTransaction) {
        await connection.commit();
      }

      if (!isExternalTransaction && connection) {
        connection.release();
        connection = null;
      }

      return invoiceId;
    } catch (error) {
      logger.error('创建应收账款发票失败:', {
        error: error.message,
        invoiceNumber: invoiceData.invoice_number,
        customerId: invoiceData.customer_id,
        totalAmount: invoiceData.total_amount,
        stack: error.stack,
      });
      if (!isExternalTransaction && connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.error('事务回滚失败:', rollbackError);
        }
      }
      throw error; // 仍然抛出错误，因为这是创建操作，需要让调用者知道失败
    } finally {
      if (!isExternalTransaction && connection) {
        try {
          connection.release();
        } catch {
          // 释放数据库连接失败
        }
      }
    }
  },

  /**
   * 获取应收账款发票列表
   */
  getInvoices: async (filters = {}, page = 1, pageSize = 20) => {
    let connection = null;

    // 限制一次获取的数据量
    const actualPageSize = Math.min(pageSize, 10000);

    try {
      // 构建基本查询
      let query = `
        SELECT a.id, a.invoice_number, a.customer_id, c.name as customer_name,
               DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoice_date, 
               DATE_FORMAT(a.due_date, '%Y-%m-%d') as due_date,
               a.total_amount, a.paid_amount, a.balance_amount, 
               a.status, a.currency_code
        FROM ar_invoices a
        LEFT JOIN customers c ON a.customer_id = c.id
        WHERE 1=1
      `;
      const params = [];

      // 添加过滤条件
      if (filters.invoice_number) {
        query += ' AND a.invoice_number LIKE ?';
        params.push(`%${filters.invoice_number}%`);
      }

      if (filters.customer_id) {
        query += ' AND a.customer_id = ?';
        params.push(filters.customer_id);
      }

      if (filters.customer_name) {
        query += ' AND c.name LIKE ?';
        params.push(`%${filters.customer_name}%`);
      }

      if (filters.start_date && filters.end_date) {
        query += ' AND a.invoice_date BETWEEN ? AND ?';
        params.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        query += ' AND a.invoice_date >= ?';
        params.push(filters.start_date);
      } else if (filters.end_date) {
        query += ' AND a.invoice_date <= ?';
        params.push(filters.end_date);
      }

      if (filters.status) {
        query += ' AND a.status = ?';
        params.push(filters.status);
      }

      // 使用直接拼接进行分页（LIMIT/OFFSET已经过严格验证）
      const limit = parseInt(actualPageSize);
      const offset = parseInt((page - 1) * actualPageSize);
      query += ` ORDER BY a.invoice_date DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`;

      // 安全获取连接
      try {
        connection = await db.getConnection();
      } catch (connError) {
        logger.error('获取数据库连接失败:', connError);
        // 如果获取连接失败，返回空结果
        return {
          invoices: [],
          pagination: {
            total: 0,
            page: page,
            pageSize: actualPageSize,
            totalPages: 0,
          },
        };
      }

      // 执行发票查询
      let invoices = [];
      try {
        const [invoiceResults] = await connection.execute(query, params);
        invoices = invoiceResults || [];
      } catch (queryError) {
        logger.error('执行发票查询失败:', queryError);
        if (connection) {
          try {
            connection.release();
          } catch (releaseError) {
            logger.error('释放连接失败:', releaseError);
          }
          connection = null;
        }
        return {
          invoices: [],
          pagination: {
            total: 0,
            page: page,
            pageSize: actualPageSize,
            totalPages: 0,
          },
        };
      }

      // 计算总记录数
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM ar_invoices a 
        LEFT JOIN customers c ON a.customer_id = c.id
        WHERE 1=1
        ${filters.invoice_number ? ' AND a.invoice_number LIKE ?' : ''}
        ${filters.customer_id ? ' AND a.customer_id = ?' : ''}
        ${filters.customer_name ? ' AND c.name LIKE ?' : ''}
        ${filters.start_date && filters.end_date
          ? ' AND a.invoice_date BETWEEN ? AND ?'
          : filters.start_date
            ? ' AND a.invoice_date >= ?'
            : filters.end_date
              ? ' AND a.invoice_date <= ?'
              : ''
        }
        ${filters.status ? ' AND a.status = ?' : ''}
      `;

      // 重新构建计数查询参数
      const countParams = [];
      if (filters.invoice_number) countParams.push(`%${filters.invoice_number}%`);
      if (filters.customer_id) countParams.push(filters.customer_id);
      if (filters.customer_name) countParams.push(`%${filters.customer_name}%`);
      if (filters.start_date && filters.end_date) {
        countParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        countParams.push(filters.start_date);
      } else if (filters.end_date) {
        countParams.push(filters.end_date);
      }
      if (filters.status) countParams.push(filters.status);

      // 执行总数查询
      let total = 0;
      try {
        const [countResult] = await connection.execute(countQuery, countParams);
        total = countResult[0]?.total || 0;
      } catch {
        // 如果获取总数失败，使用已获取记录的长度
        total = invoices.length;
      }

      // 在结果返回前确保释放连接
      if (connection) {
        try {
          connection.release();
          connection = null;
        } catch {
          // 释放连接失败
        }
      }

      return {
        invoices,
        pagination: {
          total,
          page,
          pageSize: actualPageSize,
          totalPages: Math.ceil(total / actualPageSize),
        },
      };
    } catch {
      // 返回空结果而不是抛出错误，确保前端不会崩溃
      return {
        invoices: [],
        pagination: {
          total: 0,
          page: page,
          pageSize: pageSize,
          totalPages: 0,
        },
      };
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch {
          // 在finally中释放数据库连接失败
        }
      }
    }
  },

  /**
   * 按ID获取应收账款发票
   */
  getInvoiceById: async (id) => {
    let connection = null;

    try {
      // 尝试获取连接
      try {
        connection = await db.getConnection();
      } catch (connError) {
        logger.error('获取数据库连接失败:', connError);
        return null;
      }

      // 执行查询
      let invoice = null;
      try {
        const [invoices] = await connection.execute(
          `SELECT a.id, a.invoice_number, a.customer_id, c.name as customer_name,
                  DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoice_date, 
                  DATE_FORMAT(a.due_date, '%Y-%m-%d') as due_date,
                  a.total_amount, a.paid_amount, a.balance_amount, 
                  a.status, a.currency_code, a.terms, a.notes,
                  a.source_type, a.source_id
           FROM ar_invoices a
           LEFT JOIN customers c ON a.customer_id = c.id
           WHERE a.id = ?`,
          [id]
        );

        if (invoices.length > 0) {
          invoice = invoices[0];

          // 查询发票明细项
          const [items] = await connection.execute(
            `SELECT i.id, i.product_id as productId, i.description, 
                    i.quantity, i.unit_price as unitPrice, i.amount,
                    p.name as productName
             FROM ar_invoice_items i
             LEFT JOIN materials p ON i.product_id = p.id
             WHERE i.invoice_id = ?
             ORDER BY i.id ASC`,
            [id]
          );
          invoice.items = items;
        }
      } catch (queryError) {
        logger.error('查询发票详情失败:', queryError);
        return null;
      } finally {
        // 确保连接被释放
        if (connection) {
          try {
            connection.release();
            connection = null;
          } catch (releaseError) {
            logger.error('释放连接失败:', releaseError);
          }
        }
      }

      return invoice;
    } catch {
      return null; // 返回null而不是抛出异常，防止应用崩溃
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch {
          // 在finally中释放数据库连接失败
        }
      }
    }
  },

  /**
   * 更新应收账款发票状态
   */
  updateInvoiceStatus: async (id, status, options = {}) => {
    let connection = null;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      const [invoices] = await connection.execute(
        `SELECT a.*, c.name as customer_name
         FROM ar_invoices a
         LEFT JOIN customers c ON a.customer_id = c.id
         WHERE a.id = ?
         FOR UPDATE`,
        [id]
      );

      if (invoices.length === 0) {
        await connection.rollback();
        connection.release();
        connection = null;
        return false;
      }

      const invoice = invoices[0];
      assertManualStatusTransition(invoice.status, status);

      if (invoice.status !== status && status === INVOICE_STATUS.CONFIRMED) {
        if (toCents(invoice.total_amount) <= 0) {
          throw new Error('发票金额必须大于0才能确认');
        }
        await createInvoiceConfirmationEntry(
          connection,
          invoice,
          options.updated_by || options.created_by || 'system'
        );
      }

      if (invoice.status !== status) {
        await connection.execute(
          'UPDATE ar_invoices SET status = ?, updated_at = NOW() WHERE id = ?',
          [status, id]
        );
      }

      await connection.commit();
      connection.release();
      connection = null;

      return true;
    } catch (error) {
      logger.error('更新应收账款发票状态失败:', error);
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.error('事务回滚失败:', rollbackError);
        }
      }
      throw error;
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          logger.error('释放数据库连接失败:', releaseError);
        }
      }
    }
  },

  /**
   * 更新应收账款发票
   * 草稿可维护完整发票；确认后只能维护备注/客户发票号，财务字段必须走调整流程。
   */
  updateInvoice: async (invoiceData) => {
    let connection = null;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      // 检查发票是否存在及状态
      const [existing] = await connection.execute(
        `SELECT id, status, invoice_number, customer_id, invoice_date, due_date,
                total_amount, paid_amount, balance_amount
         FROM ar_invoices
         WHERE id = ?
         FOR UPDATE`,
        [invoiceData.id]
      );
      if (existing.length === 0) {
        throw new Error('发票不存在');
      }

      const currentInvoice = existing[0];
      if (currentInvoice.status !== INVOICE_STATUS.DRAFT) {
        const requestedTotal = invoiceData.total_amount;
        const hasFinancialChange =
          (requestedTotal !== undefined &&
            Math.abs(parseFloat(requestedTotal || 0) - parseFloat(currentInvoice.total_amount || 0)) >
              0.01) ||
          (invoiceData.invoice_number &&
            invoiceData.invoice_number !== currentInvoice.invoice_number) ||
          (invoiceData.customer_id &&
            Number(invoiceData.customer_id) !== Number(currentInvoice.customer_id)) ||
          (invoiceData.invoice_date && String(invoiceData.invoice_date) !== String(currentInvoice.invoice_date)) ||
          (invoiceData.due_date && String(invoiceData.due_date) !== String(currentInvoice.due_date)) ||
          (Array.isArray(invoiceData.items) && invoiceData.items.length > 0);

        if (hasFinancialChange) {
          throw new Error(
            `当前状态 "${currentInvoice.status}" 已进入财务闭环，只能修改备注/客户发票号；金额或明细调整请走红字或调整流程`
          );
        }

        await connection.execute(
          `UPDATE ar_invoices
           SET customer_invoice_number = COALESCE(?, customer_invoice_number),
               notes = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [
            invoiceData.customer_invoice_number || null,
            invoiceData.notes ?? null,
            invoiceData.id,
          ]
        );

        await connection.commit();
        connection.release();
        connection = null;
        return true;
      }

      if (![INVOICE_STATUS.DRAFT].includes(currentInvoice.status)) {
        throw new Error(`当前状态 "${existing[0].status}" 不允许编辑`);
      }

      const paidAmount = parseFloat(currentInvoice.paid_amount || 0);
      const totalAmount = parseFloat(invoiceData.total_amount || 0);
      const balanceAmount = totalAmount - paidAmount;

      // 更新发票主表
      await connection.execute(
        `UPDATE ar_invoices SET
          invoice_number = ?,
          customer_invoice_number = ?,
          customer_id = ?,
          invoice_date = ?,
          due_date = ?,
          total_amount = ?,
          balance_amount = ?,
          notes = ?,
          updated_at = NOW()
        WHERE id = ?`,
        [
          invoiceData.invoice_number,
          invoiceData.customer_invoice_number || null,
          invoiceData.customer_id,
          invoiceData.invoice_date,
          invoiceData.due_date,
          totalAmount,
          balanceAmount,
          invoiceData.notes || null,
          invoiceData.id,
        ]
      );

      // 更新明细项: 先删除旧明细，再按当前提交重建
      if (invoiceData.items && Array.isArray(invoiceData.items)) {
        await connection.execute(
          'DELETE FROM ar_invoice_items WHERE invoice_id = ?',
          [invoiceData.id]
        );

        if (invoiceData.items.length > 0) {
          const itemValues = invoiceData.items.map(item => [
            invoiceData.id,
            item.product_id || null,
            item.description || '',
            item.quantity || 0,
            item.unit_price || 0,
            item.amount || Math.round((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0) * 100) / 100,
          ]);
          await connection.query(
            `INSERT INTO ar_invoice_items
             (invoice_id, product_id, description, quantity, unit_price, amount)
             VALUES ?`,
            [itemValues]
          );
        }
      }

      // ===== 自动同步开票号码到税务发票 =====
      if (invoiceData.customer_invoice_number) {
        // 查找该AR发票对应的销售订单
        const [arSource] = await connection.execute(
          'SELECT source_type, source_id FROM ar_invoices WHERE id = ?',
          [invoiceData.id]
        );
        if (arSource.length > 0 && arSource[0].source_type === 'sales_order' && arSource[0].source_id) {
          // 通过销售订单ID查找对应的销售出库单
          const [outbounds] = await connection.execute(
            'SELECT id FROM sales_outbound WHERE order_id = ?',
            [arSource[0].source_id]
          );
          for (const ob of outbounds) {
            const [syncResult] = await connection.execute(
              `UPDATE tax_invoices 
               SET invoice_number = ?, updated_at = NOW() 
               WHERE related_document_type = '销售出库单' AND related_document_id = ?`,
              [invoiceData.customer_invoice_number, ob.id]
            );
            if (syncResult.affectedRows > 0) {
              logger.info('[AR→Tax同步] 开票号码已同步到税务发票', {
                arInvoiceId: invoiceData.id,
                customerInvoiceNumber: invoiceData.customer_invoice_number,
                outboundId: ob.id
              });
            }
          }
        }
      }

      await connection.commit();
      connection.release();
      connection = null;

      return true;
    } catch (error) {
      logger.error('更新应收账款发票失败:', error);
      if (connection) {
        try { await connection.rollback(); } catch { /* 忽略 */ }
        // 静默忽略该错误
      }
      throw error;
    } finally {
      if (connection) {
        try { connection.release(); } catch { /* 忽略 */ }
        // 静默忽略该错误
      }
    }
  },

  /**
   * 创建收款记录
   */
  createReceipt: async (receiptData, receiptItems) => {
    let connection = null;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      if (
        BANK_BACKED_PAYMENT_METHODS.has(receiptData.payment_method) &&
        !receiptData.bank_account_id
      ) {
        throw new Error(`${receiptData.payment_method}必须选择收款账户`);
      }

      // 插入收款记录
      const [result] = await connection.execute(
        `INSERT INTO ar_receipts 
        (receipt_number, customer_id, receipt_date, total_amount, 
         payment_method, reference_number, bank_account_id, notes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptData.receipt_number,
          receiptData.customer_id,
          receiptData.receipt_date,
          receiptData.total_amount,
          receiptData.payment_method,
          receiptData.reference_number || null,
          receiptData.bank_account_id || null,
          receiptData.notes || null,
        ]
      );

      const receiptId = result.insertId;
      let bankTransactionId = null;
      let glEntryId = null;
      let glEntryNumber = null;
      const linkedInvoices = [];

      const sortedReceiptItems = [...receiptItems].sort(
        (a, b) => Number(a.invoice_id) - Number(b.invoice_id)
      );
      const requestedTotalCents = toCents(receiptData.total_amount);
      const itemsTotalCents = sortedReceiptItems.reduce(
        (sum, item) => sum + toCents(item.amount),
        0
      );
      if (requestedTotalCents !== itemsTotalCents) {
        throw new Error('收款单总金额必须等于收款明细金额合计');
      }

      // 插入收款明细并更新发票状态
      let totalPaidCents = 0;
      for (const item of sortedReceiptItems) {
        // 获取发票当前信息
        const [invoices] = await connection.execute(
          'SELECT * FROM ar_invoices WHERE id = ? FOR UPDATE',
          [item.invoice_id]
        );

        if (invoices.length === 0) {
          throw new Error(`发票ID ${item.invoice_id} 不存在`);
        }

        const invoice = invoices[0];
        linkedInvoices.push({ id: invoice.id, invoice_number: invoice.invoice_number });
        if (!SETTLEMENT_STATUSES.has(invoice.status)) {
          throw new Error(`发票 ${invoice.invoice_number} 当前状态为"${invoice.status}"，不能直接收款`);
        }

        // 插入收款明细
        await connection.execute(
          'INSERT INTO ar_receipt_items (receipt_id, invoice_id, amount, discount_amount) VALUES (?, ?, ?, ?)',
          [receiptId, item.invoice_id, item.amount, item.discount_amount || 0]
        );

        // ===== [H-3] 超额收款校验 =====
        const currentBalance = toCents(invoice.balance_amount);
        const receiveAmount = toCents(item.amount);
        if (receiveAmount > currentBalance + 1) {
          // 允许1分钱容差（浮点数取整误差）
          throw new Error(`收款金额 ${item.amount} 超过发票 ${invoice.invoice_number} 余额 ${invoice.balance_amount}`);
        }

        // ===== [H-2] 整数化精度控制 =====
        const paidAmountCents = toCents(invoice.paid_amount) + receiveAmount;
        const totalAmountCents = toCents(invoice.total_amount);
        const newPaidAmount = fromCents(paidAmountCents);
        const newBalanceAmount = fromCents(totalAmountCents - paidAmountCents);

        // 确定新的状态
        let newStatus;
        if (newBalanceAmount <= 0.001) {
          newStatus = '已付款';
        } else if (newPaidAmount > 0) {
          newStatus = '部分付款';
        } else {
          newStatus = invoice.status;
        }

        // 更新发票
        await connection.execute(
          'UPDATE ar_invoices SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, Math.max(0, newBalanceAmount), newStatus, item.invoice_id]
        );

        totalPaidCents += Math.round(parseFloat(item.amount) * 100);
      }

      const totalPaid = totalPaidCents / 100;

      // 如果是银行类收款，更新银行账户余额并创建银行交易记录
      if (BANK_BACKED_PAYMENT_METHODS.has(receiptData.payment_method)) {
        const [bankAccounts] = await connection.execute(
          'SELECT * FROM bank_accounts WHERE id = ? FOR UPDATE',
          [receiptData.bank_account_id]
        );

        if (bankAccounts.length === 0) {
          throw new Error(`银行账户ID ${receiptData.bank_account_id} 不存在`);
        }

        const bankAccount = bankAccounts[0];
        if (bankAccount.is_active === 0) {
          throw new Error(`银行账户 "${bankAccount.account_name}" 已被冻结，无法用于收款`);
        }

        // 创建银行交易记录
        const [bankTransactionResult] = await connection.execute(
          `INSERT INTO bank_transactions
          (transaction_number, bank_account_id, transaction_date, transaction_type,
          amount, reference_number, description, is_reconciled, related_party,
          related_invoice_id, related_invoice_type, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            receiptData.receipt_number,
            receiptData.bank_account_id,
            receiptData.receipt_date,
            '转入',
            totalPaid,
            receiptData.reference_number || null,
            `应收账款收款 - 客户: ${receiptData.customer_name || '未知客户'}` +
              (sortedReceiptItems.length > 1 ? ` (含${sortedReceiptItems.length}张发票)` : ''),
            false,
            receiptData.customer_name || '未知客户',
            sortedReceiptItems[0]?.invoice_id || null,
            'AR',
            'approved',
          ]
        );
        bankTransactionId = bankTransactionResult.insertId;

        await connection.execute(
          'UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?',
          [totalPaid, receiptData.bank_account_id]
        );

        logger.info(`[AR收款] 银行账户余额已更新: ${bankAccount.account_name}`);
      }

      const glEntry = await buildReceiptGlEntry(connection, receiptData);
      // 创建收款会计分录
      if (glEntry) {
        const entryData = {
          entry_number: glEntry.entry_number,
          entry_date: receiptData.receipt_date,
          posting_date: receiptData.receipt_date,
          document_type: DOCUMENT_TYPE_MAPPING.SALES_COLLECTION,
          document_number: receiptData.receipt_number,
          period_id: glEntry.period_id,
          description: `客户 ${receiptData.customer_name} 收款`,
          created_by: glEntry.created_by,
          status: 'posted',
          is_posted: 1,
        };

        // 收款分录明细
        const entryItems = [
          // 借：银行/现金
          {
            account_id: glEntry.bank_account_id,
            debit_amount: totalPaid,
            credit_amount: 0,
            description: `收款 - 收款单号: ${receiptData.receipt_number}`,
          },
          // 贷：应收账款
          {
            account_id: glEntry.receivable_account_id,
            debit_amount: 0,
            credit_amount: totalPaid,
            description: `应收账款减少 - 收款单号: ${receiptData.receipt_number}`,
          },
        ];

        // 创建会计分录
        glEntryId = await financeModel.createEntry(entryData, entryItems, connection);
        const [createdEntries] = await connection.execute(
          'SELECT entry_number FROM gl_entries WHERE id = ?',
          [glEntryId]
        );
        glEntryNumber = createdEntries[0]?.entry_number || glEntry.entry_number || null;
        if (bankTransactionId) {
          await connection.execute('UPDATE bank_transactions SET gl_entry_id = ? WHERE id = ?', [
            glEntryId,
            bankTransactionId,
          ]);
        }
      }

      for (const invoice of linkedInvoices) {
        await DocumentLinkService.tryAutoLink(
          'ar_invoice',
          invoice.id,
          invoice.invoice_number,
          'ar_receipt',
          receiptId,
          receiptData.receipt_number,
          receiptData.created_by || null,
          connection
        );
      }
      if (glEntryId) {
        await DocumentLinkService.tryAutoLink(
          'ar_receipt',
          receiptId,
          receiptData.receipt_number,
          'finance_voucher',
          glEntryId,
          glEntryNumber,
          glEntry.created_by,
          connection
        );
      }
      if (bankTransactionId) {
        await DocumentLinkService.tryAutoLink(
          'ar_receipt',
          receiptId,
          receiptData.receipt_number,
          'bank_transaction',
          bankTransactionId,
          receiptData.receipt_number,
          receiptData.created_by || null,
          connection
        );
      }
      if (bankTransactionId && glEntryId) {
        await linkBankTransactionToVoucher(
          connection,
          bankTransactionId,
          receiptData.receipt_number,
          glEntryId,
          receiptData.created_by || glEntry?.created_by || null
        );
      }

      await connection.commit();

      if (connection) {
        connection.release();
        connection = null;
      }

      return receiptId;
    } catch (error) {
      logger.error('创建收款记录失败:', error);
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.error('事务回滚失败:', rollbackError);
        }
      }
      throw error; // 仍然抛出错误，因为这是创建操作，需要让调用者知道失败
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          logger.error('释放数据库连接失败:', releaseError);
        }
      }
    }
  },

  /**
   * 获取收款记录
   */
  getReceiptById: async (id) => {
    let connection;
    try {
      // 获取收款记录
      connection = await db.getConnection();
      const [receipts] = await connection.execute(
        `SELECT r.*, c.name as customer_name, b.account_name as bank_account_name
         FROM ar_receipts r
         LEFT JOIN customers c ON r.customer_id = c.id
         LEFT JOIN bank_accounts b ON r.bank_account_id = b.id
         WHERE r.id = ?`,
        [id]
      );

      if (receipts.length === 0) {
        connection.release();
        return null;
      }

      const receipt = receipts[0];

      // 获取收款明细
      const [items] = await connection.execute(
        `SELECT ri.*, i.invoice_number
         FROM ar_receipt_items ri
         LEFT JOIN ar_invoices i ON ri.invoice_id = i.id
         WHERE ri.receipt_id = ?`,
        [id]
      );

      receipt.items = items;
      connection.release();

      return receipt;
    } catch (error) {
      logger.error('获取收款记录失败:', error);
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  /**
   * 获取收款记录列表
   */
  getReceipts: async (filters = {}, page = 1, pageSize = 20) => {
    let connection;
    try {
      // 限制一次获取的数据量
      const actualPageSize = Math.min(pageSize, 10000);

      let query = `
        SELECT r.*, c.name as customer_name,
               (SELECT i.invoice_number 
                FROM ar_receipt_items ri 
                LEFT JOIN ar_invoices i ON ri.invoice_id = i.id 
                WHERE ri.receipt_id = r.id LIMIT 1) as invoice_number
        FROM ar_receipts r
        LEFT JOIN customers c ON r.customer_id = c.id
        WHERE 1=1
      `;
      const params = [];

      // 添加过滤条件
      if (filters.receipt_number) {
        query += ' AND r.receipt_number LIKE ?';
        params.push(`%${filters.receipt_number}%`);
      }

      if (filters.customer_id) {
        query += ' AND r.customer_id = ?';
        params.push(filters.customer_id);
      }

      if (filters.customer_name) {
        query += ' AND c.name LIKE ?';
        params.push(`%${filters.customer_name}%`);
      }

      if (filters.start_date && filters.end_date) {
        query += ' AND r.receipt_date BETWEEN ? AND ?';
        params.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        query += ' AND r.receipt_date >= ?';
        params.push(filters.start_date);
      } else if (filters.end_date) {
        query += ' AND r.receipt_date <= ?';
        params.push(filters.end_date);
      }

      if (filters.payment_method) {
        query += ' AND r.payment_method = ?';
        params.push(filters.payment_method);
      }

      // 添加状态筛选
      if (filters.status) {
        query += ' AND r.status = ?';
        params.push(filters.status);
      }

      // 按发票编号过滤（通过关联表查询）
      if (filters.invoice_number) {
        query += ` AND EXISTS (
          SELECT 1 FROM ar_receipt_items ri 
          JOIN ar_invoices i ON ri.invoice_id = i.id 
          WHERE ri.receipt_id = r.id AND i.invoice_number = ?
        )`;
        params.push(filters.invoice_number);
      }

      // 使用直接拼接进行分页（LIMIT/OFFSET已经过严格验证）
      const limit = parseInt(actualPageSize);
      const offset = parseInt((page - 1) * actualPageSize);
      query += ` ORDER BY r.receipt_date DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`;

      // 使用 query 而不是 execute，避免 LIMIT/OFFSET 参数化问题
      connection = await db.getConnection();
      const [receipts] = await connection.query(query, params);

      // 获取总记录数
      const countQuery = `
        SELECT COUNT(*) as total 
        FROM ar_receipts r 
        LEFT JOIN customers c ON r.customer_id = c.id
        WHERE 1=1
        ${filters.receipt_number ? ' AND r.receipt_number LIKE ?' : ''}
        ${filters.customer_id ? ' AND r.customer_id = ?' : ''}
        ${filters.customer_name ? ' AND c.name LIKE ?' : ''}
        ${filters.start_date && filters.end_date
          ? ' AND r.receipt_date BETWEEN ? AND ?'
          : filters.start_date
            ? ' AND r.receipt_date >= ?'
            : filters.end_date
              ? ' AND r.receipt_date <= ?'
              : ''
        }
        ${filters.payment_method ? ' AND r.payment_method = ?' : ''}
        ${filters.status ? ' AND r.status = ?' : ''}
        ${filters.invoice_number
          ? ` AND EXISTS (
              SELECT 1 FROM ar_receipt_items ri
              JOIN ar_invoices i ON ri.invoice_id = i.id
              WHERE ri.receipt_id = r.id AND i.invoice_number = ?
            )`
          : ''}
      `;

      // 重新构建计数查询参数
      const countParams = [];
      if (filters.receipt_number) countParams.push(`%${filters.receipt_number}%`);
      if (filters.customer_id) countParams.push(filters.customer_id);
      if (filters.customer_name) countParams.push(`%${filters.customer_name}%`);
      if (filters.start_date && filters.end_date) {
        countParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        countParams.push(filters.start_date);
      } else if (filters.end_date) {
        countParams.push(filters.end_date);
      }
      if (filters.payment_method) countParams.push(filters.payment_method);
      if (filters.status) countParams.push(filters.status);
      if (filters.invoice_number) countParams.push(filters.invoice_number);

      const [countResult] = await connection.execute(countQuery, countParams);
      const total = countResult[0].total;

      connection.release();

      return {
        receipts,
        pagination: {
          total,
          page,
          pageSize: actualPageSize,
          totalPages: Math.ceil(total / actualPageSize),
        },
      };
    } catch (error) {
      logger.error('获取收款记录列表失败:', error);
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  /**
   * 作废收款记录
   * @param {number} receiptId - 收款记录ID
   * @param {Object} voidData - 作废信息
   * @param {number} voidData.voided_by - 作废人ID
   * @param {string} voidData.void_reason - 作废原因
   */
  voidReceipt: async (receiptId, voidData) => {
    let connection = null;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const voidedBy = Number.parseInt(voidData.voided_by, 10);
      if (!Number.isInteger(voidedBy) || voidedBy <= 0) {
        throw new Error('voided_by must be a positive integer');
      }

      // 1. 获取收款记录详情
      const [receipts] = await connection.execute(
        `SELECT r.*, ri.invoice_id, ri.amount as item_amount
         FROM ar_receipts r
         LEFT JOIN ar_receipt_items ri ON r.id = ri.receipt_id
         WHERE r.id = ?
         FOR UPDATE`,
        [receiptId]
      );

      if (receipts.length === 0) {
        throw new Error('收款记录不存在');
      }

      const receipt = receipts[0];
      let originalBankTransactionId = null;
      let originalBankTransactionNumber = null;
      let reversalBankTransactionId = null;
      let reversalBankTransactionNumber = null;
      const reversalEntries = [];

      // 2. 验证状态（只能作废正常状态的记录）
      if (receipt.status === 'void') {
        throw new Error('该收款记录已经作废，无法重复作废');
      }

      // 3. 更新收款记录状态为作废
      await connection.execute(
        `UPDATE ar_receipts 
         SET status = 'void', 
             voided_at = NOW(), 
             voided_by = ?, 
             void_reason = ?
         WHERE id = ?`,
        [voidedBy, voidData.void_reason, receiptId]
      );

      // 4. 恢复关联发票的余额和状态
      for (const item of receipts) {
        if (!item.invoice_id) continue;

        // 获取发票当前信息
        const [invoices] = await connection.execute(
          'SELECT * FROM ar_invoices WHERE id = ? FOR UPDATE',
          [item.invoice_id]
        );

        if (invoices.length === 0) continue;

        const invoice = invoices[0];

        // [H-2 补链] 计算恢复后的金额 — 整数化精度控制（与 createReceipt 对齐）
        const paidAmountCents = Math.round(parseFloat(invoice.paid_amount) * 100) - Math.round(parseFloat(item.item_amount) * 100);
        const totalAmountCents = Math.round(parseFloat(invoice.total_amount) * 100);
        const newPaidAmount = Math.max(0, paidAmountCents) / 100;
        const newBalanceAmount = (totalAmountCents - Math.max(0, paidAmountCents)) / 100;

        // 确定新的状态
        let newStatus;
        if (newPaidAmount <= 0.001) {
          newStatus = '已确认'; // 完全未收款
        } else if (newBalanceAmount > 0.001) {
          newStatus = '部分付款';
        } else {
          newStatus = '已付款';
        }

        // 更新发票
        await connection.execute(
          'UPDATE ar_invoices SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, Math.max(0, newBalanceAmount), newStatus, item.invoice_id]
        );

        logger.info(`[作废收款] 已恢复发票 ${invoice.invoice_number} 的余额: ${newBalanceAmount}`);
      }

      // 5. 如果有银行交易记录，创建冲销交易
      if (
        receipt.bank_account_id &&
        BANK_BACKED_PAYMENT_METHODS.has(receipt.payment_method)
      ) {
        try {
          // 获取原银行交易记录
          const [bankTxs] = await connection.execute(
            `SELECT * FROM bank_transactions 
             WHERE transaction_number = ? AND bank_account_id = ?
             LIMIT 1
             FOR UPDATE`,
            [receipt.receipt_number, receipt.bank_account_id]
          );

          if (bankTxs.length > 0) {
            const originalTx = bankTxs[0];
            const reversalDate = new Date().toISOString().slice(0, 10);
            originalBankTransactionId = originalTx.id;
            originalBankTransactionNumber = originalTx.transaction_number;
            reversalBankTransactionNumber = `${receipt.receipt_number}-VOID`;

            const [bankAccounts] = await connection.execute(
              'SELECT id FROM bank_accounts WHERE id = ? FOR UPDATE',
              [receipt.bank_account_id]
            );
            if (bankAccounts.length === 0) {
              throw new Error('收款账户不存在，无法冲销银行交易');
            }

            // 创建冲销交易（转出，负数金额）
            const [reversalBankTxResult] = await connection.execute(
              `INSERT INTO bank_transactions
               (transaction_number, bank_account_id, transaction_date, transaction_type,
               amount, reference_number, description, is_reconciled, related_party, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                reversalBankTransactionNumber,
                receipt.bank_account_id,
                reversalDate,
                '转出', // 冲销是转出
                receipt.total_amount,
                receipt.receipt_number,
                `冲销收款记录 - 原因: ${voidData.void_reason}`,
                false,
                originalTx.related_party || '',
                'approved',
              ]
            );
            reversalBankTransactionId = reversalBankTxResult.insertId;

            // 更新银行账户余额（减少余额）
            await connection.execute(
              'UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?',
              [receipt.total_amount, receipt.bank_account_id]
            );

            logger.info('[作废收款] 已创建冲销银行交易并更新账户余额');
          }
        } catch (err) {
          logger.error(`[作废收款] 冲销银行交易失败: ${err.message}`);
          // 银行交易冲销失败也要抛出错误，因为这会导致数据不一致
          throw new Error(`冲销银行交易失败: ${err.message}`, { cause: err });
        }
      }

      // 6. 冲销关联的会计凭证（收款单号作为document_number）
      try {
        const [glEntries] = await connection.execute(
          `SELECT id FROM gl_entries 
           WHERE document_number = ? AND document_type = '收款单' AND (is_reversed IS NULL OR is_reversed = 0)`,
          [receipt.receipt_number]
        );

        if (glEntries.length > 0) {
          for (const glEntry of glEntries) {
            // 获取原分录明细
            const [items] = await connection.execute(
              'SELECT * FROM gl_entry_items WHERE entry_id = ?',
              [glEntry.id]
            );

            const reversalDocumentNumber = `${receipt.receipt_number}-VOID`;
            const reversalDate = new Date().toISOString().slice(0, 10);
            const periodId = await getOpenPeriodIdByDate(connection, reversalDate);

            const reversalEntryId = await financeModel.createEntry(
              {
                entry_date: reversalDate,
                posting_date: reversalDate,
                document_type: DOCUMENT_TYPE_MAPPING.SALES_COLLECTION,
                document_number: reversalDocumentNumber,
                period_id: periodId,
                description: `冲销收款凭证 - 原因: ${voidData.void_reason}`,
                created_by: voidedBy,
                status: 'posted',
                is_posted: 1,
              },
              items.map((item) => ({
                account_id: item.account_id,
                debit_amount: item.credit_amount,
                credit_amount: item.debit_amount,
                currency_code: item.currency_code || 'CNY',
                exchange_rate: item.exchange_rate || 1,
                description: `冲销: ${item.description || ''}`,
              })),
              connection
            );

            // 标记原凭证为已冲销
            await connection.execute(
              "UPDATE gl_entries SET is_reversed = 1, reversal_entry_id = ?, status = 'reversed' WHERE id = ?",
              [reversalEntryId, glEntry.id]
            );
            const reversalEntryNumber = await getEntryNumberById(connection, reversalEntryId);
            reversalEntries.push({ entryId: reversalEntryId, entryNumber: reversalEntryNumber });

            logger.info(`[作废收款] 已冲销GL凭证 ID=${glEntry.id}, 冲销凭证 ID=${reversalEntryId}`);
          }
        }
      } catch (err) {
        logger.error(`[作废收款] 冲销GL凭证失败: ${err.message}`);
        throw new Error(`冲销GL凭证失败: ${err.message}`, { cause: err });
      }

      for (const reversalEntry of reversalEntries) {
        await DocumentLinkService.tryAutoLink(
          'ar_receipt',
          receiptId,
          receipt.receipt_number,
          'finance_voucher',
          reversalEntry.entryId,
          reversalEntry.entryNumber,
          voidedBy,
          connection
        );
      }

      if (reversalBankTransactionId) {
        await DocumentLinkService.tryAutoLink(
          'ar_receipt',
          receiptId,
          receipt.receipt_number,
          'bank_transaction',
          reversalBankTransactionId,
          reversalBankTransactionNumber,
          voidedBy,
          connection
        );

        if (originalBankTransactionId) {
          await DocumentLinkService.createLink({
            source_type: 'bank_transaction',
            source_id: originalBankTransactionId,
            source_code: originalBankTransactionNumber,
            target_type: 'bank_transaction',
            target_id: reversalBankTransactionId,
            target_code: reversalBankTransactionNumber,
            link_type: 'related',
            remark: 'AR receipt void reversal',
            created_by: voidedBy,
          }, connection);
        }

        if (reversalEntries.length > 0) {
          await connection.execute(
            'UPDATE bank_transactions SET gl_entry_id = ? WHERE id = ?',
            [reversalEntries[0].entryId, reversalBankTransactionId]
          );
          for (const reversalEntry of reversalEntries) {
            await DocumentLinkService.tryAutoLink(
              'bank_transaction',
              reversalBankTransactionId,
              reversalBankTransactionNumber,
              'finance_voucher',
              reversalEntry.entryId,
              reversalEntry.entryNumber,
              voidedBy,
              connection
            );
          }
        }
      }

      await connection.commit();
      logger.info(`[作废收款] 收款记录 ${receipt.receipt_number} 已成功作废`);

      if (connection) {
        connection.release();
        connection = null;
      }

      return true;
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.error('事务回滚失败:', rollbackError);
        }
      }
      logger.error('作废收款记录失败:', error);
      throw error;
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          logger.error('释放数据库连接失败:', releaseError);
        }
      }
    }
  },

  /**
   * 获取客户应收账款汇总
   */
  getCustomerReceivables: async (customerId = null) => {
    let connection;
    try {
      let query = `
        SELECT 
          c.id AS customer_id,
          c.name as customer_name,
          COUNT(a.id) AS invoice_count,
          SUM(a.total_amount) AS total_amount,
          SUM(a.paid_amount) AS paid_amount,
          SUM(a.balance_amount) AS balance_amount
        FROM customers c
        LEFT JOIN ar_invoices a ON c.id = a.customer_id AND a.status != '已取消'
      `;

      const params = [];

      if (customerId) {
        query += ' WHERE c.id = ?';
        params.push(customerId);
      }

      query += ' GROUP BY c.id, c.name ORDER BY balance_amount DESC LIMIT 100';

      connection = await db.getConnection();
      const [results] = await connection.execute(query, params);
      connection.release();
      return results;
    } catch (error) {
      logger.error('获取客户应收账款汇总失败:', error);
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  /**
   * 获取应收账款账龄分析
   */
  getReceivablesAging: async (customerId = null, asOfDate = null) => {
    let connection;
    try {
      // 如果没有指定日期，使用当前日期
      const currentDate = asOfDate || new Date().toISOString().split('T')[0];

      let query = `
        SELECT 
          c.id AS customer_id,
          c.name as customer_name,
          SUM(CASE WHEN DATEDIFF(?, a.due_date) <= 0 THEN a.balance_amount ELSE 0 END) AS current_amount,
          SUM(CASE WHEN DATEDIFF(?, a.due_date) BETWEEN 1 AND 30 THEN a.balance_amount ELSE 0 END) AS '1_30_days',
          SUM(CASE WHEN DATEDIFF(?, a.due_date) BETWEEN 31 AND 60 THEN a.balance_amount ELSE 0 END) AS '31_60_days',
          SUM(CASE WHEN DATEDIFF(?, a.due_date) BETWEEN 61 AND 90 THEN a.balance_amount ELSE 0 END) AS '61_90_days',
          SUM(CASE WHEN DATEDIFF(?, a.due_date) > 90 THEN a.balance_amount ELSE 0 END) AS 'over_90_days',
          SUM(a.balance_amount) AS total_amount
        FROM customers c
        LEFT JOIN ar_invoices a ON c.id = a.customer_id AND a.status != '已付款' AND a.status != '已取消'
      `;

      const params = [currentDate, currentDate, currentDate, currentDate, currentDate];

      if (customerId) {
        query += ' WHERE c.id = ?';
        params.push(customerId);
      }

      query +=
        ' GROUP BY c.id, c.name HAVING total_amount > 0 ORDER BY total_amount DESC LIMIT 100';

      connection = await db.getConnection();
      const [results] = await connection.execute(query, params);
      connection.release();
      return results;
    } catch (error) {
      logger.error('获取应收账款账龄分析失败:', error);
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  /**
   * 获取发票的支付记录
   */
  getInvoicePayments: async (invoiceId) => {
    let connection = null;

    try {
      // 尝试获取连接
      try {
        connection = await db.getConnection();
      } catch (connError) {
        logger.error('获取数据库连接失败:', connError);
        throw connError;
      }

      // 执行查询
      let payments = [];
      try {
        const [paymentResults] = await connection.execute(
          `SELECT rp.id, rp.receipt_id, rp.invoice_id, rp.amount, rp.discount_amount,
                  r.receipt_number, DATE_FORMAT(r.receipt_date, '%Y-%m-%d') as payment_date, 
                  r.payment_method, r.reference_number
           FROM ar_receipt_items rp
           LEFT JOIN ar_receipts r ON rp.receipt_id = r.id
           WHERE rp.invoice_id = ?
           ORDER BY r.receipt_date DESC
           LIMIT 20`,
          [invoiceId]
        );

        payments = paymentResults || [];
      } catch (queryError) {
        logger.error('查询发票支付记录失败:', queryError);
        throw queryError;
      } finally {
        // 确保连接被释放
        if (connection) {
          try {
            connection.release();
            connection = null;
          } catch (releaseError) {
            logger.error('释放连接失败:', releaseError);
          }
        }
      }

      return payments;
    } catch (error) {
      logger.error('获取发票支付记录失败:', error);
      throw error;
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          logger.error('在finally中释放数据库连接失败:', releaseError);
        }
      }
    }
  },

  /**
   * 获取发票明细项
   */
  getInvoiceItems: async (invoiceId) => {
    let connection = null;

    try {
      // 尝试获取连接
      try {
        connection = await db.getConnection();
      } catch (connError) {
        logger.error('获取数据库连接失败:', connError);
        throw connError;
      }

      // 执行查询
      let items = [];
      try {
        const [itemResults] = await connection.execute(
          `SELECT i.id, i.invoice_id, i.product_id, m.name as product_name,
                  i.description, i.quantity, i.unit_price, i.amount
           FROM ar_invoice_items i
           LEFT JOIN materials m ON i.product_id = m.id
           WHERE i.invoice_id = ?
           ORDER BY i.id
           LIMIT 50`,
          [invoiceId]
        );

        items = itemResults || [];
      } catch (queryError) {
        logger.error('查询发票明细项失败:', queryError);
        throw queryError;
      } finally {
        // 确保连接被释放
        if (connection) {
          try {
            connection.release();
            connection = null;
          } catch (releaseError) {
            logger.error('释放连接失败:', releaseError);
          }
        }
      }

      return items;
    } catch (error) {
      logger.error('获取发票明细项失败:', error);
      throw error;
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          logger.error('在finally中释放数据库连接失败:', releaseError);
        }
      }
    }
  },

  /**
   * 获取逾期的应收发票
   * @param {string} asOfDate - 检查日期，格式YYYY-MM-DD
   * @returns {Promise<Array>} 逾期发票列表
   */
  getOverdueInvoices: async (asOfDate) => {
    let connection = null;
    try {
      connection = await db.getConnection();
      const [invoices] = await connection.execute(
        `SELECT a.id, a.invoice_number, a.customer_id, c.name as customer_name,
                DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoice_date,
                DATE_FORMAT(a.due_date, '%Y-%m-%d') as due_date,
                a.total_amount, a.paid_amount, a.balance_amount, a.status
         FROM ar_invoices a
         LEFT JOIN customers c ON a.customer_id = c.id
         WHERE a.due_date < ?
           AND a.balance_amount > 0
           AND a.status NOT IN ('已付款', '已取消', 'void')
         ORDER BY a.due_date ASC
         LIMIT 100`,
        [asOfDate]
      );

      return invoices || [];
    } catch (error) {
      logger.error('获取逾期应收发票失败:', error);
      return [];
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (e) {
          logger.error('释放连接失败:', e);
        }
      }
    }
  },
};

module.exports = arModel;
