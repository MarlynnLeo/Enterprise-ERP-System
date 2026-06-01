/**
 * Unified business status registry.
 *
 * Keep all user-facing controllers and services aligned to these canonical
 * status machines. Local labels may vary, but persisted business states should
 * resolve to one of the values defined here.
 */

const { PURCHASE_STATUS, PURCHASE_STATUS_TRANSITIONS } = require('./purchaseConstants');
const {
  TRANSFER_STATUS_FLOW,
  PRODUCTION_PLAN_STATUS_FLOW,
  PRODUCTION_TASK_STATUS_FLOW,
  PRODUCTION_PROCESS_STATUS_FLOW,
} = require('./systemConstants');

const valuesFromFlow = (flow) => Array.from(new Set([
  ...Object.keys(flow),
  ...Object.values(flow).flat(),
]));

const terminalFromFlow = (flow) => Object.entries(flow)
  .filter(([, next]) => Array.isArray(next) && next.length === 0)
  .map(([status]) => status);

const INVENTORY_INBOUND_TRANSITIONS = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const INVENTORY_OUTBOUND_TRANSITIONS = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'partial_completed', 'cancelled'],
  partial_completed: ['completed'],
  completed: [],
  reversed: [],
  cancelled: [],
};

const INVENTORY_CHECK_TRANSITIONS = {
  draft: ['in_progress', 'cancelled'],
  in_progress: ['pending', 'completed', 'cancelled'],
  pending: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const SALES_ORDER_TRANSITIONS = {
  draft: ['pending', 'confirmed', 'in_production', 'in_procurement', 'ready_to_ship', 'shortage', 'cancelled'],
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'in_procurement', 'ready_to_ship', 'shortage', 'cancelled'],
  in_production: ['ready_to_ship', 'partial_shipped', 'shipped', 'cancelled'],
  in_procurement: ['ready_to_ship', 'shortage', 'cancelled'],
  ready_to_ship: ['partial_shipped', 'shipped', 'cancelled'],
  shortage: ['in_production', 'in_procurement', 'ready_to_ship', 'cancelled'],
  partial_shipped: ['shipped', 'completed'],
  shipped: ['delivered', 'completed'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

const SALES_EXCHANGE_TRANSITIONS = {
  pending: ['processing', 'rejected'],
  processing: ['completed', 'rejected'],
  completed: [],
  rejected: [],
};

const PURCHASE_REQUISITION_TRANSITIONS = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['completed', 'cancelled'],
  rejected: ['draft'],
  completed: [],
  cancelled: [],
};

const PURCHASE_RECEIPT_TRANSITIONS = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['inspecting', 'completed', 'cancelled'],
  inspecting: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const EIGHT_D_REPORT_TRANSITIONS = {
  draft: ['in_progress', 'review'],
  in_progress: ['review', 'completed'],
  review: ['in_progress', 'completed'],
  completed: ['closed'],
  closed: [],
};

const FINANCE_INVOICE_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  PARTIAL_PAID: 'partial_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
};

const GL_ENTRY_STATUS = {
  DRAFT: 'draft',
  POSTED: 'posted',
  REVERSED: 'reversed',
};

const FINANCE_PERIOD_STATUS = {
  OPEN: 'open',
  CLOSED: 'closed',
  LOCKED: 'locked',
};

const GL_ENTRY_TRANSITIONS = {
  [GL_ENTRY_STATUS.DRAFT]: [GL_ENTRY_STATUS.POSTED],
  [GL_ENTRY_STATUS.POSTED]: [GL_ENTRY_STATUS.REVERSED],
  [GL_ENTRY_STATUS.REVERSED]: [],
};

const PERIOD_TRANSITIONS = {
  [FINANCE_PERIOD_STATUS.OPEN]: [FINANCE_PERIOD_STATUS.CLOSED, FINANCE_PERIOD_STATUS.LOCKED],
  [FINANCE_PERIOD_STATUS.CLOSED]: [FINANCE_PERIOD_STATUS.OPEN, FINANCE_PERIOD_STATUS.LOCKED],
  [FINANCE_PERIOD_STATUS.LOCKED]: [],
};

const FINANCE_INVOICE_TRANSITIONS = {
  [FINANCE_INVOICE_STATUS.DRAFT]: [
    FINANCE_INVOICE_STATUS.CONFIRMED,
    FINANCE_INVOICE_STATUS.CANCELLED,
  ],
  [FINANCE_INVOICE_STATUS.CONFIRMED]: [
    FINANCE_INVOICE_STATUS.PARTIAL_PAID,
    FINANCE_INVOICE_STATUS.PAID,
    FINANCE_INVOICE_STATUS.OVERDUE,
    FINANCE_INVOICE_STATUS.CANCELLED,
  ],
  [FINANCE_INVOICE_STATUS.PARTIAL_PAID]: [
    FINANCE_INVOICE_STATUS.PAID,
    FINANCE_INVOICE_STATUS.OVERDUE,
  ],
  [FINANCE_INVOICE_STATUS.OVERDUE]: [
    FINANCE_INVOICE_STATUS.PARTIAL_PAID,
    FINANCE_INVOICE_STATUS.PAID,
  ],
  [FINANCE_INVOICE_STATUS.PAID]: [],
  [FINANCE_INVOICE_STATUS.CANCELLED]: [],
};

const registry = {
  salesOrder: {
    table: 'sales_orders',
    statusColumn: 'status',
    transitions: SALES_ORDER_TRANSITIONS,
    terminal: terminalFromFlow(SALES_ORDER_TRANSITIONS),
    aliases: { 已完成: 'completed', 已拒绝: 'rejected', 处理中: 'processing' },
  },
  salesExchange: {
    table: 'sales_exchanges',
    statusColumn: 'status',
    transitions: SALES_EXCHANGE_TRANSITIONS,
    terminal: terminalFromFlow(SALES_EXCHANGE_TRANSITIONS),
    aliases: { 待处理: 'pending', 处理中: 'processing', 已完成: 'completed', 已拒绝: 'rejected' },
  },
  purchaseOrder: {
    table: 'purchase_orders',
    statusColumn: 'status',
    transitions: PURCHASE_STATUS_TRANSITIONS,
    terminal: [PURCHASE_STATUS.COMPLETED, PURCHASE_STATUS.CANCELLED],
    aliases: {},
  },
  purchaseRequisition: {
    table: 'purchase_requisitions',
    statusColumn: 'status',
    transitions: PURCHASE_REQUISITION_TRANSITIONS,
    terminal: terminalFromFlow(PURCHASE_REQUISITION_TRANSITIONS),
    aliases: {},
  },
  purchaseReceipt: {
    table: 'purchase_receipts',
    statusColumn: 'status',
    transitions: PURCHASE_RECEIPT_TRANSITIONS,
    terminal: terminalFromFlow(PURCHASE_RECEIPT_TRANSITIONS),
    aliases: {},
  },
  inventoryInbound: {
    table: 'inventory_inbound',
    statusColumn: 'status',
    transitions: INVENTORY_INBOUND_TRANSITIONS,
    terminal: terminalFromFlow(INVENTORY_INBOUND_TRANSITIONS),
    aliases: {},
  },
  inventoryOutbound: {
    table: 'inventory_outbound',
    statusColumn: 'status',
    transitions: INVENTORY_OUTBOUND_TRANSITIONS,
    terminal: terminalFromFlow(INVENTORY_OUTBOUND_TRANSITIONS),
    aliases: {},
  },
  inventoryTransfer: {
    table: 'inventory_transfers',
    statusColumn: 'status',
    transitions: TRANSFER_STATUS_FLOW,
    terminal: terminalFromFlow(TRANSFER_STATUS_FLOW),
    aliases: {},
  },
  inventoryCheck: {
    table: 'inventory_checks',
    statusColumn: 'status',
    transitions: INVENTORY_CHECK_TRANSITIONS,
    terminal: terminalFromFlow(INVENTORY_CHECK_TRANSITIONS),
    aliases: {},
  },
  productionPlan: {
    table: 'production_plans',
    statusColumn: 'status',
    transitions: PRODUCTION_PLAN_STATUS_FLOW,
    terminal: terminalFromFlow(PRODUCTION_PLAN_STATUS_FLOW),
    aliases: {},
  },
  productionTask: {
    table: 'production_tasks',
    statusColumn: 'status',
    transitions: PRODUCTION_TASK_STATUS_FLOW,
    terminal: terminalFromFlow(PRODUCTION_TASK_STATUS_FLOW),
    aliases: {},
  },
  productionProcess: {
    table: 'production_processes',
    statusColumn: 'status',
    transitions: PRODUCTION_PROCESS_STATUS_FLOW,
    terminal: terminalFromFlow(PRODUCTION_PROCESS_STATUS_FLOW),
    aliases: {},
  },
  eightDReport: {
    table: 'eight_d_reports',
    statusColumn: 'status',
    transitions: EIGHT_D_REPORT_TRANSITIONS,
    terminal: terminalFromFlow(EIGHT_D_REPORT_TRANSITIONS),
    aliases: {},
  },
  financeInvoice: {
    table: 'ar_invoices/ap_invoices',
    statusColumn: 'status',
    transitions: FINANCE_INVOICE_TRANSITIONS,
    terminal: terminalFromFlow(FINANCE_INVOICE_TRANSITIONS),
    aliases: {
      '\u8349\u7a3f': FINANCE_INVOICE_STATUS.DRAFT,
      '\u5df2\u786e\u8ba4': FINANCE_INVOICE_STATUS.CONFIRMED,
      '\u90e8\u5206\u4ed8\u6b3e': FINANCE_INVOICE_STATUS.PARTIAL_PAID,
      '\u5df2\u90e8\u5206\u4ed8\u6b3e': FINANCE_INVOICE_STATUS.PARTIAL_PAID,
      '\u5df2\u4ed8\u6b3e': FINANCE_INVOICE_STATUS.PAID,
      '\u5df2\u903e\u671f': FINANCE_INVOICE_STATUS.OVERDUE,
      '\u903e\u671f': FINANCE_INVOICE_STATUS.OVERDUE,
      '\u5df2\u53d6\u6d88': FINANCE_INVOICE_STATUS.CANCELLED,
    },
  },
  glEntry: {
    table: 'gl_entries',
    statusColumn: 'status',
    transitions: GL_ENTRY_TRANSITIONS,
    terminal: terminalFromFlow(GL_ENTRY_TRANSITIONS),
    aliases: {},
  },
  financePeriod: {
    table: 'gl_periods',
    statusColumn: 'status',
    transitions: PERIOD_TRANSITIONS,
    terminal: terminalFromFlow(PERIOD_TRANSITIONS),
    aliases: {},
  },
};

const normalizeStatus = (domain, status) => {
  const def = registry[domain];
  if (!def) return status;
  return def.aliases?.[status] || status;
};

const getStatusDefinition = (domain) => registry[domain] || null;

const getStatusValues = (domain) => {
  const def = getStatusDefinition(domain);
  return def ? valuesFromFlow(def.transitions) : [];
};

const isKnownStatus = (domain, status) => getStatusValues(domain).includes(normalizeStatus(domain, status));

const isTerminalStatus = (domain, status) => {
  const def = getStatusDefinition(domain);
  return !!def && def.terminal.includes(normalizeStatus(domain, status));
};

const getAllowedTransitions = (domain, status) => {
  const def = getStatusDefinition(domain);
  if (!def) return [];
  return def.transitions[normalizeStatus(domain, status)] || [];
};

const isValidTransition = (domain, from, to) => (
  getAllowedTransitions(domain, from).includes(normalizeStatus(domain, to))
);

module.exports = {
  STATUS_REGISTRY: registry,
  getStatusDefinition,
  getStatusValues,
  normalizeStatus,
  isKnownStatus,
  isTerminalStatus,
  getAllowedTransitions,
  isValidTransition,
};
