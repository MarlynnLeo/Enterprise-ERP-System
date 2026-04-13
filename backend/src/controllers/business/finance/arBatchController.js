/**
 * AR批量收款控制器扩展
 * 添加批量收款接口
 */

const arModel = require('../../../models/ar');
const logger = require('../../../utils/logger');

/**
 * 批量收款
 * POST /finance/ar/receipts/batch
 */
const batchReceipts = async (req, res) => {
  try {
    const { receipts, receiptDate, paymentMethod, bankAccountId, notes } = req.body;

    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供收款明细',
      });
    }

    // 生成批次收款单号
    const batchNumber = `BATCH-RC-${Date.now()}`;
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

        // 生成单个收款单号
        const receiptNumber = `${batchNumber}-${i + 1}`;

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

    res.json({
      success: true,
      message: `批量收款完成: 成功${results.length}笔，失败${errors.length}笔`,
      data: {
        batchNumber,
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors,
      },
    });
  } catch (error) {
    logger.error('批量收款失败:', error);
    res.status(500).json({
      success: false,
      message: '批量收款失败',
      error: error.message,
    });
  }
};

module.exports = {
  batchReceipts,
};
