/**
 * 税务管理控制器
 *
 * 处理税务发票、税务申报相关的HTTP请求
 *
 * @module controllers/business/finance/taxController
 */

const taxModel = require('../../../models/tax');
const { safeParseId } = require('../../../utils/safeParseId');
const TaxAccountingService = require('../../../services/business/TaxAccountingService');
const DocumentLinkService = require('../../../services/business/DocumentLinkService');
const { DOCUMENT_LINK_TYPES: DocType } = require('../../../constants/documentLinkTypes');
const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const db = require('../../../config/db');
const { currentDateString, toLocalDateString } = require('../../../utils/dateUtils');
const Precision = require('../../../utils/precision');
const { roundMoney } = require('../../../utils/money');
const BusinessError = require('../../../utils/BusinessError');
const { isTruthyFlag } = require('../../../utils/finance/settlementMath');
const { mapKeysToSnake } = require('../../../utils/fieldMap');

function validateBusinessDate(value, fieldName) {
  const dateString = value ? String(value).slice(0, 10) : currentDateString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    throw new Error(`${fieldName}格式不正确，请使用YYYY-MM-DD`);
  }

  const [year, month, day] = dateString.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName}不是有效日期`);
  }

  return dateString;
}

async function generateTaxPaymentTransactionNumber(connection) {
  const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');
  return CodeGeneratorService.nextCode('tax_payment', connection);
}

function ensureTaxInvoiceCanChangeLink(invoice) {
  if (invoice.status === '已作废') {
    throw new Error('已作废的发票不能变更关联单据');
  }
  if (invoice.status !== '未认证' || invoice.gl_entry_id) {
    throw new Error('已认证或已入账的发票不能变更关联单据');
  }
}

function ensureTaxInvoiceDocumentTypeMatches(invoice, documentType) {
  if (invoice.invoice_type === '进项' && documentType !== 'ap_invoice') {
    throw new Error('进项发票只能关联应付发票');
  }
  if (invoice.invoice_type === '销项' && documentType !== 'ar_invoice') {
    throw new Error('销项发票只能关联应收发票');
  }
}

function getMonthRangeFromReturnPeriod(returnPeriod) {
  const period = String(returnPeriod || '');
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('增值税申报期间必须使用 YYYY-MM 格式');
  }

  const [year, month] = period.split('-').map(Number);
  if (month < 1 || month > 12) {
    throw new Error('增值税申报期间月份无效');
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01`,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

async function calculateVATReturnData(returnPeriod) {
  const { startDate, endDate } = getMonthRangeFromReturnPeriod(returnPeriod);

  const [salesRows] = await db.pool.execute(
    `SELECT
       COALESCE(SUM(amount_excluding_tax), 0) AS sales_amount,
       COALESCE(SUM(tax_amount), 0) AS sales_output_tax
     FROM tax_invoices
     WHERE invoice_type = '销项'
       AND status IN ('已认证', '已抵扣')
       AND invoice_date BETWEEN ? AND ?`,
    [startDate, endDate]
  );

  const [purchaseRows] = await db.pool.execute(
    `SELECT
       COALESCE(SUM(amount_excluding_tax), 0) AS purchase_amount,
       COALESCE(SUM(tax_amount), 0) AS purchase_input_tax
     FROM tax_invoices
     WHERE invoice_type = '进项'
       AND status IN ('已认证', '已抵扣')
       AND invoice_date BETWEEN ? AND ?`,
    [startDate, endDate]
  );

  const [deductionRows] = await db.pool.execute(
    `SELECT COALESCE(SUM(tax_amount), 0) AS input_tax_deduction
     FROM tax_invoices
     WHERE invoice_type = '进项'
       AND status = '已抵扣'
       AND deduction_date BETWEEN ? AND ?`,
    [startDate, endDate]
  );

  const sales = salesRows[0] || {};
  const purchase = purchaseRows[0] || {};
  const inputTaxDeduction = roundMoney(deductionRows[0]?.input_tax_deduction || 0);
  const salesOutputTax = roundMoney(sales.sales_output_tax || 0);
  const taxPayable = roundMoney(Math.max(Precision.sub(salesOutputTax, inputTaxDeduction), 0));

  return {
    sales_amount: roundMoney(sales.sales_amount || 0),
    sales_output_tax: salesOutputTax,
    purchase_amount: roundMoney(purchase.purchase_amount || 0),
    purchase_input_tax: roundMoney(purchase.purchase_input_tax || 0),
    input_tax_deduction: inputTaxDeduction,
    tax_payable: taxPayable,
  };
}

const taxController = {
  /**
   * 创建税务发票
   * POST /finance/tax/invoices
   */
  createTaxInvoice: async (req, res) => {
    let connection;
    try {
      const invoiceData = {
        ...req.body,
        created_by: getAuthenticatedUserId(req),
      };

      // 验证必填字段
      const requiredFields = [
        'invoice_type',
        'invoice_number',
        'invoice_date',
        'amount_excluding_tax',
        'tax_rate',
        'tax_amount',
        'total_amount',
      ];

      for (const field of requiredFields) {
        if (invoiceData[field] === undefined || invoiceData[field] === null || invoiceData[field] === '') {
          return ResponseHandler.error(res, `缺少必填字段: ${field}`, 'VALIDATION_ERROR', 400);
        }
      }

      if (invoiceData.status === '已认证') {
        connection = await db.pool.getConnection();
        await connection.beginTransaction();

        const invoiceId = await taxModel.createTaxInvoice(invoiceData, connection);
        const [invoices] = await connection.execute('SELECT id, invoice_type, invoice_number, invoice_code, invoice_date, supplier_id, customer_id, supplier_or_customer_name, supplier_tax_number, amount_excluding_tax, tax_rate, tax_amount, total_amount, status, certification_date, deduction_date, related_document_type, related_document_id, gl_entry_id, remark, created_by, created_at, updated_at FROM tax_invoices WHERE id = ?', [
          invoiceId,
        ]);
        const invoice = invoices[0];
        const userId = getAuthenticatedUserId(req);

        if (invoice.invoice_type === '销项') {
          await TaxAccountingService.generateOutputTaxEntry(invoice, userId, connection);
        } else if (invoice.invoice_type === '进项') {
          await TaxAccountingService.generateInputTaxEntry(invoice, userId, connection);
        }

        await connection.commit();
        return ResponseHandler.success(res, { id: invoiceId }, '税务发票创建成功', 201);
      }

      // 创建税务发票
      const invoiceId = await taxModel.createTaxInvoice(invoiceData);

      return ResponseHandler.success(res, { id: invoiceId }, '税务发票创建成功', 201);
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }
      logger.error('创建税务发票失败:', error);
      const isBusinessError = BusinessError.is(error)
        || /未配置|会计科目|期间|分录|借贷|不存在/.test(error.message || '');
      return ResponseHandler.error(
        res,
        isBusinessError ? error.message : '创建税务发票失败',
        isBusinessError ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError ? 400 : 500,
        error
      );
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  /**
   * 获取税务发票列表
   * GET /finance/tax/invoices
   */
  getTaxInvoices: async (req, res) => {
    try {
      // HTTP camel query → snake filters（兼容旧 snake query）
      const q = mapKeysToSnake(req.query || {});
      const filters = {
        invoice_type: q.invoice_type || req.query.invoice_type,
        status: q.status || req.query.status,
        invoice_number: q.invoice_number || req.query.invoice_number,
        start_date: q.start_date || req.query.start_date || req.query.startDate,
        end_date: q.end_date || req.query.end_date || req.query.endDate,
        supplier_id: q.supplier_id || req.query.supplier_id || req.query.supplierId,
        customer_id: q.customer_id || req.query.customer_id || req.query.customerId,
        limit: q.limit || req.query.limit || 50,
        offset: q.offset || req.query.offset || 0,
      };

      const invoices = await taxModel.getTaxInvoices(filters);

      return ResponseHandler.success(res, invoices, '获取税务发票列表成功');
    } catch (error) {
      logger.error('获取税务发票列表失败:', error);
      return ResponseHandler.error(res, '获取税务发票列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取税务发票详情
   * GET /finance/tax/invoices/:id
   */
  getTaxInvoiceById: async (req, res) => {
    try {
      const id = safeParseId(req.params.id, '发票ID');
      const invoice = await taxModel.getTaxInvoiceById(id);

      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      return ResponseHandler.success(res, invoice, '获取税务发票详情成功');
    } catch (error) {
      logger.error('获取税务发票详情失败:', error);
      return ResponseHandler.error(res, '获取税务发票详情失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 认证税务发票
   * POST /finance/tax/invoices/:id/certify
   */
  certifyTaxInvoice: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      const id = safeParseId(req.params.id, '发票ID');
      const { certification_date } = mapKeysToSnake(req.body || {});

      await connection.beginTransaction();

      const [invoices] = await connection.execute(
        'SELECT id, invoice_type, invoice_number, invoice_code, invoice_date, supplier_id, customer_id, supplier_or_customer_name, supplier_tax_number, amount_excluding_tax, tax_rate, tax_amount, total_amount, status, certification_date, deduction_date, related_document_type, related_document_id, gl_entry_id, remark, created_by, created_at, updated_at FROM tax_invoices WHERE id = ? FOR UPDATE',
        [id]
      );
      const invoice = invoices[0];

      if (!invoice) {
        await connection.rollback();
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      if (invoice.status !== '未认证') {
        await connection.rollback();
        return ResponseHandler.error(res, '发票状态不正确，无法认证', 'VALIDATION_ERROR', 400);
      }

      const certifiedDate = certification_date || currentDateString();
      await connection.execute(
        'UPDATE tax_invoices SET status = ?, certification_date = ? WHERE id = ?',
        ['已认证', certifiedDate, id]
      );

      // 自动生成会计分录
      const updatedInvoice = {
        ...invoice,
        status: '已认证',
        certification_date: certifiedDate,
      };
      const userId = getAuthenticatedUserId(req);

      let entryInfo;
      if (updatedInvoice.invoice_type === '销项') {
        entryInfo = await TaxAccountingService.generateOutputTaxEntry(
          updatedInvoice,
          userId,
          connection
        );
      } else if (updatedInvoice.invoice_type === '进项') {
        entryInfo = await TaxAccountingService.generateInputTaxEntry(
          updatedInvoice,
          userId,
          connection
        );
      }

      await connection.commit();
      return ResponseHandler.success(res, { entryInfo }, '税务发票认证成功，会计分录已自动生成');
    } catch (error) {
      await connection.rollback();
      logger.error('认证税务发票失败:', error);
      const isBusinessError = BusinessError.is(error)
        || /未配置|会计科目|期间|分录|借贷|不存在|状态/.test(error.message || '');
      return ResponseHandler.error(
        res,
        isBusinessError ? error.message : '认证税务发票失败',
        isBusinessError ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError ? 400 : 500,
        error
      );
    } finally {
      connection.release();
    }
  },

  /**
   * 抵扣税务发票
   * POST /finance/tax/invoices/:id/deduct
   */
  deductTaxInvoice: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      const id = safeParseId(req.params.id, '发票ID');
      const { deduction_date } = mapKeysToSnake(req.body || {});

      await connection.beginTransaction();
      const [invoices] = await connection.execute(
        'SELECT id, invoice_type, invoice_number, invoice_code, invoice_date, supplier_id, customer_id, supplier_or_customer_name, supplier_tax_number, amount_excluding_tax, tax_rate, tax_amount, total_amount, status, certification_date, deduction_date, related_document_type, related_document_id, gl_entry_id, remark, created_by, created_at, updated_at FROM tax_invoices WHERE id = ? FOR UPDATE',
        [id]
      );
      const invoice = invoices[0];

      if (!invoice) {
        await connection.rollback();
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      if (invoice.status !== '已认证') {
        await connection.rollback();
        return ResponseHandler.error(res, '发票状态不正确，无法抵扣', 'VALIDATION_ERROR', 400);
      }

      if (invoice.invoice_type !== '进项') {
        await connection.rollback();
        return ResponseHandler.error(res, '只有进项发票可以抵扣', 'VALIDATION_ERROR', 400);
      }

      const deductionDate = validateBusinessDate(deduction_date, '抵扣日期');
      await TaxAccountingService.getCurrentPeriodId(deductionDate, connection);

      await connection.execute(
        'UPDATE tax_invoices SET status = ?, deduction_date = ? WHERE id = ?',
        ['已抵扣', deductionDate, id]
      );

      await connection.commit();
      return ResponseHandler.success(res, null, '税务发票抵扣成功');
    } catch (error) {
      await connection.rollback();
      logger.error('抵扣税务发票失败:', error);
      return ResponseHandler.error(res, '抵扣税务发票失败', 'SERVER_ERROR', 500, error);
    } finally {
      connection.release();
    }
  },

  /**
   * 创建税务申报
   * POST /finance/tax/returns
   */
  createTaxReturn: async (req, res) => {
    try {
      const returnData = {
        ...req.body,
        created_by: getAuthenticatedUserId(req),
      };

      // 验证必填字段
      if (!returnData.return_period || !returnData.return_type) {
        return ResponseHandler.error(
          res,
          '缺少必填字段: return_period 或 return_type',
          'VALIDATION_ERROR',
          400
        );
      }

      if (String(returnData.return_period).length > 20) {
        return ResponseHandler.error(res, '申报期间长度不能超过20个字符', 'VALIDATION_ERROR', 400);
      }

      if (!['增值税', '企业所得税', '个人所得税'].includes(returnData.return_type)) {
        return ResponseHandler.error(res, '无效的申报税种', 'VALIDATION_ERROR', 400);
      }

      if (returnData.return_type === '增值税' && returnData.auto_calculate !== false) {
        Object.assign(returnData, await calculateVATReturnData(returnData.return_period));
      }

      // 创建税务申报
      const returnId = await taxModel.createTaxReturn(returnData);

      return ResponseHandler.success(res, { id: returnId }, '税务申报创建成功', 201);
    } catch (error) {
      logger.error('创建税务申报失败:', error);
      const isBusinessError = BusinessError.is(error)
        || /申报期间|税种|YYYY-MM/.test(error.message || '');
      return ResponseHandler.error(
        res,
        isBusinessError ? error.message : '创建税务申报失败',
        isBusinessError ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError ? 400 : 500,
        error
      );
    }
  },

  /**
   * 获取税务申报列表
   * GET /finance/tax/returns
   */
  getTaxReturns: async (req, res) => {
    try {
      const q = mapKeysToSnake(req.query || {});
      const filters = {
        return_type: q.return_type || req.query.return_type || req.query.returnType,
        status: q.status || req.query.status,
        year: q.year || req.query.year,
        limit: q.limit || req.query.limit || 50,
        offset: q.offset || req.query.offset || 0,
      };

      const returns = await taxModel.getTaxReturns(filters);

      return ResponseHandler.success(res, returns, '获取税务申报列表成功');
    } catch (error) {
      logger.error('获取税务申报列表失败:', error);
      return ResponseHandler.error(res, '获取税务申报列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取税务申报详情
   * GET /finance/tax/returns/:id
   */
  getTaxReturnById: async (req, res) => {
    try {
      const id = safeParseId(req.params.id, '申报ID');
      const taxReturn = await taxModel.getTaxReturnById(id);

      if (!taxReturn) {
        return ResponseHandler.error(res, '税务申报不存在', 'NOT_FOUND', 404);
      }

      return ResponseHandler.success(res, taxReturn, '获取税务申报详情成功');
    } catch (error) {
      logger.error('获取税务申报详情失败:', error);
      return ResponseHandler.error(res, '获取税务申报详情失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 提交税务申报
   * POST /finance/tax/returns/:id/submit
   */
  submitTaxReturn: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);
      const { declaration_date } = mapKeysToSnake(req.body || {});

      // 获取申报信息
      const taxReturn = await taxModel.getTaxReturnById(id);

      if (!taxReturn) {
        return ResponseHandler.error(res, '税务申报不存在', 'NOT_FOUND', 404);
      }

      if (taxReturn.status !== '草稿') {
        return ResponseHandler.error(res, '申报状态不正确，无法提交', 'VALIDATION_ERROR', 400);
      }

      // 更新申报状态为"已申报"
      await taxModel.updateTaxReturnStatus(id, '已申报', { declaration_date });

      return ResponseHandler.success(res, null, '税务申报提交成功');
    } catch (error) {
      logger.error('提交税务申报失败:', error);
      return ResponseHandler.error(res, '提交税务申报失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 缴纳税款
   * POST /finance/tax/returns/:id/pay
   */
  payTaxReturn: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      const id = safeParseId(req.params.id, '申报ID');
      const { payment_date, bank_account_id } = mapKeysToSnake(req.body || {});

      await connection.beginTransaction();

      const [taxReturns] = await connection.execute(
        'SELECT id, return_period, return_type, sales_amount, sales_output_tax, purchase_amount, purchase_input_tax, input_tax_deduction, tax_payable, tax_paid, tax_balance, total_revenue, total_cost, total_expense, taxable_income, income_tax_rate, income_tax_payable, status, declaration_date, payment_date, gl_entry_id, remark, created_by, created_at, updated_at FROM tax_returns WHERE id = ? FOR UPDATE',
        [id]
      );
      if (taxReturns.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '税务申报不存在', 'NOT_FOUND', 404);
      }
      const taxReturn = taxReturns[0];

      if (taxReturn.status !== '已申报') {
        await connection.rollback();
        return ResponseHandler.error(res, '申报状态不正确，无法缴纳', 'VALIDATION_ERROR', 400);
      }

      const payableAmount = taxReturn.return_type === '增值税'
        ? roundMoney(taxReturn.tax_payable || 0)
        : roundMoney(taxReturn.income_tax_payable || taxReturn.tax_payable || 0);

      if (!Number.isFinite(payableAmount) || payableAmount < 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '应纳税额不能为负数', 'VALIDATION_ERROR', 400);
      }

      let bankTransactionId = null;
      let entryInfo = null;
      const paymentDate = validateBusinessDate(payment_date, '缴纳日期');
      const userId = getAuthenticatedUserId(req);

      if (payableAmount > 0) {
        if (taxReturn.return_type !== '增值税') {
          throw new Error('暂未配置该税种的自动会计分录规则，不能执行缴纳');
        }

        if (!bank_account_id) {
          await connection.rollback();
          return ResponseHandler.error(res, '请选择缴税银行账户', 'VALIDATION_ERROR', 400);
        }

        const [bankAccounts] = await connection.execute(
          'SELECT id, account_number, account_name, bank_name, branch_name, currency_code, current_balance, opening_balance, account_type, is_active, contact_person, contact_phone, notes, created_at, updated_at, created_by, updated_by, last_transaction_date FROM bank_accounts WHERE id = ? AND is_active = 1 FOR UPDATE',
          [bank_account_id]
        );
        if (bankAccounts.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(res, '缴税银行账户不存在或已停用', 'VALIDATION_ERROR', 400);
        }

        const bankAccount = bankAccounts[0];
        const currentBalance = roundMoney(bankAccount.current_balance || 0);
        if (Precision.sub(currentBalance, payableAmount) < 0) {
          await connection.rollback();
          return ResponseHandler.error(
            res,
            `账户余额不足，当前余额: ${currentBalance.toFixed(2)}, 需缴税: ${payableAmount.toFixed(2)}`,
            'VALIDATION_ERROR',
            400
          );
        }

        const txNumber = await generateTaxPaymentTransactionNumber(connection);
        const [bankTransactionResult] = await connection.execute(
          `INSERT INTO bank_transactions
           (transaction_number, bank_account_id, transaction_date, transaction_type,
             amount, reference_number, description, is_reconciled, related_party, category,
             tax_return_id, gl_entry_id, status, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            txNumber,
            bank_account_id,
            paymentDate,
            '费用',
            payableAmount,
            taxReturn.return_period,
            `税款缴纳: ${taxReturn.return_type} ${taxReturn.return_period}`,
            false,
            '税务机关',
            '税费',
            taxReturn.id,
            null,
            'approved',
            userId,
          ]
        );
        bankTransactionId = bankTransactionResult.insertId;

        const BankBalanceService = require('../../../services/business/BankBalanceService');
        await BankBalanceService.syncAccountBalance(connection, bank_account_id);

        entryInfo = await TaxAccountingService.generateVATReturnEntry(
          taxReturn,
          userId,
          connection,
          { accountingDate: paymentDate }
        );

        await connection.execute(
          'UPDATE bank_transactions SET gl_entry_id = ? WHERE id = ?',
          [entryInfo.entryId, bankTransactionId]
        );

        await DocumentLinkService.tryAutoLink(DocType.TAX_RETURN,
          taxReturn.id,
          taxReturn.return_period,
          DocType.BANK_TRANSACTION,
          bankTransactionId,
          txNumber,
          userId,
          connection
        );
        await DocumentLinkService.tryAutoLink(DocType.BANK_TRANSACTION,
          bankTransactionId,
          txNumber,
          DocType.FINANCE_VOUCHER,
          entryInfo.entryId,
          entryInfo.entryNumber,
          userId,
          connection
        );
      }

      await connection.execute(
        'UPDATE tax_returns SET status = ?, payment_date = ?, tax_paid = ?, tax_balance = ? WHERE id = ?',
        ['已缴纳', paymentDate, payableAmount, 0, id]
      );

      await connection.commit();

      return ResponseHandler.success(
        res,
        { bankTransactionId, entryInfo, taxPaid: payableAmount, taxBalance: 0 },
        payableAmount > 0 ? '税款缴纳成功，银行流水和会计分录已自动生成' : '税务申报已标记为已缴纳'
      );
    } catch (error) {
      await connection.rollback();
      logger.error('缴纳税款失败:', error);
      const isBusinessError = BusinessError.is(error)
        || /不正确|不存在|不足|不能|未配置|未找到|日期格式|有效日期/.test(
        error.message || ''
      );
      return ResponseHandler.error(
        res,
        error.message || '缴纳税款失败',
        isBusinessError ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError ? 400 : 500,
        error
      );
    } finally {
      connection.release();
    }
  },

  /**
   * 作废税款缴纳
   * POST /finance/tax/returns/:id/void-payment
   */
  voidTaxReturnPayment: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      const id = safeParseId(req.params.id, '申报ID');
      const voidReason = String(req.body?.void_reason || '').trim();
      if (!voidReason) {
        return ResponseHandler.error(res, '请填写作废原因', 'VALIDATION_ERROR', 400);
      }

      await connection.beginTransaction();
      const userId = getAuthenticatedUserId(req);

      const [taxReturns] = await connection.execute(
        `SELECT id, return_period, return_type, tax_payable, tax_paid, status, gl_entry_id
         FROM tax_returns WHERE id = ? FOR UPDATE`,
        [id]
      );
      if (taxReturns.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '税务申报不存在', 'NOT_FOUND', 404);
      }
      const taxReturn = taxReturns[0];
      if (taxReturn.status !== '已缴纳') {
        await connection.rollback();
        return ResponseHandler.error(res, '仅已缴纳的申报可以作废付款', 'VALIDATION_ERROR', 400);
      }

      const taxPaid = roundMoney(taxReturn.tax_paid || 0);
      if (taxPaid > 0) {
        const [bankTxs] = await connection.execute(
          `SELECT id, transaction_number, bank_account_id, amount, is_reconciled, gl_entry_id
           FROM bank_transactions
           WHERE tax_return_id = ?
             AND COALESCE(status, 'approved') = 'approved'
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`,
          [id]
        );
        if (bankTxs.length === 0) {
          throw new Error('未找到税款缴纳银行流水，无法作废');
        }
        const bankTx = bankTxs[0];
        if (isTruthyFlag(bankTx.is_reconciled)) {
          throw new Error('关联银行流水已对账，请先取消对账后再作废');
        }

        await connection.execute(
          'SELECT id FROM bank_accounts WHERE id = ? FOR UPDATE',
          [bankTx.bank_account_id]
        );
        const reversalDate = currentDateString();
        const reversalNumber = `${bankTx.transaction_number}-VOID`;
        await connection.execute(
          `INSERT INTO bank_transactions
           (transaction_number, bank_account_id, transaction_date, transaction_type,
            amount, reference_number, description, is_reconciled, related_party, category,
            tax_return_id, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reversalNumber,
            bankTx.bank_account_id,
            reversalDate,
            '转入',
            bankTx.amount,
            taxReturn.return_period,
            `冲销税款缴纳 - 原因: ${voidReason}`,
            false,
            '税务机关',
            '税费',
            taxReturn.id,
            'approved',
            userId,
          ]
        );
        const BankBalanceService = require('../../../services/business/BankBalanceService');
        await BankBalanceService.syncAccountBalance(connection, bankTx.bank_account_id);

        // 缴税凭证通常挂在银行流水 gl_entry_id 上
        const entryIdToReverse = bankTx.gl_entry_id || taxReturn.gl_entry_id;
        if (!entryIdToReverse) {
          throw new Error('未找到税款缴纳会计凭证，无法作废');
        }
        const financeModel = require('../../../models/finance');
        await financeModel.reverseEntry(
          entryIdToReverse,
          {
            entry_date: currentDateString(),
            posting_date: currentDateString(),
            description: `冲销税款缴纳 - 原因: ${voidReason}`,
            created_by: userId,
          },
          connection
        );
      }

      const payableAmount =
        taxReturn.return_type === '增值税'
          ? roundMoney(taxReturn.tax_payable || 0)
          : roundMoney(taxReturn.tax_payable || 0);

      await connection.execute(
        `UPDATE tax_returns
         SET status = '已申报', payment_date = NULL, tax_paid = 0, tax_balance = ?, gl_entry_id = NULL
         WHERE id = ?`,
        [payableAmount, id]
      );

      await connection.commit();
      return ResponseHandler.success(res, null, '税款缴纳已作废，银行与凭证已冲销');
    } catch (error) {
      await connection.rollback();
      logger.error('作废税款缴纳失败:', error);
      const isBusinessError =
        BusinessError.is(error) ||
        /不正确|不存在|不能|请先|仅|未找到|对账|原因|positive/.test(error.message || '');
      return ResponseHandler.error(
        res,
        error.message || '作废税款缴纳失败',
        isBusinessError ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isBusinessError ? 400 : 500,
        error
      );
    } finally {
      connection.release();
    }
  },

  /**
   * 删除税务申报（仅草稿状态）
   * DELETE /finance/tax/returns/:id
   */
  deleteTaxReturn: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      await taxModel.deleteTaxReturn(id);

      return ResponseHandler.success(res, null, '税务申报删除成功');
    } catch (error) {
      logger.error('删除税务申报失败:', error);
      if (error.message === '税务申报不存在') {
        return ResponseHandler.error(res, '税务申报不存在', 'NOT_FOUND', 404);
      }
      if (error.message === '只能删除草稿状态的申报') {
        return ResponseHandler.error(res, '只能删除草稿状态的申报', 'VALIDATION_ERROR', 400);
      }
      return ResponseHandler.error(res, '删除税务申报失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ==================== 税务科目配置 ====================

  /**
   * 获取税务科目配置列表
   * GET /finance/tax/account-config
   */
  getTaxAccountConfigs: async (req, res) => {
    try {
      const configs = await taxModel.getTaxAccountConfigs();
      return ResponseHandler.success(res, configs, '获取税务科目配置成功');
    } catch (error) {
      logger.error('获取税务科目配置失败:', error);
      return ResponseHandler.error(res, '获取税务科目配置失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建税务科目配置
   * POST /finance/tax/account-config
   */
  createTaxAccountConfig: async (req, res) => {
    try {
      const { config_key, config_name, account_id, description } = mapKeysToSnake(req.body || {});

      // 验证必填字段
      if (!config_key || !config_name || !account_id) {
        return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
      }

      // 检查配置键是否已存在
      const existing = await taxModel.getTaxAccountConfigByKey(config_key);
      if (existing) {
        return ResponseHandler.error(res, '配置键已存在', 'VALIDATION_ERROR', 400);
      }

      const configId = await taxModel.createTaxAccountConfig({
        config_key,
        config_name,
        account_id,
        description,
      });

      return ResponseHandler.success(res, { id: configId }, '创建税务科目配置成功', 201);
    } catch (error) {
      logger.error('创建税务科目配置失败:', error);
      return ResponseHandler.error(res, '创建税务科目配置失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新税务科目配置
   * PUT /finance/tax/account-config/:id
   */
  updateTaxAccountConfig: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);
      const { config_name, account_id, description } = mapKeysToSnake(req.body || {});

      // 验证必填字段
      if (!config_name || !account_id) {
        return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
      }

      await taxModel.updateTaxAccountConfig(id, {
        config_name,
        account_id,
        description,
      });

      return ResponseHandler.success(res, null, '更新税务科目配置成功');
    } catch (error) {
      logger.error('更新税务科目配置失败:', error);
      return ResponseHandler.error(res, '更新税务科目配置失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除税务科目配置
   * DELETE /finance/tax/account-config/:id
   */
  deleteTaxAccountConfig: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      await taxModel.deleteTaxAccountConfig(id);

      return ResponseHandler.success(res, null, '删除税务科目配置成功');
    } catch (error) {
      logger.error('删除税务科目配置失败:', error);
      return ResponseHandler.error(res, '删除税务科目配置失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ==================== 税务发票 ↔ AP/AR 关联 ====================

  /**
   * 关联税务发票到 AP/AR 单据
   * POST /finance/tax/invoices/:id/link
   */
  linkTaxInvoice: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);
      const { document_type, document_id } = mapKeysToSnake(req.body || {});

      if (!document_type || !document_id) {
        return ResponseHandler.error(res, '缺少必填字段: document_type, document_id', 'VALIDATION_ERROR', 400);
      }

      const invoice = await taxModel.getTaxInvoiceById(id);
      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }
      ensureTaxInvoiceCanChangeLink(invoice);
      ensureTaxInvoiceDocumentTypeMatches(invoice, document_type);

      const document = await taxModel.getDocumentSummary(document_type, document_id);
      if (!document) {
        return ResponseHandler.error(res, '关联的单据不存在', 'VALIDATION_ERROR', 400);
      }

      await taxModel.linkToDocument(id, document_type, document_id);
      await DocumentLinkService.tryAutoLink(
        document_type,
        document_id,
        document.document_number,
        DocType.TAX_INVOICE,
        invoice.id,
        invoice.invoice_number,
        getAuthenticatedUserId(req),
      );

      return ResponseHandler.success(res, null, '税务发票关联成功');
    } catch (error) {
      logger.error('关联税务发票失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '关联失败',
        'VALIDATION_ERROR',
        400,
        error
      );
    }
  },

  /**
   * 取消税务发票关联
   * POST /finance/tax/invoices/:id/unlink
   */
  unlinkTaxInvoice: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      const invoice = await taxModel.getTaxInvoiceById(id);
      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }
      ensureTaxInvoiceCanChangeLink(invoice);

      const documentType = invoice.related_document_type;
      const documentId = invoice.related_document_id;
      if (documentType && documentId) {
        await DocumentLinkService.deleteLinksByPair({
          source_type: documentType,
          source_id: documentId,
          target_type: DocType.TAX_INVOICE,
          target_id: invoice.id,
        });
      }

      await taxModel.unlinkDocument(id);

      return ResponseHandler.success(res, null, '关联已取消');
    } catch (error) {
      logger.error('取消关联失败:', error);
      return ResponseHandler.error(res, error.message || '取消关联失败', 'VALIDATION_ERROR', 400, error);
    }
  },

  /**
   * 获取可关联的 AP/AR 单据列表
   * GET /finance/tax/available-documents
   */
  getAvailableDocuments: async (req, res) => {
    try {
      const { type, keyword } = req.query;

      if (!type || !['ap', 'ar'].includes(type)) {
        return ResponseHandler.error(res, '请指定类型: ap 或 ar', 'VALIDATION_ERROR', 400);
      }

      const documents = await taxModel.getAvailableDocuments(type, keyword || '');

      return ResponseHandler.success(res, documents, '获取可关联单据成功');
    } catch (error) {
      logger.error('获取可关联单据失败:', error);
      return ResponseHandler.error(res, '获取可关联单据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 手动更新税务发票号码
   * PUT /finance/tax/invoices/:id/invoice-number
   */
  updateTaxInvoiceNumber: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);
      const { invoice_number } = mapKeysToSnake(req.body || {});

      if (!invoice_number || !invoice_number.trim()) {
        return ResponseHandler.error(res, '发票号码不能为空', 'VALIDATION_ERROR', 400);
      }

      // 获取发票信息
      const invoice = await taxModel.getTaxInvoiceById(id);
      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      if (invoice.status === '已作废') {
        return ResponseHandler.error(res, '已作废的发票不能修改', 'VALIDATION_ERROR', 400);
      }
      if (invoice.status !== '未认证' || invoice.gl_entry_id) {
        return ResponseHandler.error(
          res,
          '已认证或已入账的发票不能直接修改发票号码',
          'VALIDATION_ERROR',
          400
        );
      }

      // 更新发票号码
      await taxModel.updateTaxInvoiceNumber(id, invoice_number.trim());

      logger.info('[Tax] 手动更新税务发票号码', {
        taxInvoiceId: id,
        oldNumber: invoice.invoice_number,
        newNumber: invoice_number.trim()
      });

      return ResponseHandler.success(res, null, '发票号码更新成功');
    } catch (error) {
      logger.error('更新税务发票号码失败:', error);
      return ResponseHandler.error(res, '更新税务发票号码失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 作废税务发票
   * POST /finance/tax/invoices/:id/void
   */
  voidTaxInvoice: async (req, res) => {
    const connection = await db.pool.getConnection();
    try {
      const id = safeParseId(req.params.id, '发票ID');

      await connection.beginTransaction();
      const [invoices] = await connection.execute(
        'SELECT id, invoice_type, invoice_number, invoice_code, invoice_date, supplier_id, customer_id, supplier_or_customer_name, supplier_tax_number, amount_excluding_tax, tax_rate, tax_amount, total_amount, status, certification_date, deduction_date, related_document_type, related_document_id, gl_entry_id, remark, created_by, created_at, updated_at FROM tax_invoices WHERE id = ? FOR UPDATE',
        [id]
      );
      const invoice = invoices[0];
      if (!invoice) {
        await connection.rollback();
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      if (invoice.status === '已作废') {
        await connection.rollback();
        return ResponseHandler.error(res, '发票已经作废', 'VALIDATION_ERROR', 400);
      }

      // 已认证/已抵扣且已入账：冲销关联总账后再作废
      if (invoice.gl_entry_id || ['已认证', '已抵扣'].includes(String(invoice.status))) {
        const VoucherReversalService = require('../../../services/finance/VoucherReversalService');
        const { DOCUMENT_TYPES } = require('../../../constants/financeConstants');
        try {
          await VoucherReversalService.reverseBusinessVouchers(connection, {
            sourceType: 'tax_invoice',
            sourceId: invoice.id,
            documentNumber: invoice.invoice_number,
            documentType: DOCUMENT_TYPES.INVOICE,
            voidedBy: req.user?.id || invoice.created_by || null,
            reason: `作废税务发票 ${invoice.invoice_number}`,
            entryDate: toLocalDateString(invoice.invoice_date || undefined),
          });
        } catch (revErr) {
          // 若无关联凭证（仅状态已认证但未入账），允许继续作废
          if (!/未找到单据|对应的未冲销会计凭证/.test(revErr.message || '')) {
            throw revErr;
          }
        }
        await connection.execute(
          'UPDATE tax_invoices SET status = ?, gl_entry_id = NULL WHERE id = ?',
          ['已作废', id]
        );
        await connection.commit();
        return ResponseHandler.success(res, null, '税务发票已作废并冲销会计凭证');
      }

      if (invoice.status !== '未认证') {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `当前状态「${invoice.status}」不允许作废`,
          'VALIDATION_ERROR',
          400
        );
      }

      await connection.execute('UPDATE tax_invoices SET status = ? WHERE id = ?', ['已作废', id]);
      await connection.commit();

      return ResponseHandler.success(res, null, '税务发票已作废');
    } catch (error) {
      await connection.rollback();
      logger.error('作废税务发票失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '作废税务发票失败',
        'SERVER_ERROR',
        500,
        error
      );
    } finally {
      connection.release();
    }
  },
};

module.exports = taxController;
