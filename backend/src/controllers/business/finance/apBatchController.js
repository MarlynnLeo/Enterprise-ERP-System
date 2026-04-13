/**
 * AP批量付款控制器扩展
 * 添加批量付款接口
 */

const apModel = require('../../../models/ap');
const logger = require('../../../utils/logger');

/**
 * 批量付款
 * POST /finance/ap/payments/batch
 */
const batchPayments = async (req, res) => {
  try {
    const { payments, paymentDate, paymentMethod, bankAccountId, notes } = req.body;

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供付款明细',
      });
    }

    // 生成批次付款单号
    const batchNumber = `BATCH-PAY-${Date.now()}`;
    const results = [];
    const errors = [];

    // 循环处理每个付款
    for (let i = 0; i < payments.length; i++) {
      const item = payments[i];
      try {
        // [B-2] 批量付款也必须执行核心业务校验（与单笔付款对齐）
        const invoice = await apModel.getInvoiceById(item.invoiceId);
        if (!invoice) {
          throw new Error(`发票ID ${item.invoiceId} 不存在`);
        }
        if (invoice.status === '已付款') {
          throw new Error(`发票 ${invoice.invoiceNumber || item.invoiceId} 已全额付款`);
        }
        const balanceCents = Math.round(parseFloat(invoice.balance || invoice.balance_amount || 0) * 100);
        const amountCents = Math.round(parseFloat(item.amount || 0) * 100);
        if (amountCents > balanceCents) {
          throw new Error(`付款金额 ${item.amount} 超过发票余额 ${invoice.balance || invoice.balance_amount || 0}`);
        }

        // 生成单个付款单号
        const paymentNumber = `${batchNumber}-${i + 1}`;

        const paymentData = {
          payment_number: paymentNumber,
          supplier_id: item.supplierId || invoice.supplierId || invoice.supplier_id,
          supplier_name: item.supplierName || invoice.supplierName || invoice.supplier_name,
          payment_date: paymentDate,
          total_amount: item.amount,
          payment_method: paymentMethod,
          bank_account_id: bankAccountId,
          notes: notes || `批量付款 - ${batchNumber}`,
        };

        const paymentItems = [
          {
            invoice_id: item.invoiceId,
            amount: item.amount,
            discount_amount: 0,
          },
        ];

        // 调用现有的创建付款记录方法
        const paymentId = await apModel.createPayment(paymentData, paymentItems);

        results.push({
          invoiceId: item.invoiceId,
          paymentId: paymentId,
          success: true,
        });
      } catch (error) {
        logger.error(`批量付款-处理发票${item.invoiceId}失败:`, error);
        errors.push({
          invoiceId: item.invoiceId,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `批量付款完成: 成功${results.length}笔，失败${errors.length}笔`,
      data: {
        batchNumber,
        successCount: results.length,
        errorCount: errors.length,
        results,
        errors,
      },
    });
  } catch (error) {
    logger.error('批量付款失败:', error);
    res.status(500).json({
      success: false,
      message: '批量付款失败',
      error: error.message,
    });
  }
};

module.exports = {
  batchPayments,
};
