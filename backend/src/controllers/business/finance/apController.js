/**
 * apController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { accountingConfig } = require('../../../config/accountingConfig');


const apModel = require('../../../models/ap');
const { financeConfig } = require('../../../config/financeConfig');
const db = require('../../../config/db');
const BankAccountModel = require('../../../models/cash/Account');
// responseFormatter已合并到ResponseHandler

/**
 * 应付账款控制器
 */
const apController = {
  /**
   * 生成应付账款发票编号
   */
  generateInvoiceNumber: async (req, res) => {
    try {
      // 获取当前日期
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;

      // 确保配置已加载
      await financeConfig.loadFromDatabase(db);
      const prefix = financeConfig.get('invoice.invoiceNumberPrefix.AP', 'AP');

      // 使用 MAX 提取当日最大序号，避免删除记录或并发时编号重复
      const [result] = await db.pool.execute(
        `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) as maxSerial
         FROM ap_invoices WHERE invoice_number LIKE ?`,
        [`${prefix}-${dateStr}-%`]
      );

      const nextSerial = (result[0].maxSerial || 0) + 1;
      const serialNumber = String(nextSerial).padStart(4, '0');

      // 生成发票编号: PREFIX-YYYYMMDD-序号
      const invoiceNumber = `${prefix}-${dateStr}-${serialNumber}`;

      return ResponseHandler.success(res, { invoiceNumber }, '生成发票编号成功');
    } catch (error) {
      logger.error('生成发票编号失败:', error);
      return ResponseHandler.error(res, '生成发票编号失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取应付账款发票列表
   */
  getInvoices: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        invoiceNumber,
        supplierName,
        startDate,
        endDate,
        status,
      } = req.query;

      // 参数验证
      const numPage = parseInt(page);
      const numLimit = parseInt(limit);

      if (numPage < 1 || numLimit < 1 || numLimit > 100) {
        return ResponseHandler.validationError(res, '无效的分页参数', [
          { field: 'page', message: '页码必须大于0' },
          { field: 'limit', message: '每页记录数必须在1-100之间' },
        ]);
      }

      // 构建过滤条件
      const filters = {};
      if (invoiceNumber) filters.invoice_number = invoiceNumber;
      if (supplierName) filters.supplier_name = supplierName;
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      if (status) filters.status = status;

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
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
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
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }
      const invoice = await apModel.getInvoiceById(invoiceId);

      if (!invoice) {
        return ResponseHandler.error(res, '未找到指定的发票', 'NOT_FOUND', 404);
      }

      // 发票编辑格式化 - 确保所有金额字段是数字类型
      const formattedInvoice = {
        ...invoice,
        amount: parseFloat(invoice.amount),
        paidAmount: parseFloat(invoice.paidAmount || 0),
        balance: parseFloat(invoice.balance || 0),
        items: invoice.items.map((item) => ({
          ...item,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          amount: parseFloat(item.amount),
        })),
      };

      return ResponseHandler.success(res, formattedInvoice, '获取发票编辑数据成功');
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
      // 获取请求体中的数据
      const invoiceData = req.body;

      // 验证必填字段
      if (!invoiceData.invoiceNumber || !invoiceData.supplierId || !invoiceData.invoiceDate || !invoiceData.dueDate) {
        return ResponseHandler.error(res, '缺少必要的发票信息（发票编号、供应商、发票日期、到期日）', 'VALIDATION_ERROR', 400);
      }

      // 验证金额
      const amount = parseFloat(invoiceData.amount);
      if (isNaN(amount) || amount <= 0) {
        return ResponseHandler.error(res, '发票金额必须大于0', 'VALIDATION_ERROR', 400);
      }

      // 准备数据以匹配数据库字段
      const formattedData = {
        invoice_number: invoiceData.invoiceNumber,
        supplier_id: invoiceData.supplierId,
        invoice_date: invoiceData.invoiceDate,
        due_date: invoiceData.dueDate,
        total_amount: amount,
        notes: invoiceData.notes,
        status: '草稿', // 设置默认状态为草稿
        items: invoiceData.items, // 传递明细项
      };

      // 调用模型方法创建发票
      const invoiceId = await apModel.createInvoice(formattedData);

      // 返回成功结果
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
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }
      const { status } = req.body;

      if (!status) {
        return ResponseHandler.error(res, '缺少状态参数', 'VALIDATION_ERROR', 400);
      }

      // 状态白名单校验（与 AR 对齐）
      const validStatuses = ['草稿', '已确认', '部分付款', '已付款', '已逾期', '已取消'];
      if (!validStatuses.includes(status)) {
        return ResponseHandler.error(
          res,
          `无效的状态值，有效状态: ${validStatuses.join(', ')}`,
          'VALIDATION_ERROR',
          400
        );
      }

      await apModel.updateInvoiceStatus(invoiceId, status);

      return ResponseHandler.success(res, { id: invoiceId, status }, '发票状态更新成功');
    } catch (error) {
      logger.error('更新应付账款发票状态失败:', error);
      return ResponseHandler.error(res, '更新应付账款发票状态失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新应付账款发票
   */
  updateInvoice: async (req, res) => {
    try {
      const invoiceId = req.params.id;
      const invoiceData = req.body;

      // 检查发票是否存在
      const existingInvoice = await apModel.getInvoiceById(invoiceId);
      if (!existingInvoice) {
        return ResponseHandler.error(res, '未找到指定的发票', 'NOT_FOUND', 404);
      }

      // 检查发票状态，已付款或已取消不允许修改
      if (['已付款', '已取消'].includes(existingInvoice.status)) {
        return ResponseHandler.error(res, `${existingInvoice.status}的发票不允许修改`, 'VALIDATION_ERROR', 400);
      }

      // 验证并转换金额
      const amount = parseFloat(invoiceData.amount || invoiceData.total_amount);
      if (isNaN(amount) || amount <= 0) {
        return ResponseHandler.error(res, '发票金额必须大于0', 'VALIDATION_ERROR', 400);
      }

      // 准备数据以匹配数据库字段
      const formattedData = {
        id: invoiceId,
        invoice_number: invoiceData.invoiceNumber,
        supplier_invoice_number: invoiceData.supplierInvoiceNumber,
        supplier_id: invoiceData.supplierId,
        invoice_date: invoiceData.invoiceDate,
        due_date: invoiceData.dueDate,
        total_amount: amount,
        notes: invoiceData.notes,
        items: invoiceData.items, // 传递明细项
      };

      // 调用模型方法更新发票
      const success = await apModel.updateInvoice(formattedData);

      if (success) {
        return ResponseHandler.success(res, { id: invoiceId }, '发票更新成功');
      } else {
        return ResponseHandler.error(res, '发票更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('更新应付账款发票失败:', error);
      return ResponseHandler.error(res, '更新应付账款发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取付款记录列表
   */
  getPayments: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        paymentNumber,
        supplierName,
        startDate,
        endDate,
        paymentMethod,
        status,
      } = req.query;

      // 构建过滤条件
      const filters = {};
      if (paymentNumber) filters.payment_number = paymentNumber;
      if (supplierName) filters.supplier_name = supplierName;
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      if (paymentMethod) filters.payment_method = paymentMethod;
      if (status) filters.status = status; // 添加状态筛选

      // 调用模型方法获取付款记录列表
      const result = await apModel.getPayments(filters, parseInt(page), parseInt(limit));

      // 映射结果，处理可能的字段不存在情况
      const mappedData = result.payments.map((payment) => {
        // 确保所有必要字段存在
        const formatted = {
          id: payment.id,
          paymentNumber: payment.payment_number,
          supplierId: payment.supplier_id,
          // 供应商名可能从不同字段获取
          supplierName: payment.supplier_name || payment.name || 'Unknown Supplier',
          // 日期格式化，只保留年月日
          paymentDate: payment.payment_date ? payment.payment_date.substring(0, 10) : '',
          // 确保数值型数据正确格式化
          amount: parseFloat(payment.total_amount || 0),
          paymentMethod: payment.payment_method || 'Unknown',
          status: payment.status || 'normal', // 添加状态字段
          notes: payment.notes || '',
          createdAt: payment.created_at ? payment.created_at.substring(0, 10) : '',
          // 添加发票编号
          invoiceNumber: payment.invoice_number || '',
          // 为了兼容性，添加对应的发票ID
          invoiceId: null,
        };
        return formatted;
      });

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
      const paymentId = parseInt(req.params.id);
      if (isNaN(paymentId)) {
        return ResponseHandler.error(res, '无效的付款记录ID', 'VALIDATION_ERROR', 400);
      }
      const payment = await apModel.getPaymentById(paymentId);

      if (!payment) {
        return ResponseHandler.error(res, '未找到指定的付款记录', 'NOT_FOUND', 404);
      }

      // 格式化数据以符合前端期望
      const formattedPayment = {
        id: payment.id,
        paymentNumber: payment.payment_number,
        supplierId: payment.supplier_id,
        supplierName: payment.name || payment.supplier_name || '',
        paymentDate: payment.payment_date || '',
        amount: parseFloat(payment.total_amount),
        paymentMethod: payment.payment_method,
        status: payment.status || 'normal', // 添加状态字段
        referenceNumber: payment.reference_number,
        bankAccountId: payment.bank_account_id,
        bankAccountName: payment.bank_account_name,
        notes: payment.notes || '',
        createdAt: payment.created_at || '',
        // 添加作废相关字段
        voided_at: payment.voided_at || null,
        voided_by: payment.voided_by || null,
        voided_by_name: payment.voided_by_name || null,
        void_reason: payment.void_reason || null,
        // 添加付款明细项
        items: payment.items.map((item) => ({
          id: item.id,
          invoiceId: item.invoice_id,
          invoiceNumber: item.invoice_number,
          amount: parseFloat(item.amount),
          discountAmount: parseFloat(item.discount_amount || 0),
        })),
      };

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

      // 检查发票是否已全额支付
      if (invoice.status === '已付款') {
        return ResponseHandler.error(
          res,
          `发票ID ${paymentData.invoiceId} 已全额支付，无需再付款`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 检查付款金额是否超过未付余额 (精度修复: 分/整数比对)
      const payAmountCents = Math.round(parseFloat(paymentData.amount || 0) * 100);
      const invoiceBalanceCents = Math.round(parseFloat(invoice.balance || invoice.balance_amount || 0) * 100);
      if (payAmountCents > invoiceBalanceCents) {
        return ResponseHandler.error(
          res,
          `付款金额 ${paymentData.amount} 超过发票未付余额 ${invoice.balance || invoice.balance_amount}`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 检查银行账户是否被冻结
      if (paymentData.bankAccountId) {
        const bankAccount = await BankAccountModel.getBankAccountById(paymentData.bankAccountId);
        if (bankAccount && !bankAccount.is_active) {
          return ResponseHandler.error(
            res,
            `银行账户 "${bankAccount.account_name}" 已被冻结，无法用于付款`,
            'VALIDATION_ERROR',
            400
          );
        }
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

      // 构建完整的付款数据结构
      const completePaymentData = {
        payment_number: paymentData.paymentNumber || `PAY-${Date.now()}`,
        supplier_id: invoice.supplierId,
        supplier_name: invoice.supplierName,
        payment_date: paymentData.paymentDate || new Date().toISOString().split('T')[0],
        total_amount: parseFloat(paymentData.amount),
        payment_method: paymentMethod,
        reference_number: paymentData.referenceNumber || null,
        bank_account_id: paymentData.bankAccountId || null,
        notes: paymentData.notes || '',
      };

      // 构建付款明细项数组
      const paymentItems = [
        {
          invoice_id: paymentData.invoiceId,
          amount: parseFloat(paymentData.amount),
          discount_amount: parseFloat(paymentData.discountAmount || 0),
        },
      ];


      // 获取当前会计期间并校验会计科目
      await financeConfig.loadFromDatabase(db);
      const periodId = await financeConfig.getCurrentPeriodId(db);

      if (!periodId) {
        throw new Error('无法获取当前会计期间，请先创建会计期间');
      }

      // 校验应付账款科目
      const payableCode = accountingConfig.getAccountCode('ACCOUNTS_PAYABLE') || '2202';
      const [payableAccountCheck] = await db.pool.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ?',
        [payableCode]
      );
      if (!payableAccountCheck.length) {
        throw new Error(`应付账款科目 ${payableCode} 不存在，请先在科目表中创建`);
      }
      const payableAccountId = payableAccountCheck[0].id;

      // 校验银行/现金科目
      const cashOrBankCode = completePaymentData.payment_method === '现金'
        ? accountingConfig.getAccountCode('CASH') || '1001'
        : accountingConfig.getAccountCode('BANK_DEPOSIT') || '1002';
      const [bankAccountCheck] = await db.pool.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ?',
        [cashOrBankCode]
      );
      if (!bankAccountCheck.length) {
        throw new Error(`银行/现金科目 ${cashOrBankCode} 不存在，请先在科目表中创建`);
      }
      const bankAccountId = bankAccountCheck[0].id;

      // 创建会计凭证数据
      const glEntry = {
        entry_number: `AP-${completePaymentData.payment_number}`,
        period_id: periodId,
        created_by: financeConfig.get('system.defaultCreator', 'system'),
        payable_account_id: payableAccountId,
        bank_account_id: bankAccountId,
      };

      // 添加会计凭证数据到付款数据中
      completePaymentData.gl_entry = glEntry;

      // 调用模型方法创建付款记录（会自动创建会计凭证）
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
            glEntryNumber: glEntry.entry_number,
          },
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建付款记录失败:', error);
      return ResponseHandler.error(res, '创建付款记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 作废付款记录
   */
  voidPayment: async (req, res) => {
    try {
      const paymentId = parseInt(req.params.id);
      const { void_reason } = req.body;

      if (!paymentId) {
        return ResponseHandler.error(res, '无效的付款记录ID', 'VALIDATION_ERROR', 400);
      }

      if (!void_reason || void_reason.trim() === '') {
        return ResponseHandler.error(res, '请填写作废原因', 'VALIDATION_ERROR', 400);
      }

      // 获取当前用户ID
      const userId = req.user?.id || 1;

      // 调用模型方法作废付款记录
      await apModel.voidPayment(paymentId, {
        voided_by: userId,
        void_reason: void_reason.trim(),
      });

      return ResponseHandler.success(res, null, '付款记录已成功作废');
    } catch (error) {
      logger.error('作废付款记录失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '作废付款记录失败',
        'SERVER_ERROR',
        500,
        error
      );
    }
  },

  /**
   * 获取供应商应付款
   */
  getSupplierPayables: async (req, res) => {
    try {
      const { supplierName, status } = req.query;

      // 从数据库获取供应商应付款汇总
      const connection = await db.pool.getConnection();

      try {
        // 构建查询条件
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

        // 执行查询
        const [payables] = await connection.execute(
          `
          SELECT 
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
          ORDER BY balance DESC
        `,
          params
        );

        // 格式化数据
        const formattedData = payables.map((item) => ({
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

        return ResponseHandler.success(res, {
          data: formattedData,
          total: formattedData.length,
        }, '获取供应商应付款成功');
      } finally {
        connection.release();
      }
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
      // 获取查询参数
      const { reportDate, /* supplierType, */ supplierName } = req.query;

      // 从数据库获取真实数据
      const connection = await db.pool.getConnection();

      try {
        // 构建查询条件
        let whereClause = '';
        const params = [];

        if (supplierName) {
          whereClause += ' AND s.name LIKE ?';
          params.push(`%${supplierName}%`);
        }

        // 执行查询，获取应付账款数据
        const [payables] = await connection.execute(
          `
          SELECT 
            s.id AS supplierId,
            s.name AS supplierName,
            COALESCE(SUM(i.balance_amount), 0) AS totalAmount,
            COALESCE(SUM(CASE 
              WHEN DATEDIFF(i.due_date, CURDATE()) >= 0 AND DATEDIFF(i.due_date, CURDATE()) <= 30 THEN i.balance_amount 
              ELSE 0 
            END), 0) AS within30Days,
            COALESCE(SUM(CASE 
              WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 1 AND 30 THEN i.balance_amount 
              ELSE 0 
            END), 0) AS days31to60,
            COALESCE(SUM(CASE 
              WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 31 AND 60 THEN i.balance_amount 
              ELSE 0 
            END), 0) AS days61to90,
            COALESCE(SUM(CASE 
              WHEN DATEDIFF(CURDATE(), i.due_date) > 60 THEN i.balance_amount 
              ELSE 0 
            END), 0) AS over90Days,
            s.contact_person AS contactPerson,
            s.contact_phone AS contactPhone
          FROM 
            suppliers s
          LEFT JOIN 
            ap_invoices i ON s.id = i.supplier_id AND i.status IN ('已确认', '部分付款')
          WHERE 
            s.status = 1 ${whereClause}
          GROUP BY 
            s.id, s.name, s.contact_person, s.contact_phone
          HAVING
            totalAmount >= 0
          ORDER BY 
            totalAmount DESC
        `,
          params
        );

        // 格式化数据
        const formattedData = payables.map((item) => ({
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          supplierType: '供应商', // 使用默认值代替不存在的列
          totalAmount: parseFloat(item.totalAmount || 0),
          within30Days: parseFloat(item.within30Days || 0),
          days31to60: parseFloat(item.days31to60 || 0),
          days61to90: parseFloat(item.days61to90 || 0),
          over90Days: parseFloat(item.over90Days || 0),
          lastPaymentDate: null, // 移除对不存在的列的引用
          contactPerson: item.contactPerson,
          contactPhone: item.contactPhone,
        }));

        // 返回数据
        return ResponseHandler.success(
          res,
          {
            details: formattedData,
            reportDate: reportDate || new Date().toISOString().slice(0, 10),
          },
          '获取应付账款账龄分析成功'
        );
      } finally {
        // 释放连接
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
        // 查询供应商账龄数据
        const [aging] = await connection.execute(
          `
          SELECT 
            s.id AS supplierId,
            s.name AS supplierName,
            s.contact_person AS contactPerson,
            s.contact_phone AS contactPhone,
            COALESCE(SUM(i.balance_amount), 0) AS totalAmount,
            COALESCE(SUM(CASE 
              WHEN DATEDIFF(i.due_date, CURDATE()) >= 0 AND DATEDIFF(i.due_date, CURDATE()) <= 30 THEN i.balance_amount 
              ELSE 0 
            END), 0) AS within30Days,
            COALESCE(SUM(CASE 
              WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 1 AND 30 THEN i.balance_amount 
              ELSE 0 
            END), 0) AS days31to60,
            COALESCE(SUM(CASE 
              WHEN DATEDIFF(CURDATE(), i.due_date) BETWEEN 31 AND 60 THEN i.balance_amount 
              ELSE 0 
            END), 0) AS days61to90,
            COALESCE(SUM(CASE 
              WHEN DATEDIFF(CURDATE(), i.due_date) > 60 THEN i.balance_amount 
              ELSE 0 
            END), 0) AS over90Days,
            MAX(i.invoice_date) AS lastInvoiceDate,
            COUNT(i.id) AS invoiceCount
          FROM suppliers s
          LEFT JOIN ap_invoices i ON s.id = i.supplier_id 
            AND i.status IN ('已确认', '部分付款')
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

        // 格式化返回数据
        const result = {
          supplierId: aging[0].supplierId,
          supplierName: aging[0].supplierName,
          contactPerson: aging[0].contactPerson,
          contactPhone: aging[0].contactPhone,
          supplierType: '供应商',
          totalAmount: parseFloat(aging[0].totalAmount || 0),
          within30Days: parseFloat(aging[0].within30Days || 0),
          days31to60: parseFloat(aging[0].days31to60 || 0),
          days61to90: parseFloat(aging[0].days61to90 || 0),
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
      const invoiceId = parseInt(req.params.id);
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
      // 调用模型方法获取未付清的发票
      const invoices = await apModel.getUnpaidInvoices();

      return ResponseHandler.success(res, invoices, '获取未付清发票列表成功');
    } catch (error) {
      return ResponseHandler.error(res, '获取未付清发票列表失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = apController;
