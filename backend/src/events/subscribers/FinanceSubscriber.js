/**
 * FinanceSubscriber.js
 * @description 监听领域发出的各类业务事件，安全、优雅、独立地执行后续集成记账。
 *              每个处理器包含幂等性校验，确保同一源单据不会重复生成财务数据。
 * @date 2025-03-07
 */

const EventBus = require('../EventBus');
const FinanceIntegrationService = require('../../services/external/FinanceIntegrationService');
const InventoryPostingService = require('../../services/InventoryPostingService');
const { logger } = require('../../utils/logger');
const DLQService = require('../../services/business/DLQService');
const {
  TAX_RELATED_DOCUMENT_TYPES,
  taxRelatedDocumentTypeMatchList,
} = require('../../constants/financeConstants');

class FinanceSubscriber {
  constructor() {
    this.registerDLQHandlers();
    this.registerListeners();
    logger.info('🎧 [FinanceSubscriber] 已挂载财务集成事件监听器');
  }

  registerDLQHandlers() {
    const handlers = {
      'Finance:GenerateAPInvoiceFromPurchaseReceipt': async (payload) => {
        const receipt = await this.fetchPurchaseReceipt(payload.receiptId);
        const exists = await this.existsBySource('ap_invoices', 'purchase_receipt', receipt.id);
        if (!exists) {
          await FinanceIntegrationService.generateAPInvoiceFromPurchaseReceipt(
            receipt,
            payload.currentUserId || payload.userId || null
          );
        }
      },
      'Finance:GenerateInputTaxInvoiceFromPurchaseReceipt': async (payload) => {
        const receipt = await this.fetchPurchaseReceipt(payload.receiptId);
        const exists = await this.taxInvoiceExistsByRelatedDocument(
          TAX_RELATED_DOCUMENT_TYPES.PURCHASE_RECEIPT,
          receipt.id
        );
        if (!exists) {
          await FinanceIntegrationService.generateInputTaxInvoiceFromPurchaseReceipt(
            receipt,
            payload.currentUserId || payload.userId || null
          );
        }
      },
      'Finance:GenerateARInvoiceFromSalesOrder': async (payload) => {
        const salesOrder = payload.salesOrder || (await this.fetchSalesOrder(payload.salesOrderId));
        const exists = await this.existsBySource('ar_invoices', 'sales_order', salesOrder.id);
        if (!exists) {
          await FinanceIntegrationService.generateARInvoiceFromSalesOrder(
            salesOrder,
            payload.currentUserId || payload.userId || null
          );
        }
      },
      'Finance:GenerateCostEntryFromSalesOutbound': async (payload) => {
        const outbound =
          payload.outboundData || (await this.fetchSalesOutbound(payload.outboundId));
        const exists = await this.glEntryExistsByDocument(outbound.outbound_no, 'sales_outbound');
        if (!exists) {
          await FinanceIntegrationService.generateCostEntryFromSalesOutbound(outbound);
        }
      },
      'Finance:GenerateOutputTaxInvoiceFromSalesOutbound': async (payload) => {
        const outbound =
          payload.outboundData || (await this.fetchSalesOutbound(payload.outboundId));
        const exists = await this.taxInvoiceExistsByRelatedDocument(
          TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND,
          outbound.id
        );
        if (!exists) {
          await FinanceIntegrationService.generateOutputTaxInvoiceFromSalesOutbound(
            outbound,
            payload.currentUserId || payload.userId || null
          );
        }
      },
      'Finance:GenerateARCreditNoteFromSalesReturn': async (payload) => {
        await this.handleSalesReturnCompleted(payload);
      },
      'Finance:GenerateAPCreditNoteFromPurchaseReturn': async (payload) => {
        await this.handlePurchaseReturnCompleted(payload);
      },
      'Finance:SalesReturnCompleted': async (payload) => {
        await this.handleSalesReturnCompleted(payload);
      },
      'Finance:PurchaseReturnCompleted': async (payload) => {
        await this.handlePurchaseReturnCompleted(payload);
      },
      'FinanceIntegration:SalesReturnCreditNote': async (payload) => {
        await this.handleSalesReturnCompleted(payload);
      },
      'FinanceIntegration:PurchaseReturnCreditNote': async (payload) => {
        await this.handlePurchaseReturnCompleted(payload);
      },
      'Finance:CalculateActualCostFromProductionTask': async (payload) => {
        if (!payload.isFullComplete) return;
        const db = require('../../config/db');
        const [taskRows] = await db.pool.execute(
          'SELECT status FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
          [payload.taskId]
        );
        if (!['completed', 'warehousing'].includes(taskRows[0]?.status)) {
          return; // 未入库完成，跳过，不重试
        }
        const CostAccountingService = require('../../services/business/CostAccountingService');
        await CostAccountingService.calculateActualCost(payload.taskId);
      },
      'Finance:InventoryPostingApproved': async (payload) => {
        await this.handleInventoryPostingApproved(payload);
      },
      'FinanceIntegration:InventoryAdjustmentEntry': async (payload) => {
        const db = require('../../config/db');
        const [rows] = await db.pool.execute(
          `SELECT id, material_id, location_id, transaction_type, transaction_date,
                            quantity, unit_cost, reference_no, reference_type
                       FROM inventory_ledger
                      WHERE reference_no = ?
                        AND material_id = ?
                        AND location_id = ?
                      ORDER BY id DESC
                      LIMIT 1`,
          [payload.adjustmentNo, payload.materialId, payload.locationId]
        );
        if (rows.length === 0) {
          throw new Error(`Inventory adjustment ledger not found: ${payload.adjustmentNo}`);
        }

        const ledger = rows[0];
        const InventoryCostService = require('../../services/business/InventoryCostService');
        const transaction = {
          ...ledger,
          transaction_type: payload.adjustedTransactionType || ledger.transaction_type,
          reference_type: 'inventory_adjustment',
        };
        if (Number(ledger.quantity) > 0) {
          await InventoryCostService.generateInboundCostEntry(transaction);
        } else {
          await InventoryCostService.generateOutboundCostEntry(transaction);
        }
      },
      'Finance:PurchaseReceiptCompleted': async (payload) => {
        await this.handlePurchaseReceiptCompleted(payload);
      },
      'Finance:SalesOutboundCompleted': async (payload) => {
        await this.replaySalesOutboundCompleted(payload);
      },
      'EventBus:PURCHASE_RECEIPT_COMPLETED': async (payload) => {
        await this.handlePurchaseReceiptCompleted(payload.args?.[0] || payload);
      },
      'EventBus:SALES_OUTBOUND_COMPLETED': async (payload) => {
        await this.replaySalesOutboundCompleted(payload.args?.[0] || payload);
      },
      'EventBus:PRODUCTION_TASK_COMPLETED': async (payload) => {
        await this.handleProductionTaskCompleted(payload.args?.[0] || payload);
      },
      'EventBus:SALES_RETURN_COMPLETED': async (payload) => {
        await this.handleSalesReturnCompleted(payload.args?.[0] || payload);
      },
      'EventBus:PURCHASE_RETURN_COMPLETED': async (payload) => {
        await this.handlePurchaseReturnCompleted(payload.args?.[0] || payload);
      },
    };

    Object.entries(handlers).forEach(([taskName, handler]) => {
      DLQService.registerHandler(taskName, handler);
    });
  }

  async fetchPurchaseReceipt(receiptId) {
    const db = require('../../config/db');
    const [rows] = await db.pool.execute(
      `SELECT pr.*, s.name as supplier_name
             FROM purchase_receipts pr
             LEFT JOIN suppliers s ON pr.supplier_id = s.id
             WHERE pr.id = ? AND pr.deleted_at IS NULL`,
      [receiptId]
    );
    if (rows.length === 0) {
      throw new Error(`Purchase receipt not found: ${receiptId}`);
    }
    return rows[0];
  }

  async fetchSalesOrder(salesOrderId) {
    const db = require('../../config/db');
    const [rows] = await db.pool.execute(
      `SELECT so.*, c.name as customer_name
             FROM sales_orders so
             LEFT JOIN customers c ON so.customer_id = c.id
             WHERE so.id = ? AND so.deleted_at IS NULL`,
      [salesOrderId]
    );
    if (rows.length === 0) {
      throw new Error(`Sales order not found: ${salesOrderId}`);
    }
    return rows[0];
  }

  async fetchSalesReturn(returnId) {
    const db = require('../../config/db');
    const [rows] = await db.pool.execute(
      `SELECT sr.*, c.name as customer_name
             FROM sales_returns sr
             LEFT JOIN sales_orders so ON sr.order_id = so.id
             LEFT JOIN customers c ON so.customer_id = c.id
             WHERE sr.id = ? AND sr.deleted_at IS NULL`,
      [returnId]
    );
    if (rows.length === 0) {
      throw new Error(`Sales return not found: ${returnId}`);
    }
    return rows[0];
  }

  async fetchPurchaseReturn(returnId) {
    const db = require('../../config/db');
    const [rows] = await db.pool.execute(
      `SELECT pr.*, s.name as supplier_name
             FROM purchase_returns pr
             LEFT JOIN suppliers s ON pr.supplier_id = s.id
             WHERE pr.id = ? AND pr.deleted_at IS NULL`,
      [returnId]
    );
    if (rows.length === 0) {
      throw new Error(`Purchase return not found: ${returnId}`);
    }
    return rows[0];
  }

  parseRelatedOrderIds(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(Number).filter(Boolean);

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(Number).filter(Boolean);
      } catch {
        return value
          .split(',')
          .map((item) => Number(String(item).replace(/[^0-9]/g, '')))
          .filter(Boolean);
      }
    }

    return [];
  }

  async fetchSalesOrdersForOutbound(outboundId, fallbackOrderId = null) {
    const db = require('../../config/db');
    const ids = new Set();
    if (fallbackOrderId) ids.add(Number(fallbackOrderId));

    const [sources] = await db.pool.execute(
      `SELECT sob.order_id, sob.related_orders, sobi.source_order_id
             FROM sales_outbound sob
             LEFT JOIN sales_outbound_items sobi ON sobi.outbound_id = sob.id
             WHERE sob.id = ?`,
      [outboundId]
    );

    sources.forEach((row) => {
      if (row.order_id) ids.add(Number(row.order_id));
      if (row.source_order_id) ids.add(Number(row.source_order_id));
      this.parseRelatedOrderIds(row.related_orders).forEach((id) => ids.add(id));
    });

    const orderIds = [...ids].filter(Boolean);
    if (orderIds.length === 0) return [];

    const placeholders = orderIds.map(() => '?').join(',');
    const [orders] = await db.pool.execute(
      `SELECT so.*, c.name as customer_name
             FROM sales_orders so
             LEFT JOIN customers c ON so.customer_id = c.id
             WHERE so.id IN (${placeholders})`,
      orderIds
    );
    return orders;
  }

  async fetchSalesOutbound(outboundId) {
    const db = require('../../config/db');
    const [rows] = await db.pool.execute(
      `SELECT sob.*,
                    sob.delivery_date as outbound_date,
                    ord.customer_id,
                    c.name as customer_name,
                    ord.order_no
             FROM sales_outbound sob
             LEFT JOIN sales_orders ord ON sob.order_id = ord.id
             LEFT JOIN customers c ON ord.customer_id = c.id
             WHERE sob.id = ?`,
      [outboundId]
    );
    if (rows.length === 0) {
      throw new Error(`Sales outbound not found: ${outboundId}`);
    }
    return rows[0];
  }

  async replaySalesOutboundCompleted(payload) {
    const outboundId = payload.outboundData?.id || payload.outboundId;
    const outboundData = payload.outboundData?.id
      ? payload.outboundData
      : await this.fetchSalesOutbound(outboundId);
    const salesOrderId = payload.salesOrder?.id || payload.salesOrderId || outboundData.order_id;
    const salesOrders = payload.salesOrder
      ? [payload.salesOrder]
      : await this.fetchSalesOrdersForOutbound(outboundId, salesOrderId);

    await this.handleSalesOutboundCompleted({
      salesOrder: salesOrders[0] || null,
      salesOrders,
      outboundData,
      currentUserId: payload.currentUserId || payload.userId || null,
    });
  }

  registerListeners() {
    // 监听出库单完成事件
    EventBus.on('SALES_OUTBOUND_COMPLETED', this.handleSalesOutboundCompleted.bind(this));
    // 监听采购入库单完成事件
    EventBus.on('PURCHASE_RECEIPT_COMPLETED', this.handlePurchaseReceiptCompleted.bind(this));
    // 监听生产任务完工事件（将原任务控制器的核算逻辑解耦至此）
    EventBus.on('PRODUCTION_TASK_COMPLETED', this.handleProductionTaskCompleted.bind(this));
    EventBus.on('SALES_RETURN_COMPLETED', this.handleSalesReturnCompleted.bind(this));
    EventBus.on('PURCHASE_RETURN_COMPLETED', this.handlePurchaseReturnCompleted.bind(this));
    EventBus.on('INVENTORY_POSTING_APPROVED', this.handleInventoryPostingApproved.bind(this));
  }

  async isInventoryPostingApproved(referenceNo) {
    if (!referenceNo) return false;
    const db = require('../../config/db');
    return Boolean(
      await InventoryPostingService.findApprovedForTransaction(db.pool, {
        reference_no: referenceNo,
      })
    );
  }

  async deferUntilInventoryPosted(referenceNo, flowName) {
    if (await this.isInventoryPostingApproved(referenceNo)) return false;
    logger.info(
      `[FinanceSubscriber] ${flowName} waits for finance-approved inventory posting: ${referenceNo}`
    );
    return true;
  }

  async replayInventoryPostingCosts(posting) {
    if (!posting || !Array.isArray(posting.lines)) return;
    const InventoryCostService = require('../../services/business/InventoryCostService');
    const dedicatedTransactionTypes = new Set([
      'sales_outbound',
      'production_outbound',
      'production_inbound',
      'outsourced_outbound',
      'outsourced_inbound',
    ]);

    for (const line of posting.lines) {
      if (dedicatedTransactionTypes.has(line.transaction_type)) continue;

      const transaction = {
        material_id: line.material_id,
        location_id: line.location_id,
        transaction_type: line.transaction_type,
        reference_no: line.reference_no,
        reference_type: line.reference_type,
        quantity: line.signed_quantity,
        unit_cost: line.unit_cost,
        transaction_date: line.transaction_date,
        posting_document_id: posting.id,
        posting_line_id: line.id,
      };

      if (Number(line.signed_quantity) > 0) {
        await InventoryCostService.generateInboundCostEntry(transaction);
      } else {
        await InventoryCostService.generateOutboundCostEntry(transaction);
      }
    }
  }

  async handleInventoryPostingApproved(payload) {
    const sourceNo = String(payload?.sourceNo || '').trim();
    if (!sourceNo) return;
    const db = require('../../config/db');
    const posting = payload?.postingDocumentId
      ? await InventoryPostingService.get(payload.postingDocumentId)
      : null;

    const [salesOutbound] = await db.pool.execute(
      'SELECT id FROM sales_outbound WHERE outbound_no = ? AND deleted_at IS NULL LIMIT 1',
      [sourceNo]
    );
    if (salesOutbound[0]) {
      await this.replaySalesOutboundCompleted({ outboundId: salesOutbound[0].id });
      return;
    }

    const [purchaseReceipts] = await db.pool.execute(
      'SELECT id FROM purchase_receipts WHERE receipt_no = ? AND deleted_at IS NULL LIMIT 1',
      [sourceNo]
    );
    if (purchaseReceipts[0] && !salesOutbound[0]) {
      await this.handlePurchaseReceiptCompleted({ receiptId: purchaseReceipts[0].id });
      if (posting) await this.replayInventoryPostingCosts(posting);
      return;
    }

    const [salesReturns] = await db.pool.execute(
      'SELECT id FROM sales_returns WHERE return_no = ? AND deleted_at IS NULL LIMIT 1',
      [sourceNo]
    );
    if (salesReturns[0] && !salesOutbound[0] && !purchaseReceipts[0]) {
      await this.handleSalesReturnCompleted({ returnId: salesReturns[0].id });
      if (posting) await this.replayInventoryPostingCosts(posting);
      return;
    }

    const [purchaseReturns] = await db.pool.execute(
      'SELECT id FROM purchase_returns WHERE return_no = ? AND deleted_at IS NULL LIMIT 1',
      [sourceNo]
    );
    if (purchaseReturns[0] && !salesOutbound[0] && !purchaseReceipts[0] && !salesReturns[0]) {
      await this.handlePurchaseReturnCompleted({ returnId: purchaseReturns[0].id });
      if (posting) await this.replayInventoryPostingCosts(posting);
      return;
    }

    const [productionInbounds] = await db.pool.execute(
      `SELECT ib.reference_id AS task_id, pt.code AS task_code
               FROM inventory_inbound ib
               LEFT JOIN production_tasks pt ON pt.id = ib.reference_id AND pt.deleted_at IS NULL
              WHERE ib.inbound_no = ?
                AND ib.inbound_type = 'production'
                AND COALESCE(ib.is_deleted, 0) = 0
              LIMIT 1`,
      [sourceNo]
    );
    if (
      productionInbounds[0]?.task_id &&
      !salesOutbound[0] &&
      !purchaseReceipts[0] &&
      !salesReturns[0] &&
      !purchaseReturns[0]
    ) {
      await this.handleProductionTaskCompleted({
        taskId: productionInbounds[0].task_id,
        taskCode: productionInbounds[0].task_code,
        isFullComplete: true,
        inboundNo: sourceNo,
      });
      return;
    }

    const [outsourcedProcessing] = await db.pool.execute(
      'SELECT id, processing_no, created_by FROM outsourced_processings WHERE processing_no = ? LIMIT 1',
      [sourceNo]
    );
    if (outsourcedProcessing[0]) {
      const [materials] = await db.pool.execute(
        'SELECT id, material_id, material_name, quantity, unit_price FROM outsourced_processing_materials WHERE processing_id = ?',
        [outsourcedProcessing[0].id]
      );
      await FinanceIntegrationService.generateOutsourcedIssueEntry(
        outsourcedProcessing[0],
        materials
      );
      return;
    }

    const [outsourcedReceipts] = await db.pool.execute(
      'SELECT id, receipt_no, processing_id, created_by, operator FROM outsourced_processing_receipts WHERE receipt_no = ? LIMIT 1',
      [sourceNo]
    );
    if (outsourcedReceipts[0]) {
      const [items] = await db.pool.execute(
        'SELECT * FROM outsourced_processing_receipt_items WHERE receipt_id = ?',
        [outsourcedReceipts[0].id]
      );
      await FinanceIntegrationService.generateOutsourcedReceiptEntry(outsourcedReceipts[0], items);
      return;
    }

    // Sales/general outbound and outsourced issue reversals are compensated by
    // their business reversal services; do not create a second generic cost GL.
    if (
      posting?.posting_kind === 'reversal' &&
      ['outbound', 'sales_outbound', 'outsourced_processing_material'].includes(
        String(posting.source_type || '')
      )
    ) {
      return;
    }

    if (posting) await this.replayInventoryPostingCosts(posting);
  }

  assertAllowedIdentifier(value, allowedValues, label) {
    if (!allowedValues.includes(value)) {
      throw new Error(`不允许的${label}: ${value}`);
    }
    return value;
  }

  async existsBySource(table, sourceType, sourceId) {
    const db = require('../../config/db');
    const { INACTIVE_INVOICE_STATUSES } = require('../../constants/financeConstants');
    const safeTable = this.assertAllowedIdentifier(
      table,
      ['ar_invoices', 'ap_invoices'],
      '财务幂等表'
    );

    // 仅有效发票视为已生成；已取消/作废允许重生
    const inactivePh = INACTIVE_INVOICE_STATUSES.map(() => '?').join(', ');
    const [rows] = await db.pool.execute(
      `SELECT id FROM ${safeTable}
             WHERE source_type = ? AND source_id = ?
               AND status NOT IN (${inactivePh})
             LIMIT 1`,
      [sourceType, sourceId, ...INACTIVE_INVOICE_STATUSES]
    );
    return rows.length > 0;
  }

  async glEntryExistsByDocument(documentNumber, documentType) {
    const db = require('../../config/db');
    const [rows] = await db.pool.execute(
      `SELECT id
             FROM gl_entries
             WHERE document_type = ?
               AND document_number = ?
               AND COALESCE(is_reversed, 0) = 0
             LIMIT 1`,
      [documentType, documentNumber]
    );
    return rows.length > 0;
  }

  async taxInvoiceExistsByRelatedDocument(documentType, documentId) {
    const db = require('../../config/db');
    const types = taxRelatedDocumentTypeMatchList(documentType);
    if (types.length === 0 || !documentId) return false;
    const placeholders = types.map(() => '?').join(', ');
    // 与唯一索引一致：任意关联记录均视为已生成（兼容历史中文 type）
    const [rows] = await db.pool.execute(
      `SELECT id
             FROM tax_invoices
             WHERE related_document_type IN (${placeholders})
               AND related_document_id = ?
             LIMIT 1`,
      [...types, documentId]
    );
    return rows.length > 0;
  }

  async recordFailure(taskName, payload, error, logMessage) {
    logger.warn(`${logMessage}: ${error.message}`);
    await DLQService.recordSideEffectFailure(taskName, payload, error);
  }

  /**
   * 处理采购入库完成通知
   * 对接财务凭证：自动生成应付发票、进项发票
   * 包含幂等性校验，防止重复事件触发导致重复生成
   */
  async handlePurchaseReceiptCompleted(payload) {
    const { receiptId, currentUserId } = payload;
    const db = require('../../config/db');

    logger.info(
      `[FinanceSubscriber] 收到入库完工广播，开始串行生成财务发票 - 入库单ID: ${receiptId}`
    );

    try {
      const [receiptData] = await db.pool.execute(
        `SELECT pr.*, s.name as supplier_name
                 FROM purchase_receipts pr
                 LEFT JOIN suppliers s ON pr.supplier_id = s.id
                 WHERE pr.id = ?`,
        [receiptId]
      );

      if (receiptData.length > 0) {
        const receipt = receiptData[0];
        const receiptNo = receipt.receipt_no;
        if (await this.deferUntilInventoryPosted(receiptNo, 'purchase receipt finance flow'))
          return;

        // 1. 生成应付发票（幂等检查）
        try {
          const apExists = await this.existsBySource('ap_invoices', 'purchase_receipt', receiptId);
          if (apExists) {
            logger.info(
              `[FinanceSubscriber] AP invoice already exists; skipped: receiptNo=${receiptNo}`
            );
          } else {
            await FinanceIntegrationService.generateAPInvoiceFromPurchaseReceipt(
              receipt,
              currentUserId
            );
            logger.info(`[FinanceSubscriber] AP invoice generated: receiptNo=${receiptNo}`);
          }
        } catch (invoiceError) {
          await this.recordFailure(
            'Finance:GenerateAPInvoiceFromPurchaseReceipt',
            { receiptId, receiptNo, currentUserId },
            invoiceError,
            '⚠️ [FinanceSubscriber] 应付发票自动生成失败'
          );
        }

        // 2. 生成进项发票（幂等检查）
        try {
          const taxExists = await this.taxInvoiceExistsByRelatedDocument(
            TAX_RELATED_DOCUMENT_TYPES.PURCHASE_RECEIPT,
            receiptId
          );
          if (taxExists) {
            logger.info(
              `[FinanceSubscriber] Input tax invoice already exists; skipped: receiptNo=${receiptNo}`
            );
          } else {
            await FinanceIntegrationService.generateInputTaxInvoiceFromPurchaseReceipt(
              receipt,
              currentUserId
            );
            logger.info(`[FinanceSubscriber] Input tax invoice generated: receiptNo=${receiptNo}`);
          }
        } catch (taxError) {
          await this.recordFailure(
            'Finance:GenerateInputTaxInvoiceFromPurchaseReceipt',
            { receiptId, receiptNo, currentUserId },
            taxError,
            '⚠️ [FinanceSubscriber] 进项发票自动生成失败'
          );
        }
      }
    } catch (criticalError) {
      logger.error(
        `[FinanceSubscriber] Purchase receipt finance processing failed: receiptId=${receiptId}`,
        criticalError
      );
      await DLQService.recordSideEffectFailure(
        'Finance:PurchaseReceiptCompleted',
        { receiptId, currentUserId },
        criticalError
      );
    }
  }

  /**
   * 处理销售出库完成通知
   * 当销售控制器真正 Commit 后，向总线播报，触发本方法。
   * 此方法内采用严格串行队列，从微观上保障没有跨表死锁风险。
   * 包含幂等性校验，防止重复事件触发导致重复生成
   */
  async handleSalesOutboundCompleted(payload) {
    const { salesOrder, outboundData, currentUserId } = payload;
    let salesOrders =
      Array.isArray(payload.salesOrders) && payload.salesOrders.length > 0
        ? payload.salesOrders
        : salesOrder
          ? [salesOrder]
          : [];
    const outboundNo = outboundData?.outbound_no;
    const outboundId = outboundData?.id;

    // 多订单/缺载荷时补齐关联销售订单（专业闭环：合并出库也必须能开 AR）
    if ((!salesOrders || salesOrders.length === 0) && outboundId) {
      try {
        salesOrders = await this.fetchSalesOrdersForOutbound(
          outboundId,
          outboundData?.order_id || null
        );
      } catch (fetchErr) {
        logger.warn(`[FinanceSubscriber] 补齐出库关联订单失败: ${fetchErr.message}`);
      }
    }

    logger.info(
      `[FinanceSubscriber] 收到出库完工广播，开始串行生成财务数据 - 出库单: ${outboundNo}`
    );

    if (await this.deferUntilInventoryPosted(outboundNo, 'sales outbound finance flow')) return;

    try {
      // 1. 按出库交货量生成应收（source=sales_outbound）；禁止首出整单开票
      try {
        const arOutboundExists = await this.existsBySource(
          'ar_invoices',
          'sales_outbound',
          outboundId
        );
        if (arOutboundExists) {
          logger.info(
            `[FinanceSubscriber] AR invoice for outbound already exists; skipped: outboundNo=${outboundNo}`
          );
        } else {
          await FinanceIntegrationService.generateARInvoiceFromSalesOutbound(
            outboundData,
            salesOrders,
            currentUserId
          );
          logger.info(
            `[FinanceSubscriber] AR invoice generated from outbound: outboundNo=${outboundNo}`
          );
        }
      } catch (invoiceError) {
        await this.recordFailure(
          'Finance:GenerateARInvoiceFromSalesOutbound',
          {
            outboundId,
            outboundNo,
            salesOrderIds: salesOrders.map((o) => o.id),
            currentUserId,
          },
          invoiceError,
          '⚠️ [FinanceSubscriber] 出库应收发票自动生成失败'
        );
      }

      // 2. 结转销售成本（幂等检查：检查 gl_entries 是否已有此出库单的成本分录）
      try {
        const costExists = await this.glEntryExistsByDocument(outboundNo, 'sales_outbound');
        if (costExists) {
          logger.info(
            `[FinanceSubscriber] Sales cost GL entry already exists; skipped: outboundNo=${outboundNo}`
          );
        } else {
          await FinanceIntegrationService.generateCostEntryFromSalesOutbound(
            outboundData,
            currentUserId
          );
          logger.info(
            `[FinanceSubscriber] Sales cost GL entry generated: outboundNo=${outboundNo}`
          );
        }
      } catch (costError) {
        await this.recordFailure(
          'Finance:GenerateCostEntryFromSalesOutbound',
          { outboundId: outboundData.id, outboundNo, currentUserId },
          costError,
          '⚠️ [FinanceSubscriber] 销售成本分录自动生成失败'
        );
      }

      // 3. 生成销项发票（幂等检查）
      try {
        const taxExists = await this.taxInvoiceExistsByRelatedDocument(
          TAX_RELATED_DOCUMENT_TYPES.SALES_OUTBOUND,
          outboundData.id
        );
        if (taxExists) {
          logger.info(
            `[FinanceSubscriber] Output tax invoice already exists; skipped: outboundNo=${outboundNo}`
          );
        } else {
          await FinanceIntegrationService.generateOutputTaxInvoiceFromSalesOutbound(
            outboundData,
            currentUserId
          );
          logger.info(`[FinanceSubscriber] Output tax invoice generated: outboundNo=${outboundNo}`);
        }
      } catch (taxError) {
        await this.recordFailure(
          'Finance:GenerateOutputTaxInvoiceFromSalesOutbound',
          { outboundId: outboundData.id, outboundNo, currentUserId },
          taxError,
          '⚠️ [FinanceSubscriber] 销项发票自动生成失败'
        );
      }

      logger.info(
        `[FinanceSubscriber] Sales outbound finance flow completed: outboundNo=${outboundNo}`
      );
    } catch (criticalError) {
      // 顶层防御，确保订阅者的崩溃绝对不抛给上层发布者
      logger.error(
        `[FinanceSubscriber] Sales outbound finance processing failed: outboundNo=${outboundNo}`,
        criticalError
      );
      await DLQService.recordSideEffectFailure(
        'Finance:SalesOutboundCompleted',
        { outboundNo, outboundData, salesOrderId: salesOrder?.id, currentUserId },
        criticalError
      );
    }
  }

  async handleSalesReturnCompleted(payload) {
    const returnId = payload.returnId || payload.id;
    const currentUserId = payload.currentUserId || payload.userId || null;
    try {
      const salesReturn = payload.salesReturn || (await this.fetchSalesReturn(returnId));
      if (await this.deferUntilInventoryPosted(salesReturn.return_no, 'sales return finance flow'))
        return;
      const exists = await this.existsBySource('ar_invoices', 'sales_return', salesReturn.id);
      if (exists) {
        logger.info(
          `[FinanceSubscriber] 销售退货单 ${salesReturn.return_no} 已生成过红字应收发票，跳过`
        );
        return;
      }
      await FinanceIntegrationService.generateARCreditNoteFromSalesReturn({
        ...salesReturn,
        created_by: salesReturn.created_by || currentUserId,
      });
      logger.info(
        `[FinanceSubscriber] 销售退货红字发票自动生成成功 - 退货单: ${salesReturn.return_no}`
      );
    } catch (error) {
      await this.recordFailure(
        'Finance:GenerateARCreditNoteFromSalesReturn',
        { returnId, currentUserId },
        error,
        '[FinanceSubscriber] 销售退货红字发票自动生成失败'
      );
    }
  }

  async handlePurchaseReturnCompleted(payload) {
    const returnId = payload.returnId || payload.id;
    const currentUserId = payload.currentUserId || payload.userId || null;
    try {
      const purchaseReturn = payload.purchaseReturn || (await this.fetchPurchaseReturn(returnId));
      if (
        await this.deferUntilInventoryPosted(
          purchaseReturn.return_no,
          'purchase return finance flow'
        )
      )
        return;
      const exists = await this.existsBySource('ap_invoices', 'purchase_return', purchaseReturn.id);
      if (exists) {
        logger.info(
          `[FinanceSubscriber] 采购退货单 ${purchaseReturn.return_no} 已生成过红字应付发票，跳过`
        );
        return;
      }
      await FinanceIntegrationService.generateAPCreditNoteFromPurchaseReturn({
        ...purchaseReturn,
        created_by: purchaseReturn.created_by || currentUserId,
      });
      logger.info(
        `[FinanceSubscriber] 采购退货红字发票自动生成成功 - 退货单: ${purchaseReturn.return_no}`
      );
    } catch (error) {
      await this.recordFailure(
        'Finance:GenerateAPCreditNoteFromPurchaseReturn',
        { returnId, currentUserId },
        error,
        '[FinanceSubscriber] 采购退货红字发票自动生成失败'
      );
    }
  }

  /**
   * 处理生产任务完工通知
   * 对接财务凭证：根据物料清单流转情况同步执行成本核算
   */
  async handleProductionTaskCompleted(payload) {
    const { taskId, taskCode, isFullComplete } = payload;
    if (
      payload.inboundNo &&
      (await this.deferUntilInventoryPosted(payload.inboundNo, 'production inbound finance flow'))
    )
      return;

    logger.info(
      `[FinanceSubscriber] 收到生产完工广播，由于 SSOT 解耦架构限制，开始后台成本核算 - 任务ID: ${taskId}, 任务号: ${taskCode}`
    );

    try {
      if (!isFullComplete) {
        logger.info(
          `[FinanceSubscriber] Production task partially completed; cost voucher deferred: taskCode=${taskCode}`
        );
        return;
      }

      // 成本核算仅在任务已入库完成(completed)或入库中(warehousing)时执行；
      // completeTask 只到 inspection，此时不应入 DLQ。
      const db = require('../../config/db');
      const [taskRows] = await db.pool.execute(
        'SELECT id, code, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL',
        [taskId]
      );
      const status = taskRows[0]?.status;
      if (!['completed', 'warehousing'].includes(status)) {
        logger.info(
          `[FinanceSubscriber] Skip cost calc until warehouse complete: taskCode=${taskCode}, status=${status}`
        );
        return;
      }

      const CostAccountingService = require('../../services/business/CostAccountingService');
      await CostAccountingService.calculateActualCost(taskId);
      logger.info(
        `[FinanceSubscriber] Production actual cost and GL entry generated: taskCode=${taskCode}`
      );
    } catch (costError) {
      // 在独立的订阅者上下文中进行捕获，不再污染请求核心链路
      await this.recordFailure(
        'Finance:CalculateActualCostFromProductionTask',
        { taskId, taskCode, isFullComplete },
        costError,
        '⚠️ [FinanceSubscriber] 成本核算因主数据缺失挂起'
      );
    }
  }
}

module.exports = new FinanceSubscriber();
