/**
 * Business closure registry.
 *
 * This is the executable proof map for the ERP core loops. Each flow defines
 * the ordered business objects that must hand data to the next object, the
 * status domain used by that object, and the minimum data evidence expected
 * when the loop is considered closed.
 */

const businessClosures = {
  procureToPay: {
    name: 'Procure to Pay',
    purpose: 'Purchase demand becomes payable liability and cash payment.',
    start: 'purchaseRequisition',
    end: 'glEntry',
    steps: [
      { object: 'purchaseRequisition', statusDomain: 'purchaseRequisition', requiredFields: ['id', 'status'] },
      { object: 'purchaseOrder', statusDomain: 'purchaseOrder', requiredFields: ['id', 'order_no', 'status'] },
      { object: 'purchaseReceipt', statusDomain: 'purchaseReceipt', requiredFields: ['id', 'receipt_no', 'status'] },
      { object: 'inventoryInbound', statusDomain: 'inventoryInbound', requiredFields: ['id', 'status'] },
      { object: 'financeInvoice', statusDomain: 'financeInvoice', requiredFields: ['id', 'status', 'total_amount', 'balance_amount'] },
      { object: 'glEntry', statusDomain: 'glEntry', requiredFields: ['id', 'status'] },
    ],
    invariants: [
      'Approved requisitions that generated purchase orders cannot be edited as drafts.',
      'Completed receipts must have inbound ledger evidence.',
      'Confirmed invoices must create balanced GL evidence.',
      'Paid invoices must have payment and balance evidence.',
    ],
  },
  orderToCash: {
    name: 'Order to Cash',
    purpose: 'Customer demand becomes shipment, receivable, cash receipt, and GL evidence.',
    start: 'salesQuotation',
    end: 'glEntry',
    steps: [
      { object: 'salesQuotation', requiredFields: ['id', 'status'] },
      { object: 'salesOrder', statusDomain: 'salesOrder', requiredFields: ['id', 'order_no', 'status'] },
      { object: 'inventoryOutbound', statusDomain: 'inventoryOutbound', requiredFields: ['id', 'status'] },
      { object: 'financeInvoice', statusDomain: 'financeInvoice', requiredFields: ['id', 'status', 'total_amount', 'balance_amount'] },
      { object: 'glEntry', statusDomain: 'glEntry', requiredFields: ['id', 'status'] },
    ],
    invariants: [
      'Completed sales outbound documents must have inventory ledger evidence.',
      'Shipped sales orders must not exceed ordered quantities after returns.',
      'Confirmed receivables must create balanced GL evidence.',
      'Receipts must reduce AR balance and create bank/cash evidence.',
    ],
  },
  planToProduce: {
    name: 'Plan to Produce',
    purpose: 'Planned demand becomes issued materials, reported work, quality result, and finished goods.',
    start: 'productionPlan',
    end: 'inventoryInbound',
    steps: [
      { object: 'productionPlan', statusDomain: 'productionPlan', requiredFields: ['id', 'status', 'quantity'] },
      { object: 'productionTask', statusDomain: 'productionTask', requiredFields: ['id', 'status', 'quantity'] },
      { object: 'inventoryOutbound', statusDomain: 'inventoryOutbound', requiredFields: ['id', 'status'] },
      { object: 'productionProcess', statusDomain: 'productionProcess', requiredFields: ['id', 'status'] },
      { object: 'productionReport', requiredFields: ['id', 'completed_quantity'] },
      { object: 'qualityInspection', requiredFields: ['id', 'status'] },
      { object: 'inventoryInbound', statusDomain: 'inventoryInbound', requiredFields: ['id', 'status'] },
    ],
    invariants: [
      'Material issue completion must be backed by outbound ledger evidence.',
      'Reported quantities must not exceed planned quantities without explicit excess issue flow.',
      'Finished goods inbound must be linked to production or quality evidence.',
    ],
  },
  inventoryControl: {
    name: 'Inventory Control',
    purpose: 'All quantity movements are ledger-backed and reversible only by controlled documents.',
    start: 'inventoryInbound',
    end: 'inventoryLedger',
    steps: [
      { object: 'inventoryInbound', statusDomain: 'inventoryInbound', requiredFields: ['id', 'status'] },
      { object: 'inventoryOutbound', statusDomain: 'inventoryOutbound', requiredFields: ['id', 'status'] },
      { object: 'inventoryTransfer', statusDomain: 'inventoryTransfer', requiredFields: ['id', 'status'] },
      { object: 'inventoryCheck', statusDomain: 'inventoryCheck', requiredFields: ['id', 'status'] },
      { object: 'inventoryLedger', requiredFields: ['id', 'material_id', 'quantity', 'transaction_type'] },
    ],
    invariants: [
      'Completed movement documents must have ledger entries.',
      'Terminal movement documents cannot be edited or deleted.',
      'Stock balance must equal ledger aggregation by material/location/batch.',
    ],
  },
  qualityClosedLoop: {
    name: 'Quality Closed Loop',
    purpose: 'Quality defects are contained, dispositioned, corrected, and closed with traceability.',
    start: 'qualityInspection',
    end: 'eightDReport',
    steps: [
      { object: 'qualityInspection', requiredFields: ['id', 'status'] },
      { object: 'nonconformingProduct', requiredFields: ['id', 'status'] },
      { object: 'reworkTask', requiredFields: ['id', 'status'] },
      { object: 'replacementOrder', requiredFields: ['id', 'status'] },
      { object: 'scrapRecord', requiredFields: ['id', 'status'] },
      { object: 'eightDReport', statusDomain: 'eightDReport', requiredFields: ['id', 'status', 'current_phase'] },
    ],
    invariants: [
      'NCP terminal quantity must be fully dispositioned.',
      '8D reports linked to NCP cannot close before linked NCP closure.',
      'Rework, scrap, and replacement records must preserve source inspection traceability.',
    ],
  },
  recordToReport: {
    name: 'Record to Report',
    purpose: 'Sub-ledger and manual events become posted GL, period close, and reports.',
    start: 'glEntry',
    end: 'financialReport',
    steps: [
      { object: 'glEntry', statusDomain: 'glEntry', requiredFields: ['id', 'status'] },
      { object: 'glEntryItem', requiredFields: ['entry_id', 'account_id', 'debit_amount', 'credit_amount'] },
      { object: 'financePeriod', statusDomain: 'financePeriod', requiredFields: ['id', 'status'] },
      { object: 'financialReport', requiredFields: ['period_id'] },
    ],
    invariants: [
      'Posted GL entries must be balanced.',
      'Closed periods reject new business documents dated inside the closed range.',
      'Reversed entries must preserve the original entry and create a reversing entry.',
    ],
  },
};

module.exports = {
  BUSINESS_CLOSURES: businessClosures,
};
