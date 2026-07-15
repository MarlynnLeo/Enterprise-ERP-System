/**
 * AP 批量付款
 * 默认原子事务：任一失败整批回滚
 */

const apModel = require('../../../models/ap');
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
 * 批量付款
 * POST /finance/ap/payments/batch
 * body.atomic !== false 时整批同一事务
 */
const batchPayments = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { payments, paymentDate, paymentMethod, bankAccountId, notes } = req.body;
    const createdBy = getAuthenticatedUserId(req);
    const atomic = req.body?.atomic !== false;

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return ResponseHandler.error(res, '请提供付款明细', 'VALIDATION_ERROR', 400);
    }

    const batchNumber = await CodeGeneratorService.nextCode('ap_payment_batch');
    const results = [];

    if (atomic) {
      await connection.beginTransaction();
    }

    try {
      for (const item of payments) {
        const invoice = await apModel.getInvoiceById(item.invoiceId);
        if (!invoice) {
          throw new Error(`发票ID ${item.invoiceId} 不存在`);
        }
        if (!SETTLEMENT_ELIGIBLE_STATUSES.includes(invoice.status)) {
          throw new Error(
            `发票 ${invoice.invoiceNumber || invoice.invoice_number || item.invoiceId} 当前状态为"${invoice.status}"，不能直接付款`
          );
        }

        const line = parseSettlementLine({
          amount: item.amount,
          discount_amount: item.discountAmount || item.discount_amount || 0,
        });
        assertWithinBalance(
          line.settlementCents,
          toCents(invoice.balance || invoice.balance_amount || 0),
          `发票 ${invoice.invoiceNumber || invoice.invoice_number || item.invoiceId} 付款核销金额`
        );

        const paymentNumber = await CodeGeneratorService.nextCode(
          'ap_payment',
          atomic ? connection : null
        );

        const paymentData = {
          payment_number: paymentNumber,
          supplier_id: item.supplierId || invoice.supplierId || invoice.supplier_id,
          supplier_name: item.supplierName || invoice.supplierName || invoice.supplier_name,
          payment_date: paymentDate,
          total_amount: item.amount,
          payment_method: paymentMethod,
          bank_account_id: bankAccountId,
          notes: notes || `批量付款 - ${batchNumber}`,
          created_by: createdBy,
        };

        const paymentItems = [
          {
            invoice_id: item.invoiceId,
            amount: item.amount,
            discount_amount: item.discountAmount || item.discount_amount || 0,
          },
        ];

        const paymentId = await apModel.createPayment(
          paymentData,
          paymentItems,
          atomic ? connection : null
        );

        results.push({
          invoiceId: item.invoiceId,
          paymentId,
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
        `批量付款完成: 成功 ${results.length} 笔`
      );
    } catch (error) {
      if (atomic) {
        await connection.rollback();
      }
      logger.error('批量付款失败:', error);
      return ResponseHandler.error(
        res,
        error.message || '批量付款失败',
        'VALIDATION_ERROR',
        400,
        error
      );
    }
  } catch (error) {
    logger.error('批量付款失败:', error);
    return ResponseHandler.error(res, '批量付款失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

module.exports = {
  batchPayments,
};
