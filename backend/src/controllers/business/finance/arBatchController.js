/**
 * AR批量收款控制器扩展
 * 添加批量收款接口
 */

const arModel = require('../../../models/ar');
const { ResponseHandler } = require('../../../utils/responseHandler');
const logger = require('../../../utils/logger');
const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');

/**
 * 批量收款
 * POST /finance/ar/receipts/batch
 */
const batchReceipts = async (req, res) => {
  try {
    const { receipts, receiptDate, paymentMethod, bankAccountId, notes } = req.body;

    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return ResponseHandler.error(res, '请提供收款明细', 'VALIDATION_ERROR', 400);
    }

    const batchNumber = await CodeGeneratorService.nextCode('ar_receipt_batch');
    const results = [];
    const errors = [];

    // 循环处理每个收款
    for (let i = 0; i < receipts.length; i++) {
      const item = receipts[i];
      try {
        // [B-3] 批量收款也必须执行核心业务校验（与单笔收款对齐）
        const invoice = await arModel.getInvoiceById(item.invoiceId);
        if (!invoice) {
          throw new Error(`发票ID ${item.invoiceId} 不存在`);
        }
        if (invoice.status === '已付款') {
          throw new Error(`发票 ${invoice.invoice_number || item.invoiceId} 已全额收款`);
        }
        const balanceCents = Math.round(parseFloat(invoice.balance_amount || invoice.balance || 0) * 100);
        const amountCents = Math.round(parseFloat(item.amount || 0) * 100);
        if (amountCents > balanceCents) {
          throw new Error(`收款金额 ${item.amount} 超过发票余额 ${invoice.balance_amount || invoice.balance || 0}`);
        }

        const receiptNumber = await CodeGeneratorService.nextCode('ar_receipt');

        const receiptData = {
          receipt_number: receiptNumber,
          customer_id: item.customerId || invoice.customer_id,
          customer_name: item.customerName || invoice.customer_name,
          receipt_date: receiptDate,
          total_amount: item.amount,
          payment_method: paymentMethod,
          bank_account_id: bankAccountId,
          notes: notes || `批量收款 - ${batchNumber}`,
        };

        const receiptItems = [
          {
            invoice_id: item.invoiceId,
            amount: item.amount,
            discount_amount: 0,
          },
        ];

        // 调用现有的创建收款记录方法
        const receiptId = await arModel.createReceipt(receiptData, receiptItems);

        results.push({
          invoiceId: item.invoiceId,
          receiptId: receiptId,
          success: true,
        });
      } catch (error) {
        logger.error(`批量收款-处理发票${item.invoiceId}失败:`, error);
        errors.push({
          invoiceId: item.invoiceId,
          error: error.message,
        });
      }
    }

    ResponseHandler.success(res, {
      batchNumber,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors,
    }, `批量收款完成: 成功${results.length}笔，失败${errors.length}笔`);
  } catch (error) {
    logger.error('批量收款失败:', error);
    ResponseHandler.error(res, '批量收款失败', 'SERVER_ERROR', 500, error);
  }
};

module.exports = {
  batchReceipts,
};
