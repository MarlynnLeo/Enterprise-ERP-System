/**
 * arController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const { financeConfig } = require('../../../config/financeConfig');
const { accountingConfig } = require('../../../config/accountingConfig');
const arModel = require('../../../models/ar');
const BankAccountModel = require('../../../models/cash/Account');

/**
 * 应收账款控制器
 */
const arController = {
  /**
   * 生成应收账款发票编号
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
      const dbInstance = require('../../../config/db');
      await financeConfig.loadFromDatabase(dbInstance);
      const prefix = financeConfig.get('invoice.invoiceNumberPrefix.AR', 'AR');

      // 使用 MAX 提取当日最大序号，避免删除记录后编号重复（与 AP 对齐）
      const [result] = await dbInstance.pool.execute(
        `SELECT MAX(CAST(SUBSTRING_INDEX(invoice_number, '-', -1) AS UNSIGNED)) as maxSerial
         FROM ar_invoices WHERE invoice_number LIKE ?`,
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
   * 获取应收账款发票列表
   */
  getInvoices: async (req, res) => {
    try {
      // 解析查询参数
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      // 简化过滤条件处理
      const filters = {};
      if (req.query.invoiceNumber) filters.invoice_number = req.query.invoiceNumber;
      if (req.query.customerId) filters.customer_id = req.query.customerId;
      if (req.query.startDate) filters.start_date = req.query.startDate;
      if (req.query.endDate) filters.end_date = req.query.endDate;
      if (req.query.status) filters.status = req.query.status;

      // 调用模型方法获取数据
      const result = await arModel.getInvoices(filters, page, limit);

      // 使用ResponseHandler统一响应格式
      return ResponseHandler.paginated(
        res,
        result.invoices,
        result.pagination.total,
        result.pagination.page,
        result.pagination.pageSize,
        '获取应收账款发票成功'
      );
    } catch (error) {
      logger.error('获取应收账款发票失败:', error);
      return ResponseHandler.error(res, '获取应收账款发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个应收账款发票
   */
  getInvoiceById: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }

      // 获取发票基本信息
      const invoice = await arModel.getInvoiceById(id);

      if (!invoice) {
        return ResponseHandler.error(res, '发票不存在', 'NOT_FOUND', 404);
      }

      // 获取发票明细项，使用Promise.all并行获取数据
      let items = [];
      let payments = [];

      try {
        [items, payments] = await Promise.all([
          arModel.getInvoiceItems(id),
          arModel.getInvoicePayments(id),
        ]);
      } catch (fetchError) {
        // 获取明细失败，继续使用基本信息
        logger.warn('获取发票明细失败:', fetchError);
      }

      // 合并结果
      invoice.items = items || [];
      invoice.payments = payments || [];

      // 返回结果
      return ResponseHandler.success(res, invoice, '获取发票成功');
    } catch (error) {
      logger.error('获取应收账款发票失败:', error);
      return ResponseHandler.error(res, '获取应收账款发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建应收账款发票
   */
  createInvoice: async (req, res) => {
    try {
      const invoiceData = req.body;

      // 验证必填字段
      if (
        !invoiceData.invoiceNumber ||
        !invoiceData.customerId ||
        !invoiceData.invoiceDate ||
        !invoiceData.dueDate
      ) {
        return ResponseHandler.error(res, '缺少必要的发票信息', 'VALIDATION_ERROR', 400);
      }

      // 准备数据模型所需的格式
      const modelData = {
        invoice_number: invoiceData.invoiceNumber,
        customer_id: invoiceData.customerId,
        invoice_date: invoiceData.invoiceDate,
        due_date: invoiceData.dueDate,
        total_amount: parseFloat(invoiceData.amount) || 0,
        currency_code: invoiceData.currency || financeConfig.get('invoice.defaultCurrency', 'CNY'),
        status: invoiceData.status || '草稿',
        notes: invoiceData.notes || '',
        // 如果有会计分录信息，也需要处理
        gl_entry: invoiceData.glEntry || null,
      };

      // 调用模型方法创建发票
      const invoiceId = await arModel.createInvoice(modelData);

      // 返回成功结果
      ResponseHandler.success(
        res,
        {
          id: invoiceId,
          message: '发票创建成功',
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建应收账款发票失败:', error);
      return ResponseHandler.error(res, '创建应收账款发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新应收账款发票状态
   */
  updateInvoiceStatus: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;

      if (!id) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }

      if (!status) {
        return ResponseHandler.error(res, '缺少状态信息', 'VALIDATION_ERROR', 400);
      }

      // 从配置获取有效状态列表
      await financeConfig.loadFromDatabase(require('../../../config/db'));
      const validStatuses = financeConfig.get('status.invoiceStatuses', [
        '草稿',
        '已确认',
        '部分付款',
        '已付款',
        '已逾期',
        '已取消',
      ]);

      if (!validStatuses.includes(status)) {
        return ResponseHandler.error(
          res,
          `无效的状态值，有效状态: ${validStatuses.join(', ')}`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 调用模型方法更新状态
      const success = await arModel.updateInvoiceStatus(id, status);

      if (!success) {
        return ResponseHandler.error(res, '发票不存在或状态更新失败', 'NOT_FOUND', 404);
      }

      // 返回成功结果
      return ResponseHandler.success(res, { id, status }, '发票状态更新成功');
    } catch (error) {
      logger.error('更新应收账款发票状态失败:', error);
      return ResponseHandler.error(res, '更新应收账款发票状态失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取发票用于编辑
   */
  getInvoiceForEdit: async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (!id) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }

      const invoice = await arModel.getInvoiceById(id);
      if (!invoice) {
        return ResponseHandler.error(res, '未找到指定的发票', 'NOT_FOUND', 404);
      }

      // 发票编辑格式化 - 确保所有金额字段是数字类型
      const formattedInvoice = {
        ...invoice,
        total_amount: parseFloat(invoice.total_amount || 0),
        paid_amount: parseFloat(invoice.paid_amount || 0),
        balance_amount: parseFloat(invoice.balance_amount || 0),
        items: (invoice.items || []).map((item) => ({
          ...item,
          quantity: parseFloat(item.quantity || 0),
          unit_price: parseFloat(item.unit_price || 0),
          amount: parseFloat(item.amount || 0),
        })),
      };

      return ResponseHandler.success(res, formattedInvoice, '获取发票编辑数据成功');
    } catch (error) {
      logger.error('获取发票编辑数据失败:', error);
      return ResponseHandler.error(res, '获取发票编辑数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新应收账款发票
   */
  updateInvoice: async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const invoiceData = req.body;

      if (!invoiceId) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }

      // 检查发票是否存在
      const existingInvoice = await arModel.getInvoiceById(invoiceId);
      if (!existingInvoice) {
        return ResponseHandler.error(res, '未找到指定的发票', 'NOT_FOUND', 404);
      }

      // 检查发票状态，已付款或已取消不允许修改
      if (['已付款', '已取消'].includes(existingInvoice.status)) {
        return ResponseHandler.error(res, `${existingInvoice.status}的发票不允许修改`, 'VALIDATION_ERROR', 400);
      }

      // 准备数据以匹配数据库字段
      const formattedData = {
        id: invoiceId,
        invoice_number: invoiceData.invoiceNumber || invoiceData.invoice_number,
        customer_id: invoiceData.customerId || invoiceData.customer_id,
        invoice_date: invoiceData.invoiceDate || invoiceData.invoice_date,
        due_date: invoiceData.dueDate || invoiceData.due_date,
        total_amount: invoiceData.amount || invoiceData.total_amount,
        notes: invoiceData.notes,
        items: invoiceData.items,
      };

      // 调用模型方法更新发票
      const success = await arModel.updateInvoice(formattedData);

      if (success) {
        return ResponseHandler.success(res, { id: invoiceId }, '发票更新成功');
      } else {
        return ResponseHandler.error(res, '发票更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('更新应收账款发票失败:', error);
      return ResponseHandler.error(res, error.message || '更新应收账款发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取收款记录列表
   */
  getReceipts: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        receiptNumber,
        customerName,
        startDate,
        endDate,
        paymentMethod,
        status,
        invoiceNumber,
      } = req.query;

      // 构建查询条件
      const filters = {};
      if (receiptNumber) filters.receipt_number = receiptNumber;
      if (customerName) filters.customer_name = customerName;
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      if (paymentMethod) filters.payment_method = paymentMethod;
      if (status) filters.status = status; // 添加状态筛选
      if (invoiceNumber) filters.invoice_number = invoiceNumber; // 添加发票编号过滤

      // 调用模型方法获取收款记录列表
      const result = await arModel.getReceipts(filters, parseInt(page), parseInt(limit));

      return ResponseHandler.paginated(
        res,
        result.receipts || [],
        result.pagination?.total || 0,
        result.pagination?.page || 1,
        result.pagination?.pageSize || limit,
        '获取收款记录成功'
      );
    } catch (error) {
      logger.error('获取收款记录失败:', error);
      return ResponseHandler.error(res, '获取收款记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个收款记录
   */
  getReceiptById: async (req, res) => {
    try {
      const receiptId = req.params.id;

      // 获取收款记录详情
      const receipt = await arModel.getReceiptById(receiptId);

      if (!receipt) {
        return ResponseHandler.error(res, '收款记录不存在', 'NOT_FOUND', 404);
      }

      return ResponseHandler.success(res, receipt, '获取收款记录成功');
    } catch (error) {
      logger.error('获取收款记录失败:', error);
      return ResponseHandler.error(res, '获取收款记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建收款记录
   */
  createReceipt: async (req, res) => {
    try {
      const receiptData = req.body;

      // 验证必填字段 - 分别检查每个字段给出更清晰的提示
      if (!receiptData.invoiceId) {
        return ResponseHandler.error(res, '缺少发票ID', 'VALIDATION_ERROR', 400);
      }
      if (!receiptData.receiptDate) {
        return ResponseHandler.error(res, '缺少收款日期', 'VALIDATION_ERROR', 400);
      }

      // 单独检查金额 - 确保是正数
      const amount = parseFloat(receiptData.amount);
      if (isNaN(amount) || amount <= 0) {
        return ResponseHandler.error(res, '收款金额必须大于0', 'VALIDATION_ERROR', 400);
      }

      // 获取发票信息
      const invoice = await arModel.getInvoiceById(receiptData.invoiceId);
      if (!invoice) {
        return ResponseHandler.error(res, '应收发票不存在', 'NOT_FOUND', 404);
      }

      // 检查发票是否还有未收余额
      const balanceAmount = parseFloat(invoice.balance_amount || 0);
      if (balanceAmount <= 0) {
        return ResponseHandler.error(
          res,
          '该发票已无待收款余额，无需收款',
          'VALIDATION_ERROR',
          400
        );
      }

      // 检查收款金额是否超过未收余额 (精度修复: 分/整数比对)
      const amountCents = Math.round(amount * 100);
      const balanceAmountCents = Math.round(balanceAmount * 100);
      if (amountCents > balanceAmountCents) {
        return ResponseHandler.error(
          res,
          `收款金额不能超过发票未收余额(余额: ¥${balanceAmount.toFixed(2)})`,
          'VALIDATION_ERROR',
          400
        );
      }

      // 准备收款数据 — 使用日期+序号机制生成安全编号
      const dbInstance = require('../../../config/db');
      await financeConfig.loadFromDatabase(dbInstance);
      const rcPrefix = financeConfig.get('invoice.receiptNumberPrefix', 'RC');
      const nowDate = new Date();
      const rcYear = nowDate.getFullYear();
      const rcMonth = String(nowDate.getMonth() + 1).padStart(2, '0');
      const rcDay = String(nowDate.getDate()).padStart(2, '0');
      const dateStr = `${rcYear}${rcMonth}${rcDay}`;
      // 使用 MAX 提取当日最大序号，避免并发重复
      const [maxResult] = await dbInstance.pool.execute(
        `SELECT MAX(CAST(SUBSTRING_INDEX(receipt_number, '-', -1) AS UNSIGNED)) as maxSerial
         FROM ar_receipts WHERE receipt_number LIKE ?`,
        [`${rcPrefix}-${dateStr}-%`]
      );
      const nextSerial = (maxResult[0].maxSerial || 0) + 1;
      const receiptNumber = `${rcPrefix}-${dateStr}-${String(nextSerial).padStart(4, '0')}`;

      // 支付方式映射：前端英文值 -> 数据库中文ENUM值
      const paymentMethodMap = {
        cash: '现金',
        bank_transfer: '银行转账',
        check: '支票',
        credit_card: '电子支付',
        electronic: '电子支付',
        other: '其他',
      };

      // 转换支付方式，如果已经是中文则直接使用
      let paymentMethod = receiptData.paymentMethod || '银行转账';
      if (paymentMethodMap[paymentMethod]) {
        paymentMethod = paymentMethodMap[paymentMethod];
      }

      // 检查银行账户是否被冻结
      if (receiptData.bankAccountId) {
        const bankAccount = await BankAccountModel.getBankAccountById(receiptData.bankAccountId);
        if (bankAccount && !bankAccount.is_active) {
          return ResponseHandler.error(
            res,
            `银行账户 "${bankAccount.account_name}" 已被冻结，无法用于收款`,
            'VALIDATION_ERROR',
            400
          );
        }
      }

      const modelData = {
        receipt_number: receiptNumber,
        customer_id: invoice.customer_id,
        customer_name: invoice.customer_name || '未知客户', // 添加客户名称
        receipt_date: receiptData.receiptDate,
        total_amount: parseFloat(receiptData.amount),
        payment_method: paymentMethod,
        reference_number: receiptData.referenceNumber || null,
        bank_account_id: receiptData.bankAccountId || null,
        notes: receiptData.notes || '',
      };

      // 准备收款明细
      const receiptItems = [
        {
          invoice_id: receiptData.invoiceId,
          amount: parseFloat(receiptData.amount),
          discount_amount: parseFloat(receiptData.discountAmount || 0),
        },
      ];

      // ========== 构建会计凭证数据 ==========
      const db = require('../../../config/db');

      // 校验会计科目是否存在
      let receivableAccountId, bankAccountId;
      try {
        const [receivableAccountCheck] = await db.pool.execute(
          'SELECT id FROM gl_accounts WHERE account_code = ?',
          [accountingConfig.getAccountCode('ACCOUNTS_RECEIVABLE') || '1122'] // 应收账款科目
        );

        const [bankAccountCheck] = await db.pool.execute(
          'SELECT id FROM gl_accounts WHERE account_code = ?',
          [
            paymentMethod === '现金'
              ? accountingConfig.getAccountCode('CASH') || '1001'
              : accountingConfig.getAccountCode('BANK_DEPOSIT') || '1002',
          ]
        );

        if (!receivableAccountCheck.length) {
          logger.error(
            `应收账款科目${accountingConfig.getAccountCode('ACCOUNTS_RECEIVABLE') || '1122'}不存在`
          );
          throw new Error('应收账款科目不存在');
        }

        if (!bankAccountCheck.length) {
          logger.error('银行/现金科目不存在');
          throw new Error('银行/现金科目不存在');
        }

        receivableAccountId = receivableAccountCheck[0].id;
        bankAccountId = bankAccountCheck[0].id;
      } catch (error) {
        logger.error('会计科目验证失败:', error);
        throw error;
      }

      // 获取当前会计期间ID
      await financeConfig.loadFromDatabase(db);
      const periodId = await financeConfig.getCurrentPeriodId(db);

      if (!periodId) {
        throw new Error('无法获取当前会计期间，请先创建会计期间');
      }

      // 创建会计凭证数据
      const glEntry = {
        entry_number: `AR-${receiptNumber}`,
        period_id: periodId,
        created_by: financeConfig.get('system.defaultCreator', 'system'),
        receivable_account_id: receivableAccountId,
        bank_account_id: bankAccountId,
      };

      // 添加会计凭证数据到收款数据中
      modelData.gl_entry = glEntry;

      // 调用模型方法创建收款记录（会自动创建会计凭证）
      const receiptId = await arModel.createReceipt(modelData, receiptItems);

      return ResponseHandler.success(
        res,
        {
          id: receiptId,
          receiptNumber: receiptNumber,
          message: '收款记录创建成功，已自动生成会计凭证',
          details: {
            invoice: invoice.invoice_number,
            customer: invoice.customer_name,
            amount: receiptData.amount,
            receiptDate: modelData.receipt_date,
            glEntryNumber: glEntry.entry_number,
          },
        },
        '收款记录创建成功',
        201
      );
    } catch (error) {
      logger.error('创建收款记录失败:', error);
      return ResponseHandler.error(res, '创建收款记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 作废收款记录
   */
  voidReceipt: async (req, res) => {
    try {
      const receiptId = parseInt(req.params.id);
      const { void_reason } = req.body;

      if (!receiptId) {
        return ResponseHandler.error(res, '无效的收款记录ID', 'VALIDATION_ERROR', 400);
      }

      if (!void_reason || void_reason.trim() === '') {
        return ResponseHandler.error(res, '请填写作废原因', 'VALIDATION_ERROR', 400);
      }

      // 获取当前用户ID (从req.user或session中获取，这里假设是1)
      const userId = req.user?.id || 1;

      // 调用模型方法作废收款记录
      await arModel.voidReceipt(receiptId, {
        voided_by: userId,
        void_reason: void_reason.trim(),
      });

      return ResponseHandler.success(res, null, '收款记录已成功作废');
    } catch (error) {
      logger.error('作废收款记录失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '作废收款记录失败',
        'SERVER_ERROR',
        500,
        error
      );
    }
  },

  /**
   * 获取客户应收款
   */
  getCustomerReceivables: async (req, res) => {
    try {
      const { customerName, status } = req.query;

      // 从数据库获取客户应收款汇总
      const connection = await require('../../../config/db').pool.getConnection();

      try {
        // 构建查询条件
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

        // 执行查询
        const [receivables] = await connection.execute(
          `
          SELECT 
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
          ORDER BY balance DESC
        `,
          params
        );

        // 格式化数据
        const formattedData = receivables.map((item) => ({
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

        return ResponseHandler.success(res, formattedData, '获取客户应收款成功');
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取客户应收款失败:', error);
      return ResponseHandler.error(res, '获取客户应收款失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个客户应收款
   */
  getCustomerReceivablesById: async (req, res) => {
    try {
      const customerId = req.params.id;

      // 从数据库获取指定客户的应收款详情
      const connection = await require('../../../config/db').pool.getConnection();

      try {
        // 获取客户信息和应收款汇总
        const [customerData] = await connection.execute(
          `
          SELECT
            c.id AS customerId,
            c.name AS customerName,
            c.contact_person AS contactPerson,
            c.contact_phone AS contactPhone,
            c.email,
            COUNT(i.id) AS invoiceCount,
            COALESCE(SUM(i.total_amount), 0) AS totalAmount,
            COALESCE(SUM(i.paid_amount), 0) AS paidAmount,
            COALESCE(SUM(i.balance_amount), 0) AS balance
          FROM customers c
          LEFT JOIN ar_invoices i ON c.id = i.customer_id
            AND i.status NOT IN ('已付款', '已取消', '草稿', 'void')
          WHERE c.id = ?
          GROUP BY c.id, c.name, c.contact_person, c.contact_phone, c.email
        `,
          [customerId]
        );

        if (customerData.length === 0) {
          return ResponseHandler.error(res, '客户不存在', 'NOT_FOUND', 404);
        }

        // 获取该客户的所有未付清发票
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
          FROM ar_invoices
          WHERE customer_id = ? AND balance_amount > 0
          ORDER BY due_date ASC
        `,
          [customerId]
        );

        // 格式化数据
        const result = {
          customerId: customerData[0].customerId,
          customerName: customerData[0].customerName,
          contactPerson: customerData[0].contactPerson,
          contactPhone: customerData[0].contactPhone,
          email: customerData[0].email,
          invoiceCount: parseInt(customerData[0].invoiceCount || 0),
          totalAmount: parseFloat(customerData[0].totalAmount || 0),
          paidAmount: parseFloat(customerData[0].paidAmount || 0),
          balance: parseFloat(customerData[0].balance || 0),
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

        return ResponseHandler.success(res, result, '获取客户应收款详情成功');
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取客户应收款失败:', error);
      return ResponseHandler.error(res, '获取客户应收款失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取应收账款账龄分析
   */
  getReceivablesAging: async (req, res) => {
    try {
      // 获取查询参数
      const { reportDate, customerType, customerName } = req.query;

      // 从数据库获取真实数据
      const connection = await require('../../../config/db').pool.getConnection();

      try {
        // 构建查询条件
        let whereClause = '';
        const params = [];

        // 增加按客户类型过滤
        if (customerType) {
          whereClause += ' AND c.customer_type = ?';
          params.push(customerType);
        }

        if (customerName) {
          whereClause += ' AND c.name LIKE ?';
          params.push(`%${customerName}%`);
        }

        // 执行查询，获取应收账款数据
        const [receivables] = await connection.execute(
          `
          SELECT 
            c.id AS customerId,
            c.name AS customerName,
            c.customer_type AS customerType,
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
            c.contact_person AS contactPerson,
            COALESCE(c.contact_phone, c.phone) AS contactPhone
          FROM 
            customers c
          LEFT JOIN 
            ar_invoices i ON c.id = i.customer_id AND i.status NOT IN ('已付款', '已取消', '草稿', 'void')
          WHERE 
            c.status = 'active' ${whereClause}
          GROUP BY 
            c.id, c.name, c.contact_person, c.contact_phone, c.phone
          HAVING 
            totalAmount > 0
          ORDER BY 
            totalAmount DESC
        `,
          params
        );

        // 格式化数据
        const formattedData = receivables.map((item) => ({
          customerId: item.customerId,
          customerName: item.customerName,
          customerType: item.customerType,
          totalAmount: parseFloat(item.totalAmount || 0),
          currentAmount: parseFloat(item.currentAmount || 0),
          within30Days: parseFloat(item.within30Days || 0),
          within60Days: parseFloat(item.within60Days || 0),
          within90Days: parseFloat(item.within90Days || 0),
          over90Days: parseFloat(item.over90Days || 0),
          lastPaymentDate: null, // 移除对不存在的列的引用
          contactPerson: item.contactPerson,
          contactPhone: item.contactPhone,
        }));

        // 返回数据
        return ResponseHandler.success(
          res,
          {
            data: formattedData,
            reportDate: reportDate || new Date().toISOString().slice(0, 10),
          },
          '获取应收账款账龄分析成功'
        );
      } finally {
        // 释放连接
        connection.release();
      }
    } catch (error) {
      logger.error('获取应收账款账龄分析失败:', error);
      return ResponseHandler.error(res, '获取应收账款账龄分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个应收账款账龄分析
   */
  getReceivablesAgingById: async (req, res) => {
    try {
      const customerId = req.params.id;

      // 从数据库获取指定客户的账龄分析
      const connection = await require('../../../config/db').pool.getConnection();

      try {
        // 查询客户账龄数据
        const [aging] = await connection.execute(
          `
          SELECT 
            c.id AS customerId,
            c.name AS customerName,
            c.contact_person AS contactPerson,
            c.contact_phone AS contactPhone,
            'default' AS customerType,
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
          FROM customers c
          LEFT JOIN ar_invoices i ON c.id = i.customer_id 
            AND i.status NOT IN ('已付款', '已取消', '草稿', 'void')
          WHERE c.id = ? AND c.status = 'active'
          GROUP BY c.id, c.name, c.contact_person, c.contact_phone
        `,
          [customerId]
        );

        if (aging.length === 0) {
          return ResponseHandler.error(res, '客户不存在或无应收款数据', 'NOT_FOUND', 404);
        }

        // 获取该客户的未付清发票明细
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
          FROM ar_invoices
          WHERE customer_id = ? AND balance_amount > 0
          ORDER BY due_date ASC
          LIMIT 20
        `,
          [customerId]
        );

        // 格式化返回数据
        const result = {
          customerId: aging[0].customerId,
          customerName: aging[0].customerName,
          contactPerson: aging[0].contactPerson,
          contactPhone: aging[0].contactPhone,
          customerType: aging[0].customerType,
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

        return ResponseHandler.success(res, result, '获取客户账龄分析详情成功');
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取应收账款账龄分析失败:', error);
      return ResponseHandler.error(res, '获取应收账款账龄分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取发票的支付记录
   */
  getInvoicePayments: async (req, res) => {
    try {
      const invoiceId = parseInt(req.params.id);

      if (!invoiceId) {
        return ResponseHandler.error(res, '无效的发票ID', 'VALIDATION_ERROR', 400);
      }

      // 从数据库获取支付记录
      const payments = await arModel.getInvoicePayments(invoiceId);

      // 返回简化的数据结构
      return ResponseHandler.success(res, payments || [], '获取发票支付记录成功');
    } catch (error) {
      logger.error('获取发票支付记录失败:', error);
      return ResponseHandler.error(res, '获取发票支付记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 生成收款编号
   */
  generateReceiptNumber: async (req, res) => {
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;

      // 确保配置已加载
      const dbInstance = require('../../../config/db');
      await financeConfig.loadFromDatabase(dbInstance);
      const prefix = financeConfig.get('invoice.receiptNumberPrefix', 'RC');

      // 使用 MAX 提取当日最大序号，避免删除记录后编号冲突
      const [result] = await dbInstance.pool.execute(
        `SELECT MAX(CAST(SUBSTRING_INDEX(receipt_number, '-', -1) AS UNSIGNED)) as maxSerial
         FROM ar_receipts WHERE receipt_number LIKE ?`,
        [`${prefix}-${dateStr}-%`]
      );

      const nextSerial = (result[0].maxSerial || 0) + 1;
      const serialNumber = String(nextSerial).padStart(4, '0');

      // 生成收款编号: PREFIX-YYYYMMDD-序号
      const receiptNumber = `${prefix}-${dateStr}-${serialNumber}`;

      return ResponseHandler.success(res, { receiptNumber }, '生成收款编号成功');
    } catch (error) {
      logger.error('生成收款编号失败:', error);
      return ResponseHandler.error(res, '生成收款编号失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取未付清的发票列表（用于创建收款时选择）
   */
  getUnpaidInvoices: async (req, res) => {
    try {
      const customerId = req.query.customerId;

      let query = `
        SELECT id, invoice_number, customer_id, invoice_date, due_date,
               total_amount, paid_amount, balance_amount, status
        FROM ar_invoices
        WHERE balance_amount > 0 AND status != '已取消'
      `;

      const params = [];
      if (customerId) {
        query += ' AND customer_id = ?';
        params.push(customerId);
      }

      query += ' ORDER BY due_date ASC';

      const [invoices] = await require('../../../config/db').pool.execute(query, params);

      return ResponseHandler.success(res, invoices, '获取未付清发票成功');
    } catch (error) {
      logger.error('获取未付清发票失败:', error);
      return ResponseHandler.error(res, '获取未付清发票失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = arController;
