/**
 * AR 批量收款
 * 默认原子事务：任一失败整批回滚
 */

const arModel = require('../../../models/ar');
const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const {
  SETTLEMENT_ELIGIBLE_STATUSES,
  parseSettlementLine,
  assertWithinBalance,
  toCents,
} = require('../../../utils/finance/settlementMath');

/**
 * 批量收款
 * POST /finance/ar/receipts/batch
 * body.atomic !== false 时整批同一事务
 */
const batchReceipts = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { receipts, receiptDate, paymentMethod, bankAccountId, notes } = req.body;
    const createdBy = getAuthenticatedUserId(req);
    const atomic = req.body?.atomic !== false;

    if (!receipts || !Array.isArray(receipts) || receipts.length === 0) {
      return ResponseHandler.error(res, '请提供收款明细', 'VALIDATION_ERROR', 400);
    }

    const batchNumber = await CodeGeneratorService.nextCode('ar_receipt_batch');
    const results = [];

    if (atomic) {
      await connection.beginTransaction();
    }

    try {
      for (const item of receipts) {
        const invoice = await arModel.getInvoiceById(item.invoiceId);
        if (!invoice) {
          throw new Error(`发票ID ${item.invoiceId} 不存在`);
        }
        if (!SETTLEMENT_ELIGIBLE_STATUSES.includes(invoice.status)) {
          throw new Error(
            `发票 ${invoice.invoice_number || item.invoiceId} 当前状态为"${invoice.status}"，不能直接收款`
          );
        }

        const line = parseSettlementLine({
          amount: item.amount,
          discount_amount: item.discountAmount || 0,
        });
        assertWithinBalance(
          line.settlementCents,
          toCents(invoice.balanceAmount || invoice.balance || 0),
          `发票 ${invoice.invoice_number || item.invoiceId} 收款核销金额`
        );

        const receiptNumber = await CodeGeneratorService.nextCode(
          'ar_receipt',
          atomic ? connection : null
        );

        const receiptData = {
          receipt_number: receiptNumber,
          customer_id: item.customerId || invoice.customer_id,
          customer_name: item.customerName || invoice.customer_name,
          receipt_date: receiptDate,
          total_amount: item.amount,
          payment_method: paymentMethod,
          bank_account_id: bankAccountId,
          notes: notes || `批量收款 - ${batchNumber}`,
          created_by: createdBy,
        };

        const receiptItems = [
          {
            invoice_id: item.invoiceId,
            amount: item.amount,
            discount_amount: item.discountAmount || 0,
          },
        ];

        const receiptId = await arModel.createReceipt(
          receiptData,
          receiptItems,
          atomic ? connection : null
        );

        results.push({
          invoiceId: item.invoiceId,
          receiptId,
          success: true,
        });
      }

      if (atomic) {
        await connection.commit();
      }

      return ResponseHandler.success(
        res,
        {
          batchNumber,
          atomic,
          successCount: results.length,
          errorCount: 0,
          results,
          errors: [],
        },
        `批量收款完成: 成功 ${results.length} 笔`
      );
    } catch (error) {
      if (atomic) {
        await connection.rollback();
      }
      logger.error('批量收款失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '批量收款失败',
        'VALIDATION_ERROR',
        400,
        error
      );
    }
  } catch (error) {
    logger.error('批量收款失败:', error);
    return ResponseHandler.error(res, '批量收款失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

module.exports = {
  batchReceipts,
};
