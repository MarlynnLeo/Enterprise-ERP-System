/**
 * ap.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const db = require('../config/db');
const financeModel = require('./finance');
const {
  DOCUMENT_TYPE_MAPPING,
  INVOICE_STATUS,
  MANUAL_INVOICE_STATUS_TRANSITIONS,
  BANK_BACKED_PAYMENT_METHODS,
} = require('../constants/financeConstants');
const { getUserIdByIdentifier } = require('../utils/userUtils');
const AccountMappingService = require('../services/finance/AccountMappingService');
const DocumentLinkService = require('../services/business/DocumentLinkService');
const { financeConfig } = require('../config/financeConfig');
const { accountingConfig } = require('../config/accountingConfig');

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
      `不允许从"${currentStatus}"手工变更为"${nextStatus}"；付款状态只能由付款/作废流程自动维护`
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
    [DOCUMENT_TYPE_MAPPING.PURCHASE_INVOICE, documentNumber]
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

const resolvePurchaseInvoiceAccounts = async (connection, invoice) => {
  const mapping = await AccountMappingService.getDefaultMapping('purchase_invoice', {
    supplier_id: invoice.supplier_id,
  });

  if (mapping && mapping.debit_account_id && mapping.credit_account_id) {
    return {
      purchaseCostAccountId: mapping.debit_account_id,
      payableAccountId: mapping.credit_account_id,
    };
  }

  await accountingConfig.loadFromDatabase(db);
  return {
    purchaseCostAccountId: await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('PURCHASE_COST') || '1401',
      '采购成本'
    ),
    payableAccountId: await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('ACCOUNTS_PAYABLE') || '2202',
      '应付账款'
    ),
  };
};

const createInvoiceConfirmationEntry = async (connection, invoice, createdBy = 'system') => {
  const shouldCreateEntry = await ensureNoActiveInvoiceEntry(connection, invoice.invoice_number);
  if (!shouldCreateEntry) {
    return null;
  }

  const { purchaseCostAccountId, payableAccountId } = await resolvePurchaseInvoiceAccounts(
    connection,
    invoice
  );
  const periodId = await getOpenPeriodIdByDate(connection, invoice.invoice_date);

  const entryId = await financeModel.createEntry(
    {
      entry_date: invoice.invoice_date,
      posting_date: invoice.invoice_date,
      document_type: DOCUMENT_TYPE_MAPPING.PURCHASE_INVOICE,
      document_number: invoice.invoice_number,
      period_id: periodId,
      description: `供应商 ${invoice.supplier_name || '未知供应商'} 应付账款`,
      created_by: createdBy,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: purchaseCostAccountId,
        debit_amount: invoice.total_amount,
        credit_amount: 0,
        currency_code: invoice.currency_code || 'CNY',
        exchange_rate: invoice.exchange_rate || 1,
        description: `采购成本 - 发票号: ${invoice.invoice_number}`,
      },
      {
        account_id: payableAccountId,
        debit_amount: 0,
        credit_amount: invoice.total_amount,
        currency_code: invoice.currency_code || 'CNY',
        exchange_rate: invoice.exchange_rate || 1,
        description: `应付账款 - 发票号: ${invoice.invoice_number}`,
      },
    ],
    connection
  );

  const entryNumber = await linkDocumentToVoucher(
    connection,
    'ap_invoice',
    invoice.id,
    invoice.invoice_number,
    entryId,
    createdBy
  );

  return { entryId, entryNumber };
};

const buildPaymentGlEntry = async (connection, paymentData) => {
  if (paymentData.gl_entry) {
    return paymentData.gl_entry;
  }

  await accountingConfig.loadFromDatabase(db);
  await financeConfig.loadFromDatabase(db);
  const payableAccountId = await getAccountIdByCode(
    connection,
    accountingConfig.getAccountCode('ACCOUNTS_PAYABLE') || '2202',
    '应付账款'
  );
  const cashOrBankCode =
    paymentData.payment_method === '现金'
      ? accountingConfig.getAccountCode('CASH') || '1001'
      : accountingConfig.getAccountCode('BANK_DEPOSIT') || '1002';
  const bankAccountId = await getAccountIdByCode(connection, cashOrBankCode, '银行/现金');
  const periodId = await getOpenPeriodIdByDate(connection, paymentData.payment_date);

  return {
    period_id: periodId,
    created_by: financeConfig.get('system.defaultCreator', 'system'),
    payable_account_id: payableAccountId,
    bank_account_id: bankAccountId,
  };
};

/**
 * 应付账款模块数据库操作
 */
const apModel = {
  /**
   * 创建应付账款发票
   */
  createInvoice: async (invoiceData, connection = null) => {
    // 使用事务确保数据一致性
    const conn = connection || (await db.pool.getConnection());
    try {
      if (!connection) {
        await conn.beginTransaction();
      }

      // 计算余额 - 确保使用正确的字段名
      const balanceAmount = invoiceData.total_amount;

      // 插入应付账款发票
      const [result] = await conn.execute(
        `INSERT INTO ap_invoices
        (invoice_number, supplier_id, invoice_date, due_date,
         total_amount, paid_amount, balance_amount,
         currency_code, exchange_rate, status, terms, notes, 
         supplier_invoice_number, source_type, source_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceData.invoice_number,
          invoiceData.supplier_id,
          invoiceData.invoice_date,
          invoiceData.due_date,
          invoiceData.total_amount,
          0, // 初始已付金额为0
          balanceAmount,

          invoiceData.currency_code || financeConfig.get('invoice.defaultCurrency', 'CNY'),
          invoiceData.exchange_rate || financeConfig.get('invoice.defaultExchangeRate', 1),
          invoiceData.status || '草稿',
          invoiceData.terms ?? null,
          invoiceData.notes ?? null,
          invoiceData.supplier_invoice_number ?? null,
          invoiceData.source_type ?? null,
          invoiceData.source_id ?? null,
        ]
      );

      const invoiceId = result.insertId;

      // 批量插入发票明细项（1次SQL替代N次）
      if (invoiceData.items && Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
        const itemValues = invoiceData.items.map(item => [
          invoiceId,
          item.material_id ?? null,
          item.description ?? null,
          item.quantity ?? null,
          item.unit_price ?? null,
          item.amount ?? null,
        ]);
        await conn.query(
          `INSERT INTO ap_invoice_items
           (invoice_id, material_id, description, quantity, unit_price, amount)
           VALUES ?`,
          [itemValues]
        );
      }

      // 如果发票状态为"已确认"，则创建会计分录
      if (invoiceData.status === '已确认') {
        // 如果没有提供会计分录信息，尝试从配置中获取
        if (!invoiceData.gl_entry) {
          logger.info('[AP] 未提供会计分录信息，尝试从配置中获取默认科目映射');
          const mapping = await AccountMappingService.getDefaultMapping('purchase_invoice', {
            supplier_id: invoiceData.supplier_id,
          });

          if (mapping && mapping.debit_account_id && mapping.credit_account_id) {
            logger.info('[AP] 找到默认科目映射:', mapping);

            // 获取当前会计期间
            let periodId = null;
            try {
              const entryDate = invoiceData.invoice_date || new Date().toISOString().slice(0, 10);
              const [periods] = await conn.execute(
                `SELECT id FROM gl_periods
                 WHERE start_date <= ? AND end_date >= ? AND is_closed = 0
                 ORDER BY start_date DESC LIMIT 1`,
                [entryDate, entryDate]
              );
              if (periods.length > 0) {
                periodId = periods[0].id;
              }
            } catch (err) {
              logger.warn('[AP] 获取会计期间失败，会计分录可能缺少期间信息:', err.message);
            }

            invoiceData.gl_entry = {
              purchase_cost_account_id: mapping.debit_account_id,
              payable_account_id: mapping.credit_account_id,
              period_id: periodId,
              created_by: invoiceData.created_by || 'system',
            };
          } else {
            logger.warn('[AP] 未找到科目映射配置，跳过会计分录创建');
          }
        }

        // 如果有会计分录信息（提供的或从配置获取的），创建会计分录
        if (invoiceData.gl_entry) {
          // [C-1] 日志降级：生产环境避免输出敏感财务信息
          logger.debug('[AP] 准备创建会计分录，invoiceData:', {
            invoice_number: invoiceData.invoice_number,
            invoice_date: invoiceData.invoice_date,
            invoice_date_type: typeof invoiceData.invoice_date,
            supplier_name: invoiceData.supplier_name,
            total_amount: invoiceData.total_amount,
            gl_entry: invoiceData.gl_entry,
          });

          // 转换 created_by 为用户ID
          const createdById = await getUserIdByIdentifier(
            conn,
            invoiceData.gl_entry.created_by ?? 'system'
          );

          const entryData = {
            entry_number: invoiceData.gl_entry.entry_number ?? null,
            entry_date: invoiceData.invoice_date ?? null,
            posting_date: invoiceData.invoice_date ?? null,
            document_type: '发票',
            document_number: invoiceData.invoice_number ?? null,
            period_id: invoiceData.gl_entry.period_id ?? null,
            description: `供应商 ${invoiceData.supplier_name || '未知供应商'} 应付账款`,
            created_by: createdById,
            status: 'posted',
            is_posted: 1,
          };

          logger.debug('[AP] entryData准备完成:', entryData);

          // 应付账款分录明细
          const entryItems = [
            // 借：采购成本/库存商品
            {
              account_id:
                invoiceData.gl_entry.purchase_cost_account_id ??
                invoiceData.gl_entry.expense_account_id ??
                null,
              debit_amount: invoiceData.total_amount ?? 0,
              credit_amount: 0,
              currency_code: invoiceData.currency_code ?? 'CNY',
              exchange_rate: invoiceData.exchange_rate ?? 1,
              description: `采购成本 - 发票号: ${invoiceData.invoice_number}`,
            },
            // 贷：应付账款
            {
              account_id: invoiceData.gl_entry.payable_account_id ?? null,
              debit_amount: 0,
              credit_amount: invoiceData.total_amount ?? 0,
              currency_code: invoiceData.currency_code ?? 'CNY',
              exchange_rate: invoiceData.exchange_rate ?? 1,
              description: `应付账款 - 发票号: ${invoiceData.invoice_number}`,
            },
          ];

          // 创建会计分录并写入单据链
          const entryId = await financeModel.createEntry(entryData, entryItems, conn);
          await linkDocumentToVoucher(
            conn,
            'ap_invoice',
            invoiceId,
            invoiceData.invoice_number,
            entryId,
            createdById
          );
        }
      }

      if (!connection) {
        await conn.commit();
      }

      return invoiceId;
    } catch (error) {
      if (!connection) {
        await conn.rollback();
      }
      logger.error('创建应付账款发票失败:', {
        error: error.message,
        invoiceNumber: invoiceData.invoice_number,
        supplierId: invoiceData.supplier_id,
        totalAmount: invoiceData.total_amount,
        stack: error.stack,
      });
      throw error;
    } finally {
      if (!connection && conn) {
        conn.release();
      }
    }
  },

  /**
   * 按ID获取应付账款发票
   */
  getInvoiceById: async (id) => {
    // 查询发票主数据
    const [invoices] = await db.pool.execute(
      `SELECT a.*, 
              DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoice_date, 
              DATE_FORMAT(a.due_date, '%Y-%m-%d') as due_date, 
              DATE_FORMAT(a.created_at, '%Y-%m-%d') as created_at,
              s.name as supplier_name
       FROM ap_invoices a
       LEFT JOIN suppliers s ON a.supplier_id = s.id
       WHERE a.id = ?`,
      [id]
    );

    if (invoices.length === 0) {
      return null;
    }

    const invoice = invoices[0];

    // 查询发票明细项
    const [items] = await db.pool.execute(
      `SELECT i.id, i.material_id as materialId, i.description, 
              i.quantity, i.unit_price as unitPrice, i.amount,
              m.name as materialName
       FROM ap_invoice_items i
       LEFT JOIN materials m ON i.material_id = m.id
       WHERE i.invoice_id = ?
       ORDER BY i.id ASC`,
      [id]
    );

    // 添加明细项到发票数据
    invoice.items = items;

    // 格式化数据以符合前端期望
    const result = {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      supplierInvoiceNumber: invoice.supplier_invoice_number,
      supplierId: invoice.supplier_id,
      supplierName: invoice.supplier_name,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      amount: invoice.total_amount,
      paidAmount: invoice.paid_amount,
      balance: invoice.balance_amount,
      status: invoice.status,
      notes: invoice.notes,
      items: items,
      createdAt: invoice.created_at,
    };

    return result;
  },

  /**
   * 获取应付账款发票列表
   */
  getInvoices: async (filters = {}, page = 1, pageSize = 20) => {
    // 确保page和pageSize是数字
    const numPage = Number(page) || 1;
    const numPageSize = Number(pageSize) || 20;

    // 优化：移除不必要的表存在性检查，直接使用JOIN查询
    // 如果suppliers表不存在，JOIN查询会自动处理

    // 构建WHERE子句和参数
    let whereClause = 'WHERE 1=1';
    const params = [];

    // 添加过滤条件
    if (filters.invoice_number) {
      whereClause += ' AND a.invoice_number LIKE ?';
      params.push(`%${filters.invoice_number}%`);
    }

    if (filters.supplier_id) {
      whereClause += ' AND a.supplier_id = ?';
      params.push(filters.supplier_id);
    }

    if (filters.supplier_invoice_number) {
      whereClause += ' AND a.supplier_invoice_number LIKE ?';
      params.push(`%${filters.supplier_invoice_number}%`);
    }

    // 供应商名称过滤条件
    if (filters.supplier_name) {
      whereClause += ' AND s.name LIKE ?';
      params.push(`%${filters.supplier_name}%`);
    }

    if (filters.start_date && filters.end_date) {
      whereClause += ' AND a.invoice_date BETWEEN ? AND ?';
      params.push(filters.start_date, filters.end_date);
    } else if (filters.start_date) {
      whereClause += ' AND a.invoice_date >= ?';
      params.push(filters.start_date);
    } else if (filters.end_date) {
      whereClause += ' AND a.invoice_date <= ?';
      params.push(filters.end_date);
    }

    if (filters.status) {
      whereClause += ' AND a.status = ?';
      params.push(filters.status);
    }

    // 查询总记录数 - 使用统一的JOIN查询
      const countQuery = `
        SELECT COUNT(*) as total
        FROM ap_invoices a
        LEFT JOIN suppliers s ON a.supplier_id = s.id
        ${whereClause}`;

      const [countResult] = await db.pool.execute(countQuery, params);
      const total = countResult[0].total;

      // 如果没有记录，直接返回空结果
      if (total === 0) {
        return {
          data: [],
          total: 0,
          page: numPage,
          pageSize: numPageSize,
        };
      }

      // 分页参数处理
      const offset = (numPage - 1) * numPageSize;

      // 执行数据查询 - 使用统一的JOIN查询
      const dataQuery = `
        SELECT a.id, a.invoice_number as invoiceNumber, a.supplier_invoice_number as supplierInvoiceNumber, a.supplier_id as supplierId,
              s.name as supplierName,
              DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoiceDate,
              DATE_FORMAT(a.due_date, '%Y-%m-%d') as dueDate,
              a.total_amount as amount,
              a.paid_amount as paidAmount, a.balance_amount as balance,
              a.status, DATE_FORMAT(a.created_at, '%Y-%m-%d') as createdAt
        FROM ap_invoices a
        LEFT JOIN suppliers s ON a.supplier_id = s.id
        ${whereClause}
        ORDER BY a.invoice_date DESC, a.id DESC
        LIMIT ${numPageSize} OFFSET ${offset}`;

      // 使用 query 而不是 execute，避免 LIMIT/OFFSET 参数化问题
      const [invoices] = await db.pool.query(dataQuery, params);

      // 返回结果
      return {
        data: invoices,
        total,
        page: numPage,
        pageSize: numPageSize,
      };
  },

  /**
   * 更新应付账款发票状态
   */
  updateInvoiceStatus: async (id, status, options = {}) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [invoices] = await connection.execute(
        `SELECT a.*, s.name as supplier_name
         FROM ap_invoices a
         LEFT JOIN suppliers s ON a.supplier_id = s.id
         WHERE a.id = ?
         FOR UPDATE`,
        [id]
      );

      if (invoices.length === 0) {
        await connection.rollback();
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
          'UPDATE ap_invoices SET status = ?, updated_at = NOW() WHERE id = ?',
          [status, id]
        );
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('更新应付账款发票状态失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 更新应付账款发票
   */
  updateInvoice: async (invoiceData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [currentInvoice] = await connection.execute(
        `SELECT id, status, invoice_number, supplier_id, invoice_date, due_date,
                total_amount, paid_amount, balance_amount
         FROM ap_invoices
         WHERE id = ?
         FOR UPDATE`,
        [invoiceData.id]
      );
      if (currentInvoice.length === 0) {
        throw new Error('发票不存在');
      }

      const current = currentInvoice[0];
      if (current.status !== INVOICE_STATUS.DRAFT) {
        const hasFinancialChange =
          (invoiceData.total_amount !== undefined &&
            Math.abs(parseFloat(invoiceData.total_amount || 0) - parseFloat(current.total_amount || 0)) >
              0.01) ||
          (invoiceData.invoice_number && invoiceData.invoice_number !== current.invoice_number) ||
          (invoiceData.supplier_id &&
            Number(invoiceData.supplier_id) !== Number(current.supplier_id)) ||
          (invoiceData.invoice_date && String(invoiceData.invoice_date) !== String(current.invoice_date)) ||
          (invoiceData.due_date && String(invoiceData.due_date) !== String(current.due_date)) ||
          (Array.isArray(invoiceData.items) && invoiceData.items.length > 0);

        if (hasFinancialChange) {
          throw new Error(
            `当前状态 "${current.status}" 已进入财务闭环，只能修改备注/供应商发票号；金额或明细调整请走红字或调整流程`
          );
        }

        await connection.execute(
          `UPDATE ap_invoices
           SET supplier_invoice_number = COALESCE(?, supplier_invoice_number),
               notes = ?,
               updated_at = NOW()
           WHERE id = ?`,
          [
            invoiceData.supplier_invoice_number || null,
            invoiceData.notes ?? null,
            invoiceData.id,
          ]
        );

        await connection.commit();
        return true;
      }

      // 更新发票主数据（供应商发票号、备注等始终可更新）
      await connection.execute(
        `UPDATE ap_invoices 
         SET invoice_number = ?, supplier_invoice_number = ?, supplier_id = ?, invoice_date = ?, 
             due_date = ?, total_amount = ?, balance_amount = ?, notes = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          invoiceData.invoice_number,
          invoiceData.supplier_invoice_number || null,
          invoiceData.supplier_id,
          invoiceData.invoice_date,
          invoiceData.due_date,
          invoiceData.total_amount,
          invoiceData.total_amount - (invoiceData.paid_amount || 0), // 重新计算余额
          invoiceData.notes || null,
          invoiceData.id,
        ]
      );

      // 草稿发票允许按当前提交重建明细
      if (invoiceData.items && Array.isArray(invoiceData.items)) {
        // 删除旧的明细项
        await connection.execute('DELETE FROM ap_invoice_items WHERE invoice_id = ?', [
          invoiceData.id,
        ]);

        if (invoiceData.items.length > 0) {
          // 批量插入新明细项（1次SQL替代N次）
          const itemValues = invoiceData.items.map(item => [
            invoiceData.id,
            item.materialId,
            item.description || '',
            item.quantity,
            item.unitPrice,
            item.amount,
          ]);
          await connection.query(
            `INSERT INTO ap_invoice_items
             (invoice_id, material_id, description, quantity, unit_price, amount)
             VALUES ?`,
            [itemValues]
          );
        }
      }

      // ===== 自动同步供应商发票号到税务发票 =====
      if (invoiceData.supplier_invoice_number) {
        // 通过 source_id 精确匹配（AP发票直接关联采购入库单）
        const [apSource] = await connection.execute(
          'SELECT source_type, source_id FROM ap_invoices WHERE id = ?',
          [invoiceData.id]
        );
        if (apSource.length > 0 && apSource[0].source_type === 'purchase_receipt' && apSource[0].source_id) {
          const [syncResult] = await connection.execute(
            `UPDATE tax_invoices 
             SET invoice_number = ?, updated_at = NOW() 
             WHERE related_document_type = '采购入库单' AND related_document_id = ?`,
            [invoiceData.supplier_invoice_number, apSource[0].source_id]
          );
          if (syncResult.affectedRows > 0) {
            logger.info('[AP→Tax同步] 供应商发票号同步成功', {
              apInvoiceId: invoiceData.id,
              supplierInvoiceNumber: invoiceData.supplier_invoice_number,
              receiptId: apSource[0].source_id
            });
          }
        }
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('更新应付账款发票失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 创建付款记录
   */
  createPayment: async (paymentData, paymentItems) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      if (
        BANK_BACKED_PAYMENT_METHODS.has(paymentData.payment_method) &&
        !paymentData.bank_account_id
      ) {
        throw new Error(`${paymentData.payment_method}必须选择付款账户`);
      }

      // 插入付款记录
      const [result] = await connection.execute(
        `INSERT INTO ap_payments 
        (payment_number, supplier_id, payment_date, total_amount, 
         payment_method, reference_number, bank_account_id, notes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentData.payment_number,
          paymentData.supplier_id,
          paymentData.payment_date,
          paymentData.total_amount,
          paymentData.payment_method,
          paymentData.reference_number || null,
          paymentData.bank_account_id || null,
          paymentData.notes || null,
        ]
      );

      const paymentId = result.insertId;
      let bankTransactionId = null;
      let glEntryId = null;
      let glEntryNumber = null;
      const linkedInvoices = [];

      const sortedPaymentItems = [...paymentItems].sort(
        (a, b) => Number(a.invoice_id) - Number(b.invoice_id)
      );
      const requestedTotalCents = toCents(paymentData.total_amount);
      const itemsTotalCents = sortedPaymentItems.reduce(
        (sum, item) => sum + toCents(item.amount),
        0
      );
      if (requestedTotalCents !== itemsTotalCents) {
        throw new Error('付款单总金额必须等于付款明细金额合计');
      }

      // 插入付款明细并更新发票状态
      let totalPaidCents = 0;
      for (const item of sortedPaymentItems) {
        // 获取发票当前信息
        const [invoices] = await connection.execute(
          'SELECT * FROM ap_invoices WHERE id = ? FOR UPDATE',
          [item.invoice_id]
        );

        if (invoices.length === 0) {
          throw new Error(`发票ID ${item.invoice_id} 不存在`);
        }

        const invoice = invoices[0];
        linkedInvoices.push({ id: invoice.id, invoice_number: invoice.invoice_number });
        if (!SETTLEMENT_STATUSES.has(invoice.status)) {
          throw new Error(`发票 ${invoice.invoice_number} 当前状态为"${invoice.status}"，不能直接付款`);
        }

        // 插入付款明细
        await connection.execute(
          'INSERT INTO ap_payment_items (payment_id, invoice_id, amount, discount_amount) VALUES (?, ?, ?, ?)',
          [paymentId, item.invoice_id, item.amount, item.discount_amount || 0]
        );

        // ===== [H-3] 超额付款校验 =====
        const currentBalance = toCents(invoice.balance_amount);
        const payAmount = toCents(item.amount);
        if (payAmount > currentBalance + 1) {
          // 允许1分钱容差（浮点数取整误差）
          throw new Error(`付款金额 ${item.amount} 超过发票 ${invoice.invoice_number} 余额 ${invoice.balance_amount}`);
        }

        // ===== [H-2] 整数化精度控制 =====
        const paidAmountCents = toCents(invoice.paid_amount) + payAmount;
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
          'UPDATE ap_invoices SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, Math.max(0, newBalanceAmount), newStatus, item.invoice_id]
        );

        totalPaidCents += Math.round(parseFloat(item.amount) * 100);
      }

      const totalPaid = totalPaidCents / 100;

      // 如果是银行类付款，更新银行账户余额并创建银行交易记录
      if (BANK_BACKED_PAYMENT_METHODS.has(paymentData.payment_method)) {
        // 获取银行账户信息
        const [bankAccounts] = await connection.execute(
          'SELECT * FROM bank_accounts WHERE id = ? FOR UPDATE',
          [paymentData.bank_account_id]
        );

        if (bankAccounts.length === 0) {
          throw new Error(`银行账户ID ${paymentData.bank_account_id} 不存在`);
        }

        const bankAccount = bankAccounts[0];
        if (bankAccount.is_active === 0) {
          throw new Error(`银行账户 "${bankAccount.account_name}" 已被冻结，无法用于付款`);
        }

        // 创建银行交易记录
        const [bankTransactionResult] = await connection.execute(
          `INSERT INTO bank_transactions
          (transaction_number, bank_account_id, transaction_date, transaction_type,
          amount, reference_number, description, is_reconciled, related_party,
          related_invoice_id, related_invoice_type, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            paymentData.payment_number,
            paymentData.bank_account_id,
            paymentData.payment_date,
            '转出',
            totalPaid,
            paymentData.reference_number || null,
            `应付账款付款 - 供应商: ${paymentData.supplier_name || '未知供应商'}` +
              (sortedPaymentItems.length > 1 ? ` (含${sortedPaymentItems.length}张发票)` : ''),
            false,
            paymentData.supplier_name || '未知供应商',
            sortedPaymentItems[0]?.invoice_id || null,
            'AP',
            'approved',
          ]
        );
        bankTransactionId = bankTransactionResult.insertId;

        await connection.execute(
          'UPDATE bank_accounts SET current_balance = current_balance - ? WHERE id = ?',
          [totalPaid, paymentData.bank_account_id]
        );

        logger.info(`[AP付款] 银行账户余额已更新: ${bankAccount.account_name}`);
      }

      const glEntry = await buildPaymentGlEntry(connection, paymentData);
      // 创建付款会计分录
      if (glEntry) {
        const entryData = {
          entry_number: glEntry.entry_number,
          entry_date: paymentData.payment_date,
          posting_date: paymentData.payment_date,
          document_type: DOCUMENT_TYPE_MAPPING.PURCHASE_PAYMENT,
          document_number: paymentData.payment_number,
          period_id: glEntry.period_id,
          description: `供应商 ${paymentData.supplier_name} 付款`,
          created_by: glEntry.created_by,
          status: 'posted',
          is_posted: 1,
        };

        // 付款分录明细
        const entryItems = [
          // 借：应付账款
          {
            account_id: glEntry.payable_account_id,
            debit_amount: totalPaid,
            credit_amount: 0,
            description: `应付账款减少 - 付款单号: ${paymentData.payment_number}`,
          },
          // 贷：银行/现金
          {
            account_id: glEntry.bank_account_id,
            debit_amount: 0,
            credit_amount: totalPaid,
            description: `付款 - 付款单号: ${paymentData.payment_number}`,
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
          'ap_invoice',
          invoice.id,
          invoice.invoice_number,
          'ap_payment',
          paymentId,
          paymentData.payment_number,
          paymentData.created_by || null,
          connection
        );
      }
      if (glEntryId) {
        await DocumentLinkService.tryAutoLink(
          'ap_payment',
          paymentId,
          paymentData.payment_number,
          'finance_voucher',
          glEntryId,
          glEntryNumber,
          glEntry.created_by,
          connection
        );
      }
      if (bankTransactionId) {
        await DocumentLinkService.tryAutoLink(
          'ap_payment',
          paymentId,
          paymentData.payment_number,
          'bank_transaction',
          bankTransactionId,
          paymentData.payment_number,
          paymentData.created_by || null,
          connection
        );
      }
      if (bankTransactionId && glEntryId) {
        await linkBankTransactionToVoucher(
          connection,
          bankTransactionId,
          paymentData.payment_number,
          glEntryId,
          paymentData.created_by || glEntry?.created_by || null
        );
      }

      await connection.commit();
      return paymentId;
    } catch (error) {
      await connection.rollback();
      logger.error('创建付款记录失败:', {
        error: error.message,
        paymentNumber: paymentData.payment_number,
        supplierId: paymentData.supplier_id,
        totalAmount: paymentData.total_amount,
        paymentMethod: paymentData.payment_method,
        stack: error.stack,
      });
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 获取付款记录
   */
  getPaymentById: async (id) => {
    try {
      // 获取付款记录
      const [payments] = await db.pool.execute(
        `SELECT p.id, p.payment_number, p.supplier_id, 
                DATE_FORMAT(p.payment_date, '%Y-%m-%d') as payment_date,
                p.total_amount, p.payment_method, p.reference_number,
                p.bank_account_id, p.notes,
                DATE_FORMAT(p.created_at, '%Y-%m-%d') as created_at,
                s.name as supplier_name, b.account_name as bank_account_name
         FROM ap_payments p
         LEFT JOIN suppliers s ON p.supplier_id = s.id
         LEFT JOIN bank_accounts b ON p.bank_account_id = b.id
         WHERE p.id = ?`,
        [id]
      );

      if (payments.length === 0) return null;

      const payment = payments[0];

      // 获取付款明细
      const [items] = await db.pool.execute(
        `SELECT pi.*, i.invoice_number
         FROM ap_payment_items pi
         LEFT JOIN ap_invoices i ON pi.invoice_id = i.id
         WHERE pi.payment_id = ?`,
        [id]
      );

      payment.items = items;

      return payment;
    } catch (error) {
      logger.error('获取付款记录失败:', error);
      throw error;
    }
  },

  /**
   * 获取付款记录列表
   */
  getPayments: async (filters = {}, page = 1, pageSize = 20) => {
    try {
      // 确保page和pageSize是数字
      const numPage = parseInt(page) || 1;
      const numPageSize = parseInt(pageSize) || 20;
      const offset = (numPage - 1) * numPageSize;

      // 构建查询，直接关联供应商表获取供应商名称，并通过付款明细表关联获取发票编号
      let query = `
        SELECT p.id, p.payment_number, p.supplier_id, 
               DATE_FORMAT(p.payment_date, '%Y-%m-%d') as payment_date,
               p.total_amount, p.payment_method, p.reference_number,
               p.bank_account_id, p.notes, p.status,
               DATE_FORMAT(p.created_at, '%Y-%m-%d') as created_at,
               s.name as supplier_name,
               (SELECT i.invoice_number 
                FROM ap_payment_items pi 
                JOIN ap_invoices i ON pi.invoice_id = i.id 
                WHERE pi.payment_id = p.id 
                LIMIT 1) as invoice_number
        FROM ap_payments p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE 1=1
      `;

      const params = [];

      // 添加过滤条件
      if (filters.payment_number) {
        query += ' AND p.payment_number LIKE ?';
        params.push(`%${filters.payment_number}%`);
      }

      if (filters.supplier_id) {
        query += ' AND p.supplier_id = ?';
        params.push(filters.supplier_id);
      }

      if (filters.supplier_name) {
        query += ' AND s.name LIKE ?';
        params.push(`%${filters.supplier_name}%`);
      }

      if (filters.start_date && filters.end_date) {
        query += ' AND p.payment_date BETWEEN ? AND ?';
        params.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        query += ' AND p.payment_date >= ?';
        params.push(filters.start_date);
      } else if (filters.end_date) {
        query += ' AND p.payment_date <= ?';
        params.push(filters.end_date);
      }

      if (filters.payment_method) {
        query += ' AND p.payment_method = ?';
        params.push(filters.payment_method);
      }

      // 添加状态筛选
      if (filters.status) {
        query += ' AND p.status = ?';
        params.push(filters.status);
      }

      // 使用直接拼接进行分页（LIMIT/OFFSET已经过严格验证）
      query += ` ORDER BY p.payment_date DESC, p.id DESC LIMIT ${numPageSize} OFFSET ${offset}`;

      // 使用 query 而不是 execute，避免 LIMIT/OFFSET 参数化问题
      const [payments] = await db.pool.query(query, params);

      // 获取总记录数（与主查询相同的 JOIN 结构）
      let countQuery = `
        SELECT COUNT(*) as total 
        FROM ap_payments p
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE 1=1
      `;

      const countParams = [];

      // 添加与主查询相同的过滤条件
      if (filters.payment_number) {
        countQuery += ' AND p.payment_number LIKE ?';
        countParams.push(`%${filters.payment_number}%`);
      }

      if (filters.supplier_id) {
        countQuery += ' AND p.supplier_id = ?';
        countParams.push(filters.supplier_id);
      }

      if (filters.supplier_name) {
        countQuery += ' AND s.name LIKE ?';
        countParams.push(`%${filters.supplier_name}%`);
      }

      if (filters.start_date && filters.end_date) {
        countQuery += ' AND p.payment_date BETWEEN ? AND ?';
        countParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        countQuery += ' AND p.payment_date >= ?';
        countParams.push(filters.start_date);
      } else if (filters.end_date) {
        countQuery += ' AND p.payment_date <= ?';
        countParams.push(filters.end_date);
      }

      if (filters.payment_method) {
        countQuery += ' AND p.payment_method = ?';
        countParams.push(filters.payment_method);
      }

      // 添加状态筛选
      if (filters.status) {
        countQuery += ' AND p.status = ?';
        countParams.push(filters.status);
      }

      const [countResult] = await db.pool.execute(countQuery, countParams);
      const total = countResult[0].total;

      return {
        payments,
        pagination: {
          total,
          page: numPage,
          pageSize: numPageSize,
          totalPages: Math.ceil(total / numPageSize),
        },
      };
    } catch (error) {
      logger.error('获取付款记录列表失败:', error);
      throw error;
    }
  },

  /**
   * 作废付款记录
   * @param {number} paymentId - 付款记录ID
   * @param {Object} voidData - 作废信息
   * @param {number} voidData.voided_by - 作废人ID
   * @param {string} voidData.void_reason - 作废原因
   */
  voidPayment: async (paymentId, voidData) => {
    let connection = null;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();
      const voidedBy = Number.parseInt(voidData.voided_by, 10);
      if (!Number.isInteger(voidedBy) || voidedBy <= 0) {
        throw new Error('voided_by must be a positive integer');
      }

      // 1. 获取付款记录详情
      const [payments] = await connection.execute(
        `SELECT p.*, pi.invoice_id, pi.amount as item_amount
         FROM ap_payments p
         LEFT JOIN ap_payment_items pi ON p.id = pi.payment_id
         WHERE p.id = ?
         FOR UPDATE`,
        [paymentId]
      );

      if (payments.length === 0) {
        throw new Error('付款记录不存在');
      }

      const payment = payments[0];
      let originalBankTransactionId = null;
      let originalBankTransactionNumber = null;
      let reversalBankTransactionId = null;
      let reversalBankTransactionNumber = null;
      const reversalEntries = [];

      // 2. 验证状态（只能作废正常状态的记录）
      if (payment.status === 'void') {
        throw new Error('该付款记录已经作废，无法重复作废');
      }

      // 3. 更新付款记录状态为作废
      await connection.execute(
        `UPDATE ap_payments 
         SET status = 'void', 
             voided_at = NOW(), 
             voided_by = ?, 
             void_reason = ?
         WHERE id = ?`,
        [voidedBy, voidData.void_reason, paymentId]
      );

      // 4. 恢复关联发票的余额和状态
      for (const item of payments) {
        if (!item.invoice_id) continue;

        // 获取发票当前信息
        const [invoices] = await connection.execute(
          'SELECT * FROM ap_invoices WHERE id = ? FOR UPDATE',
          [item.invoice_id]
        );

        if (invoices.length === 0) continue;

        const invoice = invoices[0];

        // [H-2 补链] 计算恢复后的金额 — 整数化精度控制（与 createPayment 对齐）
        const paidAmountCents = Math.round(parseFloat(invoice.paid_amount) * 100) - Math.round(parseFloat(item.item_amount) * 100);
        const totalAmountCents = Math.round(parseFloat(invoice.total_amount) * 100);
        const newPaidAmount = Math.max(0, paidAmountCents) / 100;
        const newBalanceAmount = (totalAmountCents - Math.max(0, paidAmountCents)) / 100;

        // 确定新的状态
        let newStatus;
        if (newPaidAmount <= 0.001) {
          newStatus = '已确认'; // 完全未付款
        } else if (newBalanceAmount > 0.001) {
          newStatus = '部分付款';
        } else {
          newStatus = '已付款';
        }

        // 更新发票
        await connection.execute(
          'UPDATE ap_invoices SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, Math.max(0, newBalanceAmount), newStatus, item.invoice_id]
        );

        logger.info(`[作废付款] 已恢复发票 ${invoice.invoice_number} 的余额: ${newBalanceAmount}`);
      }

      // 5. 如果有银行交易记录，创建冲销交易
      if (
        payment.bank_account_id &&
        BANK_BACKED_PAYMENT_METHODS.has(payment.payment_method)
      ) {
        try {
          // 获取原银行交易记录
          const [bankTxs] = await connection.execute(
            `SELECT * FROM bank_transactions 
             WHERE transaction_number = ? AND bank_account_id = ?
             LIMIT 1
             FOR UPDATE`,
            [payment.payment_number, payment.bank_account_id]
          );

          if (bankTxs.length > 0) {
            const originalTx = bankTxs[0];
            const reversalDate = new Date().toISOString().slice(0, 10);
            originalBankTransactionId = originalTx.id;
            originalBankTransactionNumber = originalTx.transaction_number;
            reversalBankTransactionNumber = `${payment.payment_number}-VOID`;

            const [bankAccounts] = await connection.execute(
              'SELECT id FROM bank_accounts WHERE id = ? FOR UPDATE',
              [payment.bank_account_id]
            );
            if (bankAccounts.length === 0) {
              throw new Error('付款账户不存在，无法冲销银行交易');
            }

            // 创建冲销交易（转入，增加余额）
            const [reversalBankTxResult] = await connection.execute(
              `INSERT INTO bank_transactions
               (transaction_number, bank_account_id, transaction_date, transaction_type,
               amount, reference_number, description, is_reconciled, related_party, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                reversalBankTransactionNumber,
                payment.bank_account_id,
                reversalDate,
                '转入', // 冲销付款是转入（退回资金）
                payment.total_amount,
                payment.payment_number,
                `冲销付款记录 - 原因: ${voidData.void_reason}`,
                false,
                originalTx.related_party || '',
                'approved',
              ]
            );
            reversalBankTransactionId = reversalBankTxResult.insertId;

            // 更新银行账户余额（增加余额）
            await connection.execute(
              'UPDATE bank_accounts SET current_balance = current_balance + ? WHERE id = ?',
              [payment.total_amount, payment.bank_account_id]
            );

            logger.info('[作废付款] 已创建冲销银行交易并更新账户余额');
          }
        } catch (err) {
          logger.error(`[作废付款] 冲销银行交易失败: ${err.message}`);
          throw new Error(`冲销银行交易失败: ${err.message}`, { cause: err });
        }
      }

      // 6. 冲销关联的会计凭证（付款单号作为document_number）
      try {
        const [glEntries] = await connection.execute(
          `SELECT id FROM gl_entries 
           WHERE document_number = ? AND document_type IN ('付款单', 'PURCHASE_PAYMENT') AND (is_reversed IS NULL OR is_reversed = 0)`,
          [payment.payment_number]
        );

        if (glEntries.length > 0) {
          for (const glEntry of glEntries) {
            // 获取原分录明细
            const [items] = await connection.execute(
              'SELECT * FROM gl_entry_items WHERE entry_id = ?',
              [glEntry.id]
            );

            const reversalDocumentNumber = `${payment.payment_number}-VOID`;
            const reversalDate = new Date().toISOString().slice(0, 10);
            const periodId = await getOpenPeriodIdByDate(connection, reversalDate);

            const reversalEntryId = await financeModel.createEntry(
              {
                entry_date: reversalDate,
                posting_date: reversalDate,
                document_type: DOCUMENT_TYPE_MAPPING.PURCHASE_PAYMENT,
                document_number: reversalDocumentNumber,
                period_id: periodId,
                description: `冲销付款凭证 - 原因: ${voidData.void_reason}`,
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

            logger.info(`[作废付款] 已冲销GL凭证 ID=${glEntry.id}, 冲销凭证 ID=${reversalEntryId}`);
          }
        }
      } catch (err) {
        logger.error(`[作废付款] 冲销GL凭证失败: ${err.message}`);
        throw new Error(`冲销GL凭证失败: ${err.message}`, { cause: err });
      }

      for (const reversalEntry of reversalEntries) {
        await DocumentLinkService.tryAutoLink(
          'ap_payment',
          paymentId,
          payment.payment_number,
          'finance_voucher',
          reversalEntry.entryId,
          reversalEntry.entryNumber,
          voidedBy,
          connection
        );
      }

      if (reversalBankTransactionId) {
        await DocumentLinkService.tryAutoLink(
          'ap_payment',
          paymentId,
          payment.payment_number,
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
            remark: 'AP payment void reversal',
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
      logger.info(`[作废付款] 付款记录 ${payment.payment_number} 已成功作废`);

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
      logger.error('作废付款记录失败:', error);
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
   * 获取供应商应付账款汇总
   */
  getSupplierPayables: async (supplierId = null) => {
    try {
      let query = `
        SELECT 
          s.id AS supplier_id,
          s.supplier_name,
          COUNT(a.id) AS invoice_count,
          SUM(a.total_amount) AS total_amount,
          SUM(a.paid_amount) AS paid_amount,
          SUM(a.balance_amount) AS balance_amount
        FROM suppliers s
        LEFT JOIN ap_invoices a ON s.id = a.supplier_id AND a.status != '已取消'
      `;

      const params = [];

      if (supplierId) {
        query += ' WHERE s.id = ?';
        params.push(supplierId);
      }

      query += ' GROUP BY s.id, s.supplier_name ORDER BY balance_amount DESC';

      const [results] = await db.pool.execute(query, params);
      return results;
    } catch (error) {
      logger.error('获取供应商应付账款汇总失败:', error);
      throw error;
    }
  },

  /**
   * 获取应付账款账龄分析
   */
  getPayablesAging: async (supplierId = null, asOfDate = null) => {
    try {
      // 如果没有指定日期，使用当前日期
      const currentDate = asOfDate || new Date().toISOString().split('T')[0];

      let query = `
        SELECT 
          s.id AS supplier_id,
          s.supplier_name,
          SUM(CASE WHEN DATEDIFF(?, a.due_date) <= 0 THEN a.balance_amount ELSE 0 END) AS current_amount,
          SUM(CASE WHEN DATEDIFF(?, a.due_date) BETWEEN 1 AND 30 THEN a.balance_amount ELSE 0 END) AS '1_30_days',
          SUM(CASE WHEN DATEDIFF(?, a.due_date) BETWEEN 31 AND 60 THEN a.balance_amount ELSE 0 END) AS '31_60_days',
          SUM(CASE WHEN DATEDIFF(?, a.due_date) BETWEEN 61 AND 90 THEN a.balance_amount ELSE 0 END) AS '61_90_days',
          SUM(CASE WHEN DATEDIFF(?, a.due_date) > 90 THEN a.balance_amount ELSE 0 END) AS 'over_90_days',
          SUM(a.balance_amount) AS total_amount
        FROM suppliers s
        LEFT JOIN ap_invoices a ON s.id = a.supplier_id AND a.status != '已付款' AND a.status != '已取消'
      `;

      const params = [currentDate, currentDate, currentDate, currentDate, currentDate];

      if (supplierId) {
        query += ' WHERE s.id = ?';
        params.push(supplierId);
      }

      query += ' GROUP BY s.id, s.supplier_name HAVING total_amount > 0 ORDER BY total_amount DESC';

      const [results] = await db.pool.execute(query, params);
      return results;
    } catch (error) {
      logger.error('获取应付账款账龄分析失败:', error);
      throw error;
    }
  },

  /**
   * 获取未付清的应付账款发票列表
   */
  getUnpaidInvoices: async () => {
    // 查询可付款的未付清发票（草稿必须先确认，不能直接付款）
    const [invoices] = await db.pool.execute(
      `SELECT a.id, a.invoice_number as invoiceNumber, 
              a.supplier_id as supplierId, s.name as supplierName,
              DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoiceDate, 
              DATE_FORMAT(a.due_date, '%Y-%m-%d') as dueDate,
              ROUND(a.total_amount, 2) as amount,
              ROUND(a.paid_amount, 2) as paidAmount,
              ROUND(a.balance_amount, 2) as balance,
              a.status
       FROM ap_invoices a
       LEFT JOIN suppliers s ON a.supplier_id = s.id
       WHERE a.status IN ('已确认', '部分付款', '已逾期')
       AND a.balance_amount > 0
       ORDER BY a.due_date ASC, a.id ASC`
    );

    // 转换金额为数字类型
    const formattedInvoices = invoices.map((invoice) => ({
      ...invoice,
      amount: parseFloat(invoice.amount),
      paidAmount: parseFloat(invoice.paidAmount),
      balance: parseFloat(invoice.balance),
    }));

    return formattedInvoices;
  },

  /**
   * 获取发票关联的付款记录
   */
  getInvoicePayments: async (invoiceId) => {
    // 通过付款项表查询与发票关联的所有付款记录
    const [payments] = await db.pool.execute(
      `SELECT p.id, p.payment_number as paymentNumber, 
              DATE_FORMAT(p.payment_date, '%Y-%m-%d') as paymentDate, 
              p.payment_method as paymentMethod,
              pi.amount, pi.discount_amount as discountAmount,
              p.notes, DATE_FORMAT(p.created_at, '%Y-%m-%d') as createdAt
       FROM ap_payment_items pi
       JOIN ap_payments p ON pi.payment_id = p.id
       WHERE pi.invoice_id = ?
       ORDER BY p.payment_date DESC, p.id DESC`,
      [invoiceId]
    );

    // 转换金额为数字类型
    const formattedPayments = payments.map((payment) => ({
      ...payment,
      amount: parseFloat(payment.amount),
      discountAmount: parseFloat(payment.discountAmount || 0),
      // 转换付款方式为前端可读显示
      paymentMethodDisplay: (() => {
        const methodMap = {
          现金: '现金',
          银行转账: '银行转账',
          支票: '支票',
          信用卡: '信用卡',
          微信: '微信',
          支付宝: '支付宝',
        };
        return methodMap[payment.paymentMethod] || payment.paymentMethod;
      })(),
    }));

    return formattedPayments;
  },

  /**
   * 获取逾期的应付发票
   * @param {string} asOfDate - 检查日期，格式YYYY-MM-DD
   * @returns {Promise<Array>} 逾期发票列表
   */
  getOverdueInvoices: async (asOfDate) => {
    try {
      const [invoices] = await db.pool.execute(
        `SELECT a.id, a.invoice_number, a.supplier_id, s.name as supplier_name,
                DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoice_date,
                DATE_FORMAT(a.due_date, '%Y-%m-%d') as due_date,
                a.total_amount, a.paid_amount, a.balance_amount, a.status
         FROM ap_invoices a
         LEFT JOIN suppliers s ON a.supplier_id = s.id
         WHERE a.due_date < ?
           AND a.balance_amount > 0
           AND a.status NOT IN ('已付款', '已取消', 'void')
         ORDER BY a.due_date ASC
         LIMIT 100`,
        [asOfDate]
      );

      return invoices || [];
    } catch (error) {
      logger.error('获取逾期应付发票失败:', error);
      return [];
    }
  },
};

module.exports = apModel;
