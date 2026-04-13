/**
 * ar.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const db = require('../config/db');
const financeModel = require('./finance');
const { getUserIdByIdentifier } = require('../utils/userUtils');

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
            'SELECT name FROM customers WHERE id = ?',
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

        // 创建会计分录
        await financeModel.createEntry(entryData, entryItems, connection);
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
        } catch (releaseError) {
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
      } catch (countError) {
        // 如果获取总数失败，使用已获取记录的长度
        total = invoices.length;
      }

      // 在结果返回前确保释放连接
      if (connection) {
        try {
          connection.release();
          connection = null;
        } catch (releaseError) {
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
    } catch (error) {
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
        } catch (releaseError) {
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
    } catch (error) {
      return null; // 返回null而不是抛出异常，防止应用崩溃
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          // 在finally中释放数据库连接失败
        }
      }
    }
  },

  /**
   * 更新应收账款发票状态
   */
  updateInvoiceStatus: async (id, status) => {
    let connection = null;
    try {
      connection = await db.getConnection();
      const [result] = await connection.execute('UPDATE ar_invoices SET status = ? WHERE id = ?', [
        status,
        id,
      ]);

      if (connection) {
        connection.release();
        connection = null;
      }

      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新应收账款发票状态失败:', error);
      return false; // 返回失败标志而不是抛出异常，防止应用崩溃
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
   * 仅允许 '草稿' 和 '已确认' 状态的发票编辑
   */
  updateInvoice: async (invoiceData) => {
    let connection = null;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // 检查发票是否存在及状态
      const [existing] = await connection.execute(
        'SELECT id, status, paid_amount FROM ar_invoices WHERE id = ?',
        [invoiceData.id]
      );
      if (existing.length === 0) {
        throw new Error('发票不存在');
      }
      if (!['草稿', '已确认'].includes(existing[0].status)) {
        throw new Error(`当前状态 "${existing[0].status}" 不允许编辑`);
      }

      const paidAmount = parseFloat(existing[0].paid_amount || 0);
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

      // 更新明细项: 先删除旧明细，再批量插入新明细
      if (invoiceData.items && Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
        await connection.execute(
          'DELETE FROM ar_invoice_items WHERE invoice_id = ?',
          [invoiceData.id]
        );

        const itemValues = invoiceData.items.map(item => [
          invoiceData.id,
          item.product_id || null,
          item.description || '',
          item.quantity || 0,
          item.unit_price || 0,
          item.amount || (item.quantity * item.unit_price) || 0,
        ]);
        await connection.query(
          `INSERT INTO ar_invoice_items
           (invoice_id, product_id, description, quantity, unit_price, amount)
           VALUES ?`,
          [itemValues]
        );
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
        try { await connection.rollback(); } catch (e) { /* 忽略 */ }
        // 静默忽略该错误
      }
      throw error;
    } finally {
      if (connection) {
        try { connection.release(); } catch (e) { /* 忽略 */ }
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

      // 插入收款明细并更新发票状态
      let totalPaidCents = 0;
      for (const item of receiptItems) {
        // 插入收款明细
        await connection.execute(
          'INSERT INTO ar_receipt_items (receipt_id, invoice_id, amount, discount_amount) VALUES (?, ?, ?, ?)',
          [receiptId, item.invoice_id, item.amount, item.discount_amount || 0]
        );

        // 获取发票当前信息
        const [invoices] = await connection.execute('SELECT * FROM ar_invoices WHERE id = ?', [
          item.invoice_id,
        ]);

        if (invoices.length === 0) {
          throw new Error(`发票ID ${item.invoice_id} 不存在`);
        }

        const invoice = invoices[0];

        // ===== [H-3] 超额收款校验 =====
        const currentBalance = Math.round(parseFloat(invoice.balance_amount) * 100);
        const receiveAmount = Math.round(parseFloat(item.amount) * 100);
        if (receiveAmount > currentBalance + 1) {
          // 允许1分钱容差（浮点数取整误差）
          throw new Error(`收款金额 ${item.amount} 超过发票 ${invoice.invoice_number} 余额 ${invoice.balance_amount}`);
        }

        // ===== [H-2] 整数化精度控制 =====
        const paidAmountCents = Math.round(parseFloat(invoice.paid_amount) * 100) + receiveAmount;
        const totalAmountCents = Math.round(parseFloat(invoice.total_amount) * 100);
        const newPaidAmount = paidAmountCents / 100;
        const newBalanceAmount = (totalAmountCents - paidAmountCents) / 100;

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

      // 如果是银行转账收款，更新银行账户余额并创建银行交易记录
      // 支持多种银行支付方式
      const bankPaymentMethods = ['银行转账', 'bank_transfer', '电子支付', 'credit_card'];
      if (bankPaymentMethods.includes(receiptData.payment_method) && receiptData.bank_account_id) {
        try {
          // 获取银行账户信息
          const [bankAccounts] = await connection.execute(
            'SELECT * FROM bank_accounts WHERE id = ?',
            [receiptData.bank_account_id]
          );

          if (bankAccounts.length > 0) {
            const bankAccount = bankAccounts[0];

            // 创建银行交易记录
            await connection.execute(
              `INSERT INTO bank_transactions
              (transaction_number, bank_account_id, transaction_date, transaction_type,
              amount, reference_number, description, is_reconciled, related_party,
              related_invoice_id, related_invoice_type)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                receiptData.receipt_number, // 使用收款单号作为交易号
                receiptData.bank_account_id,
                receiptData.receipt_date,
                '转入', // 收款属于转入类型
                totalPaid, // 交易金额
                receiptData.reference_number || null,
                // [M-5] 在描述中包含所有关联发票信息
                `应收账款收款 - 客户: ${receiptData.customer_name || '未知客户'}` +
                (receiptItems.length > 1 ? ` (含${receiptItems.length}张发票)` : ''),
                false, // 未对账
                receiptData.customer_name || '未知客户', // 相关方为客户
                receiptItems[0]?.invoice_id || null, // 关联主发票ID（向后兼容）
                'AR', // 关联发票类型：应收
              ]
            );

            // 更新银行账户余额（收款增加余额）— 整数化精度控制
            const currentBalanceCents = Math.round(parseFloat(bankAccount.current_balance) * 100);
            const totalPaidCents = Math.round(totalPaid * 100);
            const newBalance = (currentBalanceCents + totalPaidCents) / 100;
            await connection.execute('UPDATE bank_accounts SET current_balance = ? WHERE id = ?', [
              newBalance,
              receiptData.bank_account_id,
            ]);

            logger.info(
              `[AR收款] 银行账户余额已更新: ${bankAccount.account_name}, 新余额: ${newBalance}`
            );
          } else {
            logger.warn(`[AR收款] 银行账户ID ${receiptData.bank_account_id} 不存在，跳过余额更新`);
          }
        } catch (err) {
          logger.error(`[AR收款] 创建银行交易记录失败: ${err.message}`);
          // 不阻塞收款流程，但记录错误
        }
      }

      // 如果提供了会计分录信息，创建收款会计分录
      if (receiptData.gl_entry) {
        const entryData = {
          entry_number: receiptData.gl_entry.entry_number,
          entry_date: receiptData.receipt_date,
          posting_date: receiptData.receipt_date,
          document_type: '收款单',
          document_number: receiptData.receipt_number,
          period_id: receiptData.gl_entry.period_id,
          description: `客户 ${receiptData.customer_name} 收款`,
          created_by: receiptData.gl_entry.created_by,
        };

        // 收款分录明细
        const entryItems = [
          // 借：银行/现金
          {
            account_id: receiptData.gl_entry.bank_account_id,
            debit_amount: totalPaid,
            credit_amount: 0,
            description: `收款 - 收款单号: ${receiptData.receipt_number}`,
          },
          // 贷：应收账款
          {
            account_id: receiptData.gl_entry.receivable_account_id,
            debit_amount: 0,
            credit_amount: totalPaid,
            description: `应收账款减少 - 收款单号: ${receiptData.receipt_number}`,
          },
        ];

        // 创建会计分录
        await financeModel.createEntry(entryData, entryItems, connection);
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
        WHERE 1=1
        ${filters.receipt_number ? ' AND r.receipt_number LIKE ?' : ''}
        ${filters.customer_id ? ' AND r.customer_id = ?' : ''}
        ${filters.start_date && filters.end_date
          ? ' AND r.receipt_date BETWEEN ? AND ?'
          : filters.start_date
            ? ' AND r.receipt_date >= ?'
            : filters.end_date
              ? ' AND r.receipt_date <= ?'
              : ''
        }
        ${filters.payment_method ? ' AND r.payment_method = ?' : ''}
      `;

      // 重新构建计数查询参数
      const countParams = [];
      if (filters.receipt_number) countParams.push(`%${filters.receipt_number}%`);
      if (filters.customer_id) countParams.push(filters.customer_id);
      if (filters.start_date && filters.end_date) {
        countParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        countParams.push(filters.start_date);
      } else if (filters.end_date) {
        countParams.push(filters.end_date);
      }
      if (filters.payment_method) countParams.push(filters.payment_method);

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

      // 1. 获取收款记录详情
      const [receipts] = await connection.execute(
        `SELECT r.*, ri.invoice_id, ri.amount as item_amount
         FROM ar_receipts r
         LEFT JOIN ar_receipt_items ri ON r.id = ri.receipt_id
         WHERE r.id = ?`,
        [receiptId]
      );

      if (receipts.length === 0) {
        throw new Error('收款记录不存在');
      }

      const receipt = receipts[0];

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
        [voidData.voided_by, voidData.void_reason, receiptId]
      );

      // 4. 恢复关联发票的余额和状态
      for (const item of receipts) {
        if (!item.invoice_id) continue;

        // 获取发票当前信息
        const [invoices] = await connection.execute('SELECT * FROM ar_invoices WHERE id = ?', [
          item.invoice_id,
        ]);

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
        ['银行转账', 'bank_transfer', '电子支付', 'credit_card'].includes(receipt.payment_method)
      ) {
        try {
          // 获取原银行交易记录
          const [bankTxs] = await connection.execute(
            `SELECT * FROM bank_transactions 
             WHERE transaction_number = ? AND bank_account_id = ?
             LIMIT 1`,
            [receipt.receipt_number, receipt.bank_account_id]
          );

          if (bankTxs.length > 0) {
            const originalTx = bankTxs[0];

            // 创建冲销交易（转出，负数金额）
            await connection.execute(
              `INSERT INTO bank_transactions
               (transaction_number, bank_account_id, transaction_date, transaction_type,
               amount, reference_number, description, is_reconciled, related_party)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                `${receipt.receipt_number}-VOID`, // 冲销交易号
                receipt.bank_account_id,
                new Date(), // 使用当前日期
                '转出', // 冲销是转出
                receipt.total_amount,
                receipt.receipt_number,
                `冲销收款记录 - 原因: ${voidData.void_reason}`,
                false,
                originalTx.related_party || '',
              ]
            );

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
          throw new Error(`冲销银行交易失败: ${err.message}`);
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

            // 获取当前会计期间
            let periodId = null;
            const [periods] = await connection.execute(
              `SELECT id FROM gl_periods WHERE is_closed = 0 ORDER BY end_date DESC LIMIT 1`
            );
            if (periods.length > 0) periodId = periods[0].id;

            // 生成冲销凭证编号 (更短，避免超出字段长度限制，使用符合中国财务习惯的“冲”字前缀)
            const shortStr = Math.random().toString(36).substring(2, 6).toUpperCase();
            const reversalEntryNumber = `冲-AR-${receipt.receipt_number.substring(receipt.receipt_number.length - 8)}-${shortStr}`;

            // 创建冲销凭证头
            const [entryResult] = await connection.execute(
              `INSERT INTO gl_entries 
               (entry_number, entry_date, posting_date, document_type, document_number, period_id, is_posted, description, created_by)
               VALUES (?, NOW(), NOW(), '收款单', ?, ?, 1, ?, ?)`,
              [
                reversalEntryNumber,
                receipt.receipt_number,
                periodId,
                `冲销收款凭证 - 原因: ${voidData.void_reason}`,
                voidData.voided_by || 1,
              ]
            );

            const reversalEntryId = entryResult.insertId;

            // 创建冲销明细（借贷方向相反）
            for (const item of items) {
              await connection.execute(
                `INSERT INTO gl_entry_items 
                 (entry_id, account_id, debit_amount, credit_amount, currency_code, exchange_rate, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  reversalEntryId,
                  item.account_id,
                  item.credit_amount,  // 借贷方向相反
                  item.debit_amount,   // 借贷方向相反
                  item.currency_code || 'CNY',
                  item.exchange_rate || 1,
                  `冲销: ${item.description || ''}`,
                ]
              );
            }

            // 标记原凭证为已冲销
            await connection.execute(
              'UPDATE gl_entries SET is_reversed = 1, reversal_entry_id = ? WHERE id = ?',
              [reversalEntryId, glEntry.id]
            );

            logger.info(`[作废收款] 已冲销GL凭证 ID=${glEntry.id}, 冲销凭证 ID=${reversalEntryId}`);
          }
        }
      } catch (err) {
        logger.error(`[作废收款] 冲销GL凭证失败: ${err.message}`);
        throw new Error(`冲销GL凭证失败: ${err.message}`);
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
        return [];
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
        return [];
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
      return []; // 返回空数组而不是抛出异常，防止应用崩溃
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
        return [];
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
        return [];
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
      return []; // 返回空数组而不是抛出异常，防止应用崩溃
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
