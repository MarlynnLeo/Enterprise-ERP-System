/**
 * 逾期检查和冲销控制器
 */

const logger = require('../../../utils/logger');
const { triggerOverdueCheck } = require('../../../services/scheduler');
const arModel = require('../../../models/ar');
const apModel = require('../../../models/ap');
const { getCurrentUserName } = require('../../../utils/userHelper');

/**
 * 手动触发逾期检查
 * GET /finance/overdue/check
 */
const checkOverdueInvoices = async (req, res) => {
  try {
    const result = await triggerOverdueCheck();

    res.json({
      success: true,
      message: `逾期检查完成 - AR: ${result.ar.count}张, AP: ${result.ap.count}张`,
      data: result,
    });
  } catch (error) {
    logger.error('手动触发逾期检查失败:', error);
    res.status(500).json({
      success: false,
      message: '逾期检查失败',
      error: error.message,
    });
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

    res.json({
      success: true,
      data: invoices,
      total: invoices.length,
    });
  } catch (error) {
    logger.error('获取逾期应收发票失败:', error);
    res.status(500).json({
      success: false,
      message: '获取逾期应收发票失败',
      error: error.message,
    });
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

    res.json({
      success: true,
      data: invoices,
      total: invoices.length,
    });
  } catch (error) {
    logger.error('获取逾期应付发票失败:', error);
    res.status(500).json({
      success: false,
      message: '获取逾期应付发票失败',
      error: error.message,
    });
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

    const voidedBy = await getCurrentUserName(req);
    await arModel.voidReceipt(id, { voided_by: voidedBy, void_reason: reason });

    res.json({
      success: true,
      message: '收款记录已冲销',
    });
  } catch (error) {
    logger.error('冲销收款记录失败:', error);
    res.status(500).json({
      success: false,
      message: '冲销收款记录失败',
      error: error.message,
    });
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

    const voidedBy = await getCurrentUserName(req);
    await apModel.voidPayment(id, { voided_by: voidedBy, void_reason: reason });

    res.json({
      success: true,
      message: '付款记录已冲销',
    });
  } catch (error) {
    logger.error('冲销付款记录失败:', error);
    res.status(500).json({
      success: false,
      message: '冲销付款记录失败',
      error: error.message,
    });
  }
};

module.exports = {
  checkOverdueInvoices,
  getOverdueARInvoices,
  getOverdueAPInvoices,
  reverseReceipt,
  reversePayment,
};
