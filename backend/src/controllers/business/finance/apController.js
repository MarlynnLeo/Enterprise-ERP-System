/**
 * apController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const { logger } = require('../../../utils/logger');


const apModel = require('../../../models/ap');
const db = require('../../../config/db');
const BankAccountModel = require('../../../models/cash/Account');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { safeParseId } = require('../../../utils/safeParseId');
const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');
const { currentDateString, toLocalDateString } = require('../../../utils/dateUtils');
const {
  INVOICE_STATUS,
  BANK_BACKED_PAYMENT_METHODS,
} = require('../../../constants/financeConstants');
const ScopeGuard = require('../../../authorization/ScopeGuard');
const {
  fromInvoiceApi,
  toInvoiceApi,
  fromInvoiceListQuery,
  toPaymentApi,
  fromPaymentListQuery,
} = require('../../../utils/finance/invoiceFieldMap');

const isPaymentBusinessError = (error) =>
  /不存在|已经|状态|无法|不能|期间|科目|余额|原因|positive integer|作废|冲销/.test(
    error.message || ''
  );

/**
 * 应付账款控制器
 */
const apController = {
  /**
   * 生成应付账款发票编号
   */
  generateInvoiceNumber: async (req, res) => {
    try {
      // 统一走编码规则引擎，保证并发安全
      const invoiceNumber = await CodeGeneratorService.nextCode('ap_invoice');
      return ResponseHandler.success(res, { invoiceNumber }, '生成发票编号成功');
    } catch (error) {
      logger.error('生成发票编号失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '生成发票编号失败',
        'SERVER_ERROR',
        500,
        error
      );
    }
  },

  /**
   * 获取应付账款发票列表
   */
  getInvoices: async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;

      // 参数验证
      const numPage = parseInt(page, 10);
      const numLimit = parseInt(limit, 10);

      if (numPage < 1 || numLimit < 1 || numLimit > 100) {
        return ResponseHandler.validationError(res, '无效的分页参数', [
          { field: 'page', message: '页码必须大于0' },
          { field: 'limit', message: '每页记录数必须在1-100之间' },
        ]);
      }

      // HTTP query(camel) → 模型 filters(snake)
      const filters = fromInvoiceListQuery(req.query, 'ap');

      // 行级 DataScope（SSOT：ScopeGuard）
      filters.scopeClause = await ScopeGuard.applyListScope(req, 'ap_invoice', {
        tableAlias: 'a',
        ownerAlias: 'ap_invoice_owner_scope',
      });

      // 调用模型方法获取数据
      const result = await apModel.getInvoices(filters, numPage, numLimit);

      // 返回标准化的分页响应
      ResponseHandler.paginated(
        res,
        result.data,
        result.total,
        result.page,
        result.pageSize,
        '获取应付账款发票列表成功'
      );
    } catch (error) {
      logger.error('获取应付账款发票失败:', error);
      ResponseHandler.error(res, '获取应付账款发票失败', 'AP_INVOICE_QUERY_ERROR', 500, error);
    }
  },

  /**
   * 获取单个应付账款发票
   */
  getInvoiceById: async (req, res) => {
    try {
      // [B-1] 参数类型校验
      const invoiceId = safeParseId(req.params.id);
      if (isNaN(invoiceId)) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }
      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'ap_invoice', invoiceId, '无权访问该应付发票'))) {
        return;
      }
      const invoice = await apModel.getInvoiceById(invoiceId);

      if (!invoice) {
        return ResponseHandler.error(res, '未找到指定的发票', 'NOT_FOUND', 404);
      }

      return ResponseHandler.success(res, invoice, '获取发票成功');
    } catch (error) {
      logger.error('获取应付账款发票失败:', error);
      return ResponseHandler.error(res, '获取应付账款发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取发票用于编辑
   */
  getInvoiceForEdit: async (req, res) => {
    try {
      // [B-1] 参数类型校验
      const invoiceId = safeParseId(req.params.id);
      if (isNaN(invoiceId)) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }
      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'ap_invoice', invoiceId, '无权访问该应付发票'))) {
        return;
      }
      const invoice = await apModel.getInvoiceById(invoiceId);

      if (!invoice) {
        return ResponseHandler.error(res, '未找到指定的发票', 'NOT_FOUND', 404);
      }

      // 模型已输出 camel 契约；金额已是 number
      return ResponseHandler.success(res, invoice, '获取发票编辑数据成功');
    } catch (error) {
      logger.error('获取发票编辑数据失败:', error);
      return ResponseHandler.error(res, '获取发票编辑数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建应付账款发票
   */
  createInvoice: async (req, res) => {
    try {
      // HTTP camel → 模型 snake（唯一入参边界）
      const formattedData = {
        ...fromInvoiceApi(req.body, 'ap'),
        status: INVOICE_STATUS.DRAFT,
        ...ScopeGuard.stampOwner(req, 'ap_invoice'),
      };

      if (
        !formattedData.invoice_number ||
        !formattedData.supplier_id ||
        !formattedData.invoice_date ||
        !formattedData.due_date
      ) {
        return ResponseHandler.error(
          res,
          '缺少必要的发票信息（发票编号、供应商、发票日期、到期日）',
          'VALIDATION_ERROR',
          400
        );
      }

      const hasItems = Array.isArray(formattedData.items) && formattedData.items.length > 0;
      const total = Number(formattedData.total_amount);
      if (!hasItems && (!Number.isFinite(total) || total <= 0)) {
        return ResponseHandler.error(res, '发票金额必须大于0', 'VALIDATION_ERROR', 400);
      }

      const invoiceId = await apModel.createInvoice(formattedData);
      return ResponseHandler.success(res, { id: invoiceId }, '发票创建成功', 201);
    } catch (error) {
      logger.error('创建应付账款发票失败:', error);
      return ResponseHandler.error(res, '创建应付账款发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新应付账款发票状态
   */
  updateInvoiceStatus: async (req, res) => {
    try {
      // [B-1] 参数类型校验
      const invoiceId = safeParseId(req.params.id);
      if (isNaN(invoiceId)) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }
      const { status } = req.body;

      if (!status) {
        return ResponseHandler.error(res, '缺少状态参数', 'VALIDATION_ERROR', 400);
      }

      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'ap_invoice', invoiceId, '无权变更该应付发票状态'))) {
        return;
      }

      const manualStatuses = [INVOICE_STATUS.CONFIRMED, INVOICE_STATUS.CANCELLED];
      if (!manualStatuses.includes(status)) {
        return ResponseHandler.error(
          res,
          '只能手工确认或取消草稿发票；部分付款、已付款、已逾期状态由付款和逾期检查自动维护',
          'VALIDATION_ERROR',
          400
        );
      }

      const updated = await apModel.updateInvoiceStatus(invoiceId, status, {
        updated_by: getAuthenticatedUserId(req),
      });

      if (!updated) {
        return ResponseHandler.error(res, '发票不存在或状态更新失败', 'NOT_FOUND', 404);
      }

      return ResponseHandler.success(res, { id: invoiceId, status }, '发票状态更新成功');
    } catch (error) {
      logger.error('更新应付账款发票状态失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '更新应付账款发票状态失败',
        'VALIDATION_ERROR',
        400,
        error
      );
    }
  },

  /**
   * 更新应付账款发票
   */
  updateInvoice: async (req, res) => {
    try {
      const invoiceId = safeParseId(req.params.id);
      const invoiceData = req.body;
      if (!invoiceId) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }
      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'ap_invoice', invoiceId, '无权修改该应付发票'))) {
        return;
      }

      // 检查发票是否存在
      const existingInvoice = await apModel.getInvoiceById(invoiceId);
      if (!existingInvoice) {
        return ResponseHandler.error(res, '未找到指定的发票', 'NOT_FOUND', 404);
      }

      if (existingInvoice.status !== INVOICE_STATUS.DRAFT) {
        // 非草稿只允许备注/供应商发票号（camel 契约）
        const financialFields = [
          'totalAmount',
          'amountExcludingTax',
          'taxAmount',
          'taxRate',
          'invoiceNumber',
          'supplierId',
          'invoiceDate',
          'dueDate',
          'items',
        ];
        const hasFinancialField = financialFields.some((field) => invoiceData[field] !== undefined);
        if (hasFinancialField) {
          return ResponseHandler.error(
            res,
            `${existingInvoice.status}的发票已进入财务闭环，只能修改备注/供应商发票号`,
            'VALIDATION_ERROR',
            400
          );
        }

        const success = await apModel.updateInvoice({
          id: invoiceId,
          supplier_invoice_number: invoiceData.supplierInvoiceNumber ?? null,
          notes: invoiceData.notes,
        });

        if (success) {
          return ResponseHandler.success(res, { id: invoiceId }, '发票非财务信息更新成功');
        }
        return ResponseHandler.error(res, '发票更新失败', 'SERVER_ERROR', 500);
      }

      const formattedData = {
        ...fromInvoiceApi(invoiceData, 'ap'),
        id: invoiceId,
      };
      const total = Number(formattedData.total_amount);
      const hasItems = Array.isArray(formattedData.items) && formattedData.items.length > 0;
      if (!hasItems && (!Number.isFinite(total) || total <= 0)) {
        return ResponseHandler.error(res, '发票金额必须大于0', 'VALIDATION_ERROR', 400);
      }

      const success = await apModel.updateInvoice(formattedData);

      if (success) {
        return ResponseHandler.success(res, { id: invoiceId }, '发票更新成功');
      } else {
        return ResponseHandler.error(res, '发票更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('更新应付账款发票失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '更新应付账款发票失败',
        'VALIDATION_ERROR',
        400,
        error
      );
    }
  },

  /**
   * 获取付款记录列表
   */
  getPayments: async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;

      // HTTP query(camel) → 模型 filters(snake)
      const filters = fromPaymentListQuery(req.query);
      filters.scopeClause = await ScopeGuard.applyListScope(req, 'ap_payment', {
        tableAlias: 'p',
        ownerAlias: 'ap_payment_owner_scope',
      });

      const result = await apModel.getPayments(filters, parseInt(page), parseInt(limit));
      const mappedData = (result.payments || []).map((payment) => toPaymentApi(payment));

      return ResponseHandler.paginated(
        res,
        mappedData,
        result.pagination.total,
        result.pagination.page,
        result.pagination.pageSize,
        '获取付款记录成功'
      );
    } catch (error) {
      logger.error('获取付款记录失败:', error);
      return ResponseHandler.error(res, '获取付款记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个付款记录
   */
  getPaymentById: async (req, res) => {
    try {
      // [B-1] 参数类型校验
      const paymentId = safeParseId(req.params.id);
      if (isNaN(paymentId)) {
        return ResponseHandler.error(res, '无效的付款记录ID', 'VALIDATION_ERROR', 400);
      }
      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'ap_payment', paymentId, '无权访问该付款记录'))) {
        return;
      }
      const payment = await apModel.getPaymentById(paymentId);

      if (!payment) {
        return ResponseHandler.error(res, '未找到指定的付款记录', 'NOT_FOUND', 404);
      }

      // 出参统一 camel（toPaymentApi）
      const formattedPayment = toPaymentApi(payment);

      return ResponseHandler.success(res, formattedPayment, '获取付款记录成功');
    } catch (error) {
      return ResponseHandler.error(res, '获取付款记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建付款记录
   * 付款记录引用应付账款发票，但不直接在应付账款模块中处理付款
   */
  createPayment: async (req, res) => {
    try {
      const paymentData = req.body;

      // 确保有引用的发票ID
      if (!paymentData.invoiceId) {
        return ResponseHandler.error(
          res,
          '付款记录必须关联一个应付账款发票',
          'VALIDATION_ERROR',
          400
        );
      }

      if (!(await ScopeGuard.denyUnlessAccess(
        res,
        db.pool,
        req,
        'ap_invoice',
        paymentData.invoiceId,
        '无权对该应付发票付款'
      ))) {
        return;
      }

      // 查询发票信息，确保发票存在并获取供应商ID和金额信息
      const invoice = await apModel.getInvoiceById(paymentData.invoiceId);

      if (!invoice) {
        return ResponseHandler.error(
          res,
          `发票ID ${paymentData.invoiceId} 不存在`,
          'NOT_FOUND',
          404
        );
      }

      if (![INVOICE_STATUS.CONFIRMED, INVOICE_STATUS.PARTIAL_PAID, INVOICE_STATUS.OVERDUE].includes(invoice.status)) {
        return ResponseHandler.error(
          res,
          `发票当前状态为"${invoice.status}"，必须先确认后才能付款`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 检查付款核销金额（实付+折扣）是否超过未付余额 (精度修复: 分/整数比对)
      const payAmountCents = Math.round(parseFloat(paymentData.amount || 0) * 100);
      if (payAmountCents < 0) {
        return ResponseHandler.error(
          res,
          '付款金额不能为负数',
          'VALIDATION_ERROR',
          400
        );
      }

      const discountAmount = parseFloat(paymentData.discountAmount || 0);
      if (isNaN(discountAmount) || discountAmount < 0) {
        return ResponseHandler.error(res, '折扣金额不能为负数', 'VALIDATION_ERROR', 400);
      }
      const discountCents = Math.round(discountAmount * 100);
      if (payAmountCents === 0 && discountCents === 0) {
        return ResponseHandler.error(
          res,
          '付款金额与折扣金额不能同时为0',
          'VALIDATION_ERROR',
          400
        );
      }

      const settlementCents = payAmountCents + discountCents;
      // 发票已由 toInvoiceApi 出 camel
      const invoiceBalance = parseFloat(invoice.balanceAmount ?? 0);
      const invoiceBalanceCents = Math.round(invoiceBalance * 100);
      if (settlementCents > invoiceBalanceCents) {
        return ResponseHandler.error(
          res,
          `付款核销金额 ${settlementCents / 100}（含折扣）超过发票未付余额 ${invoiceBalance}`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 转换支付方式为数据库接受的值
      let paymentMethod = '银行转账'; // 默认值
      if (paymentData.paymentMethod) {
        // 映射前端传来的值到数据库接受的值
        const methodMap = {
          bank_transfer: '银行转账',
          cash: '现金',
          check: '支票',
          credit_card: '信用卡',
          wechat: '微信',
          alipay: '支付宝',
        };

        paymentMethod = methodMap[paymentData.paymentMethod] || '银行转账';
      }

      if (BANK_BACKED_PAYMENT_METHODS.has(paymentMethod) && !paymentData.bankAccountId) {
        return ResponseHandler.error(
          res,
          `${paymentMethod}必须选择付款账户`,
          'VALIDATION_ERROR',
          400
        );
      }

      if (paymentData.bankAccountId) {
        const bankAccount = await BankAccountModel.getBankAccountById(paymentData.bankAccountId);
        if (!bankAccount) {
          return ResponseHandler.error(res, '付款账户不存在', 'VALIDATION_ERROR', 400);
        }
        if (!bankAccount.is_active) {
          return ResponseHandler.error(
            res,
            `银行账户 "${bankAccount.account_name}" 已被冻结，无法用于付款`,
            'VALIDATION_ERROR',
            400
          );
        }
      }

      // 构建完整的付款数据结构
      const completePaymentData = {
        payment_number: paymentData.paymentNumber || await CodeGeneratorService.nextCode('ap_payment'),
        supplier_id: invoice.supplierId,
        supplier_name: invoice.supplierName,
        payment_date: paymentData.paymentDate || currentDateString(),
        total_amount: parseFloat(paymentData.amount),
        payment_method: paymentMethod,
        reference_number: paymentData.referenceNumber || null,
        bank_account_id: paymentData.bankAccountId || null,
        notes: paymentData.notes || '',
        ...ScopeGuard.stampOwner(req, 'ap_payment'),
      };

      // 构建付款明细项数组
      const paymentItems = [
        {
          invoice_id: paymentData.invoiceId,
          amount: parseFloat(paymentData.amount),
          discount_amount: discountAmount,
        },
      ];

      // 调用模型方法创建付款记录；模型在同一事务中维护发票、资金流水和会计凭证
      const paymentId = await apModel.createPayment(completePaymentData, paymentItems);

      ResponseHandler.success(
        res,
        {
          id: paymentId,
          message: '付款记录创建成功，已自动生成会计凭证',
          details: {
            invoice: invoice.invoiceNumber,
            supplier: invoice.supplierName,
            amount: paymentData.amount,
            paymentDate: completePaymentData.payment_date,
            paymentNumber: completePaymentData.payment_number,
          },
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建付款记录失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '创建付款记录失败',
        'VALIDATION_ERROR',
        400,
        error
      );
    }
  },

  /**
   * 作废付款记录
   */
  voidPayment: async (req, res) => {
    try {
      const paymentId = safeParseId(req.params.id);
      const { void_reason } = mapKeysToSnake(req.body || {});

      if (!paymentId) {
        return ResponseHandler.error(res, '无效的付款记录ID', 'VALIDATION_ERROR', 400);
      }

      if (!void_reason || void_reason.trim() === '') {
        return ResponseHandler.error(res, '请填写作废原因', 'VALIDATION_ERROR', 400);
      }

      const userId = getAuthenticatedUserId(req);

      // 调用模型方法作废付款记录
      await apModel.voidPayment(paymentId, {
        voided_by: userId,
        void_reason: void_reason.trim(),
      });

      return ResponseHandler.success(res, null, '付款记录已成功作废');
    } catch (error) {
      logger.error('作废付款记录失败:', error);
      const businessError = isPaymentBusinessError(error);
      return ResponseHandler.error(
        res,
        error.message || '作废付款记录失败',
        businessError ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        businessError ? 400 : 500,
        error
      );
    }
  },

  /**
   * 应付结算看板（数量 + 金额 + 明细）
   */
  getSettlementDashboard: async (req, res) => {
    try {
      const data = await apModel.getSettlementDashboard({
        startDate: req.query.startDate || req.query.start_date,
        endDate: req.query.endDate || req.query.end_date,
        supplierName: req.query.supplierName || req.query.supplier_name,
        settlementKey: req.query.settlementKey || req.query.settlement_key || 'open',
        limit: req.query.limit || req.query.pageSize || 50,
      });
      return ResponseHandler.success(res, data, '获取应付结算看板成功');
    } catch (error) {
      logger.error('获取应付结算看板失败:', error);
      return ResponseHandler.error(res, '获取应付结算看板失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取供应商应付款
   */
  getSupplierPayables: async (req, res) => {
    try {
      const { supplierName, status } = req.query;
      const formattedData = await apModel.getSupplierPayablesSummary({ supplierName, status });
      return ResponseHandler.success(res, {
        data: formattedData,
        total: formattedData.length,
      }, '获取供应商应付款成功');
    } catch (error) {
      logger.error('获取供应商应付款失败:', error);
      return ResponseHandler.error(res, '获取供应商应付款失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个供应商应付款
   */
  getSupplierPayablesById: async (req, res) => {
    try {
      const supplierId = req.params.id;

      // 从数据库获取指定供应商的应付款详情
      const connection = await db.pool.getConnection();

      try {
        // 获取供应商信息和应付款汇总
        const [supplierData] = await connection.execute(
          `
          SELECT
            s.id AS supplierId,
            s.name AS supplierName,
            s.contact_person AS contactPerson,
            s.contact_phone AS contactPhone,
            s.email,
            COUNT(i.id) AS invoiceCount,
            COALESCE(SUM(i.total_amount), 0) AS totalAmount,
            COALESCE(SUM(i.paid_amount), 0) AS paidAmount,
            COALESCE(SUM(i.balance_amount), 0) AS balance
          FROM suppliers s
          LEFT JOIN ap_invoices i ON s.id = i.supplier_id
            AND i.status IN ('已确认', '部分付款')
          WHERE s.id = ?
          GROUP BY s.id, s.name, s.contact_person, s.contact_phone, s.email
        `,
          [supplierId]
        );

        if (supplierData.length === 0) {
          return ResponseHandler.error(res, '供应商不存在', 'NOT_FOUND', 404);
        }

        // 获取该供应商的所有未付清发票
        const [invoices] = await connection.execute(
          `
          SELECT
            id,
            invoice_number AS invoiceNumber,
            invoice_date AS invoiceDate,
            due_date AS dueDate,
            total_amount AS totalAmount,
            paid_amount AS paidAmount,
            balance_amount AS balance,
            status,
            DATEDIFF(CURDATE(), due_date) AS overdueDays
          FROM ap_invoices
          WHERE supplier_id = ? AND balance_amount > 0
          ORDER BY due_date ASC
        `,
          [supplierId]
        );

        // 格式化数据
        const result = {
          supplierId: supplierData[0].supplierId,
          supplierName: supplierData[0].supplierName,
          contactPerson: supplierData[0].contactPerson,
          contactPhone: supplierData[0].contactPhone,
          email: supplierData[0].email,
          invoiceCount: parseInt(supplierData[0].invoiceCount || 0),
          totalAmount: parseFloat(supplierData[0].totalAmount || 0),
          paidAmount: parseFloat(supplierData[0].paidAmount || 0),
          balance: parseFloat(supplierData[0].balance || 0),
          invoices: invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            totalAmount: parseFloat(inv.totalAmount || 0),
            paidAmount: parseFloat(inv.paidAmount || 0),
            balance: parseFloat(inv.balance || 0),
            status: inv.status,
            overdueDays: parseInt(inv.overdueDays || 0),
            isOverdue: parseInt(inv.overdueDays || 0) > 0,
          })),
        };

        return ResponseHandler.success(res, result, '获取供应商应付款详情成功');
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取供应商应付款失败:', error);
      return ResponseHandler.error(res, '获取供应商应付款失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取应付账款账龄分析
   */
  getPayablesAging: async (req, res) => {
    try {
      const { reportDate, supplierName } = req.query;
      const asOf = toLocalDateString(reportDate || currentDateString());
      const connection = await db.pool.getConnection();

      try {
        let whereClause = '';
        const params = [asOf, asOf, asOf, asOf, asOf];

        if (supplierName) {
          whereClause += ' AND s.name LIKE ?';
          params.push(`%${supplierName}%`);
        }

        const [payables] = await connection.execute(
          `
          SELECT
            s.id AS supplierId,
            s.name AS supplierName,
            COALESCE(SUM(i.balance_amount), 0) AS totalAmount,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(?, i.due_date) <= 0 THEN i.balance_amount
              ELSE 0
            END), 0) AS currentAmount,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(?, i.due_date) BETWEEN 1 AND 30 THEN i.balance_amount
              ELSE 0
            END), 0) AS within30Days,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(?, i.due_date) BETWEEN 31 AND 60 THEN i.balance_amount
              ELSE 0
            END), 0) AS within60Days,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(?, i.due_date) BETWEEN 61 AND 90 THEN i.balance_amount
              ELSE 0
            END), 0) AS within90Days,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(?, i.due_date) > 90 THEN i.balance_amount
              ELSE 0
            END), 0) AS over90Days,
            s.contact_person AS contactPerson,
            s.contact_phone AS contactPhone
          FROM
            suppliers s
          LEFT JOIN
            ap_invoices i ON s.id = i.supplier_id
            AND i.status NOT IN ('已付款', '已取消', '草稿', 'void', '作废', 'cancelled')
          WHERE
            s.status = 1 ${whereClause}
          GROUP BY
            s.id, s.name, s.contact_person, s.contact_phone
          HAVING
            totalAmount > 0
          ORDER BY
            totalAmount DESC
        `,
          params
        );

        const formattedData = payables.map((item) => ({
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          supplierType: '供应商',
          totalAmount: parseFloat(item.totalAmount || 0),
          currentAmount: parseFloat(item.currentAmount || 0),
          within30Days: parseFloat(item.within30Days || 0),
          within60Days: parseFloat(item.within60Days || 0),
          within90Days: parseFloat(item.within90Days || 0),
          over90Days: parseFloat(item.over90Days || 0),
          lastPaymentDate: null,
          contactPerson: item.contactPerson,
          contactPhone: item.contactPhone,
        }));

        return ResponseHandler.success(
          res,
          {
            data: formattedData,
            reportDate: asOf,
          },
          '获取应付账款账龄分析成功'
        );
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取应付账款账龄分析失败:', error);
      return ResponseHandler.error(res, '获取应付账款账龄分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个应付账款账龄分析
   */
  getPayablesAgingById: async (req, res) => {
    try {
      const supplierId = req.params.id;

      // 从数据库获取指定供应商的账龄分析
      const connection = await db.pool.getConnection();

      try {
        // 查询供应商账龄数据（字段名与AR对齐）
        const [aging] = await connection.execute(
          `
          SELECT
            s.id AS supplierId,
            s.name AS supplierName,
            s.contact_person AS contactPerson,
            s.contact_phone AS contactPhone,
            COALESCE(SUM(i.balance_amount), 0) AS totalAmount,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(CURDATE(), i.due_date) <= 0 THEN i.balance_amount
              ELSE 0
            END), 0) AS currentAmount,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 1 AND 30 THEN i.balance_amount
              ELSE 0
            END), 0) AS within30Days,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 31 AND 60 THEN i.balance_amount
              ELSE 0
            END), 0) AS within60Days,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 61 AND 90 THEN i.balance_amount
              ELSE 0
            END), 0) AS within90Days,
            COALESCE(SUM(CASE
              WHEN DATEDIFF(CURDATE(), i.due_date) > 90 THEN i.balance_amount
              ELSE 0
            END), 0) AS over90Days,
            MAX(i.invoice_date) AS lastInvoiceDate,
            COUNT(i.id) AS invoiceCount
          FROM suppliers s
          LEFT JOIN ap_invoices i ON s.id = i.supplier_id
            AND i.status NOT IN ('已付款', '已取消', '草稿', 'void')
          WHERE s.id = ? AND s.status = 1
          GROUP BY s.id, s.name, s.contact_person, s.contact_phone
        `,
          [supplierId]
        );

        if (aging.length === 0) {
          return ResponseHandler.error(res, '供应商不存在或无应付款数据', 'NOT_FOUND', 404);
        }

        // 获取该供应商的未付清发票明细
        const [invoices] = await connection.execute(
          `
          SELECT
            id,
            invoice_number AS invoiceNumber,
            invoice_date AS invoiceDate,
            due_date AS dueDate,
            total_amount AS totalAmount,
            paid_amount AS paidAmount,
            balance_amount AS balance,
            status,
            DATEDIFF(CURDATE(), due_date) AS overdueDays
          FROM ap_invoices
          WHERE supplier_id = ? AND balance_amount > 0
          ORDER BY due_date ASC
          LIMIT 20
        `,
          [supplierId]
        );

        // 格式化返回数据（字段名与AR对齐）
        const result = {
          supplierId: aging[0].supplierId,
          supplierName: aging[0].supplierName,
          contactPerson: aging[0].contactPerson,
          contactPhone: aging[0].contactPhone,
          supplierType: '供应商',
          totalAmount: parseFloat(aging[0].totalAmount || 0),
          currentAmount: parseFloat(aging[0].currentAmount || 0),
          within30Days: parseFloat(aging[0].within30Days || 0),
          within60Days: parseFloat(aging[0].within60Days || 0),
          within90Days: parseFloat(aging[0].within90Days || 0),
          over90Days: parseFloat(aging[0].over90Days || 0),
          lastInvoiceDate: aging[0].lastInvoiceDate,
          invoiceCount: parseInt(aging[0].invoiceCount || 0),
          invoices: invoices.map((inv) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            totalAmount: parseFloat(inv.totalAmount || 0),
            paidAmount: parseFloat(inv.paidAmount || 0),
            balance: parseFloat(inv.balance || 0),
            status: inv.status,
            overdueDays: parseInt(inv.overdueDays || 0),
            isOverdue: parseInt(inv.overdueDays || 0) > 0,
          })),
        };

        return ResponseHandler.success(res, result, '获取供应商账龄分析详情成功');
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取应付账款账龄分析失败:', error);
      return ResponseHandler.error(res, '获取应付账款账龄分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取发票关联的付款记录
   */
  getInvoicePayments: async (req, res) => {
    try {
      // [B-1] 参数类型校验
      const invoiceId = safeParseId(req.params.id);
      if (isNaN(invoiceId)) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }

      // 确认发票存在
      const invoice = await apModel.getInvoiceById(invoiceId);
      if (!invoice) {
        return ResponseHandler.error(res, '未找到指定的发票', 'NOT_FOUND', 404);
      }

      // 查询发票关联的付款记录
      const payments = await apModel.getInvoicePayments(invoiceId);

      return ResponseHandler.success(res, {
        data: payments,
        total: payments.length,
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: parseFloat(invoice.amount),
          paidAmount: parseFloat(invoice.paidAmount),
          balance: parseFloat(invoice.balance),
        },
      }, '获取发票付款记录成功');
    } catch (error) {
      return ResponseHandler.error(res, '获取发票付款记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取未付清的应付账款发票列表（用于支付选择）
   */
  getUnpaidInvoices: async (req, res) => {
    try {
      const invoices = await apModel.getUnpaidInvoices();
      // 统一 camel；兼容前端 balance / amount 别名
      const mapped = (invoices || []).map((inv) => {
        const api = toInvoiceApi(
          {
            id: inv.id,
            invoice_number: inv.invoiceNumber ?? inv.invoice_number,
            supplier_id: inv.supplierId ?? inv.supplier_id,
            supplier_name: inv.supplierName ?? inv.supplier_name,
            invoice_date: inv.invoiceDate ?? inv.invoice_date,
            due_date: inv.dueDate ?? inv.due_date,
            total_amount: inv.amount ?? inv.totalAmount ?? inv.total_amount,
            paid_amount: inv.paidAmount ?? inv.paid_amount,
            balance_amount: inv.balance ?? inv.balanceAmount ?? inv.balance_amount,
            status: inv.status,
          },
          'ap'
        );
        // 创建付款表单历史字段
        api.amount = api.totalAmount;
        api.balance = api.balanceAmount;
        return api;
      });

      return ResponseHandler.success(res, mapped, '获取未付清发票列表成功');
    } catch (error) {
      return ResponseHandler.error(res, '获取未付清发票列表失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = apController;
