/**
 * 税务管理路由
 *
 * @module routes/business/finance/taxRoutes
 */

const express = require('express');
const router = express.Router();
const taxController = require('../../../controllers/business/finance/taxController');
const { authenticateToken } = require('../../../middleware/auth');
const { requirePermission } = require('../../../middleware/requirePermission');

// 应用认证中间件
router.use(authenticateToken);

// ==================== 税务发票路由 ====================

/**
 * @route   POST /finance/tax/invoices
 * @desc    创建税务发票
 * @access  Private
 */
router.post('/invoices', requirePermission('finance:tax:create'), taxController.createTaxInvoice);

/**
 * @route   GET /finance/tax/invoices
 * @desc    获取税务发票列表
 * @access  Private
 */
router.get('/invoices', requirePermission('finance:tax:view'), taxController.getTaxInvoices);

/**
 * @route   GET /finance/tax/invoices/:id
 * @desc    获取税务发票详情
 * @access  Private
 */
router.get('/invoices/:id', requirePermission('finance:tax:view'), taxController.getTaxInvoiceById);

/**
 * @route   POST /finance/tax/invoices/:id/certify
 * @desc    认证税务发票
 * @access  Private
 */
router.post('/invoices/:id/certify', requirePermission('finance:tax:update'), taxController.certifyTaxInvoice);

/**
 * @route   POST /finance/tax/invoices/:id/deduct
 * @desc    抵扣税务发票
 * @access  Private
 */
router.post('/invoices/:id/deduct', requirePermission('finance:tax:update'), taxController.deductTaxInvoice);

/**
 * @route   PUT /finance/tax/invoices/:id/invoice-number
 * @desc    手动更新税务发票号码
 * @access  Private
 */
router.put('/invoices/:id/invoice-number', requirePermission('finance:tax:update'), taxController.updateTaxInvoiceNumber);

/**
 * @route   POST /finance/tax/invoices/:id/void
 * @desc    作废税务发票
 * @access  Private
 */
router.post('/invoices/:id/void', requirePermission('finance:tax:update'), taxController.voidTaxInvoice);

// ==================== 税务申报路由 ====================

/**
 * @route   POST /finance/tax/returns
 * @desc    创建税务申报
 * @access  Private
 */
router.post('/returns', requirePermission('finance:tax:create'), taxController.createTaxReturn);

/**
 * @route   GET /finance/tax/returns
 * @desc    获取税务申报列表
 * @access  Private
 */
router.get('/returns', requirePermission('finance:tax:view'), taxController.getTaxReturns);

/**
 * @route   GET /finance/tax/returns/:id
 * @desc    获取税务申报详情
 * @access  Private
 */
router.get('/returns/:id', requirePermission('finance:tax:view'), taxController.getTaxReturnById);

/**
 * @route   POST /finance/tax/returns/:id/submit
 * @desc    提交税务申报
 * @access  Private
 */
router.post('/returns/:id/submit', requirePermission('finance:tax:update'), taxController.submitTaxReturn);

/**
 * @route   POST /finance/tax/returns/:id/pay
 * @desc    缴纳税款
 * @access  Private
 */
router.post('/returns/:id/pay', requirePermission('finance:tax:pay'), taxController.payTaxReturn);

/**
 * @route   DELETE /finance/tax/returns/:id
 * @desc    删除税务申报（仅草稿状态）
 * @access  Private
 */
router.delete('/returns/:id', requirePermission('finance:tax:delete'), taxController.deleteTaxReturn);

// ==================== 税务发票关联路由 ====================

/**
 * @route   POST /finance/tax/invoices/:id/link
 * @desc    关联税务发票到业务单据
 * @access  Private
 */
router.post('/invoices/:id/link', requirePermission('finance:tax:update'), taxController.linkTaxInvoice);

/**
 * @route   POST /finance/tax/invoices/:id/unlink
 * @desc    取消税务发票关联
 * @access  Private
 */
router.post('/invoices/:id/unlink', requirePermission('finance:tax:update'), taxController.unlinkTaxInvoice);

/**
 * @route   GET /finance/tax/available-documents
 * @desc    获取可关联的业务单据
 * @access  Private
 */
router.get('/available-documents', requirePermission('finance:tax:view'), taxController.getAvailableDocuments);

// ==================== 税务科目配置路由 ====================

/**
 * @route   GET /finance/tax/account-config
 * @desc    获取税务科目配置列表
 * @access  Private
 */
router.get('/account-config', requirePermission('finance:tax:view'), taxController.getTaxAccountConfigs);

/**
 * @route   POST /finance/tax/account-config
 * @desc    创建税务科目配置
 * @access  Private
 */
router.post('/account-config', requirePermission('finance:tax:create'), taxController.createTaxAccountConfig);

/**
 * @route   PUT /finance/tax/account-config/:id
 * @desc    更新税务科目配置
 * @access  Private
 */
router.put('/account-config/:id', requirePermission('finance:tax:update'), taxController.updateTaxAccountConfig);

/**
 * @route   DELETE /finance/tax/account-config/:id
 * @desc    删除税务科目配置
 * @access  Private
 */
router.delete('/account-config/:id', requirePermission('finance:tax:delete'), taxController.deleteTaxAccountConfig);

module.exports = router;
