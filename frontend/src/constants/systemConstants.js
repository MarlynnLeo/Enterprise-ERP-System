/**
 * systemConstants.js
 * 新版系统统一常量配置 (依赖于后端系统字典)
 * 该文件通过全局缓存进行无缝衔接
 */

import { reactive, watchEffect } from 'vue';
import { useDictionaryStore } from '@/stores/dictionary';
import { startCase } from 'lodash-es';

// =======================
// 后端字典缺省容灾配置 (FALLBACK)
// =======================
// 防御性编程：在面临新部署、后端升级数据丢失或外网波动时兜底显示
const FALLBACK_DICTIONARY = {
  inventory_transaction: {
    inbound: { name: '其他入库', color: 'success' },
    outbound: { name: '其他出库', color: 'danger' },
    in: { name: '入库', color: 'success' },
    out: { name: '出库', color: 'danger' },
    production: { name: '生产出库', color: 'primary' },
    production_outbound: { name: '生产出库', color: 'primary' },
    bom_issue: { name: '生产领料', color: 'primary' },
    batch_issue: { name: '批量发料', color: 'primary' },
    supplement: { name: '补料出库', color: 'warning' },
    exchange: { name: '换料出库', color: 'warning' },
    sales: { name: '销售出库', color: 'danger' },
    sales_outbound: { name: '销售出库', color: 'danger' },
    sales_exchange_out: { name: '换料出库', color: 'warning' },
    manual: { name: '手工出库', color: 'info' },
    manual_out: { name: '手工出库', color: 'info' },
    manual_in: { name: '手工入库', color: 'info' },
    defective_return: { name: '不良退回', color: 'success' },
    production_return: { name: '生产退料', color: 'success' },
    purchase_return: { name: '采购退货', color: 'warning' },
    sales_return: { name: '销售退货', color: 'warning' },
    outsourced_outbound: { name: '委外出库', color: 'danger' },
    outsourced_inbound: { name: '委外入库', color: 'success' },
    outsourced_return: { name: '外协退料', color: 'success' },
    inbound_cancel: { name: '撤销入库', color: 'danger' },
    outbound_cancel: { name: '撤销出库', color: 'success' },
    transfer_cancel_in: { name: '撤销调拨入库', color: 'danger' },
    transfer_cancel_out: { name: '撤销调拨出库', color: 'success' }
  },
  production_status: {
    draft: { name: '未开始', color: 'info' },
    pending: { name: '未开始', color: 'info' },
    allocated: { name: '分配中', color: 'info' },
    material_issuing: { name: '发料中', color: 'warning' },
    preparing: { name: '配料中', color: 'warning' },
    material_issued: { name: '已发料', color: 'primary' },
    material_partial_issued: { name: '部分发料', color: 'primary' },
    in_progress: { name: '生产中', color: 'success' },
    processing: { name: '生产中', color: 'success' },
    paused: { name: '已暂停', color: 'warning' },
    inspection: { name: '待检验', color: 'warning' },
    warehousing: { name: '入库中', color: 'primary' },
    completed: { name: '已完成', color: 'success' },
    cancelled: { name: '已取消', color: 'danger' }
  },
  gl_transaction_type: {
    PRODUCTION_MATERIAL: { name: '生产领料', color: 'warning' },
    PRODUCTION_LABOR: { name: '人工成本', color: 'primary' },
    PRODUCTION_OVERHEAD: { name: '制造费用', color: 'primary' },
    PRODUCTION_COMPLETE: { name: '生产完工', color: 'success' },
    PRODUCTION: { name: '生产业务', color: 'primary' },
    MATERIAL_ISSUE: { name: '材料领用', color: 'warning' }
  },
  inbound_outbound_status: {
    draft: { name: '草稿', color: 'info' },
    confirmed: { name: '确认', color: 'warning' },
    partial_completed: { name: '部分', color: 'warning' },
    completed: { name: '完成', color: 'success' },
    cancelled: { name: '取消', color: 'danger' }
  },
  inventory_check_status: {
    draft: { name: '草稿', color: 'info' },
    in_progress: { name: '进行中', color: 'primary' },
    pending: { name: '待审核', color: 'warning' },
    completed: { name: '已完成', color: 'success' },
    cancelled: { name: '已取消', color: 'danger' },
  },
  transfer_status: {
    draft: { name: '草稿', color: 'info' },
    pending: { name: '待审核', color: 'warning' },
    approved: { name: '已审核', color: 'primary' },
    completed: { name: '已完成', color: 'success' },
    reversed: { name: '已冲销', color: 'info' },
    cancelled: { name: '已取消', color: 'danger' },
    in_transit: { name: '运输中', color: 'primary' },
    rejected: { name: '已拒绝', color: 'danger' },
  },
  order_status: {
    draft: { name: '草稿', color: 'info' },
    pending: { name: '待确认', color: 'warning' },
    confirmed: { name: '已确认', color: 'primary' },
    in_production: { name: '生产中', color: 'primary' },
    ready_to_ship: { name: '待发货', color: 'warning' },
    shipped: { name: '已发货', color: 'primary' },
    delivered: { name: '已交付', color: 'success' },
    completed: { name: '已完成', color: 'success' },
    cancelled: { name: '已取消', color: 'danger' },
  },
  quality_status: {
    pending: { name: '待检验', color: 'warning' },
    in_progress: { name: '检验中', color: 'primary' },
    passed: { name: '合格', color: 'success' },
    failed: { name: '不合格', color: 'danger' },
    rework: { name: '返工', color: 'warning' },
    review: { name: '复检', color: 'primary' },
    partial: { name: '部分合格', color: 'warning' },
    cancelled: { name: '已取消', color: 'danger' },
  },
  purchase_status: {
    draft: { name: '草稿', color: 'info' },
    pending: { name: '待处理', color: 'warning' },
    submitted: { name: '待审批', color: 'warning' },
    approved: { name: '已批准', color: 'success' },
    confirmed: { name: '已确认', color: 'primary' },
    processing: { name: '处理中', color: 'primary' },
    partial_received: { name: '部分收货', color: 'warning' },
    completed: { name: '已完成', color: 'success' },
    cancelled: { name: '已取消', color: 'danger' },
    rejected: { name: '已拒绝', color: 'danger' },
  },
  outsourced_status: {
    pending: { name: '待出库', color: 'warning' },
    arrived: { name: '待检验', color: 'warning' },
    confirmed: { name: '加工中', color: 'primary' },
    in_progress: { name: '加工中', color: 'primary' },
    completed: { name: '已完成', color: 'success' },
    cancelled: { name: '已取消', color: 'danger' },
  },
  sales_status: {
    draft: { name: '草稿', color: 'info' },
    pending: { name: '待处理', color: 'warning' },
    confirmed: { name: '已确认', color: 'primary' },
    processing: { name: '处理中', color: 'primary' },
    in_production: { name: '生产中', color: 'primary' },
    in_procurement: { name: '采购中', color: 'primary' },
    ready_to_ship: { name: '可发货', color: 'warning' },
    shortage: { name: '缺料', color: 'danger' },
    partial_shipped: { name: '部分发货', color: 'warning' },
    shipped: { name: '已发货', color: 'primary' },
    delivered: { name: '已交付', color: 'success' },
    completed: { name: '已完成', color: 'success' },
    cancelled: { name: '已取消', color: 'danger' },
  },
  equipment_status: {
    running: { name: '运行中', color: 'success' },
    idle: { name: '空闲', color: 'info' },
    maintenance: { name: '维护中', color: 'warning' },
    fault: { name: '故障', color: 'danger' },
    offline: { name: '离线', color: 'info' },
  },
  common_status: {
    active: { name: '启用', color: 'success' },
    inactive: { name: '禁用', color: 'danger' },
    enabled: { name: '启用', color: 'success' },
    disabled: { name: '禁用', color: 'danger' },
    normal: { name: '正常', color: 'success' },
    abnormal: { name: '异常', color: 'danger' },
    online: { name: '在线', color: 'success' },
    offline: { name: '离线', color: 'info' },
    valid: { name: '有效', color: 'success' },
    invalid: { name: '无效', color: 'danger' },
    available: { name: '可用', color: 'success' },
    unavailable: { name: '不可用', color: 'warning' },
    locked: { name: '锁定', color: 'warning' },
    unlocked: { name: '解锁', color: 'success' },
  },
  approval_status: {
    draft: { name: '草稿', color: 'info' },
    pending: { name: '待审批', color: 'warning' },
    approved: { name: '已审批', color: 'success' },
    rejected: { name: '已拒绝', color: 'danger' },
    cancelled: { name: '已取消', color: 'danger' },
  },
  user_status: {
    active: { name: '正常', color: 'success' },
    inactive: { name: '禁用', color: 'danger' },
    disabled: { name: '禁用', color: 'danger' },
    enabled: { name: '启用', color: 'success' },
    pending: { name: '待激活', color: 'warning' },
    locked: { name: '锁定', color: 'warning' },
    online: { name: '在线', color: 'success' },
    offline: { name: '离线', color: 'info' },
  },
  asset_status: {
    in_use: { name: '在用', color: 'success' },
    idle: { name: '闲置', color: 'info' },
    under_repair: { name: '维修', color: 'warning' },
    disposed: { name: '报废', color: 'danger' },
    sold: { name: '已处置', color: 'info' },
  },
  contract_status: {
    draft: { name: '草稿', color: 'info' },
    pending_approval: { name: '待审批', color: 'warning' },
    active: { name: '生效', color: 'success' },
    executing: { name: '执行中', color: 'primary' },
    completed: { name: '已完成', color: 'success' },
    terminated: { name: '已终止', color: 'danger' },
    expired: { name: '已过期', color: 'info' },
  },
  contract_type: {
    purchase: { name: '采购合同', color: 'warning' },
    sales: { name: '销售合同', color: 'success' },
    service: { name: '服务合同', color: 'primary' },
    other: { name: '其他合同', color: 'info' },
  },
  packing_status: {
    draft: { name: '草稿', color: 'info' },
    confirmed: { name: '已确认', color: 'warning' },
    packing: { name: '装箱中', color: 'primary' },
    completed: { name: '已完成', color: 'success' },
    cancelled: { name: '已取消', color: 'danger' },
  },
  ecn_status: {
    draft: { name: '草稿', color: 'info' },
    pending: { name: '待审核', color: 'warning' },
    reviewing: { name: '审核中', color: 'primary' },
    approved: { name: '已通过', color: 'success' },
    rejected: { name: '已拒绝', color: 'danger' },
    executing: { name: '执行中', color: 'primary' },
    completed: { name: '已完成', color: 'success' },
    cancelled: { name: '已取消', color: 'info' },
  },
  nonconforming_severity: {
    minor: { name: '轻微缺陷', color: 'info' },
    major: { name: '严重缺陷', color: 'warning' },
    critical: { name: '致命缺陷', color: 'danger' },
  },
  nonconforming_status: {
    pending: { name: '待处理', color: 'warning' },
    processing: { name: '处理中', color: 'primary' },
    completed: { name: '已完成', color: 'success' },
    closed: { name: '已关闭', color: 'info' },
  },
  performance_period_status: {
    draft: { name: '草稿', color: 'info' },
    active: { name: '进行中', color: 'success' },
    evaluating: { name: '考评中', color: 'warning' },
    completed: { name: '已完成', color: 'primary' },
    closed: { name: '已归档', color: 'info' },
  },
  performance_eval_status: {
    pending_self: { name: '待自评', color: 'warning' },
    pending_manager: { name: '待主管评', color: 'warning' },
    completed: { name: '已完成', color: 'success' },
  }
};


/**
 * 助手函数：创建一个响应式的字典对象映射，等同于原有的 { key: value } 形式。
 * 它可以支持原有组件中进行的 Object.keys(XXX_TYPES) 循环。
 */
const createDictionaryGroup = (groupCode) => {
  const state = reactive({});
  watchEffect(() => {
    try {
      const store = useDictionaryStore();
      if (store.isLoaded) {
        // 清空旧的 keys
        for (const key in state) delete state[key];
        Object.assign(state, store.getMap(groupCode));
      }
    } catch {
      // Pinia 可能尚未初始化
    }
  });
  return state;
};

/**
 * 助手函数：创建对应的颜色映射表
 */
const createDictionaryColors = (groupCode) => {
  const state = reactive({});
  watchEffect(() => {
    try {
      const store = useDictionaryStore();
      if (store.isLoaded) {
        for (const key in state) delete state[key];
        const types = store.groups[groupCode] || [];
        types.forEach(t => {
          state[t.code] = t.tagType || t.tag_type || 'info';
        });
      }
    } catch {}
  });
  return state;
};

// =======================
// 动态字典实例导出
// =======================
export const WAREHOUSE_TYPES = createDictionaryGroup('warehouse_type');
export const WAREHOUSE_COLORS = createDictionaryColors('warehouse_type');
export const INVENTORY_TRANSACTION_TYPES = createDictionaryGroup('inventory_transaction');
export const INVENTORY_TRANSACTION_COLORS = createDictionaryColors('inventory_transaction');
export const INVENTORY_STATUS = createDictionaryGroup('inventory_status');
export const INVENTORY_STATUS_COLORS = createDictionaryColors('inventory_status');
export const INVENTORY_CHECK_STATUS = createDictionaryGroup('inventory_check_status');
export const INVENTORY_CHECK_STATUS_COLORS = createDictionaryColors('inventory_check_status');
export const INBOUND_OUTBOUND_STATUS = createDictionaryGroup('inbound_outbound_status');
export const INBOUND_OUTBOUND_STATUS_COLORS = createDictionaryColors('inbound_outbound_status');
export const TRANSFER_STATUS = createDictionaryGroup('transfer_status');
export const TRANSFER_STATUS_COLORS = createDictionaryColors('transfer_status');
export const ORDER_STATUS = createDictionaryGroup('order_status');
export const ORDER_STATUS_COLORS = createDictionaryColors('order_status');
export const PURCHASE_STATUS = createDictionaryGroup('purchase_status');
export const PURCHASE_STATUS_COLORS = createDictionaryColors('purchase_status');
export const PURCHASE_RECEIPT_STATUS = createDictionaryGroup('purchase_receipt_status');
export const PURCHASE_RECEIPT_STATUS_COLORS = createDictionaryColors('purchase_receipt_status');
export const PURCHASE_RETURN_STATUS = createDictionaryGroup('purchase_return_status');
export const PURCHASE_RETURN_STATUS_COLORS = createDictionaryColors('purchase_return_status');
export const SALES_STATUS = createDictionaryGroup('sales_status');
export const SALES_STATUS_COLORS = createDictionaryColors('sales_status');
export const SALES_QUOTATION_STATUS = createDictionaryGroup('sales_quotation_status');
export const SALES_QUOTATION_STATUS_COLORS = createDictionaryColors('sales_quotation_status');
export const OUTSOURCED_STATUS = createDictionaryGroup('outsourced_status');
export const OUTSOURCED_STATUS_COLORS = createDictionaryColors('outsourced_status');
export const QUALITY_STATUS = createDictionaryGroup('quality_status');
export const QUALITY_STATUS_COLORS = createDictionaryColors('quality_status');
export const QUALITY_INSPECTION_TYPES = createDictionaryGroup('quality_inspection_type');
export const FIRST_ARTICLE_RESULT = createDictionaryGroup('first_article_result');
export const FIRST_ARTICLE_RESULT_COLORS = createDictionaryColors('first_article_result');
export const BUDGET_STATUS = createDictionaryGroup('budget_status');
export const BUDGET_STATUS_COLORS = createDictionaryColors('budget_status');
export const PRODUCTION_STATUS = createDictionaryGroup('production_status');
export const PRODUCTION_STATUS_COLORS = createDictionaryColors('production_status');
export const EQUIPMENT_STATUS = createDictionaryGroup('equipment_status');
export const EQUIPMENT_STATUS_COLORS = createDictionaryColors('equipment_status');
export const COMMON_STATUS = createDictionaryGroup('common_status');
export const COMMON_STATUS_COLORS = createDictionaryColors('common_status');
export const FINANCE_TRANSACTION_TYPES = createDictionaryGroup('finance_transaction');
export const FINANCE_TRANSACTION_COLORS = createDictionaryColors('finance_transaction');
export const COSTING_METHOD = createDictionaryGroup('costing_method');
export const GL_TRANSACTION_TYPES = createDictionaryGroup('gl_transaction_type');
export const GL_TRANSACTION_COLORS = createDictionaryColors('gl_transaction_type');
export const PRIORITY_LEVELS = createDictionaryGroup('priority');
export const PRIORITY_COLORS = createDictionaryColors('priority');
export const APPROVAL_STATUS = createDictionaryGroup('approval_status');
export const APPROVAL_STATUS_COLORS = createDictionaryColors('approval_status');
export const USER_STATUS = createDictionaryGroup('user_status');
export const USER_STATUS_COLORS = createDictionaryColors('user_status');
export const ASSET_STATUS = createDictionaryGroup('asset_status');
export const ASSET_STATUS_COLORS = createDictionaryColors('asset_status');
export const ASSET_TYPES = createDictionaryGroup('asset_type');
export const ASSET_TYPE_COLORS = createDictionaryColors('asset_type');
export const CONTRACT_STATUS = createDictionaryGroup('contract_status');
export const CONTRACT_STATUS_COLORS = createDictionaryColors('contract_status');
export const CONTRACT_TYPES = createDictionaryGroup('contract_type');
export const CONTRACT_TYPE_COLORS = createDictionaryColors('contract_type');
export const PACKING_STATUS = createDictionaryGroup('packing_status');
export const PACKING_STATUS_COLORS = createDictionaryColors('packing_status');
export const ECN_STATUS = createDictionaryGroup('ecn_status');
export const ECN_STATUS_COLORS = createDictionaryColors('ecn_status');
export const NONCONFORMING_SEVERITY = createDictionaryGroup('nonconforming_severity');
export const NONCONFORMING_SEVERITY_COLORS = createDictionaryColors('nonconforming_severity');
export const NONCONFORMING_STATUS = createDictionaryGroup('nonconforming_status');
export const NONCONFORMING_STATUS_COLORS = createDictionaryColors('nonconforming_status');
export const PERFORMANCE_PERIOD_STATUS = createDictionaryGroup('performance_period_status');
export const PERFORMANCE_PERIOD_STATUS_COLORS = createDictionaryColors('performance_period_status');
export const PERFORMANCE_EVAL_STATUS = createDictionaryGroup('performance_eval_status');
export const PERFORMANCE_EVAL_STATUS_COLORS = createDictionaryColors('performance_eval_status');
const createStatusKeyMap = (codes) => Object.freeze(
  Object.fromEntries(codes.map((code) => [
    code.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
    code,
  ]))
);
export const PRODUCTION_STATUS_KEYS = createStatusKeyMap(Object.keys(FALLBACK_DICTIONARY.production_status));

const createOptions = (groupCode, filterKeys = null) => {
  const state = reactive([]);
  watchEffect(() => {
    try {
      const store = useDictionaryStore();
      state.splice(0, state.length); // clear array
      let opts = store.isLoaded ? store.getOptions(groupCode) : [];
      if (opts.length === 0) {
        opts = Object.entries(FALLBACK_DICTIONARY[groupCode] || {}).map(([value, item]) => ({
          value,
          label: item.name,
        }));
      }
      if (filterKeys) {
        opts = opts.filter(opt => filterKeys.includes(opt.value));
      }
      state.push(...opts);
    } catch {}
  });
  return state;
};

export const INVENTORY_CHECK_STATUS_OPTIONS = createOptions('inventory_check_status');
export const PURCHASE_STATUS_OPTIONS = createOptions('purchase_status', ['draft', 'pending', 'approved', 'confirmed', 'received', 'inspecting', 'inspected', 'warehousing', 'partial_received', 'completed', 'cancelled']);
export const DEFAULT_PURCHASE_DELIVERY_DAYS = 21;
export const DEFAULT_PURCHASE_VAT_RATE = 0.13;
export const PURCHASE_STATUS_TRANSITIONS = {
  draft: ['pending', 'cancelled'],
  pending: [],
  confirmed: ['received', 'partial_received', 'cancelled'],
  approved: ['received', 'partial_received', 'cancelled'],
  received: ['inspecting', 'cancelled'],
  inspecting: ['inspected', 'cancelled'],
  inspected: ['warehousing', 'cancelled'],
  warehousing: ['completed', 'cancelled'],
  partial_received: ['received', 'cancelled'],
  completed: [],
  cancelled: []
};
export const PURCHASE_STATUS_ACTION_TEXT = {
  draft: '\u9a73\u56de',
  pending: '\u63d0\u4ea4\u5ba1\u6279',
  confirmed: '\u6279\u51c6',
  approved: '\u6279\u51c6',
  received: '\u786e\u8ba4\u5230\u8d27',
  inspecting: '\u8bbe\u4e3a\u68c0\u9a8c\u4e2d',
  inspected: '\u8bbe\u4e3a\u68c0\u9a8c\u5b8c\u6210',
  warehousing: '\u8bbe\u4e3a\u5165\u5e93\u4e2d',
  completed: '\u5b8c\u6210',
  cancelled: '\u53d6\u6d88'
};
export const OUTSOURCED_STATUS_OPTIONS = createOptions('outsourced_status');
export const PURCHASE_RECEIPT_STATUS_OPTIONS = createOptions('purchase_receipt_status');
export const PURCHASE_RETURN_STATUS_OPTIONS = createOptions('purchase_return_status');
export const FIRST_ARTICLE_RESULT_OPTIONS = createOptions('first_article_result');
export const BUDGET_STATUS_OPTIONS = createOptions('budget_status');
export const SALES_STATUS_OPTIONS = createOptions('sales_status');
export const SALES_RETURN_STATUS_OPTIONS = createOptions('sales_return_status');
export const SALES_EXCHANGE_STATUS_OPTIONS = createOptions('sales_exchange_status');
export const SALES_QUOTATION_STATUS_OPTIONS = createOptions('sales_quotation_status');
export const PACKING_STATUS_OPTIONS = createOptions('packing_status');
export const CONTRACT_STATUS_OPTIONS = createOptions('contract_status');
export const CONTRACT_TYPE_OPTIONS = createOptions('contract_type');
export const ECN_STATUS_OPTIONS = createOptions('ecn_status');
export const NONCONFORMING_SEVERITY_OPTIONS = createOptions('nonconforming_severity');
export const NONCONFORMING_STATUS_OPTIONS = createOptions('nonconforming_status');
export const PERFORMANCE_PERIOD_STATUS_OPTIONS = createOptions('performance_period_status');
export const PERFORMANCE_EVAL_STATUS_OPTIONS = createOptions('performance_eval_status');
export const toStatusOptions = (mapObj) => Object.entries(mapObj).map(([value, label]) => ({value, label}));

// =======================
// 静态保留业务配置
// =======================
export const VALIDATION_RULES = {
  STOCK_QUANTITY: { min: 0, max: 999999999, precision: 3 },
  AMOUNT: { min: 0, max: 999999999.99, precision: 2 },
  CODE_LENGTH: { min: 1, max: 50 },
  NAME_LENGTH: { min: 1, max: 100 },
  REMARK_LENGTH: { min: 0, max: 500 }
};

export const BUSINESS_RULES = {};

export const INVENTORY_TRANSACTION_GROUPS = {
  INCREASE: ['inbound', 'in', 'purchase_inbound', 'production_inbound', 'outsourced_inbound', 'sales_return', 'sales_exchange_return', 'transfer_in', 'adjustment_in', 'initial_import', 'correction', 'outbound_cancel', 'transfer_cancel_out'],
  DECREASE: ['outbound', 'out', 'production_outbound', 'outsourced_outbound', 'sale', 'sales_outbound', 'sales_exchange_out', 'transfer_out', 'adjustment_out', 'purchase_return', 'inbound_cancel', 'transfer_cancel_in'],
  TRANSFER: ['transfer', 'transfer_in', 'transfer_out', 'transfer_cancel_in', 'transfer_cancel_out']
};

export const FIRST_ARTICLE_CONFIG = {
  DEFAULT_QTY: 5,
  DEFAULT_FULL_INSPECTION_THRESHOLD: 5,
  DEFAULT_UNIT: '个',
  DEFAULT_INSPECTION_ITEMS: [ { item_name: '外观检查', standard_value: '无缺陷', type: 'visual' } ]
};

export const PRODUCTION_FLOW_STEPS = [
  { status: 'draft', name: '未开始' },
  { status: 'allocated', name: '分配中' },
  { status: 'material_issuing', name: '发料中' },
  { status: 'preparing', name: '配料中' },
  { status: 'material_issued', name: '已发料' },
  { status: 'in_progress', name: '生产中' },
  { status: 'inspection', name: '待检验' },
  { status: 'warehousing', name: '入库中' },
  { status: 'completed', name: '已完成' }
];

export const PRODUCTION_PLAN_PUSHABLE_STATUSES = Object.freeze([
  PRODUCTION_STATUS_KEYS.DRAFT,
  PRODUCTION_STATUS_KEYS.ALLOCATED,
  PRODUCTION_STATUS_KEYS.MATERIAL_ISSUING,
  PRODUCTION_STATUS_KEYS.PREPARING,
  PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED,
  PRODUCTION_STATUS_KEYS.IN_PROGRESS,
]);
export const PRODUCTION_PLAN_CANCELABLE_STATUSES = Object.freeze([
  PRODUCTION_STATUS_KEYS.DRAFT,
  PRODUCTION_STATUS_KEYS.ALLOCATED,
  PRODUCTION_STATUS_KEYS.MATERIAL_ISSUING,
  PRODUCTION_STATUS_KEYS.PREPARING,
  PRODUCTION_STATUS_KEYS.MATERIAL_ISSUED,
  PRODUCTION_STATUS_KEYS.IN_PROGRESS,
  PRODUCTION_STATUS_KEYS.PAUSED,
  PRODUCTION_STATUS_KEYS.INSPECTION,
]);
export const PRODUCTION_PLAN_STATUS_OPTIONS = Object.freeze([
  ...PRODUCTION_FLOW_STEPS.map(({ status, name }) => ({ value: status, label: name })),
  {
    value: PRODUCTION_STATUS_KEYS.CANCELLED,
    label: FALLBACK_DICTIONARY.production_status[PRODUCTION_STATUS_KEYS.CANCELLED]?.name || PRODUCTION_STATUS_KEYS.CANCELLED,
  },
]);

export const isIncreaseTransaction = (type) => INVENTORY_TRANSACTION_GROUPS.INCREASE.includes(type);
export const isDecreaseTransaction = (type) => INVENTORY_TRANSACTION_GROUPS.DECREASE.includes(type);
export const isTransferTransaction = (type) => INVENTORY_TRANSACTION_GROUPS.TRANSFER.includes(type);

export const BUSINESS_TYPE_CATEGORIES = { 'in': '入库', 'out': '出库', 'transfer': '调拨', 'adjust': '调整' };
export const BUSINESS_TYPE_CATEGORY_OPTIONS = [
  { label: '入库', value: 'in' },
  { label: '出库', value: 'out' },
  { label: '调拨', value: 'transfer' },
  { label: '调整', value: 'adjust' }
];
export const BUSINESS_TYPE_CATEGORY_COLORS = { 'in': 'success', 'out': 'warning', 'transfer': 'primary', 'adjust': 'info' };
export const getBusinessTypeCategoryName = (category) => BUSINESS_TYPE_CATEGORIES[category] || category;
export const getBusinessTypeCategoryColor = (category) => BUSINESS_TYPE_CATEGORY_COLORS[category] || 'info';

// =======================
// 旧 API Getter 实现（无缝兼容与容灾拦截调用）
// =======================
const getText = (group, code) => {
  if (!code) return '';
  const rawCode = String(code).trim();
  const normalizedCode = rawCode.toLowerCase();
  try {
    const storeObj = useDictionaryStore();
    // 强制触发响应式依赖追踪：直接读取 storeObj.groups 的内容
    // 并且读取 storeObj.isLoaded
    const isLoaded = storeObj.isLoaded;
    const groups = storeObj.groups;
    const groupData = groups[group] || [];

    // 查找字典项
    const item = groupData.find(i =>
      i.code === code ||
      String(i.code || '').toLowerCase() === normalizedCode ||
      i.name === code
    );

    if (item) {
      return item.name;
    }

    // 如果还没加载完或者没找到，尝试 fallback
    const fallbackItem = FALLBACK_DICTIONARY[group]?.[code] || FALLBACK_DICTIONARY[group]?.[normalizedCode];
    if (fallbackItem) {
      // 容错时打印 warn
      if (isLoaded) {
      }
      return fallbackItem.name;
    }

    return startCase(rawCode);
  } catch {
    return startCase(rawCode);
  }
};

const getColor = (group, code) => {
  if (!code) return 'info';
  const rawCode = String(code).trim();
  const normalizedCode = rawCode.toLowerCase();

  // 1. 全局标准且强制一致的主题语义色彩映射字典（适用于传中文字符串、未匹配字典或新加状态）
  const semanticColors = {
    // 成功/完成类 (绿色)
    'completed': 'success', '已完成': 'success',
    'approved': 'success', '已审批': 'success', '审批通过': 'success',
    'active': 'success', '启用': 'success', '正常': 'success',
    'inspected': 'success', '合格': 'success', '已检验': 'success',

    // 进行中/核心动作 (品牌色/蓝色)
    'in_progress': 'primary', '处理中': 'primary', '生产中': 'primary',
    'warehousing': 'primary', '入库中': 'primary', '入库': 'primary',
    'material_issued': 'primary', '已发料': 'primary', '发料': 'primary',
    'processing': 'primary', '执行中': 'primary', '出库': 'primary',

    // 警告/待处理动作 (橙/黄色)
    'pending': 'warning', '待审批': 'warning', '待处理': 'warning', '未开始': 'warning',
    'inspecting': 'warning', '待检验': 'warning', '检验中': 'warning',
    'material_issuing': 'warning', '发料中': 'warning', '配料中': 'warning',
    'paused': 'warning', '已暂停': 'warning', '暂停': 'warning',

    // 危险/失败操作 (红色)
    'cancelled': 'danger', '已取消': 'danger', '取消': 'danger',
    'rejected': 'danger', '已拒绝': 'danger', '拒绝': 'danger',
    'failed': 'danger', '失败': 'danger', '不合格': 'danger',
    'disabled': 'danger', '禁用': 'danger', '停用': 'danger'
  };

  try {
    // 2. 尝试从 Pinia 后端字典获取颜色
    const storeObj = useDictionaryStore();

    const groups = storeObj.groups;
    const groupData = groups[group] || [];

    // 优先读取后端业务类型配置（API 出参通常已转换为 camelCase）。
    const item = groupData.find(i =>
      i.code === code ||
      String(i.code || '').toLowerCase() === normalizedCode ||
      i.name === code
    );
    const configuredColor = item?.tagType || item?.tag_type;
    if (configuredColor) {
      return configuredColor;
    }

    // 3. Fallback 到硬编码配置
    const fallbackItem = FALLBACK_DICTIONARY[group]?.[code] || FALLBACK_DICTIONARY[group]?.[normalizedCode];
    if (fallbackItem) {
      return fallbackItem.color || 'info';
    }
  } catch {}

  // 4. 终极智能语义匹配，保证全系统所有“已完成”等无论出于哪个界面的哪个模块，必定为统一样式
   const lowerCode = normalizedCode;
  if (semanticColors[lowerCode]) {
    return semanticColors[lowerCode];
  }

  // 5. 无法识别则返回 info（灰色）
  return 'info';
};
export const getWarehouseTypeText = (code) => getText('warehouse_type', code);
export const getWarehouseTypeColor = (code) => getColor('warehouse_type', code);
export const getInventoryTransactionTypeText = (code) => getText('inventory_transaction', code);
export const getInventoryTransactionTypeColor = (code) => getColor('inventory_transaction', code);
const INVENTORY_INBOUND_TYPE_ALIASES = Object.freeze({
  other: 'inbound',
  purchase: 'purchase_inbound',
  production: 'production_inbound',
  outsourced: 'outsourced_inbound',
});
export const normalizeInventoryInboundType = (code) =>
  INVENTORY_INBOUND_TYPE_ALIASES[String(code || '').trim().toLowerCase()] || code;
export const getInventoryInboundTypeText = (code) =>
  getInventoryTransactionTypeText(normalizeInventoryInboundType(code));
export const getInventoryInboundTypeColor = (code) =>
  getInventoryTransactionTypeColor(normalizeInventoryInboundType(code));
export const getInventoryStatusText = (code) => getText('inventory_status', code);
export const getInventoryStatusColor = (code) => getColor('inventory_status', code);
export const getInventoryCheckStatusText = (code) => getText('inventory_check_status', code);
export const getInventoryCheckStatusColor = (code) => getColor('inventory_check_status', code);
export const getInboundOutboundStatusText = (code) => getText('inbound_outbound_status', code);
export const getInboundOutboundStatusColor = (code) => getColor('inbound_outbound_status', code);
export const getTransferStatusText = (code) => getText('transfer_status', code);
export const getTransferStatusColor = (code) => getColor('transfer_status', code);
export const getOrderStatusText = (code) => getText('order_status', code);
export const getOrderStatusColor = (code) => getColor('order_status', code);
export const getPurchaseStatusText = (code) => getText('purchase_status', code);
export const getPurchaseStatusColor = (code) => getColor('purchase_status', code);
export const getPurchaseStatusLabel = getPurchaseStatusText;
export const getPurchaseReceiptStatusText = (code) => getText('purchase_receipt_status', code);
export const getPurchaseReceiptStatusColor = (code) => getColor('purchase_receipt_status', code);
export const getPurchaseReturnStatusText = (code) => getText('purchase_return_status', code);
export const getPurchaseReturnStatusColor = (code) => getColor('purchase_return_status', code);
export const getSalesStatusText = (code) => getText('sales_status', code);
export const getSalesStatusColor = (code) => getColor('sales_status', code);
export const getSalesQuotationStatusText = (code) => getText('sales_quotation_status', code);
export const getSalesQuotationStatusColor = (code) => getColor('sales_quotation_status', code);
export const getOutsourcedStatusText = (code) => getText('outsourced_status', code);
export const getOutsourcedStatusColor = (code) => getColor('outsourced_status', code);
export const getQualityStatusText = (code) => getText('quality_status', code);
export const getQualityStatusColor = (code) => getColor('quality_status', code);
export const getQualityInspectionTypeText = (code) => getText('quality_inspection_type', code);
export const getFirstArticleResultText = (code) => getText('first_article_result', code);
export const getFirstArticleResultColor = (code) => getColor('first_article_result', code);
const BUDGET_STATUS_ALIASES = {
  '\u8349\u7a3f': 'draft',
  '\u5f85\u5ba1\u6279': 'pending_approval',
  '\u5df2\u5ba1\u6279': 'approved',
  '\u6267\u884c\u4e2d': 'executing',
  '\u5df2\u5b8c\u6210': 'completed',
  '\u5df2\u5173\u95ed': 'closed',
};
export const normalizeBudgetStatusCode = (code) => BUDGET_STATUS_ALIASES[code] || code;
export const getBudgetStatusText = (code) => getText('budget_status', normalizeBudgetStatusCode(code));
export const getBudgetStatusColor = (code) => getColor('budget_status', normalizeBudgetStatusCode(code));
export const getProductionStatusText = (code) => getText('production_status', code);
export const getProductionStatusColor = (code) => getColor('production_status', code);
export const getEquipmentStatusText = (code) => getText('equipment_status', code);
export const getEquipmentStatusColor = (code) => getColor('equipment_status', code);
export const getCommonStatusText = (code) => getText('common_status', code);
export const getCommonStatusColor = (code) => getColor('common_status', code);
export const getCostingMethodText = (code) => getText('costing_method', code);
export const getGLTransactionTypeText = (code) => getText('gl_transaction_type', code);
export const getGLTransactionTypeColor = (code) => getColor('gl_transaction_type', code);
export const getApprovalStatusText = (code) => getText('approval_status', code);
export const getApprovalStatusColor = (code) => getColor('approval_status', code);
export const getUserStatusText = (code) => getText('user_status', code);
export const getUserStatusColor = (code) => getColor('user_status', code);
export const getAssetStatusText = (code) => getText('asset_status', code);
export const getAssetStatusColor = (code) => getColor('asset_status', code);
export const getAssetTypeText = (code) => getText('asset_type', code);
export const getContractStatusText = (code) => getText('contract_status', code);
export const getContractStatusColor = (code) => getColor('contract_status', code);
export const getContractTypeText = (code) => getText('contract_type', code);
export const getContractTypeColor = (code) => getColor('contract_type', code);
export const getPackingStatusText = (code) => getText('packing_status', code);
export const getPackingStatusColor = (code) => getColor('packing_status', code);
export const getEcnStatusText = (code) => getText('ecn_status', code);
export const getEcnStatusColor = (code) => getColor('ecn_status', code);
export const getNonconformingSeverityText = (code) => getText('nonconforming_severity', code);
export const getNonconformingSeverityColor = (code) => getColor('nonconforming_severity', code);
export const getNonconformingStatusText = (code) => getText('nonconforming_status', code);
export const getNonconformingStatusColor = (code) => getColor('nonconforming_status', code);
export const getPerformancePeriodStatusText = (code) => getText('performance_period_status', code);
export const getPerformancePeriodStatusColor = (code) => getColor('performance_period_status', code);
export const getPerformanceEvalStatusText = (code) => getText('performance_eval_status', code);
export const getPerformanceEvalStatusColor = (code) => getColor('performance_eval_status', code);
export const getReplacementStatusText = (code) => getText('replacement_status', code);
export const getReplacementStatusColor = (code) => getColor('replacement_status', code);
export const getReworkStatusText = (code) => getText('rework_status', code);
export const getReworkStatusColor = (code) => getColor('rework_status', code);
export const getScrapStatusText = (code) => getText('scrap_status', code);
export const getScrapStatusColor = (code) => getColor('scrap_status', code);

// 额外补充特定 API
export const isValidStatusTransition = (currentStatus, newStatus, transitions = PURCHASE_STATUS_TRANSITIONS) => {
  const allowedTransitions = transitions[currentStatus];
  return Array.isArray(allowedTransitions) && allowedTransitions.includes(newStatus);
};
export const generateStatusCaseSQL = () => '';

// ========== 默认导出 ==========
export default {
  WAREHOUSE_TYPES,
  WAREHOUSE_COLORS,
  getWarehouseTypeText,
  getWarehouseTypeColor,
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_TRANSACTION_COLORS,
  getInventoryTransactionTypeText,
  getInventoryTransactionTypeColor,
  INVENTORY_STATUS,
  INVENTORY_STATUS_COLORS,
  getInventoryStatusText,
  getInventoryStatusColor,
  getInventoryCheckStatusText,
  getInventoryCheckStatusColor,
  INVENTORY_CHECK_STATUS,
  INVENTORY_CHECK_STATUS_COLORS,
  INBOUND_OUTBOUND_STATUS,
  INBOUND_OUTBOUND_STATUS_COLORS,
  getInboundOutboundStatusText,
  getInboundOutboundStatusColor,
  TRANSFER_STATUS,
  TRANSFER_STATUS_COLORS,
  getTransferStatusText,
  getTransferStatusColor,
  ORDER_STATUS,
  ORDER_STATUS_COLORS,
  getOrderStatusText,
  getOrderStatusColor,
  PURCHASE_STATUS,
  PURCHASE_STATUS_COLORS,
  PURCHASE_STATUS_ACTION_TEXT,
  PURCHASE_STATUS_TRANSITIONS,
  PURCHASE_STATUS_OPTIONS,
  DEFAULT_PURCHASE_DELIVERY_DAYS,
  DEFAULT_PURCHASE_VAT_RATE,
  getPurchaseStatusText,
  getPurchaseStatusColor,
  getPurchaseStatusLabel,
  PURCHASE_RECEIPT_STATUS,
  PURCHASE_RECEIPT_STATUS_COLORS,
  getPurchaseReceiptStatusText,
  getPurchaseReceiptStatusColor,
  PURCHASE_RETURN_STATUS,
  PURCHASE_RETURN_STATUS_COLORS,
  getPurchaseReturnStatusText,
  getPurchaseReturnStatusColor,
  SALES_STATUS,
  SALES_STATUS_COLORS,
  getSalesStatusText,
  getSalesStatusColor,
  SALES_QUOTATION_STATUS,
  SALES_QUOTATION_STATUS_COLORS,
  getSalesQuotationStatusText,
  getSalesQuotationStatusColor,
  OUTSOURCED_STATUS,
  OUTSOURCED_STATUS_COLORS,
  getOutsourcedStatusText,
  getOutsourcedStatusColor,
  QUALITY_STATUS,
  QUALITY_STATUS_COLORS,
  getQualityStatusText,
  getQualityStatusColor,
  QUALITY_INSPECTION_TYPES,
  getQualityInspectionTypeText,
  FIRST_ARTICLE_RESULT,
  FIRST_ARTICLE_RESULT_COLORS,
  FIRST_ARTICLE_RESULT_OPTIONS,
  getFirstArticleResultText,
  getFirstArticleResultColor,
  BUDGET_STATUS,
  BUDGET_STATUS_COLORS,
  BUDGET_STATUS_OPTIONS,
  normalizeBudgetStatusCode,
  getBudgetStatusText,
  getBudgetStatusColor,
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_COLORS,
  PRODUCTION_STATUS_KEYS,
  PRODUCTION_PLAN_PUSHABLE_STATUSES,
  PRODUCTION_PLAN_CANCELABLE_STATUSES,
  PRODUCTION_PLAN_STATUS_OPTIONS,
  getProductionStatusText,
  getProductionStatusColor,
  EQUIPMENT_STATUS,
  EQUIPMENT_STATUS_COLORS,
  getEquipmentStatusText,
  getEquipmentStatusColor,
  COMMON_STATUS,
  COMMON_STATUS_COLORS,
  getCommonStatusText,
  getCommonStatusColor,
  FINANCE_TRANSACTION_TYPES,
  FINANCE_TRANSACTION_COLORS,
  COSTING_METHOD,
  getCostingMethodText,
  GL_TRANSACTION_TYPES,
  GL_TRANSACTION_COLORS,
  getGLTransactionTypeText,
  getGLTransactionTypeColor,
  PRIORITY_LEVELS,
  PRIORITY_COLORS,
  APPROVAL_STATUS,
  APPROVAL_STATUS_COLORS,
  getApprovalStatusText,
  getApprovalStatusColor,
  USER_STATUS,
  USER_STATUS_COLORS,
  getUserStatusText,
  PRODUCTION_STATUS_COLORS,
  PRODUCTION_STATUS_KEYS,
  PRODUCTION_PLAN_PUSHABLE_STATUSES,
  PRODUCTION_PLAN_CANCELABLE_STATUSES,
  PRODUCTION_PLAN_STATUS_OPTIONS,
  getProductionStatusText,
  getProductionStatusColor,
  EQUIPMENT_STATUS,
  EQUIPMENT_STATUS_COLORS,
  getEquipmentStatusText,
  getEquipmentStatusColor,
  COMMON_STATUS,
  COMMON_STATUS_COLORS,
  getCommonStatusText,
  getCommonStatusColor,
  FINANCE_TRANSACTION_TYPES,
  FINANCE_TRANSACTION_COLORS,
  COSTING_METHOD,
  getCostingMethodText,
  GL_TRANSACTION_TYPES,
  GL_TRANSACTION_COLORS,
  getGLTransactionTypeText,
  getGLTransactionTypeColor,
  PRIORITY_LEVELS,
  PRIORITY_COLORS,
  APPROVAL_STATUS,
  APPROVAL_STATUS_COLORS,
  getApprovalStatusText,
  getApprovalStatusColor,
  USER_STATUS,
  USER_STATUS_COLORS,
  getUserStatusText,
  getUserStatusColor,
  ASSET_STATUS,
  ASSET_STATUS_COLORS,
  getAssetStatusText,
  getAssetStatusColor,
  ASSET_TYPES,
  getAssetTypeText,
  CONTRACT_STATUS,
  CONTRACT_STATUS_COLORS,
  CONTRACT_STATUS_OPTIONS,
  getContractStatusText,
  getContractStatusColor,
  CONTRACT_TYPES,
  CONTRACT_TYPE_COLORS,
  CONTRACT_TYPE_OPTIONS,
  getContractTypeText,
  getContractTypeColor,
  PACKING_STATUS,
  PACKING_STATUS_COLORS,
  PACKING_STATUS_OPTIONS,
  getPackingStatusText,
  getPackingStatusColor,
  ECN_STATUS,
  ECN_STATUS_COLORS,
  ECN_STATUS_OPTIONS,
  getEcnStatusText,
  getEcnStatusColor,
  NONCONFORMING_SEVERITY,
  NONCONFORMING_SEVERITY_COLORS,
  NONCONFORMING_SEVERITY_OPTIONS,
  getNonconformingSeverityText,
  getNonconformingSeverityColor,
  NONCONFORMING_STATUS,
  NONCONFORMING_STATUS_COLORS,
  NONCONFORMING_STATUS_OPTIONS,
  getNonconformingStatusText,
  getNonconformingStatusColor,
  PERFORMANCE_PERIOD_STATUS,
  PERFORMANCE_PERIOD_STATUS_COLORS,
  PERFORMANCE_PERIOD_STATUS_OPTIONS,
  getPerformancePeriodStatusText,
  getPerformancePeriodStatusColor,
  PERFORMANCE_EVAL_STATUS,
  PERFORMANCE_EVAL_STATUS_COLORS,
  PERFORMANCE_EVAL_STATUS_OPTIONS,
  getPerformanceEvalStatusText,
  getPerformanceEvalStatusColor,
  getReplacementStatusText,
  getReplacementStatusColor,
  getReworkStatusText,
  getReworkStatusColor,
  getScrapStatusText,
  getScrapStatusColor,

  INVENTORY_CHECK_STATUS_OPTIONS,
  VALIDATION_RULES, BUSINESS_RULES, INVENTORY_TRANSACTION_GROUPS,
  isIncreaseTransaction, isDecreaseTransaction, isTransferTransaction, isValidStatusTransition, generateStatusCaseSQL
};
