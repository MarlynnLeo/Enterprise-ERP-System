/**
 * 税务管理控制器
 *
 * 处理税务发票、税务申报相关的HTTP请求
 *
 * @module controllers/business/finance/taxController
 */

const taxModel = require('../../../models/tax');
const TaxAccountingService = require('../../../services/business/TaxAccountingService');
const logger = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { getCurrentUserName } = require('../../../utils/userHelper');

const taxController = {
  /**
   * 创建税务发票
   * POST /finance/tax/invoices
   */
  createTaxInvoice: async (req, res) => {
    try {
      const invoiceData = {
        ...req.body,
        created_by: await getCurrentUserName(req),
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
        if (!invoiceData[field]) {
          return ResponseHandler.error(res, `缺少必填字段: ${field}`, 'VALIDATION_ERROR', 400);
        }
      }

      // 创建税务发票
      const invoiceId = await taxModel.createTaxInvoice(invoiceData);

      // 如果状态是"已认证"，自动生成会计分录
      if (invoiceData.status === '已认证') {
        const invoice = await taxModel.getTaxInvoiceById(invoiceId);
        const userName = await getCurrentUserName(req);

        if (invoice.invoice_type === '销项') {
          await TaxAccountingService.generateOutputTaxEntry(invoice, userName);
        } else if (invoice.invoice_type === '进项') {
          await TaxAccountingService.generateInputTaxEntry(invoice, userName);
        }
      }

      return ResponseHandler.success(res, { id: invoiceId }, '税务发票创建成功', 201);
    } catch (error) {
      logger.error('创建税务发票失败:', error);
      return ResponseHandler.error(res, '创建税务发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取税务发票列表
   * GET /finance/tax/invoices
   */
  getTaxInvoices: async (req, res) => {
    try {
      const filters = {
        invoice_type: req.query.invoice_type,
        status: req.query.status,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        supplier_id: req.query.supplier_id,
        customer_id: req.query.customer_id,
        limit: req.query.limit || 50,
        offset: req.query.offset || 0,
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
      const { id } = req.params;
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
    try {
      const { id } = req.params;
      const { certification_date } = req.body;

      // 获取发票信息
      const invoice = await taxModel.getTaxInvoiceById(id);

      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      if (invoice.status !== '未认证') {
        return ResponseHandler.error(res, '发票状态不正确，无法认证', 'VALIDATION_ERROR', 400);
      }

      // 更新发票状态为"已认证"
      await taxModel.updateTaxInvoiceStatus(id, '已认证', { certification_date });

      // 自动生成会计分录
      const updatedInvoice = await taxModel.getTaxInvoiceById(id);
      const userName = await getCurrentUserName(req);

      let entryInfo;
      if (updatedInvoice.invoice_type === '销项') {
        entryInfo = await TaxAccountingService.generateOutputTaxEntry(
          updatedInvoice,
          userName
        );
      } else if (updatedInvoice.invoice_type === '进项') {
        entryInfo = await TaxAccountingService.generateInputTaxEntry(
          updatedInvoice,
          userName
        );
      }

      return ResponseHandler.success(res, { entryInfo }, '税务发票认证成功，会计分录已自动生成');
    } catch (error) {
      logger.error('认证税务发票失败:', error);
      return ResponseHandler.error(res, '认证税务发票失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 抵扣税务发票
   * POST /finance/tax/invoices/:id/deduct
   */
  deductTaxInvoice: async (req, res) => {
    try {
      const { id } = req.params;
      const { deduction_date } = req.body;

      // 获取发票信息
      const invoice = await taxModel.getTaxInvoiceById(id);

      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      if (invoice.status !== '已认证') {
        return ResponseHandler.error(res, '发票状态不正确，无法抵扣', 'VALIDATION_ERROR', 400);
      }

      if (invoice.invoice_type !== '进项') {
        return ResponseHandler.error(res, '只有进项发票可以抵扣', 'VALIDATION_ERROR', 400);
      }

      // 更新发票状态为"已抵扣"
      await taxModel.updateTaxInvoiceStatus(id, '已抵扣', { deduction_date });

      return ResponseHandler.success(res, null, '税务发票抵扣成功');
    } catch (error) {
      logger.error('抵扣税务发票失败:', error);
      return ResponseHandler.error(res, '抵扣税务发票失败', 'SERVER_ERROR', 500, error);
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
        created_by: await getCurrentUserName(req),
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

      // 创建税务申报
      const returnId = await taxModel.createTaxReturn(returnData);

      return ResponseHandler.success(res, { id: returnId }, '税务申报创建成功', 201);
    } catch (error) {
      logger.error('创建税务申报失败:', error);
      return ResponseHandler.error(res, '创建税务申报失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取税务申报列表
   * GET /finance/tax/returns
   */
  getTaxReturns: async (req, res) => {
    try {
      const filters = {
        return_type: req.query.return_type,
        status: req.query.status,
        year: req.query.year,
        limit: req.query.limit || 50,
        offset: req.query.offset || 0,
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
      const { id } = req.params;
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
      const { id } = req.params;
      const { declaration_date } = req.body;

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
    try {
      const { id } = req.params;
      const { payment_date } = req.body;

      // 获取申报信息
      const taxReturn = await taxModel.getTaxReturnById(id);

      if (!taxReturn) {
        return ResponseHandler.error(res, '税务申报不存在', 'NOT_FOUND', 404);
      }

      if (taxReturn.status !== '已申报') {
        return ResponseHandler.error(res, '申报状态不正确，无法缴纳', 'VALIDATION_ERROR', 400);
      }

      // 生成缴纳税款的会计分录
      if (taxReturn.return_type === '增值税' && taxReturn.tax_payable > 0) {
        const userName = await getCurrentUserName(req);
        await TaxAccountingService.generateVATReturnEntry(taxReturn, userName);
      }

      // 更新申报状态为"已缴纳"
      await taxModel.updateTaxReturnStatus(id, '已缴纳', { payment_date });

      return ResponseHandler.success(res, null, '税款缴纳成功，会计分录已自动生成');
    } catch (error) {
      logger.error('缴纳税款失败:', error);
      return ResponseHandler.error(res, '缴纳税款失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除税务申报（仅草稿状态）
   * DELETE /finance/tax/returns/:id
   */
  deleteTaxReturn: async (req, res) => {
    try {
      const { id } = req.params;

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
      const { config_key, config_name, account_id, description } = req.body;

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
      const { id } = req.params;
      const { config_name, account_id, description } = req.body;

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
      const { id } = req.params;

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
      const { id } = req.params;
      const { document_type, document_id } = req.body;

      if (!document_type || !document_id) {
        return ResponseHandler.error(res, '缺少必填字段: document_type, document_id', 'VALIDATION_ERROR', 400);
      }

      const invoice = await taxModel.getTaxInvoiceById(id);
      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      await taxModel.linkToDocument(id, document_type, document_id);

      return ResponseHandler.success(res, null, '税务发票关联成功');
    } catch (error) {
      logger.error('关联税务发票失败:', error);
      return ResponseHandler.error(res, error.message || '关联失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 取消税务发票关联
   * POST /finance/tax/invoices/:id/unlink
   */
  unlinkTaxInvoice: async (req, res) => {
    try {
      const { id } = req.params;

      const invoice = await taxModel.getTaxInvoiceById(id);
      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      await taxModel.unlinkDocument(id);

      return ResponseHandler.success(res, null, '关联已取消');
    } catch (error) {
      logger.error('取消关联失败:', error);
      return ResponseHandler.error(res, '取消关联失败', 'SERVER_ERROR', 500, error);
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
      const { id } = req.params;
      const { invoice_number } = req.body;

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
    try {
      const { id } = req.params;

      const invoice = await taxModel.getTaxInvoiceById(id);
      if (!invoice) {
        return ResponseHandler.error(res, '税务发票不存在', 'NOT_FOUND', 404);
      }

      if (invoice.status === '已作废') {
        return ResponseHandler.error(res, '发票已经作废', 'VALIDATION_ERROR', 400);
      }

      if (invoice.status === '已抵扣') {
        return ResponseHandler.error(res, '已抵扣的发票不能作废', 'VALIDATION_ERROR', 400);
      }

      await taxModel.updateTaxInvoiceStatus(id, '已作废');

      return ResponseHandler.success(res, null, '税务发票已作废');
    } catch (error) {
      logger.error('作废税务发票失败:', error);
      return ResponseHandler.error(res, '作废税务发票失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = taxController;
