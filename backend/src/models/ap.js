/**
 * ap.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const db = require('../config/db');
const financeModel = require('./finance');
const {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_MAPPING,
  INVOICE_STATUS,
  MANUAL_INVOICE_STATUS_TRANSITIONS,
  BANK_BACKED_PAYMENT_METHODS,
} = require('../constants/financeConstants');
const AccountMappingService = require('../services/finance/AccountMappingService');
const DocumentLinkService = require('../services/business/DocumentLinkService');
const VoucherReversalService = require('../services/finance/VoucherReversalService');
const { financeConfig } = require('../config/financeConfig');
const { accountingConfig } = require('../config/accountingConfig');
const { parsePagination } = require('../utils/safePagination');
const { currentDateString, toLocalDateString } = require('../utils/dateUtils');
const {
  toCents,
  fromCents,
  parseSettlementLine,
  assertWithinBalance,
  assertBankBalanceSufficient,
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
      `应付发票明细合计 ${fromCents(itemTotalCents).toFixed(2)} 与发票总额 ${fromCents(totalCents).toFixed(2)} 不一致`
    );
  }
};

const normalizeInvoiceAmountPolicy = (invoiceData) => {
  const totalCents = toCents(invoiceData.total_amount);
  if (totalCents < 0 && invoiceData.source_type !== 'purchase_return') {
    throw new Error('Negative AP invoices must be purchase_return credit notes');
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
      `不允许从"${currentStatus}"手工变更为"${nextStatus}"；付款状态只能由付款/作废流程自动维护`
    );
  }

  // 已确认/逾期 → 取消：必须未付款
  if (
    nextStatus === INVOICE_STATUS.CANCELLED &&
    [INVOICE_STATUS.CONFIRMED, INVOICE_STATUS.OVERDUE].includes(currentStatus)
  ) {
    const paid = Math.abs(toCents(invoice?.paid_amount || 0));
    if (paid > 0) {
      throw new Error('发票已有付款记录，不能直接取消；请先作废相关付款');
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
    [DOCUMENT_TYPE_MAPPING.PURCHASE_INVOICE, documentNumber]
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

const resolvePurchaseInvoiceAccounts = async (connection, invoice) => {
  if (invoice.gl_entry) {
    return {
      purchaseCostAccountId:
        invoice.gl_entry.purchase_cost_account_id || invoice.gl_entry.expense_account_id,
      payableAccountId: invoice.gl_entry.payable_account_id,
    };
  }

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
  // 专业默认：借 GR/IR（暂估应付），与入库集成路径一致；无 GR/IR 再回退采购成本
  let debitAccountId;
  try {
    debitAccountId = await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('GR_IR'),
      'GR/IR暂估'
    );
  } catch {
    debitAccountId = await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('PURCHASE_COST'),
      '采购成本'
    );
  }
  return {
    purchaseCostAccountId: debitAccountId,
    payableAccountId: await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('ACCOUNTS_PAYABLE'),
      '应付账款'
    ),
  };
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

  const { purchaseCostAccountId, payableAccountId } = await resolvePurchaseInvoiceAccounts(
    connection,
    invoice
  );
  await accountingConfig.loadFromDatabase(db);
  await financeConfig.loadFromDatabase(db);
  const inputTaxAccountId =
    invoice.gl_entry?.input_tax_account_id ||
    (await getAccountIdByCode(
      connection,
      accountingConfig.getAccountCode('VAT_INPUT_TAX'),
      '进项税额'
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
  // 价税分离 fail-closed：有税额时必须拆进项税，禁止采购成本含税
  const { TAX_SPLIT_FAIL_CLOSED } = require('../constants/financeConstants');
  const canSplitTax =
    taxAbs > 0.0001 && inputTaxAccountId && Math.abs(netAbs + taxAbs - totalAbs) <= 0.02;
  if (taxAbs > 0.0001 && !canSplitTax) {
    if (TAX_SPLIT_FAIL_CLOSED) {
      if (!inputTaxAccountId) {
        throw new Error('未配置进项税科目(VAT_INPUT_TAX)，禁止确认含税应付发票（价税分离 fail-closed）');
      }
      throw new Error(
        `价税金额不平（未税 ${netAbs} + 税 ${taxAbs} ≠ 合计 ${totalAbs}），禁止确认发票`
      );
    }
    logger.warn('[AP] 价税分离失败，降级两行价税合计', {
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

  const supplierId = invoice.supplier_id ? Number(invoice.supplier_id) : null;
  const items = splitTax
    ? [
        {
          account_id: purchaseCostAccountId,
          debit_amount: isCn ? 0 : netAbs,
          credit_amount: isCn ? netAbs : 0,
          currency_code: currency,
          exchange_rate: rate,
          supplier_id: supplierId,
          description: `采购/GR-IR(未税) - 发票号: ${invoice.invoice_number}`,
        },
        {
          account_id: inputTaxAccountId,
          debit_amount: isCn ? 0 : taxAbs,
          credit_amount: isCn ? taxAbs : 0,
          currency_code: currency,
          exchange_rate: rate,
          description: `进项税额 - 发票号: ${invoice.invoice_number}`,
        },
        {
          account_id: payableAccountId,
          debit_amount: isCn ? totalAbs : 0,
          credit_amount: isCn ? 0 : totalAbs,
          currency_code: currency,
          exchange_rate: rate,
          supplier_id: supplierId,
          description: `应付账款(价税合计) - 发票号: ${invoice.invoice_number}`,
        },
      ]
    : [
        {
          account_id: purchaseCostAccountId,
          debit_amount: isCn ? 0 : totalAbs,
          credit_amount: isCn ? totalAbs : 0,
          currency_code: currency,
          exchange_rate: rate,
          supplier_id: supplierId,
          description: `采购/GR-IR - 发票号: ${invoice.invoice_number}`,
        },
        {
          account_id: payableAccountId,
          debit_amount: isCn ? totalAbs : 0,
          credit_amount: isCn ? 0 : totalAbs,
          currency_code: currency,
          exchange_rate: rate,
          supplier_id: supplierId,
          description: `应付账款 - 发票号: ${invoice.invoice_number}`,
        },
      ];

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
    items,
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
    accountingConfig.getAccountCode('ACCOUNTS_PAYABLE'),
    '应付账款'
  );
  const cashOrBankCode =
    paymentData.payment_method === '现金'
      ? accountingConfig.getAccountCode('CASH')
      : accountingConfig.getAccountCode('BANK_DEPOSIT');
  const bankAccountId = await getAccountIdByCode(connection, cashOrBankCode, '银行/现金');
  const periodId = await getOpenPeriodIdByDate(connection, paymentData.payment_date);

  return {
    period_id: periodId,
    created_by: paymentData.created_by || financeConfig.get('system.defaultCreator', null),
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

      // 服务端权威重算未税/税额/价税合计
      applyNormalizedInvoiceAmounts(invoiceData);

      // 计算余额 - 确保使用正确的字段名
      const amountPolicy = normalizeInvoiceAmountPolicy(invoiceData);
      const balanceAmount = amountPolicy.totalAmount;
      invoiceData.total_amount = amountPolicy.totalAmount;
      assertInvoiceItemsMatchTotal(invoiceData.items, invoiceData.total_amount, invoiceData);

      // owner：created_by 必须写入，供 DataScope 行级授权
      const ownerId =
        invoiceData.created_by !== null &&
        invoiceData.created_by !== undefined &&
        invoiceData.created_by !== ''
          ? invoiceData.created_by
          : invoiceData.gl_entry?.created_by !== null &&
              invoiceData.gl_entry?.created_by !== undefined
            ? invoiceData.gl_entry.created_by
            : null;

      // 插入应付账款发票（含未税/税额/税率，供价税分离与账龄分析）
      const [result] = await conn.execute(
        `INSERT INTO ap_invoices
        (invoice_number, supplier_id, invoice_date, due_date,
         total_amount, amount_excluding_tax, tax_amount, tax_rate,
         paid_amount, balance_amount,
         currency_code, exchange_rate, status, terms, notes,
         supplier_invoice_number, source_type, source_id,
         created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceData.invoice_number,
          invoiceData.supplier_id,
          invoiceData.invoice_date,
          invoiceData.due_date,
          amountPolicy.totalAmount,
          invoiceData.amount_excluding_tax ?? invoiceData.subtotal ?? null,
          invoiceData.tax_amount ?? null,
          invoiceData.tax_rate ?? null,
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
          ownerId,
          ownerId,
        ]
      );

      const invoiceId = result.insertId;

      // 批量插入发票明细项（1次SQL替代N次）
      if (invoiceData.items && Array.isArray(invoiceData.items) && invoiceData.items.length > 0) {
        const itemValues = invoiceData.items.map((item) => [
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

      // 已确认发票默认同步生成总账凭证；合并生成路径可 skip_gl_entry，由上层写一张合并凭证。
      if (invoiceData.status === INVOICE_STATUS.CONFIRMED) {
        if (!amountPolicy.isCreditNote && toCents(invoiceData.total_amount) <= 0) {
          throw new Error('发票金额必须大于0才能确认');
        }
        // 强制三单匹配时：来源为收货的 AP 须先有 confirmed 匹配单
        if (
          invoiceData.source_type === 'purchase_receipt' &&
          invoiceData.source_id
        ) {
          try {
            const ThreeWayMatchService = require('../services/finance/ThreeWayMatchService');
            if (await ThreeWayMatchService.isMatchRequired()) {
              const ok = await ThreeWayMatchService.hasConfirmedMatchForReceipt(
                invoiceData.source_id
              );
              if (!ok) {
                throw new Error(
                  '已开启三单匹配强制：请先完成并确认 PO-收货-发票匹配，再确认应付'
                );
              }
            }
          } catch (e) {
            if (e.message && e.message.includes('三单匹配')) throw e;
            // 表未建时忽略强制
          }
        }
        if (!invoiceData.skip_gl_entry) {
          await createInvoiceConfirmationEntry(
            conn,
            { ...invoiceData, id: invoiceId },
            invoiceData.created_by
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

    // 查询发票明细项（库列 snake；出参由 toInvoiceApi 统一 camel）
    const [items] = await db.pool.execute(
      `SELECT i.id, i.material_id, i.description, i.quantity, i.unit_price, i.amount,
              m.code AS material_code, m.name AS material_name, m.specs AS specification
       FROM ap_invoice_items i
       LEFT JOIN materials m ON i.material_id = m.id
       WHERE i.invoice_id = ?
       ORDER BY i.id ASC`,
      [id]
    );

    invoice.items = items;
    return toInvoiceApi(invoice, 'ap');
  },

  /**
   * 获取应付账款发票列表
   */
  getInvoices: async (filters = {}, page = 1, pageSize = 20) => {
    // 确保page和pageSize是数字
    const pagination = parsePagination(page, pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    const numPage = pagination.page;
    const numPageSize = pagination.pageSize;

    // 优化：移除不必要的表存在性检查，直接使用JOIN查询
    // 如果suppliers表不存在，JOIN查询会自动处理

    const scopeClause = filters.scopeClause || { join: '', where: '', params: [] };

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
    if (scopeClause.where) {
      whereClause += scopeClause.where;
      params.push(...(scopeClause.params || []));
    }

    // 查询总记录数 - 使用统一的JOIN查询
    const countQuery = `
        SELECT COUNT(*) as total
        FROM ap_invoices a
        LEFT JOIN suppliers s ON a.supplier_id = s.id
        ${scopeClause.join || ''}
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
    const offset = pagination.offset;

    // 列表 SQL 只选 snake 列；出参统一 toInvoiceApi（禁止 SQL 里 AS camel 双轨）
    const dataQuery = `
        SELECT a.id, a.invoice_number, a.supplier_invoice_number, a.supplier_id,
              s.name AS supplier_name,
              DATE_FORMAT(a.invoice_date, '%Y-%m-%d') AS invoice_date,
              DATE_FORMAT(a.due_date, '%Y-%m-%d') AS due_date,
              a.total_amount, a.amount_excluding_tax, a.tax_amount, a.tax_rate,
              a.paid_amount, a.balance_amount, a.terms, a.source_type, a.source_id,
              a.status, DATE_FORMAT(a.created_at, '%Y-%m-%d') AS created_at
        FROM ap_invoices a
        LEFT JOIN suppliers s ON a.supplier_id = s.id
        ${scopeClause.join || ''}
        ${whereClause}
        ORDER BY a.invoice_date DESC, a.id DESC
        LIMIT ${numPageSize} OFFSET ${offset}`;

    const [rows] = await db.pool.query(dataQuery, params);

    return {
      data: (rows || []).map((row) => toInvoiceApi(row, 'ap')),
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
      assertManualStatusTransition(invoice.status, status, invoice);

      if (invoice.status !== status && status === INVOICE_STATUS.CONFIRMED) {
        const amountPolicy = normalizeInvoiceAmountPolicy(invoice);
        if (!amountPolicy.isCreditNote && toCents(invoice.total_amount) <= 0) {
          throw new Error('发票金额必须大于0才能确认');
        }
        if (invoice.source_type === 'purchase_receipt' && invoice.source_id) {
          try {
            const ThreeWayMatchService = require('../services/finance/ThreeWayMatchService');
            if (await ThreeWayMatchService.isMatchRequired()) {
              const ok = await ThreeWayMatchService.hasConfirmedMatchForReceipt(invoice.source_id);
              if (!ok) {
                throw new Error(
                  '已开启三单匹配强制：请先完成并确认 PO-收货-发票匹配，再确认应付'
                );
              }
            }
          } catch (e) {
            if (e.message && e.message.includes('三单匹配')) throw e;
          }
        }
        await createInvoiceConfirmationEntry(
          connection,
          invoice,
          options.updated_by || options.created_by
        );
      }

      // 已确认/逾期→取消：冲销关联确认凭证（未付款已在 assertManualStatusTransition 校验）
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
            sourceType: 'ap_invoice',
            sourceId: invoice.id,
            documentNumber: invoice.invoice_number,
            documentType: DOCUMENT_TYPE_MAPPING.PURCHASE_INVOICE,
            voidedBy,
            reason: `应付发票作废 ${invoice.invoice_number}`,
          });
        } catch (revErr) {
          // 历史数据可能无 GL 凭证；其余冲销失败必须阻断作废，避免账实不一致
          if (!/未找到|不存在|not found|NO_ENTRY|无可冲销/i.test(String(revErr.message || ''))) {
            throw revErr;
          }
          logger.warn(`[AP] 作废时未找到可冲销凭证: ${revErr.message}`);
        }
      }

      if (invoice.status !== status) {
        await connection.execute(
          'UPDATE ap_invoices SET status = ?, updated_at = NOW() WHERE id = ?',
          [status, id]
        );
      }

      if (status === INVOICE_STATUS.CANCELLED || status === 'cancelled' || status === 'void' || status === '作废') {
        const FinanceIntegrationService = require('../services/external/FinanceIntegrationService');
        await FinanceIntegrationService.releaseInvoiceSourceOnCancel(
          connection,
          'ap_invoices',
          id
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
                total_amount, amount_excluding_tax, tax_amount, tax_rate,
                paid_amount, balance_amount, terms, notes
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
            Math.abs(
              parseFloat(invoiceData.total_amount || 0) - parseFloat(current.total_amount || 0)
            ) > 0.01) ||
          (invoiceData.invoice_number && invoiceData.invoice_number !== current.invoice_number) ||
          (invoiceData.supplier_id &&
            Number(invoiceData.supplier_id) !== Number(current.supplier_id)) ||
          (invoiceData.invoice_date &&
            String(invoiceData.invoice_date) !== String(current.invoice_date)) ||
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
          [invoiceData.supplier_invoice_number || null, invoiceData.notes ?? null, invoiceData.id]
        );

        await connection.commit();
        return true;
      }

      const amountPolicy = normalizeInvoiceAmountPolicy(invoiceData);
      invoiceData.total_amount = amountPolicy.totalAmount;
      assertInvoiceItemsMatchTotal(invoiceData.items, invoiceData.total_amount, invoiceData);

      // 更新发票主数据（含未税/税额/税率，与 create 对称）
      await connection.execute(
        `UPDATE ap_invoices
         SET invoice_number = ?, supplier_invoice_number = ?, supplier_id = ?, invoice_date = ?,
             due_date = ?, total_amount = ?, amount_excluding_tax = ?, tax_amount = ?, tax_rate = ?,
             balance_amount = ?, terms = ?, notes = ?, updated_at = NOW()
         WHERE id = ?`,
        [
          invoiceData.invoice_number,
          invoiceData.supplier_invoice_number || null,
          invoiceData.supplier_id,
          invoiceData.invoice_date,
          invoiceData.due_date,
          invoiceData.total_amount,
          invoiceData.amount_excluding_tax ?? invoiceData.subtotal ?? null,
          invoiceData.tax_amount ?? null,
          invoiceData.tax_rate ?? null,
          invoiceData.total_amount - (invoiceData.paid_amount || 0), // 重新计算余额
          invoiceData.terms ?? null,
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
          const itemValues = invoiceData.items.map((item) => [
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
        if (
          apSource.length > 0 &&
          apSource[0].source_type === 'purchase_receipt' &&
          apSource[0].source_id
        ) {
          const {
            TAX_RELATED_DOCUMENT_TYPES,
            taxRelatedDocumentTypeMatchList,
          } = require('../constants/financeConstants');
          const receiptTaxTypes = taxRelatedDocumentTypeMatchList(
            TAX_RELATED_DOCUMENT_TYPES.PURCHASE_RECEIPT
          );
          const receiptTaxPlaceholders = receiptTaxTypes.map(() => '?').join(', ');
          const [syncResult] = await connection.execute(
            `UPDATE tax_invoices
             SET invoice_number = ?, updated_at = NOW()
             WHERE related_document_type IN (${receiptTaxPlaceholders})
               AND related_document_id = ?
               AND status = '未认证'
               AND gl_entry_id IS NULL`,
            [invoiceData.supplier_invoice_number, ...receiptTaxTypes, apSource[0].source_id]
          );
          if (syncResult.affectedRows > 0) {
            logger.info('[AP→Tax同步] 供应商发票号同步成功', {
              apInvoiceId: invoiceData.id,
              supplierInvoiceNumber: invoiceData.supplier_invoice_number,
              receiptId: apSource[0].source_id,
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
  /**
   * 创建付款记录
   * @param {Object|null} externalConnection 可选外层事务连接（批量付款时复用）
   */
  createPayment: async (paymentData, paymentItems, externalConnection = null) => {
    const isExternalTransaction = !!externalConnection;
    const connection = externalConnection || (await db.pool.getConnection());
    try {
      if (!isExternalTransaction) {
        await connection.beginTransaction();
      }

      // 大额付款审批钩子
      const PaymentApprovalGuard = require('../services/finance/PaymentApprovalGuard');
      const payAmount = Array.isArray(paymentItems)
        ? paymentItems.reduce((s, it) => s + Number(it.amount || it.payment_amount || 0), 0)
        : Number(paymentData.amount || paymentData.total_amount || 0);
      await PaymentApprovalGuard.assertPayable({
        amount: payAmount,
        approved: paymentData.approved,
        skipApproval: paymentData.skipApproval,
        workflowStatus: paymentData.workflow_status || paymentData.workflowStatus,
        approvalNo: paymentData.approval_no || paymentData.approvalNo,
        approvedBy: paymentData.created_by || paymentData.approved_by,
        paymentRef: paymentData.payment_number,
        remark: paymentData.notes,
        connection,
      });

      if (
        BANK_BACKED_PAYMENT_METHODS.has(paymentData.payment_method) &&
        !paymentData.bank_account_id
      ) {
        throw new Error(`${paymentData.payment_method}必须选择付款账户`);
      }

      // 预算硬控：传入费用科目时占用预算；无适用预算则跳过（skipIfNoBudget）
      const budgetAccountId =
        paymentData.budget_account_id ||
        paymentData.gl_entry?.expense_account_id ||
        paymentData.gl_entry?.purchase_cost_account_id ||
        null;
      if (budgetAccountId) {
        const BudgetControlService = require('../services/business/BudgetControlService');
        await BudgetControlService.executeBudgetControl(
          {
            accountId: budgetAccountId,
            departmentId:
              paymentData.department_id || paymentData.gl_entry?.department_id || null,
            amount: paymentData.total_amount,
            date: paymentData.payment_date,
            documentType: 'ap_payment',
            documentId: null,
            documentNo: paymentData.payment_number,
            description: `应付付款 ${paymentData.payment_number}`,
            userId: paymentData.created_by,
            skipIfNoBudget: true,
          },
          connection
        );
      }

      // 插入付款记录
      const [result] = await connection.execute(
        `INSERT INTO ap_payments
        (payment_number, supplier_id, payment_date, total_amount,
         payment_method, reference_number, bank_account_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          paymentData.payment_number,
          paymentData.supplier_id,
          paymentData.payment_date,
          paymentData.total_amount,
          paymentData.payment_method,
          paymentData.reference_number || null,
          paymentData.bank_account_id || null,
          paymentData.notes || null,
          paymentData.created_by || null,
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
        throw new Error('付款单总金额必须等于付款明细金额合计（不含折扣）');
      }

      // 插入付款明细并更新发票状态
      // totalCashCents = 实际出账；totalSettlementCents = 核销额（出账+折扣）
      let totalCashCents = 0;
      let totalSettlementCents = 0;
      let totalDiscountCents = 0;
      for (const item of sortedPaymentItems) {
        const [invoices] = await connection.execute(
          'SELECT id, invoice_number, supplier_invoice_number, supplier_id, invoice_date, due_date, total_amount, amount_excluding_tax, tax_amount, tax_rate, paid_amount, balance_amount, currency_code, exchange_rate, status, terms, notes, created_at, updated_at, source_type, source_id, created_by, updated_by FROM ap_invoices WHERE id = ? FOR UPDATE',
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
          `发票 ${invoice.invoice_number} 付款核销金额`
        );

        await connection.execute(
          'INSERT INTO ap_payment_items (payment_id, invoice_id, amount, discount_amount) VALUES (?, ?, ?, ?)',
          [paymentId, item.invoice_id, line.cashAmount, line.discountAmount]
        );

        const paidAmountCents = toCents(invoice.paid_amount) + line.settlementCents;
        const totalAmountCents = toCents(invoice.total_amount);
        const newPaidAmount = fromCents(paidAmountCents);
        const newBalanceAmount = fromCents(Math.max(0, totalAmountCents - paidAmountCents));
        const newStatus = invoiceStatusAfterSettlement(paidAmountCents, totalAmountCents);

        await connection.execute(
          'UPDATE ap_invoices SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, newBalanceAmount, newStatus, item.invoice_id]
        );

        totalCashCents += line.cashCents;
        totalSettlementCents += line.settlementCents;
        totalDiscountCents += line.discountCents;
      }

      const totalPaid = fromCents(totalCashCents);
      const totalSettlement = fromCents(totalSettlementCents);
      const totalDiscount = fromCents(totalDiscountCents);

      // 如果是银行类付款且有实际出账金额，更新银行账户余额并创建银行交易记录
      if (
        BANK_BACKED_PAYMENT_METHODS.has(paymentData.payment_method) &&
        totalCashCents > 0
      ) {
        const [bankAccounts] = await connection.execute(
          'SELECT id, account_number, account_name, bank_name, branch_name, currency_code, current_balance, opening_balance, account_type, is_active, contact_person, contact_phone, notes, created_at, updated_at, created_by, updated_by, last_transaction_date FROM bank_accounts WHERE id = ? FOR UPDATE',
          [paymentData.bank_account_id]
        );

        if (bankAccounts.length === 0) {
          throw new Error(`银行账户ID ${paymentData.bank_account_id} 不存在`);
        }

        const bankAccount = bankAccounts[0];
        if (String(bankAccount.currency_code || 'CNY').toUpperCase() !== 'CNY') {
          throw new Error(`银行账户 "${bankAccount.account_name}" 不是人民币账户，当前不能用于付款`);
        }
        if (bankAccount.is_active === 0) {
          throw new Error(`银行账户 "${bankAccount.account_name}" 已被冻结，无法用于付款`);
        }

        assertBankBalanceSufficient(toCents(bankAccount.current_balance), totalCashCents);

        // 创建银行交易记录（仅实付金额，不含折扣）
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
              (sortedPaymentItems.length > 1 ? ` (含${sortedPaymentItems.length}张发票)` : '') +
              (totalDiscountCents > 0 ? `；折扣 ${totalDiscount}` : ''),
            false,
            paymentData.supplier_name || '未知供应商',
            sortedPaymentItems[0]?.invoice_id || null,
            'AP',
            'approved',
          ]
        );
        bankTransactionId = bankTransactionResult.insertId;

        const BankBalanceService = require('../services/business/BankBalanceService');
        await BankBalanceService.syncAccountBalance(connection, paymentData.bank_account_id);

        logger.info(`[AP付款] 银行账户余额已按流水重算: ${bankAccount.account_name}`);
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

        // 付款分录：借应付(核销额) = 贷银行(实付) + 贷财务费用(折扣冲减)
        const entryItems = [
          {
            account_id: glEntry.payable_account_id,
            debit_amount: totalSettlement,
            credit_amount: 0,
            description: `应付账款减少 - 付款单号: ${paymentData.payment_number}`,
          },
        ];
        if (totalCashCents > 0) {
          entryItems.push({
            account_id: glEntry.bank_account_id,
            debit_amount: 0,
            credit_amount: totalPaid,
            description: `付款 - 付款单号: ${paymentData.payment_number}`,
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
            debit_amount: 0,
            credit_amount: totalDiscount,
            description: `现金折扣 - 付款单号: ${paymentData.payment_number}`,
          });
        }

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

      if (!isExternalTransaction) {
        await connection.commit();
      }
      return paymentId;
    } catch (error) {
      if (!isExternalTransaction) {
        await connection.rollback();
      }
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
      if (!isExternalTransaction) {
        connection.release();
      }
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
                p.bank_account_id, p.notes, p.status,
                DATE_FORMAT(p.voided_at, '%Y-%m-%d %H:%i:%s') as voided_at,
                p.voided_by, p.void_reason,
                DATE_FORMAT(p.created_at, '%Y-%m-%d') as created_at,
                s.name as supplier_name, b.account_name as bank_account_name,
                COALESCE(u.real_name, u.username) as voided_by_name
         FROM ap_payments p
         LEFT JOIN suppliers s ON p.supplier_id = s.id
         LEFT JOIN bank_accounts b ON p.bank_account_id = b.id
         LEFT JOIN users u ON p.voided_by = u.id
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
      const pagination = parsePagination(page, pageSize, {
        defaultPageSize: 20,
        maxPageSize: 100,
      });
      const numPage = pagination.page;
      const numPageSize = pagination.pageSize;
      const offset = pagination.offset;

      const scopeClause = filters.scopeClause || { join: '', where: '', params: [] };

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
        ${scopeClause.join || ''}
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

      if (scopeClause.where) {
        query += scopeClause.where;
        params.push(...(scopeClause.params || []));
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
        ${scopeClause.join || ''}
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

      if (scopeClause.where) {
        countQuery += scopeClause.where;
        countParams.push(...(scopeClause.params || []));
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
        `SELECT p.*, pi.invoice_id, pi.amount as item_amount, pi.discount_amount as item_discount_amount
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

      // 4. 恢复关联发票的余额和状态（核销额 = 实付 + 折扣）
      for (const item of payments) {
        if (!item.invoice_id) continue;

        const [invoices] = await connection.execute(
          'SELECT id, invoice_number, supplier_invoice_number, supplier_id, invoice_date, due_date, total_amount, amount_excluding_tax, tax_amount, tax_rate, paid_amount, balance_amount, currency_code, exchange_rate, status, terms, notes, created_at, updated_at, source_type, source_id, created_by, updated_by FROM ap_invoices WHERE id = ? FOR UPDATE',
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
          'UPDATE ap_invoices SET paid_amount = ?, balance_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, newBalanceAmount, newStatus, item.invoice_id]
        );

        logger.info(`[作废付款] 已恢复发票 ${invoice.invoice_number} 的余额: ${newBalanceAmount}`);
      }

      // 5. 如果有银行交易记录，创建冲销交易
      if (payment.bank_account_id && BANK_BACKED_PAYMENT_METHODS.has(payment.payment_method)) {
        try {
          // 获取原银行交易记录
          const [bankTxs] = await connection.execute(
            `SELECT id, transaction_number, bank_account_id, transaction_date, transaction_type, amount, reference_number, description, is_reconciled, reconciliation_date, related_party, created_at, updated_at, created_by, updated_by, related_invoice_id, related_invoice_type, tax_return_id, gl_entry_id, audit_status, auditor_id, audit_time, audit_remark, submitted_by, submitted_at, reconcile_confirmed_by, reconcile_confirmed_at, status, approved_by, approved_at, reject_reason, category, payment_method FROM bank_transactions
             WHERE transaction_number = ? AND bank_account_id = ?
             LIMIT 1
             FOR UPDATE`,
            [payment.payment_number, payment.bank_account_id]
          );

          if (bankTxs.length === 0) {
            throw new Error(
              `未找到付款单 ${payment.payment_number} 对应的银行流水，无法作废（资金类付款必须有银行链路）`
            );
          }

          const originalTx = bankTxs[0];
          if (isTruthyFlag(originalTx.is_reconciled)) {
            throw new Error('关联银行流水已对账，请先取消对账后再作废付款');
          }

          const reversalDate = currentDateString();
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

          const [reversalBankTxResult] = await connection.execute(
            `INSERT INTO bank_transactions
             (transaction_number, bank_account_id, transaction_date, transaction_type,
             amount, reference_number, description, is_reconciled, related_party, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              reversalBankTransactionNumber,
              payment.bank_account_id,
              reversalDate,
              '转入',
              payment.total_amount,
              payment.payment_number,
              `冲销付款记录 - 原因: ${voidData.void_reason}`,
              false,
              originalTx.related_party || '',
              'approved',
            ]
          );
          reversalBankTransactionId = reversalBankTxResult.insertId;

          const BankBalanceService = require('../services/business/BankBalanceService');
          await BankBalanceService.syncAccountBalance(connection, payment.bank_account_id);

          logger.info('[作废付款] 已创建冲销银行交易并按流水重算余额');
        } catch (err) {
          logger.error(`[作废付款] 冲销银行交易失败: ${err.message}`);
          throw new Error(`冲销银行交易失败: ${err.message}`, { cause: err });
        }
      }

      // 6. 按单据链路冲销关联总账凭证（规范 document_type = payment）
      try {
        const reversed = await VoucherReversalService.reverseBusinessVouchers(connection, {
          sourceType: 'ap_payment',
          sourceId: paymentId,
          documentNumber: payment.payment_number,
          documentType: DOCUMENT_TYPES.PAYMENT,
          voidedBy,
          reason: `冲销付款凭证 - 原因: ${voidData.void_reason}`,
        });
        for (const item of reversed) {
          reversalEntries.push({ entryId: item.entryId, entryNumber: item.entryNumber });
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
          await DocumentLinkService.createLink(
            {
              source_type: 'bank_transaction',
              source_id: originalBankTransactionId,
              source_code: originalBankTransactionNumber,
              target_type: 'bank_transaction',
              target_id: reversalBankTransactionId,
              target_code: reversalBankTransactionNumber,
              link_type: 'related',
              remark: 'AP payment void reversal',
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
      const currentDate = toLocalDateString(asOfDate || currentDateString());

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
      throw error;
    }
  },


  /**
   * 获取供应商应付款汇总（含联系人信息和余额筛选）
   * @param {Object} filters - 筛选条件
   * @param {string} [filters.supplierName] - 供应商名称（模糊匹配）
   * @param {string} [filters.status] - 发票状态
   * @returns {Promise<Array>} 供应商应付款汇总列表
   */
  getSupplierPayablesSummary: async (filters = {}) => {
    const { supplierName, status } = filters;
    let whereClause = '';
    const params = [];

    if (supplierName) {
      whereClause += ' AND s.name LIKE ?';
      params.push(`%${supplierName}%`);
    }

    if (status) {
      whereClause += ' AND i.status = ?';
      params.push(status);
    }

    const [payables] = await db.pool.execute(
      `SELECT
        s.id AS supplierId,
        s.name AS supplierName,
        s.contact_person AS contactPerson,
        s.contact_phone AS contactPhone,
        COUNT(i.id) AS invoiceCount,
        COALESCE(SUM(i.total_amount), 0) AS totalAmount,
        COALESCE(SUM(i.paid_amount), 0) AS paidAmount,
        COALESCE(SUM(i.balance_amount), 0) AS balance,
        MAX(i.invoice_date) AS lastInvoiceDate
      FROM suppliers s
      LEFT JOIN ap_invoices i ON s.id = i.supplier_id
        AND i.status IN ('已确认', '部分付款')
      WHERE s.status = 1 ${whereClause}
      GROUP BY s.id, s.name, s.contact_person, s.contact_phone
      HAVING balance > 0
      ORDER BY balance DESC`,
      params
    );

    return payables.map((item) => ({
      supplierId: item.supplierId,
      supplierName: item.supplierName,
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
   * 应付结算看板：数量 + 金额汇总 + 未结清明细
   * settlementKey: all | unpaid | partial | paid | overdue | open
   */
  getSettlementDashboard: async (filters = {}) => {
    const { startDate, endDate, supplierName, settlementKey = 'open', limit = 50 } = filters;
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
    if (supplierName) {
      where.push('s.name LIKE ?');
      params.push(`%${supplierName}%`);
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
       FROM ap_invoices a
       LEFT JOIN suppliers s ON a.supplier_id = s.id
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

    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const [details] = await db.pool.execute(
      `SELECT
         a.id,
         a.invoice_number,
         a.supplier_invoice_number,
         a.supplier_id,
         s.name AS supplier_name,
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
       FROM ap_invoices a
       LEFT JOIN suppliers s ON a.supplier_id = s.id
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
      side: 'ap',
      asOf: new Date().toISOString().slice(0, 10),
      settlementKey: key,
      summary,
      details: details.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        supplierInvoiceNumber: row.supplier_invoice_number || null,
        partyId: row.supplier_id,
        partyName: row.supplier_name,
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

module.exports = apModel;
