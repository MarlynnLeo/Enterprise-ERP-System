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
  in_progress: ['pending', 'cancelled'],
  pending: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const SALES_ORDER_TRANSITIONS = {
  draft: ['pending', 'confirmed', 'in_production', 'in_procurement', 'ready_to_ship', 'shortage', 'cancelled'],
  pending: ['confirmed', 'in_production', 'in_procurement', 'ready_to_ship', 'shortage', 'cancelled'],
  confirmed: ['in_production', 'in_procurement', 'ready_to_ship', 'shortage', 'partial_shipped', 'shipped', 'completed', 'cancelled'],
  in_production: ['ready_to_ship', 'shortage', 'partial_shipped', 'shipped', 'completed', 'cancelled'],
  in_procurement: ['ready_to_ship', 'shortage', 'partial_shipped', 'shipped', 'completed', 'cancelled'],
  ready_to_ship: ['partial_shipped', 'shipped', 'completed', 'cancelled'],
  shortage: ['in_production', 'in_procurement', 'ready_to_ship', 'partial_shipped', 'shipped', 'cancelled'],
  partial_shipped: ['shipped', 'completed', 'cancelled'],
  shipped: ['delivered', 'completed'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

const SALES_OUTBOUND_TRANSITIONS = {
  draft: ['processing', 'cancelled'],
  processing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const SALES_PACKING_TRANSITIONS = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['packing', 'cancelled'],
  packing: ['completed', 'cancelled'],
  completed: [],
  cancelled: ['draft'],
};

const PURCHASE_RETURN_TRANSITIONS = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const PURCHASE_RECEIPT_STATUS_TRANSITIONS = {
  draft: ['confirmed', 'completed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

// 调拨转换（与 inventoryTransferController 本地规则一致）
const INVENTORY_TRANSFER_TRANSITIONS = {
  draft: ['pending', 'cancelled'],
  pending: ['approved', 'cancelled'],
  approved: ['completed', 'cancelled'],
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

const BUDGET_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  CLOSED: 'closed',
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

const BUDGET_TRANSITIONS = {
  [BUDGET_STATUS.DRAFT]: [BUDGET_STATUS.PENDING_APPROVAL],
  [BUDGET_STATUS.PENDING_APPROVAL]: [BUDGET_STATUS.APPROVED, BUDGET_STATUS.DRAFT],
  [BUDGET_STATUS.APPROVED]: [BUDGET_STATUS.EXECUTING],
  [BUDGET_STATUS.EXECUTING]: [BUDGET_STATUS.COMPLETED, BUDGET_STATUS.CLOSED],
  [BUDGET_STATUS.COMPLETED]: [BUDGET_STATUS.CLOSED],
  [BUDGET_STATUS.CLOSED]: [],
};

const ECN_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

const ECN_TRANSITIONS = {
  [ECN_STATUS.DRAFT]: [ECN_STATUS.SUBMITTED, ECN_STATUS.CANCELLED],
  [ECN_STATUS.SUBMITTED]: [ECN_STATUS.APPROVED, ECN_STATUS.REJECTED],
  [ECN_STATUS.APPROVED]: [],
  [ECN_STATUS.REJECTED]: [ECN_STATUS.DRAFT],
  [ECN_STATUS.CANCELLED]: [],
};

const PERFORMANCE_EVALUATION_STATUS = {
  DRAFT: 'draft',
  SELF_EVALUATION: 'self_evaluation',
  MANAGER_REVIEW: 'manager_review',
  COMPLETED: 'completed',
};

const PERFORMANCE_EVALUATION_TRANSITIONS = {
  [PERFORMANCE_EVALUATION_STATUS.DRAFT]: [PERFORMANCE_EVALUATION_STATUS.SELF_EVALUATION],
  [PERFORMANCE_EVALUATION_STATUS.SELF_EVALUATION]: [PERFORMANCE_EVALUATION_STATUS.MANAGER_REVIEW],
  [PERFORMANCE_EVALUATION_STATUS.MANAGER_REVIEW]: [PERFORMANCE_EVALUATION_STATUS.COMPLETED],
  [PERFORMANCE_EVALUATION_STATUS.COMPLETED]: [],
};

const PERFORMANCE_PERIOD_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
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
  salesOutbound: {
    table: 'sales_outbound',
    statusColumn: 'status',
    transitions: SALES_OUTBOUND_TRANSITIONS,
    terminal: terminalFromFlow(SALES_OUTBOUND_TRANSITIONS),
    aliases: {},
  },
  salesPacking: {
    table: 'packing_lists',
    statusColumn: 'status',
    transitions: SALES_PACKING_TRANSITIONS,
    terminal: terminalFromFlow(SALES_PACKING_TRANSITIONS),
    aliases: {},
  },
  purchaseReturn: {
    table: 'purchase_returns',
    statusColumn: 'status',
    transitions: PURCHASE_RETURN_TRANSITIONS,
    terminal: terminalFromFlow(PURCHASE_RETURN_TRANSITIONS),
    aliases: {},
  },
  purchaseReceiptStatus: {
    table: 'purchase_receipts',
    statusColumn: 'status',
    transitions: PURCHASE_RECEIPT_STATUS_TRANSITIONS,
    terminal: terminalFromFlow(PURCHASE_RECEIPT_STATUS_TRANSITIONS),
    aliases: {},
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
    transitions: INVENTORY_TRANSFER_TRANSITIONS,
    terminal: terminalFromFlow(INVENTORY_TRANSFER_TRANSITIONS),
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
  budget: {
    table: 'budgets',
    statusColumn: 'status',
    transitions: BUDGET_TRANSITIONS,
    terminal: terminalFromFlow(BUDGET_TRANSITIONS),
    aliases: {
      '\u8349\u7a3f': BUDGET_STATUS.DRAFT,
      '\u5f85\u5ba1\u6279': BUDGET_STATUS.PENDING_APPROVAL,
      '\u5df2\u5ba1\u6279': BUDGET_STATUS.APPROVED,
      '\u6267\u884c\u4e2d': BUDGET_STATUS.EXECUTING,
      '\u5df2\u5b8c\u6210': BUDGET_STATUS.COMPLETED,
      '\u5df2\u5173\u95ed': BUDGET_STATUS.CLOSED,
    },
  },
  ecn: {
    table: 'ecn_orders',
    statusColumn: 'status',
    transitions: ECN_TRANSITIONS,
    terminal: terminalFromFlow(ECN_TRANSITIONS),
    aliases: {},
  },
  performanceEvaluation: {
    table: 'performance_evaluations',
    statusColumn: 'status',
    transitions: PERFORMANCE_EVALUATION_TRANSITIONS,
    terminal: terminalFromFlow(PERFORMANCE_EVALUATION_TRANSITIONS),
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
  // 转换定义常量（供控制器直接引用，消除双写）
  SALES_ORDER_TRANSITIONS,
  SALES_EXCHANGE_TRANSITIONS,
  SALES_OUTBOUND_TRANSITIONS,
  SALES_PACKING_TRANSITIONS,
  PURCHASE_RETURN_TRANSITIONS,
  PURCHASE_RECEIPT_STATUS_TRANSITIONS,
  INVENTORY_INBOUND_TRANSITIONS,
  INVENTORY_OUTBOUND_TRANSITIONS,
  INVENTORY_CHECK_TRANSITIONS,
  INVENTORY_TRANSFER_TRANSITIONS,
  // ECN / 绩效
  ECN_STATUS,
  ECN_TRANSITIONS,
  PERFORMANCE_EVALUATION_STATUS,
  PERFORMANCE_EVALUATION_TRANSITIONS,
  PERFORMANCE_PERIOD_STATUS,
  // 工具函数
  getStatusDefinition,
  getStatusValues,
  normalizeStatus,
  isKnownStatus,
  isTerminalStatus,
  getAllowedTransitions,
  isValidTransition,
};
