/**
 * 逾期检查和冲销控制器
 */

const logger = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { triggerOverdueCheck } = require('../../../services/scheduler');
const arModel = require('../../../models/ar');
const apModel = require('../../../models/ap');
const { getAuthenticatedUserId } = require('../../../utils/authContext');

function isBusinessError(error) {
  return /不存在|已经|状态|无法|不能|期间|科目|余额|原因|positive integer|作废|冲销/.test(
    error.message || ''
  );
}

function normalizeReverseReason(reason) {
  const normalized = String(reason || '').trim();
  if (!normalized) {
    throw new Error('请填写冲销原因');
  }
  return normalized;
}

/**
 * 手动触发逾期检查
 * GET /finance/overdue/check
 */
const checkOverdueInvoices = async (req, res) => {
  try {
    const result = await triggerOverdueCheck();

    ResponseHandler.success(res, result, `逾期检查完成 - AR: ${result.ar.count}张, AP: ${result.ap.count}张`);
  } catch (error) {
    logger.error('手动触发逾期检查失败:', error);
    ResponseHandler.error(res, '逾期检查失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取逾期的应收发票列表
 * GET /finance/ar/invoices/overdue
 */
const getOverdueARInvoices = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const invoices = await arModel.getOverdueInvoices(today);

    ResponseHandler.success(res, { data: invoices, total: invoices.length }, '获取逾期应收发票成功');
  } catch (error) {
    logger.error('获取逾期应收发票失败:', error);
    ResponseHandler.error(res, '获取逾期应收发票失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取逾期的应付发票列表
 * GET /finance/ap/invoices/overdue
 */
const getOverdueAPInvoices = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const invoices = await apModel.getOverdueInvoices(today);

    ResponseHandler.success(res, { data: invoices, total: invoices.length }, '获取逾期应付发票成功');
  } catch (error) {
    logger.error('获取逾期应付发票失败:', error);
    ResponseHandler.error(res, '获取逾期应付发票失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 冲销AR收款记录
 * POST /finance/ar/receipts/:id/reverse
 */
const reverseReceipt = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const voidedBy = getAuthenticatedUserId(req);
    await arModel.voidReceipt(id, {
      voided_by: voidedBy,
      void_reason: normalizeReverseReason(reason),
    });

    ResponseHandler.success(res, null, '收款记录已冲销');
  } catch (error) {
    logger.error('冲销收款记录失败:', error);
    const businessError = isBusinessError(error);
    ResponseHandler.error(
      res,
      businessError ? error.message : '冲销收款记录失败',
      businessError ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
      businessError ? 400 : 500,
      error
    );
  }
};

/**
 * 冲销AP付款记录
 * POST /finance/ap/payments/:id/reverse
 */
const reversePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const voidedBy = getAuthenticatedUserId(req);
    await apModel.voidPayment(id, {
      voided_by: voidedBy,
      void_reason: normalizeReverseReason(reason),
    });

    ResponseHandler.success(res, null, '付款记录已冲销');
  } catch (error) {
    logger.error('冲销付款记录失败:', error);
    const businessError = isBusinessError(error);
    ResponseHandler.error(
      res,
      businessError ? error.message : '冲销付款记录失败',
      businessError ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
      businessError ? 400 : 500,
      error
    );
  }
};

module.exports = {
  checkOverdueInvoices,
  getOverdueARInvoices,
  getOverdueAPInvoices,
  reverseReceipt,
  reversePayment,
};
