/**
 * ar.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const db = require('../config/db');
const financeModel = require('./finance');
const { accountingConfig } = require('../config/accountingConfig');
const { financeConfig } = require('../config/financeConfig');
const {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_MAPPING,
  INVOICE_STATUS,
  MANUAL_INVOICE_STATUS_TRANSITIONS,
  BANK_BACKED_PAYMENT_METHODS,
} = require('../constants/financeConstants');
const DocumentLinkService = require('../services/business/DocumentLinkService');
const VoucherReversalService = require('../services/finance/VoucherReversalService');
const { currentDateString, toLocalDateString } = require('../utils/dateUtils');
const {
  toCents,
  fromCents,
  parseSettlementLine,
  assertWithinBalance,
  invoiceStatusAfterSettlement,
  isTruthyFlag,
  assertInvoiceSettlementsEligible,
} = require('../utils/finance/settlementMath');
const { applyNormalizedInvoiceAmounts } = require('../utils/finance/invoiceAmounts');
const { toInvoiceApi } = require('../utils/finance/invoiceFieldMap');

const resolveInvoiceItemAmount = (item) =>
  item.amount !== undefined && item.amount !== null
    ? parseFloat(item.amount)
    : (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);

const assertInvoiceItemsMatchTotal = (items, totalAmount, invoiceData = {}) => {
  if (!Array.isArray(items) || items.length === 0) return;

  const totalCents = toCents(totalAmount);
  const subtotalCents = toCents(
    invoiceData.amount_excluding_tax ?? invoiceData.subtotal ?? invoiceData.subtotal_amount
  );
  const taxCents = toCents(invoiceData.tax_amount);
  const itemTotalCents = items.reduce(
    (sum, item) => sum + toCents(resolveInvoiceItemAmount(item)),
    0
  );
  if (subtotalCents > 0 && taxCents > 0 && itemTotalCents === subtotalCents) {
    return;
  }
  if (itemTotalCents !== totalCents) {
    throw new Error(
      `应收发票明细合计 ${fromCents(itemTotalCents).toFixed(2)} 与发票总额 ${fromCents(totalCents).toFixed(2)} 不一致`
    );
  }
};

const normalizeInvoiceAmountPolicy = (invoiceData) => {
  const totalCents = toCents(invoiceData.total_amount);
  if (totalCents < 0 && invoiceData.source_type !== 'sales_return') {
    throw new Error('Negative AR invoices must be sales_return credit notes');
  }

  return {
    totalAmount: fromCents(totalCents),
    absoluteAmount: Math.abs(totalCents) / 100,
    isCreditNote: totalCents < 0,
  };
};

const getOpenPeriodIdByDate = async (connection, entryDate) => {
  const date = toLocalDateString(entryDate || currentDateString());
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

const assertManualStatusTransition = (currentStatus, nextStatus, invoice = null) => {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedTargets = MANUAL_INVOICE_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowedTargets.includes(nextStatus)) {
    throw new Error(
      `不允许从"${currentStatus}"手工变更为"${nextStatus}"；收款状态只能由收款/作废流程自动维护`
    );
  }

  if (
    nextStatus === INVOICE_STATUS.CANCELLED &&
    [INVOICE_STATUS.CONFIRMED, INVOICE_STATUS.OVERDUE].includes(currentStatus)
  ) {
    const paid = Math.abs(toCents(invoice?.paid_amount || 0));
    if (paid > 0) {
      throw new Error('发票已有收款记录，不能直接取消；请先作废相关收款');
    }
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
  const [entries] = await connection.execute('SELECT entry_number FROM gl_entries WHERE id = ?', [
    entryId,
  ]);
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

const createInvoiceConfirmationEntry = async (connection, invoice, createdBy = null) => {
  const { resolveActorUserId } = require('../utils/userUtils');
  createdBy = await resolveActorUserId(
    connection,
    createdBy,
    invoice.created_by,
    invoice.updated_by,
    invoice.gl_entry?.created_by
  );
  const shouldCreateEntry = await ensureNoActiveInvoiceEntry(connection, invoice.invoice_number);
  if (!shouldCreateEntry) {
    return null;
  }

  await accountingConfig.loadFromDatabase(db);
  await financeConfig.loadFromDatabase(db);
  const receivableAccountId =
    invoice.gl_entry?.receivable_account_id ||
    (await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('ACCOUNTS_RECEIVABLE'),
      '应收账款'
    ));
  const incomeAccountId =
    invoice.gl_entry?.income_account_id ||
    (await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('SALES_REVENUE'),
      '销售收入'
    ));
  // 价税分离：有税额时贷记销项税，避免收入含税
  const outputTaxAccountId =
    invoice.gl_entry?.output_tax_account_id ||
    (await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('VAT_OUTPUT_TAX'),
      '销项税额'
    ).catch(() => null));

  const periodId = await getOpenPeriodIdByDate(connection, invoice.invoice_date);
  const amountPolicy = normalizeInvoiceAmountPolicy(invoice);
  const totalAbs = amountPolicy.absoluteAmount;
  const taxAbs = Math.abs(toCents(invoice.tax_amount || 0)) / 100;
  let netAbs = Math.abs(
    toCents(invoice.amount_excluding_tax ?? invoice.subtotal ?? invoice.subtotal_amount ?? 0)
  ) / 100;
  if (netAbs <= 0 && totalAbs > 0) {
    netAbs = Math.max(0, Math.round((totalAbs - taxAbs) * 100) / 100);
  }
  // 价税分离：税额>0 时必须拆分；fail-closed 时禁止降级为收入含税两行
  const { TAX_SPLIT_FAIL_CLOSED } = require('../constants/financeConstants');
  const canSplitTax =
    taxAbs > 0.0001 && outputTaxAccountId && Math.abs(netAbs + taxAbs - totalAbs) <= 0.02;
  if (taxAbs > 0.0001 && !canSplitTax) {
    if (TAX_SPLIT_FAIL_CLOSED) {
      if (!outputTaxAccountId) {
        throw new Error('未配置销项税科目(VAT_OUTPUT_TAX)，禁止确认含税应收发票（价税分离 fail-closed）');
      }
      throw new Error(
        `价税金额不平（未税 ${netAbs} + 税 ${taxAbs} ≠ 合计 ${totalAbs}），禁止确认发票`
      );
    }
    logger.warn('[AR] 价税分离失败，降级两行价税合计', {
      invoiceNumber: invoice.invoice_number,
      netAbs,
      taxAbs,
      totalAbs,
    });
  }
  const splitTax = canSplitTax;
  const currency = invoice.currency_code || financeConfig.get('invoice.defaultCurrency', 'CNY');
  const rate = invoice.exchange_rate || 1;
  const isCn = amountPolicy.isCreditNote;

  const customerId = invoice.customer_id ? Number(invoice.customer_id) : null;
  const items = splitTax
    ? [
        {
          account_id: receivableAccountId,
          debit_amount: isCn ? 0 : totalAbs,
          credit_amount: isCn ? totalAbs : 0,
          currency_code: currency,
          exchange_rate: rate,
          customer_id: customerId,
          description: `应收账款(价税合计) - 发票号: ${invoice.invoice_number}`,
        },
        {
          account_id: incomeAccountId,
          debit_amount: isCn ? netAbs : 0,
          credit_amount: isCn ? 0 : netAbs,
          currency_code: currency,
          exchange_rate: rate,
          description: `销售收入(未税) - 发票号: ${invoice.invoice_number}`,
        },
        {
          account_id: outputTaxAccountId,
          debit_amount: isCn ? taxAbs : 0,
          credit_amount: isCn ? 0 : taxAbs,
          currency_code: currency,
          exchange_rate: rate,
          description: `销项税额 - 发票号: ${invoice.invoice_number}`,
        },
      ]
    : [
        {
          account_id: receivableAccountId,
          debit_amount: isCn ? 0 : totalAbs,
          credit_amount: isCn ? totalAbs : 0,
          currency_code: currency,
          exchange_rate: rate,
          customer_id: customerId,
          description: `应收账款 - 发票号: ${invoice.invoice_number}`,
        },
        {
          account_id: incomeAccountId,
          debit_amount: isCn ? totalAbs : 0,
          credit_amount: isCn ? 0 : totalAbs,
          currency_code: currency,
          exchange_rate: rate,
          description: `销售收入 - 发票号: ${invoice.invoice_number}`,
        },
      ];

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
    items,
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
    accountingConfig.getAccountCode('ACCOUNTS_RECEIVABLE'),
    '应收账款'
  );
  const cashOrBankCode =
    receiptData.payment_method === '现金'
      ? accountingConfig.getAccountCode('CASH')
      : accountingConfig.getAccountCode('BANK_DEPOSIT');
  const bankAccountId = await getAccountIdByCode(connection, cashOrBankCode, '银行/现金');
  const periodId = await getOpenPeriodIdByDate(connection, receiptData.receipt_date);

  return {
    period_id: periodId,
    created_by: receiptData.created_by || financeConfig.get('system.defaultCreator', null),
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

      // 服务端权威重算未税/税额/价税合计，不信任前端 total_amount
      applyNormalizedInvoiceAmounts(invoiceData);

      // 计算余额
      const amountPolicy = normalizeInvoiceAmountPolicy(invoiceData);
      const balanceAmount = amountPolicy.totalAmount;
      assertInvoiceItemsMatchTotal(invoiceData.items, invoiceData.total_amount, invoiceData);

      // owner：created_by 必须写入，供 DataScope 行级授权（禁止只写 gl_entry.created_by）
      const ownerId =
        invoiceData.created_by !== null &&
        invoiceData.created_by !== undefined &&
        invoiceData.created_by !== ''
          ? invoiceData.created_by
          : invoiceData.gl_entry?.created_by !== null &&
              invoiceData.gl_entry?.created_by !== undefined
            ? invoiceData.gl_entry.created_by
            : null;

      // 插入应收账款发票（含未税/税额/税率）
      const [result] = await connection.query(
        `INSERT INTO ar_invoices
        (invoice_number, customer_id, invoice_date, due_date,
         total_amount, amount_excluding_tax, tax_amount, tax_rate,
         paid_amount, balance_amount,
         currency_code, exchange_rate, status, terms, notes,
         customer_invoice_number, source_type, source_id,
         created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceData.invoice_number,
          invoiceData.customer_id,
          invoiceData.invoice_date,
          invoiceData.due_date,
          amountPolicy.totalAmount,
          invoiceData.amount_excluding_tax ?? invoiceData.subtotal ?? null,
          invoiceData.tax_amount ?? null,
          invoiceData.tax_rate ?? null,
          0, // 初始已付金额为0
          balanceAmount,
          invoiceData.currency_code || financeConfig.get('invoice.defaultCurrency', 'CNY'),
          invoiceData.exchange_rate || 1,
          invoiceData.status || '草稿',
          invoiceData.terms || null,
          invoiceData.notes || null,
          invoiceData.customer_invoice_number || null,
          invoiceData.source_type || null,
          invoiceData.source_id || null,
          ownerId,
          ownerId,
        ]
      );

      const invoiceId = result.insertId;

      // 批量插入发票明细项（1次SQL替代N次）
      if (invoiceData.items && Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
        const itemValues = invoiceData.items.map((item) => [
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

      // 已确认发票默认同步生成总账凭证；合并生成路径可 skip_gl_entry，由上层写一张合并凭证。
      if (invoiceData.status === INVOICE_STATUS.CONFIRMED) {
        if (!amountPolicy.isCreditNote && toCents(invoiceData.total_amount) <= 0) {
          throw new Error('发票金额必须大于0才能确认');
        }
        if (!invoiceData.skip_gl_entry) {
          await createInvoiceConfirmationEntry(
            connection,
            { ...invoiceData, id: invoiceId },
            invoiceData.created_by
          );
        }
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
    const actualPageSize = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);

    try {
      connection = await db.getConnection();

      const scopeClause = filters.scopeClause || { join: '', where: '', params: [] };

      // 构建基本查询
      let query = `
        SELECT a.id, a.invoice_number, a.customer_id, c.name as customer_name,
               DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoice_date,
               DATE_FORMAT(a.due_date, '%Y-%m-%d') as due_date,
               a.total_amount, a.amount_excluding_tax, a.tax_amount, a.tax_rate,
               a.paid_amount, a.balance_amount,
               a.status, a.currency_code, a.terms, a.customer_invoice_number,
               a.source_type, a.source_id
        FROM ar_invoices a
        LEFT JOIN customers c ON a.customer_id = c.id
        ${scopeClause.join || ''}
        WHERE 1=1
      `;
      const params = [];

      // 添加过滤条件
      if (filters.invoice_number) {
        query += ' AND a.invoice_number LIKE ?';
        params.push(`%${filters.invoice_number}%`);
      }

      if (filters.customer_invoice_number) {
        query += ' AND a.customer_invoice_number LIKE ?';
        params.push(`%${filters.customer_invoice_number}%`);
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
      if (scopeClause.where) {
        query += scopeClause.where;
        params.push(...(scopeClause.params || []));
      }

      // 使用直接拼接进行分页（LIMIT/OFFSET已经过严格验证）
      const limit = parseInt(actualPageSize);
      const offset = parseInt((page - 1) * actualPageSize);
      query += ` ORDER BY a.invoice_date DESC, a.id DESC LIMIT ${limit} OFFSET ${offset}`;

      const [invoiceResults] = await connection.execute(query, params);
      const invoices = (invoiceResults || []).map((row) => toInvoiceApi(row, 'ar'));

      // 计算总记录数（与主查询同一过滤 + DataScope）
      let countQuery = `
        SELECT COUNT(*) as total
        FROM ar_invoices a
        LEFT JOIN customers c ON a.customer_id = c.id
        ${scopeClause.join || ''}
        WHERE 1=1
      `;
      const countParams = [];
      if (filters.invoice_number) {
        countQuery += ' AND a.invoice_number LIKE ?';
        countParams.push(`%${filters.invoice_number}%`);
      }
      if (filters.customer_invoice_number) {
        countQuery += ' AND a.customer_invoice_number LIKE ?';
        countParams.push(`%${filters.customer_invoice_number}%`);
      }
      if (filters.customer_id) {
        countQuery += ' AND a.customer_id = ?';
        countParams.push(filters.customer_id);
      }
      if (filters.customer_name) {
        countQuery += ' AND c.name LIKE ?';
        countParams.push(`%${filters.customer_name}%`);
      }
      if (filters.start_date && filters.end_date) {
        countQuery += ' AND a.invoice_date BETWEEN ? AND ?';
        countParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        countQuery += ' AND a.invoice_date >= ?';
        countParams.push(filters.start_date);
      } else if (filters.end_date) {
        countQuery += ' AND a.invoice_date <= ?';
        countParams.push(filters.end_date);
      }
      if (filters.status) {
        countQuery += ' AND a.status = ?';
        countParams.push(filters.status);
      }
      if (scopeClause.where) {
        countQuery += scopeClause.where;
        countParams.push(...(scopeClause.params || []));
      }

      const [countResult] = await connection.execute(countQuery, countParams);
      const total = countResult[0]?.total || 0;

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
      logger.error('获取应收账款发票列表失败:', error);
      throw error;
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  /**
   * 按ID获取应收账款发票
   */
  getInvoiceById: async (id) => {
    let connection = null;

    try {
      connection = await db.getConnection();

      const [invoices] = await connection.execute(
        `SELECT a.id, a.invoice_number, a.customer_id, c.name as customer_name,
                DATE_FORMAT(a.invoice_date, '%Y-%m-%d') as invoice_date,
                DATE_FORMAT(a.due_date, '%Y-%m-%d') as due_date,
                a.total_amount, a.amount_excluding_tax, a.tax_amount, a.tax_rate,
                a.paid_amount, a.balance_amount,
                a.status, a.currency_code, a.exchange_rate, a.terms, a.notes,
                a.customer_invoice_number, a.source_type, a.source_id,
                DATE_FORMAT(a.created_at, '%Y-%m-%d') as created_at
         FROM ar_invoices a
         LEFT JOIN customers c ON a.customer_id = c.id
         WHERE a.id = ?`,
        [id]
      );

      if (invoices.length === 0) {
        return null;
      }

      const invoice = invoices[0];
      const [items] = await connection.execute(
        `SELECT i.id, i.product_id, i.description, i.quantity, i.unit_price, i.amount,
                p.code AS product_code, p.name AS product_name, p.specs AS specification
         FROM ar_invoice_items i
         LEFT JOIN materials p ON i.product_id = p.id
         WHERE i.invoice_id = ?
         ORDER BY i.id ASC`,
        [id]
      );
      invoice.items = items;
      return toInvoiceApi(invoice, 'ar');
    } catch (error) {
      logger.error('查询应收账款发票详情失败:', error);
      throw error;
    } finally {
      if (connection) {
        connection.release();
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
      assertManualStatusTransition(invoice.status, status, invoice);

      if (invoice.status !== status && status === INVOICE_STATUS.CONFIRMED) {
        const amountPolicy = normalizeInvoiceAmountPolicy(invoice);
        if (!amountPolicy.isCreditNote && toCents(invoice.total_amount) <= 0) {
          throw new Error('发票金额必须大于0才能确认');
        }
        await createInvoiceConfirmationEntry(
          connection,
          invoice,
          options.updated_by || options.created_by
        );
      }

      // 已确认/逾期→取消：冲销关联确认凭证（未收款已在 assertManualStatusTransition 校验）
      if (
        invoice.status !== status &&
        status === INVOICE_STATUS.CANCELLED &&
        [INVOICE_STATUS.CONFIRMED, INVOICE_STATUS.OVERDUE].includes(invoice.status)
      ) {
        const VoucherReversalService = require('../services/finance/VoucherReversalService');
        const { resolveActorUserId } = require('../utils/userUtils');
        const voidedBy = await resolveActorUserId(
          connection,
          options.updated_by,
          options.created_by,
          invoice.created_by
        );
        try {
          await VoucherReversalService.reverseBusinessVouchers(connection, {
            sourceType: 'ar_invoice',
            sourceId: invoice.id,
            documentNumber: invoice.invoice_number,
            documentType: DOCUMENT_TYPE_MAPPING.SALES_INVOICE,
            voidedBy,
            reason: `应收发票作废 ${invoice.invoice_number}`,
          });
        } catch (revErr) {
          // 历史数据可能无 GL 凭证；其余冲销失败必须阻断作废，避免账实不一致
          if (!/未找到|不存在|not found|NO_ENTRY|无可冲销/i.test(String(revErr.message || ''))) {
            throw revErr;
          }
          logger.warn(`[AR] 作废时未找到可冲销凭证: ${revErr.message}`);
        }
      }

      if (invoice.status !== status) {
        await connection.execute(
          'UPDATE ar_invoices SET status = ?, updated_at = NOW() WHERE id = ?',
          [status, id]
        );
      }

      // 取消后释放 source 唯一键，允许同业务单据重新生成
      if (status === INVOICE_STATUS.CANCELLED || status === 'cancelled' || status === 'void' || status === '作废') {
        const FinanceIntegrationService = require('../services/external/FinanceIntegrationService');
        await FinanceIntegrationService.releaseInvoiceSourceOnCancel(
          connection,
          'ar_invoices',
          id
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
                total_amount, amount_excluding_tax, tax_amount, tax_rate,
                paid_amount, balance_amount, terms, notes
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
            Math.abs(
              parseFloat(requestedTotal || 0) - parseFloat(currentInvoice.total_amount || 0)
            ) > 0.01) ||
          (invoiceData.invoice_number &&
            invoiceData.invoice_number !== currentInvoice.invoice_number) ||
          (invoiceData.customer_id &&
            Number(invoiceData.customer_id) !== Number(currentInvoice.customer_id)) ||
          (invoiceData.invoice_date &&
            String(invoiceData.invoice_date) !== String(currentInvoice.invoice_date)) ||
          (invoiceData.due_date &&
            String(invoiceData.due_date) !== String(currentInvoice.due_date)) ||
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
          [invoiceData.customer_invoice_number || null, invoiceData.notes ?? null, invoiceData.id]
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
      const amountPolicy = normalizeInvoiceAmountPolicy(invoiceData);
      const totalAmount = amountPolicy.totalAmount;
      const balanceAmount = totalAmount - paidAmount;
      assertInvoiceItemsMatchTotal(invoiceData.items, totalAmount, invoiceData);

      // 更新发票主表（含未税/税额/税率，与 create 对称）
      await connection.execute(
        `UPDATE ar_invoices SET
          invoice_number = ?,
          customer_invoice_number = ?,
          customer_id = ?,
          invoice_date = ?,
          due_date = ?,
          total_amount = ?,
          amount_excluding_tax = ?,
          tax_amount = ?,
          tax_rate = ?,
          balance_amount = ?,
          terms = ?,
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
          invoiceData.amount_excluding_tax ?? invoiceData.subtotal ?? null,
          invoiceData.tax_amount ?? null,
          invoiceData.tax_rate ?? null,
          balanceAmount,
          invoiceData.terms ?? null,
          invoiceData.notes || null,
          invoiceData.id,
        ]
      );

      // 更新明细项: 先删除旧明细，再按当前提交重建
      if (invoiceData.items && Array.isArray(invoiceData.items)) {
        await connection.execute('DELETE FROM ar_invoice_items WHERE invoice_id = ?', [
          invoiceData.id,
        ]);

        if (invoiceData.items.length > 0) {
          const itemValues = invoiceData.items.map((item) => [
            invoiceData.id,
            item.product_id || null,
            item.description || '',
            item.quantity || 0,
            item.unit_price || 0,
            item.amount ||
              Math.round(
                (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0) * 100
              ) / 100,
          ]);
          await connection.query(
            `INSERT INTO ar_invoice_items
             (invoice_id, product_id, description, quantity, unit_price, amount)
             VALUES ?`,
            [itemValues]
          );
        }
      }

      // ===== 自动同步开票号码到税务发票（支持出库级 / 订单级） =====
      if (invoiceData.customer_invoice_number) {
        const [arSource] = await connection.execute(
          'SELECT source_type, source_id FROM ar_invoices WHERE id = ?',
          [invoiceData.id]
        );
        if (arSource.length > 0 && arSource[0].source_id) {
          const sourceType = arSource[0].source_type;
          const sourceId = arSource[0].source_id;
          let outboundIds = [];

          if (sourceType === 'sales_outbound') {
            outboundIds = [sourceId];
          } else if (sourceType === 'sales_order') {
            const [outbounds] = await connection.execute(
              `SELECT id FROM sales_outbound
               WHERE deleted_at IS NULL
                 AND (order_id = ? OR id IN (
                   SELECT outbound_id FROM sales_outbound_items WHERE source_order_id = ?
                 ))`,
              [sourceId, sourceId]
            );
            outboundIds = outbounds.map((o) => o.id);
          }

          for (const outboundId of outboundIds) {
            const {
              TAX_RELATED_DOCUMENT_TYPES,
              taxRelatedDocumentTypeMatchList,
            } = require('../constants/financeConstants');
            const outboundTaxTypes = taxRelatedDocumentTypeMatchList(
              TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND
            );
            const outboundTaxPlaceholders = outboundTaxTypes.map(() => '?').join(', ');
            const [syncResult] = await connection.execute(
              `UPDATE tax_invoices
               SET invoice_number = ?, updated_at = NOW()
               WHERE related_document_type IN (${outboundTaxPlaceholders})
                 AND related_document_id = ?
                 AND status = '未认证'
                 AND gl_entry_id IS NULL`,
              [invoiceData.customer_invoice_number, ...outboundTaxTypes, outboundId]
            );
            if (syncResult.affectedRows > 0) {
              logger.info('[AR→Tax同步] 开票号码已同步到税务发票', {
                arInvoiceId: invoiceData.id,
                sourceType,
                customerInvoiceNumber: invoiceData.customer_invoice_number,
                outboundId,
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
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.warn('回滚应收账款发票事务失败:', rollbackError.message);
        }
      }
      throw error;
    } finally {
      if (connection) {
        try {
          connection.release();
        } catch (releaseError) {
          logger.warn('释放应收账款发票连接失败:', releaseError.message);
        }
      }
    }
  },

  /**
   * 创建收款记录
   * @param {Object|null} externalConnection 可选外层事务连接（批量收款时复用）
   */
  createReceipt: async (receiptData, receiptItems, externalConnection = null) => {
    const isExternalTransaction = !!externalConnection;
    let connection = externalConnection;
    try {
      if (!isExternalTransaction) {
        connection = await db.getConnection();
        await connection.beginTransaction();
      }

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
         payment_method, reference_number, bank_account_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptData.receipt_number,
          receiptData.customer_id,
          receiptData.receipt_date,
          receiptData.total_amount,
          receiptData.payment_method,
          receiptData.reference_number || null,
          receiptData.bank_account_id || null,
          receiptData.notes || null,
          receiptData.created_by || null,
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
        throw new Error('收款单总金额必须等于收款明细金额合计（不含折扣）');
      }

      // 插入收款明细并更新发票状态
      // totalCashCents = 实际到账；totalSettlementCents = 核销额（到账+折扣）
      let totalCashCents = 0;
      let totalSettlementCents = 0;
      let totalDiscountCents = 0;
      for (const item of sortedReceiptItems) {
        const [invoices] = await connection.execute(
          'SELECT id, invoice_number, customer_invoice_number, customer_id, invoice_date, due_date, total_amount, amount_excluding_tax, tax_amount, tax_rate, paid_amount, balance_amount, currency_code, exchange_rate, status, terms, notes, source_type, source_id, created_by, updated_by, created_at, updated_at FROM ar_invoices WHERE id = ? FOR UPDATE',
          [item.invoice_id]
        );

        if (invoices.length === 0) {
          throw new Error(`发票ID ${item.invoice_id} 不存在`);
        }

        const invoice = invoices[0];
        if (
          String(invoice.currency_code || 'CNY').toUpperCase() !== 'CNY' ||
          Math.abs(Number(invoice.exchange_rate || 1) - 1) > 0.000001
        ) {
          throw new Error(`发票 ${invoice.invoice_number} 为非人民币业务，当前未启用本位币换算，不能核销`);
        }
        linkedInvoices.push({ id: invoice.id, invoice_number: invoice.invoice_number });
        assertInvoiceSettlementsEligible(invoice.status, `发票 ${invoice.invoice_number}`);

        const line = parseSettlementLine(item);
        assertWithinBalance(
          line.settlementCents,
          toCents(invoice.balance_amount),
          `发票 ${invoice.invoice_number} 收款核销金额`
        );

        await connection.execute(
          'INSERT INTO ar_receipt_items (receipt_id, invoice_id, amount, discount_amount) VALUES (?, ?, ?, ?)',
          [receiptId, item.invoice_id, line.cashAmount, line.discountAmount]
        );

        const paidAmountCents = toCents(invoice.paid_amount) + line.settlementCents;
        const totalAmountCents = toCents(invoice.total_amount);
        const newPaidAmount = fromCents(paidAmountCents);
        const newBalanceAmount = fromCents(Math.max(0, totalAmountCents - paidAmountCents));
        const newStatus = invoiceStatusAfterSettlement(paidAmountCents, totalAmountCents);

        await connection.execute(
          'UPDATE ar_invoices SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, newBalanceAmount, newStatus, item.invoice_id]
        );

        totalCashCents += line.cashCents;
        totalSettlementCents += line.settlementCents;
        totalDiscountCents += line.discountCents;
      }

      const totalPaid = fromCents(totalCashCents);
      const totalSettlement = fromCents(totalSettlementCents);
      const totalDiscount = fromCents(totalDiscountCents);

      // 如果是银行类收款且有实际到账金额，更新银行账户余额并创建银行交易记录
      if (
        BANK_BACKED_PAYMENT_METHODS.has(receiptData.payment_method) &&
        totalCashCents > 0
      ) {
        const [bankAccounts] = await connection.execute(
          'SELECT id, account_number, account_name, bank_name, branch_name, currency_code, current_balance, opening_balance, account_type, is_active, contact_person, contact_phone, notes, created_at, updated_at, created_by, updated_by, last_transaction_date FROM bank_accounts WHERE id = ? FOR UPDATE',
          [receiptData.bank_account_id]
        );

        if (bankAccounts.length === 0) {
          throw new Error(`银行账户ID ${receiptData.bank_account_id} 不存在`);
        }

        const bankAccount = bankAccounts[0];
        if (String(bankAccount.currency_code || 'CNY').toUpperCase() !== 'CNY') {
          throw new Error(`银行账户 "${bankAccount.account_name}" 不是人民币账户，当前不能用于收款`);
        }
        if (bankAccount.is_active === 0) {
          throw new Error(`银行账户 "${bankAccount.account_name}" 已被冻结，无法用于收款`);
        }

        // 创建银行交易记录（仅实收金额，不含折扣）
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
              (sortedReceiptItems.length > 1 ? ` (含${sortedReceiptItems.length}张发票)` : '') +
              (totalDiscountCents > 0 ? `；折扣 ${totalDiscount}` : ''),
            false,
            receiptData.customer_name || '未知客户',
            sortedReceiptItems[0]?.invoice_id || null,
            'AR',
            'approved',
          ]
        );
        bankTransactionId = bankTransactionResult.insertId;

        // 以流水 SSOT 重算余额，避免增量加减漂移
        const BankBalanceService = require('../services/business/BankBalanceService');
        await BankBalanceService.syncAccountBalance(connection, receiptData.bank_account_id);

        logger.info(`[AR收款] 银行账户余额已按流水重算: ${bankAccount.account_name}`);
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

        // 收款分录：借银行(实收) + 借财务费用(折扣) = 贷应收账款(核销额)
        const entryItems = [];
        if (totalCashCents > 0) {
          entryItems.push({
            account_id: glEntry.bank_account_id,
            debit_amount: totalPaid,
            credit_amount: 0,
            description: `收款 - 收款单号: ${receiptData.receipt_number}`,
          });
        }
        if (totalDiscountCents > 0) {
          const discountAccountId =
            glEntry.discount_account_id ||
            (await getAccountIdByCode(
              connection,
              accountingConfig.getAccountCode('FINANCE_EXPENSE'),
              '财务费用(现金折扣)'
            ));
          entryItems.push({
            account_id: discountAccountId,
            debit_amount: totalDiscount,
            credit_amount: 0,
            description: `现金折扣 - 收款单号: ${receiptData.receipt_number}`,
          });
        }
        entryItems.push({
          account_id: glEntry.receivable_account_id,
          debit_amount: 0,
          credit_amount: totalSettlement,
          description: `应收账款减少 - 收款单号: ${receiptData.receipt_number}`,
        });

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

      if (!isExternalTransaction) {
        await connection.commit();
      }

      return receiptId;
    } catch (error) {
      logger.error('创建收款记录失败:', error);
      if (!isExternalTransaction && connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          logger.error('事务回滚失败:', rollbackError);
        }
      }
      throw error;
    } finally {
      if (!isExternalTransaction && connection) {
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
      const actualPageSize = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);

      const scopeClause = filters.scopeClause || { join: '', where: '', params: [] };

      let query = `
        SELECT r.*, c.name as customer_name,
               (SELECT i.invoice_number
                FROM ar_receipt_items ri
                LEFT JOIN ar_invoices i ON ri.invoice_id = i.id
                WHERE ri.receipt_id = r.id LIMIT 1) as invoice_number
        FROM ar_receipts r
        LEFT JOIN customers c ON r.customer_id = c.id
        ${scopeClause.join || ''}
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

      if (scopeClause.where) {
        query += scopeClause.where;
        params.push(...(scopeClause.params || []));
      }

      // 使用直接拼接进行分页（LIMIT/OFFSET已经过严格验证）
      const limit = parseInt(actualPageSize);
      const offset = parseInt((page - 1) * actualPageSize);
      query += ` ORDER BY r.receipt_date DESC, r.id DESC LIMIT ${limit} OFFSET ${offset}`;

      // 使用 query 而不是 execute，避免 LIMIT/OFFSET 参数化问题
      connection = await db.getConnection();
      const [receipts] = await connection.query(query, params);

      // 获取总记录数（与主查询同一过滤 + DataScope）
      let countQuery = `
        SELECT COUNT(*) as total
        FROM ar_receipts r
        LEFT JOIN customers c ON r.customer_id = c.id
        ${scopeClause.join || ''}
        WHERE 1=1
      `;
      const countParams = [];
      if (filters.receipt_number) {
        countQuery += ' AND r.receipt_number LIKE ?';
        countParams.push(`%${filters.receipt_number}%`);
      }
      if (filters.customer_id) {
        countQuery += ' AND r.customer_id = ?';
        countParams.push(filters.customer_id);
      }
      if (filters.customer_name) {
        countQuery += ' AND c.name LIKE ?';
        countParams.push(`%${filters.customer_name}%`);
      }
      if (filters.start_date && filters.end_date) {
        countQuery += ' AND r.receipt_date BETWEEN ? AND ?';
        countParams.push(filters.start_date, filters.end_date);
      } else if (filters.start_date) {
        countQuery += ' AND r.receipt_date >= ?';
        countParams.push(filters.start_date);
      } else if (filters.end_date) {
        countQuery += ' AND r.receipt_date <= ?';
        countParams.push(filters.end_date);
      }
      if (filters.payment_method) {
        countQuery += ' AND r.payment_method = ?';
        countParams.push(filters.payment_method);
      }
      if (filters.status) {
        countQuery += ' AND r.status = ?';
        countParams.push(filters.status);
      }
      if (filters.invoice_number) {
        countQuery += ` AND EXISTS (
          SELECT 1 FROM ar_receipt_items ri
          JOIN ar_invoices i ON ri.invoice_id = i.id
          WHERE ri.receipt_id = r.id AND i.invoice_number = ?
        )`;
        countParams.push(filters.invoice_number);
      }
      if (scopeClause.where) {
        countQuery += scopeClause.where;
        countParams.push(...(scopeClause.params || []));
      }

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
        `SELECT r.*, ri.invoice_id, ri.amount as item_amount, ri.discount_amount as item_discount_amount
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

      // 4. 恢复关联发票的余额和状态（核销额 = 实收 + 折扣）
      for (const item of receipts) {
        if (!item.invoice_id) continue;

        const [invoices] = await connection.execute(
          'SELECT id, invoice_number, customer_invoice_number, customer_id, invoice_date, due_date, total_amount, amount_excluding_tax, tax_amount, tax_rate, paid_amount, balance_amount, currency_code, exchange_rate, status, terms, notes, source_type, source_id, created_by, updated_by, created_at, updated_at FROM ar_invoices WHERE id = ? FOR UPDATE',
          [item.invoice_id]
        );

        if (invoices.length === 0) continue;

        const invoice = invoices[0];
        const settleBackCents = parseSettlementLine({
          amount: item.item_amount,
          discount_amount: item.item_discount_amount,
        }).settlementCents;
        const paidAmountCents = Math.max(0, toCents(invoice.paid_amount) - settleBackCents);
        const totalAmountCents = toCents(invoice.total_amount);
        const newPaidAmount = fromCents(paidAmountCents);
        const newBalanceAmount = fromCents(Math.max(0, totalAmountCents - paidAmountCents));
        const newStatus = invoiceStatusAfterSettlement(paidAmountCents, totalAmountCents);

        await connection.execute(
          'UPDATE ar_invoices SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, newBalanceAmount, newStatus, item.invoice_id]
        );

        logger.info(`[作废收款] 已恢复发票 ${invoice.invoice_number} 的余额: ${newBalanceAmount}`);
      }

      // 5. 如果有银行交易记录，创建冲销交易
      if (receipt.bank_account_id && BANK_BACKED_PAYMENT_METHODS.has(receipt.payment_method)) {
        try {
          // 获取原银行交易记录
          const [bankTxs] = await connection.execute(
            `SELECT id, transaction_number, bank_account_id, transaction_date, transaction_type, amount, reference_number, description, is_reconciled, reconciliation_date, related_party, created_at, updated_at, created_by, updated_by, related_invoice_id, related_invoice_type, tax_return_id, gl_entry_id, audit_status, auditor_id, audit_time, audit_remark, submitted_by, submitted_at, reconcile_confirmed_by, reconcile_confirmed_at, status, approved_by, approved_at, reject_reason, category, payment_method FROM bank_transactions
             WHERE transaction_number = ? AND bank_account_id = ?
             LIMIT 1
             FOR UPDATE`,
            [receipt.receipt_number, receipt.bank_account_id]
          );

          if (bankTxs.length === 0) {
            throw new Error(
              `未找到收款单 ${receipt.receipt_number} 对应的银行流水，无法作废（资金类收款必须有银行链路）`
            );
          }

          const originalTx = bankTxs[0];
          if (isTruthyFlag(originalTx.is_reconciled)) {
            throw new Error('关联银行流水已对账，请先取消对账后再作废收款');
          }

          const reversalDate = currentDateString();
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

          // 创建冲销交易（转出）
          const [reversalBankTxResult] = await connection.execute(
            `INSERT INTO bank_transactions
             (transaction_number, bank_account_id, transaction_date, transaction_type,
             amount, reference_number, description, is_reconciled, related_party, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              reversalBankTransactionNumber,
              receipt.bank_account_id,
              reversalDate,
              '转出',
              receipt.total_amount,
              receipt.receipt_number,
              `冲销收款记录 - 原因: ${voidData.void_reason}`,
              false,
              originalTx.related_party || '',
              'approved',
            ]
          );
          reversalBankTransactionId = reversalBankTxResult.insertId;

          const BankBalanceService = require('../services/business/BankBalanceService');
          await BankBalanceService.syncAccountBalance(connection, receipt.bank_account_id);

          logger.info('[作废收款] 已创建冲销银行交易并按流水重算余额');
        } catch (err) {
          logger.error(`[作废收款] 冲销银行交易失败: ${err.message}`);
          throw new Error(`冲销银行交易失败: ${err.message}`, { cause: err });
        }
      }

      // 6. 按单据链路冲销关联总账凭证（规范 document_type = collection）
      try {
        const reversed = await VoucherReversalService.reverseBusinessVouchers(connection, {
          sourceType: 'ar_receipt',
          sourceId: receiptId,
          documentNumber: receipt.receipt_number,
          documentType: DOCUMENT_TYPES.COLLECTION,
          voidedBy,
          reason: `冲销收款凭证 - 原因: ${voidData.void_reason}`,
        });
        for (const item of reversed) {
          reversalEntries.push({ entryId: item.entryId, entryNumber: item.entryNumber });
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
          await DocumentLinkService.createLink(
            {
              source_type: 'bank_transaction',
              source_id: originalBankTransactionId,
              source_code: originalBankTransactionNumber,
              target_type: 'bank_transaction',
              target_id: reversalBankTransactionId,
              target_code: reversalBankTransactionNumber,
              link_type: 'related',
              remark: 'AR receipt void reversal',
              created_by: voidedBy,
            },
            connection
          );
        }

        if (reversalEntries.length > 0) {
          await connection.execute('UPDATE bank_transactions SET gl_entry_id = ? WHERE id = ?', [
            reversalEntries[0].entryId,
            reversalBankTransactionId,
          ]);
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
      const currentDate = toLocalDateString(asOfDate || currentDateString());

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
          `SELECT i.id, i.invoice_id, i.product_id, i.product_id as productId,
                  m.code as product_code, m.code as productCode,
                  m.name as product_name, m.name as productName,
                  m.code as material_code, m.name as material_name,
                  m.specs as specification, m.specs as specs,
                  i.description, i.quantity, i.unit_price, i.unit_price as unitPrice, i.amount
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
      throw error;
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


  /**
   * 获取客户应收款汇总（含联系人信息和余额筛选）
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.customerName] - 客户名称（模糊匹配）
   * @param {string} [filters.status] - 发票状态
   * @returns {Promise<Array>} 客户应收款汇总列表
   */
  getCustomerReceivablesSummary: async (filters = {}) => {
    const { customerName, status } = filters;
    let whereClause = '';
    const params = [];

    if (customerName) {
      whereClause += ' AND c.name LIKE ?';
      params.push(`%${customerName}%`);
    }

    if (status) {
      whereClause += ' AND i.status = ?';
      params.push(status);
    }

    const [receivables] = await db.pool.execute(
      `SELECT
        c.id AS customerId,
        c.name AS customerName,
        c.contact_person AS contactPerson,
        c.contact_phone AS contactPhone,
        COUNT(i.id) AS invoiceCount,
        COALESCE(SUM(i.total_amount), 0) AS totalAmount,
        COALESCE(SUM(i.paid_amount), 0) AS paidAmount,
        COALESCE(SUM(i.balance_amount), 0) AS balance,
        MAX(i.invoice_date) AS lastInvoiceDate
      FROM customers c
      LEFT JOIN ar_invoices i ON c.id = i.customer_id
        AND i.status NOT IN ('已付款', '已取消', '草稿', 'void')
      WHERE c.status = 'active' ${whereClause}
      GROUP BY c.id, c.name, c.contact_person, c.contact_phone
      HAVING balance > 0
      ORDER BY balance DESC`,
      params
    );

    return receivables.map((item) => ({
      customerId: item.customerId,
      customerName: item.customerName,
      contactPerson: item.contactPerson,
      contactPhone: item.contactPhone,
      invoiceCount: parseInt(item.invoiceCount || 0),
      totalAmount: parseFloat(item.totalAmount || 0),
      paidAmount: parseFloat(item.paidAmount || 0),
      balance: parseFloat(item.balance || 0),
      lastInvoiceDate: item.lastInvoiceDate,
    }));
  },

  /**
   * 应收结算看板：数量 + 金额汇总 + 未结清明细
   * settlementKey: all | unpaid | partial | paid | overdue | open
   */
  getSettlementDashboard: async (filters = {}) => {
    const { startDate, endDate, customerName, settlementKey = 'open', limit = 50 } = filters;
    const where = ["a.status NOT IN ('草稿', '已取消', 'cancelled', 'void', '作废')"];
    const params = [];

    if (startDate) {
      where.push('a.invoice_date >= ?');
      params.push(startDate);
    }
    if (endDate) {
      where.push('a.invoice_date <= ?');
      params.push(endDate);
    }
    if (customerName) {
      where.push('c.name LIKE ?');
      params.push(`%${customerName}%`);
    }

    const whereSql = where.join(' AND ');

    const [summaryRows] = await db.pool.execute(
      `SELECT
         COUNT(*) AS total_count,
         COALESCE(SUM(a.total_amount), 0) AS total_amount,
         COALESCE(SUM(a.paid_amount), 0) AS paid_amount,
         COALESCE(SUM(a.balance_amount), 0) AS balance_amount,
         SUM(CASE WHEN a.status = '已付款' OR COALESCE(a.balance_amount, 0) <= 0.005 THEN 1 ELSE 0 END) AS paid_count,
         COALESCE(SUM(CASE WHEN a.status = '已付款' OR COALESCE(a.balance_amount, 0) <= 0.005 THEN a.total_amount ELSE 0 END), 0) AS paid_total_amount,
         SUM(CASE
               WHEN a.status = '部分付款'
                 OR (COALESCE(a.paid_amount, 0) > 0.005 AND COALESCE(a.balance_amount, 0) > 0.005)
             THEN 1 ELSE 0 END) AS partial_count,
         COALESCE(SUM(CASE
               WHEN a.status = '部分付款'
                 OR (COALESCE(a.paid_amount, 0) > 0.005 AND COALESCE(a.balance_amount, 0) > 0.005)
             THEN a.balance_amount ELSE 0 END), 0) AS partial_balance,
         SUM(CASE
               WHEN a.status IN ('已确认', '已逾期')
                AND COALESCE(a.paid_amount, 0) <= 0.005
                AND COALESCE(a.balance_amount, 0) > 0.005
             THEN 1 ELSE 0 END) AS unpaid_count,
         COALESCE(SUM(CASE
               WHEN a.status IN ('已确认', '已逾期')
                AND COALESCE(a.paid_amount, 0) <= 0.005
                AND COALESCE(a.balance_amount, 0) > 0.005
             THEN a.balance_amount ELSE 0 END), 0) AS unpaid_balance,
         SUM(CASE
               WHEN a.status = '已逾期'
                AND COALESCE(a.balance_amount, 0) > 0.005
             THEN 1
               WHEN COALESCE(a.balance_amount, 0) > 0.005
                AND a.due_date IS NOT NULL
                AND a.due_date < CURDATE()
                AND a.status NOT IN ('已付款')
             THEN 1 ELSE 0 END) AS overdue_count,
         COALESCE(SUM(CASE
               WHEN a.status = '已逾期'
                AND COALESCE(a.balance_amount, 0) > 0.005
             THEN a.balance_amount
               WHEN COALESCE(a.balance_amount, 0) > 0.005
                AND a.due_date IS NOT NULL
                AND a.due_date < CURDATE()
                AND a.status NOT IN ('已付款')
             THEN a.balance_amount ELSE 0 END), 0) AS overdue_balance,
         SUM(CASE WHEN COALESCE(a.balance_amount, 0) > 0.005 THEN 1 ELSE 0 END) AS open_count,
         COALESCE(SUM(CASE WHEN COALESCE(a.balance_amount, 0) > 0.005 THEN a.balance_amount ELSE 0 END), 0) AS open_balance
       FROM ar_invoices a
       LEFT JOIN customers c ON a.customer_id = c.id
       WHERE ${whereSql}`,
      params
    );

    const s = summaryRows[0] || {};
    const summary = {
      totalCount: Number(s.total_count || 0),
      totalAmount: Number(s.total_amount || 0),
      paidAmount: Number(s.paid_amount || 0),
      balanceAmount: Number(s.balance_amount || 0),
      paidCount: Number(s.paid_count || 0),
      paidTotalAmount: Number(s.paid_total_amount || 0),
      partialCount: Number(s.partial_count || 0),
      partialBalance: Number(s.partial_balance || 0),
      unpaidCount: Number(s.unpaid_count || 0),
      unpaidBalance: Number(s.unpaid_balance || 0),
      overdueCount: Number(s.overdue_count || 0),
      overdueBalance: Number(s.overdue_balance || 0),
      openCount: Number(s.open_count || 0),
      openBalance: Number(s.open_balance || 0),
    };

    const detailWhere = [...where];
    const detailParams = [...params];
    const key = String(settlementKey || 'open').toLowerCase();

    if (key === 'paid') {
      detailWhere.push("(a.status = '已付款' OR COALESCE(a.balance_amount, 0) <= 0.005)");
    } else if (key === 'partial') {
      detailWhere.push(`(
        a.status = '部分付款'
        OR (COALESCE(a.paid_amount, 0) > 0.005 AND COALESCE(a.balance_amount, 0) > 0.005)
      )`);
    } else if (key === 'unpaid') {
      detailWhere.push(`(
        a.status IN ('已确认', '已逾期')
        AND COALESCE(a.paid_amount, 0) <= 0.005
        AND COALESCE(a.balance_amount, 0) > 0.005
      )`);
    } else if (key === 'overdue') {
      detailWhere.push(`(
        (a.status = '已逾期' AND COALESCE(a.balance_amount, 0) > 0.005)
        OR (
          COALESCE(a.balance_amount, 0) > 0.005
          AND a.due_date IS NOT NULL
          AND a.due_date < CURDATE()
          AND a.status NOT IN ('已付款')
        )
      )`);
    } else if (key === 'open') {
      detailWhere.push('COALESCE(a.balance_amount, 0) > 0.005');
    }
    // all: 无额外条件

    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const [details] = await db.pool.execute(
      `SELECT
         a.id,
         a.invoice_number,
         a.customer_id,
         c.name AS customer_name,
         a.invoice_date,
         a.due_date,
         a.total_amount,
         a.paid_amount,
         a.balance_amount,
         a.status,
         a.source_type,
         a.source_id,
         CASE
           WHEN a.status = '已付款' OR COALESCE(a.balance_amount, 0) <= 0.005 THEN 'paid'
           WHEN a.status = '已逾期'
             OR (COALESCE(a.balance_amount, 0) > 0.005 AND a.due_date IS NOT NULL AND a.due_date < CURDATE())
             THEN 'overdue'
           WHEN a.status = '部分付款'
             OR (COALESCE(a.paid_amount, 0) > 0.005 AND COALESCE(a.balance_amount, 0) > 0.005)
             THEN 'partial'
           ELSE 'unpaid'
         END AS settlement_bucket,
         CASE
           WHEN a.due_date IS NULL THEN NULL
           ELSE DATEDIFF(CURDATE(), a.due_date)
         END AS overdue_days
       FROM ar_invoices a
       LEFT JOIN customers c ON a.customer_id = c.id
       WHERE ${detailWhere.join(' AND ')}
       ORDER BY
         CASE
           WHEN a.status = '已逾期' OR (COALESCE(a.balance_amount,0) > 0.005 AND a.due_date < CURDATE()) THEN 0
           WHEN COALESCE(a.balance_amount,0) > 0.005 THEN 1
           ELSE 2
         END,
         a.due_date ASC,
         a.id DESC
       LIMIT ${limitNum}`,
      detailParams
    );

    return {
      side: 'ar',
      asOf: new Date().toISOString().slice(0, 10),
      settlementKey: key,
      summary,
      details: details.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        partyId: row.customer_id,
        partyName: row.customer_name,
        invoiceDate: row.invoice_date,
        dueDate: row.due_date,
        totalAmount: Number(row.total_amount || 0),
        paidAmount: Number(row.paid_amount || 0),
        balanceAmount: Number(row.balance_amount || 0),
        status: row.status,
        sourceType: row.source_type,
        sourceId: row.source_id,
        settlementBucket: row.settlement_bucket,
        overdueDays: row.overdue_days == null ? null : Number(row.overdue_days),
      })),
    };
  },
};

module.exports = arModel;
