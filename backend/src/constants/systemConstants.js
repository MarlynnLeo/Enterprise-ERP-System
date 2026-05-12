/**
 * 系统统一常量配置 - 后端兼容版本
 *
 * 此文件重新导向到前端的统一常量文件，确保前后端使用相同的常量定义
 *
 * 注意：
 * 1. 前端文件包含了所有常量定义（共享 + 前端专用 + 后端专用）
 * 2. 此文件仅作为后端的兼容层，将ES6模块转换为CommonJS模块
 * 3. 后端只使用共享常量和后端专用常量，忽略前端专用的颜色映射
 *
 * @author 系统开发团队
 * @version 2.0.0 - 重构为统一常量文件
 * @since 2025-08-13
 */

// 由于Node.js环境限制，我们需要手动导入前端常量文件的内容
// 这里包含了所有后端需要的常量定义

// ==================== 仓库/库位类型映射 ====================
const WAREHOUSE_TYPES = {
  // 仓库类型
  warehouse: '仓库',
  material: '原料仓',
  wip: '在制品仓',
  product: '成品仓',
  finished_goods: '成品库',
  component: '零部件库',
  defect: '次品库',
  quarantine: '隔离仓',
  scrap: '报废仓',

  // 库位类型
  production: '生产区',
  staging: '暂存区',
  shipping: '发货区',
  receiving: '收货区',
  quality: '质检区',
  return: '退货区',
  other: '其他',
};

/**
 * 获取仓库类型的中文名称
 * @param {string} type - 仓库类型
 * @returns {string} 中文名称
 */
const getWarehouseTypeText = (type) => {
  return WAREHOUSE_TYPES[type] || type || '仓库';
};

// ==================== 库存事务类型映射 ====================
// ⚠️ 已废弃：此常量已迁移到数据库 business_types 表
// 请使用 BusinessTypeService 服务动态获取业务类型
// 保留此常量仅用于向后兼容，建议逐步迁移到新服务
const INVENTORY_TRANSACTION_TYPES = {
  // 基础类型
  inbound: '生产入库',
  outbound: '生产出库',
  in: '生产入库',
  out: '生产出库',

  // 调拨类型
  transfer: '调拨',
  transfer_in: '调拨入库',
  transfer_out: '调拨出库',

  // 业务类型
  purchase_inbound: '采购入库',
  purchase_return: '采购退货',
  production_inbound: '生产入库',
  production_outbound: '生产出库',
  production_return: '生产退料',
  defective_return: '不良退回',
  outsourced_inbound: '委外入库',
  outsourced_outbound: '委外出库',
  outsourced_return: '外协退料',
  sale: '销售出库',
  sales_outbound: '销售出库',
  sales_return: '销售退货',
  sales_exchange_return: '销售换退',
  sales_exchange_out: '销售换出',

  // 管理类型
  check: '盘点',
  adjust: '调整',
  adjustment: '库存调整',
  adjustment_in: '调整入库',
  adjustment_out: '调整出库',
  outbound_cancel: '撤销出库',
  initial_import: '初始导入',
  manual_adjustment: '手动调整',
  manual_in: '手工入库',
  manual_out: '手工出库',
  correction: '纠正',
  other: '其他',
};

// 库存事务类型分组（用于业务逻辑判断）
const INVENTORY_TRANSACTION_GROUPS = {
  // 增加库存的类型
  INCREASE: [
    'inbound',
    'in',
    'transfer_in',
    'purchase_inbound',
    'production_inbound',
    'production_return',
    'outsourced_inbound',
    'outsourced_return',
    'outbound_cancel',
  ],
  // 减少库存的类型
  DECREASE: [
    'outbound',
    'out',
    'transfer_out',
    'production_outbound',
    'outsourced_outbound',
    'sale',
    'sales_outbound',
  ],
  // 调拨相关类型
  TRANSFER: ['transfer', 'transfer_in', 'transfer_out'],
  // 调整类型
  ADJUSTMENT: ['check', 'adjust', 'adjustment', 'correction'],
};

// ==================== 入库单类型 ====================
const INBOUND_TYPES = {
  purchase: '采购入库',
  production: '生产入库',
  production_return: '生产退料',
  defective_return: '不良退回',
  outsourced: '委外入库',
  sales_return: '销售退货入库',
  other: '其他入库',
};

// ==================== 调拨单状态映射 ====================
const TRANSFER_STATUS = {
  draft: '草稿',
  pending: '待审核',
  approved: '已审核',
  in_transit: '运输中',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝',
};

// 调拨单状态流转规则
const TRANSFER_STATUS_FLOW = {
  draft: ['pending', 'cancelled'],
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['in_transit', 'cancelled'],
  in_transit: ['completed', 'cancelled'],
  completed: [], // 终态
  cancelled: [], // 终态
  rejected: ['draft'], // 可以重新提交
};

// ==================== 订单状态映射 ====================
const ORDER_STATUS = {
  draft: '草稿',
  pending: '待确认',
  confirmed: '已确认',
  in_production: '生产中',
  ready_to_ship: '待发货',
  shipped: '已发货',
  delivered: '已交付',
  completed: '已完成',
  cancelled: '已取消',
};

// 订单状态流转规则
const ORDER_STATUS_FLOW = {
  draft: ['pending', 'cancelled'],
  pending: ['confirmed', 'cancelled'],
  confirmed: ['in_production', 'cancelled'],
  in_production: ['ready_to_ship', 'cancelled'],
  ready_to_ship: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['completed'],
  completed: [], // 终态
  cancelled: [], // 终态
};

// ==================== 质量检验状态映射 ====================
const QUALITY_STATUS = {
  pending: '待检验',
  in_progress: '检验中',
  passed: '合格',
  failed: '不合格',
  rework: '返工',
  review: '复检',
  partial: '部分合格',
  cancelled: '已取消',
};

// ==================== 采购状态映射 ====================
const PURCHASE_STATUS = {
  draft: '草稿',
  pending: '待处理',
  submitted: '待审批',
  approved: '已批准',
  confirmed: '已确认',
  processing: '处理中',
  partial_received: '部分收货',
  completed: '已完成',
  cancelled: '已取消',
  rejected: '已拒绝',
};

// ==================== 销售状态映射 ====================
const SALES_STATUS = {
  draft: '草稿',
  pending: '待处理',
  confirmed: '已确认',
  processing: '处理中',
  in_production: '生产中',
  in_procurement: '采购中',
  ready_to_ship: '可发货',
  shortage: '缺料', // 表示订单有缺料
  partial_shipped: '部分发货',
  shipped: '已发货',
  delivered: '已交付',
  completed: '已完成',
  cancelled: '已取消',
};

// ==================== 订单锁定状态 ====================
const ORDER_LOCK_STATUS = {
  unlocked: '未锁定',
  locked: '已锁定',
};

// ==================== 库存盘点状态映射 ====================
const INVENTORY_CHECK_STATUS = {
  draft: '草稿',
  in_progress: '进行中',
  pending: '待审核',
  completed: '已完成',
  cancelled: '已取消',
};

// ==================== 生产状态映射 ====================
const PRODUCTION_STATUS = {
  // 基础状态
  draft: '未开始',
  planned: '已计划',
  ready: '准备就绪',
  pending: '待处理',

  // 准备阶段
  allocated: '分配中',
  preparing: '配料中',
  material_issuing: '发料中',
  material_issued: '已发料',
  materials_issued: '已发料',

  // 生产阶段
  in_progress: '生产中',
  inProgress: '生产中',
  processing: '生产中',
  wip: '生产中',
  doing: '生产中',
  started: '生产中',
  paused: '暂停',

  // 完成阶段
  inspection: '待检验',
  warehousing: '入库中',
  completed: '已完成',
  done: '已完成',
  finished: '已完成',

  // 取消状态
  cancelled: '已取消',
  cancel: '已取消',
};

// 生产计划状态流转规则
const PRODUCTION_PLAN_STATUS_FLOW = {
  draft: ['allocated', 'material_issuing', 'cancelled'], // 草稿 → 分配中 | 发料中 | 已取消
  allocated: ['material_issuing', 'cancelled'], // 分配中 → 发料中 | 已取消
  material_issuing: ['preparing', 'material_issued', 'cancelled'], // 发料中 → 配料中 | 已发料 | 已取消
  preparing: ['material_issued', 'in_progress', 'cancelled'], // 配料中 → 已发料 | 生产中 | 已取消
  material_issued: ['in_progress', 'cancelled'], // 已发料 → 生产中 | 已取消
  in_progress: ['inspection', 'paused', 'cancelled'], // 生产中 → 检验中 | 已暂停 | 已取消
  paused: ['in_progress', 'cancelled'], // 已暂停 → 恢复生产 | 已取消
  inspection: ['warehousing', 'cancelled'], // 检验中 → 入库中 | 已取消
  warehousing: ['completed'], // 入库中 → 已完成
  completed: [], // 已完成（终态）
  cancelled: [], // 已取消（终态）
};

// 生产任务状态流转规则
const PRODUCTION_TASK_STATUS_FLOW = {
  pending: ['allocated', 'material_issuing', 'cancelled'], // 待处理 → 分配中 | 发料中 | 已取消
  allocated: ['material_issuing', 'cancelled'], // 分配中 → 发料中 | 已取消
  material_issuing: ['preparing', 'material_issued', 'cancelled'], // 发料中 → 配料中 | 已发料 | 已取消
  preparing: ['material_issued', 'material_partial_issued', 'in_progress', 'cancelled'], // 配料中 → 已发料 | 部分发料 | 生产中 | 已取消
  material_issued: ['in_progress', 'cancelled'], // 已发料 → 生产中 | 已取消
  material_partial_issued: ['in_progress', 'cancelled'], // 部分发料 → 生产中 | 已取消
  in_progress: ['inspection', 'paused', 'cancelled'], // 生产中 → 待检验 | 已暂停 | 已取消
  paused: ['in_progress', 'cancelled'], // 已暂停 → 恢复生产 | 已取消
  inspection: ['in_progress', 'warehousing', 'cancelled'], // 待检验 → 检验中(in_progress) | 入库中 | 已取消
  warehousing: ['completed'], // 入库中 → 已完成
  completed: [], // 已完成（终态）
  cancelled: [], // 已取消（终态）
};

// 生产工序状态流转规则
const PRODUCTION_PROCESS_STATUS_FLOW = {
  pending: ['in_progress', 'cancelled'], // 待处理 → 进行中 | 已取消
  in_progress: ['completed', 'cancelled'], // 进行中 → 已完成 | 已取消
  completed: [], // 已完成（终态）
  cancelled: [], // 已取消（终态）
};

// ==================== 设备状态映射 ====================
const EQUIPMENT_STATUS = {
  running: '运行中',
  idle: '空闲',
  maintenance: '维护中',
  fault: '故障',
  offline: '离线',
};

// ==================== 通用状态映射 ====================
const COMMON_STATUS = {
  active: '启用',
  inactive: '禁用',
  enabled: '启用',
  disabled: '禁用',
  normal: '正常',
  abnormal: '异常',
  online: '在线',
  offline: '离线',
  valid: '有效',
  invalid: '无效',
  available: '可用',
  unavailable: '不可用',
  locked: '锁定',
  unlocked: '解锁',
};

// ==================== 财务交易类型映射 ====================
const FINANCE_TRANSACTION_TYPES = {
  income: '收入',
  expense: '支出',
  transfer: '转账',
  deposit: '存款',
  withdrawal: '取款',
  interest: '利息',
  fee: '费用',
};

// ==================== 优先级映射 ====================
const PRIORITY_LEVELS = {
  low: '低',
  normal: '普通',
  high: '高',
  urgent: '紧急',
  critical: '严重',
};

// ==================== 审批状态映射 ====================
const APPROVAL_STATUS = {
  draft: '草稿',
  pending: '待审批',
  approved: '已审批',
  rejected: '已拒绝',
  cancelled: '已取消',
};

// ==================== 用户状态映射 ====================
const USER_STATUS = {
  active: '正常',
  inactive: '禁用',
  disabled: '禁用',
  enabled: '启用',
  pending: '待激活',
  locked: '锁定',
  online: '在线',
  offline: '离线',
};

// ==================== 资产状态映射 ====================
const ASSET_STATUS = {
  in_use: '在用',
  idle: '闲置',
  under_repair: '维修',
  disposed: '报废',
  sold: '已处置',
};

// ==================== 资产类型映射 ====================
const ASSET_TYPES = {
  machine: '机器设备',
  electronic: '电子设备',
  furniture: '办公家具',
  building: '房屋建筑',
  vehicle: '车辆',
  other: '其他',
};

// ==================== 折旧方法映射 ====================
const DEPRECIATION_METHODS = {
  straight_line: '直线法',
  double_declining: '双倍余额递减法',
  sum_of_years: '年数总和法',
  units_of_production: '工作量法',
  no_depreciation: '不计提',
};

// ==================== 系统状态映射 ====================
const SYSTEM_STATUS = {
  running: '运行正常',
  maintenance: '维护中',
  error: '异常',
  stopped: '已停止',
};

// ==================== 数据验证规则 ====================
const VALIDATION_RULES = {
  // 库存数量验证
  STOCK_QUANTITY: {
    min: 0,
    max: 999999999,
    precision: 3, // 小数点后3位
  },

  // 金额验证
  AMOUNT: {
    min: 0,
    max: 999999999.99,
    precision: 2, // 小数点后2位
  },

  // 编码长度验证
  CODE_LENGTH: {
    min: 1,
    max: 50,
  },

  // 名称长度验证
  NAME_LENGTH: {
    min: 1,
    max: 100,
  },

  // 备注长度验证
  REMARK_LENGTH: {
    min: 0,
    max: 500,
  },
};

// ==================== 业务规则配置 ====================
// 注意：业务规则配置已迁移到 config/businessRulesConfig.js
// 为了向后兼容，这里从配置服务导入
// 建议直接使用 businessRulesConfig.getConfig() 获取最新配置
const { businessRulesConfig } = require('../config/businessRulesConfig');

// 获取业务规则配置（支持数据库动态配置）
const BUSINESS_RULES = {
  // 首检相关（保留在这里是因为是系统常量，不需要动态配置）
  FIRST_ARTICLE: {
    // 默认首检数量
    DEFAULT_QTY: 5,
    // 默认全检阈值（生产数量小于此值时全检）
    DEFAULT_FULL_INSPECTION_THRESHOLD: 5,
    // 默认单位
    DEFAULT_UNIT: '个',
    // 检验单号前缀
    INSPECTION_NO_PREFIX: 'FAI',
    // 批次号前缀
    BATCH_NO_PREFIX: 'BATCH',
  },

  // 其他业务规则从配置服务获取
  // 使用 Proxy 实现动态获取
  get INVENTORY() {
    return businessRulesConfig.getConfig().inventory;
  },
  get ORDER() {
    return businessRulesConfig.getConfig().order;
  },
  get PRODUCTION() {
    return businessRulesConfig.getConfig().production;
  },
};

// ==================== 工具函数 ====================

/**
 * 获取库存事务类型的中文名称
 * @param {string} type - 事务类型
 * @returns {string} 中文名称
 */
const getInventoryTransactionTypeText = (type) => {
  return INVENTORY_TRANSACTION_TYPES[type] || type;
};

/**
 * 判断事务类型是否增加库存
 * @param {string} type - 事务类型
 * @returns {boolean} 是否增加库存
 */
const isIncreaseTransaction = (type) => {
  return INVENTORY_TRANSACTION_GROUPS.INCREASE.includes(type);
};

/**
 * 判断事务类型是否减少库存
 * @param {string} type - 事务类型
 * @returns {boolean} 是否减少库存
 */
const isDecreaseTransaction = (type) => {
  return INVENTORY_TRANSACTION_GROUPS.DECREASE.includes(type);
};

/**
 * 判断事务类型是否为调拨相关
 * @param {string} type - 事务类型
 * @returns {boolean} 是否为调拨相关
 */
const isTransferTransaction = (type) => {
  return INVENTORY_TRANSACTION_GROUPS.TRANSFER.includes(type);
};

/**
 * 获取调拨单状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getTransferStatusText = (status) => {
  return TRANSFER_STATUS[status] || status;
};

/**
 * 验证状态流转是否合法
 * @param {string} fromStatus - 原状态
 * @param {string} toStatus - 目标状态
 * @param {string} type - 类型（transfer, order等）
 * @returns {boolean} 是否合法
 */
const isValidStatusTransition = (fromStatus, toStatus, type = 'transfer') => {
  const flowMap = {
    transfer: TRANSFER_STATUS_FLOW,
    order: ORDER_STATUS_FLOW,
  };

  const flow = flowMap[type];
  if (!flow || !flow[fromStatus]) {
    return false;
  }

  return flow[fromStatus].includes(toStatus);
};

/**
 * 获取订单状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getOrderStatusText = (status) => {
  return ORDER_STATUS[status] || status;
};

/**
 * 获取通用状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getCommonStatusText = (status) => {
  return COMMON_STATUS[status] || status;
};

/**
 * 获取生产状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getProductionStatusText = (status) => {
  return PRODUCTION_STATUS[status] || status;
};

/**
 * 获取质量检验状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getQualityStatusText = (status) => {
  return QUALITY_STATUS[status] || status;
};

/**
 * 获取采购状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getPurchaseStatusText = (status) => {
  return PURCHASE_STATUS[status] || status;
};

/**
 * 获取销售状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getSalesStatusText = (status) => {
  return SALES_STATUS[status] || status;
};

/**
 * 获取审批状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getApprovalStatusText = (status) => {
  return APPROVAL_STATUS[status] || status;
};

/**
 * 获取用户状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getUserStatusText = (status) => {
  return USER_STATUS[status] || status;
};

/**
 * 获取资产状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getAssetStatusText = (status) => {
  return ASSET_STATUS[status] || status;
};

/**
 * 获取资产类型的中文名称
 * @param {string} type - 资产类型
 * @returns {string} 中文名称
 */
const getAssetTypeText = (type) => {
  return ASSET_TYPES[type] || type;
};

/**
 * 获取折旧方法的中文名称
 * @param {string} method - 折旧方法
 * @returns {string} 中文名称
 */
const getDepreciationMethodText = (method) => {
  return DEPRECIATION_METHODS[method] || method;
};

/**
 * 获取设备状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getEquipmentStatusText = (status) => {
  return EQUIPMENT_STATUS[status] || status;
};

/**
 * 获取系统状态的中文名称
 * @param {string} status - 状态
 * @returns {string} 中文名称
 */
const getSystemStatusText = (status) => {
  return SYSTEM_STATUS[status] || status;
};

/**
 * 生成SQL CASE语句用于状态映射
 * @param {string} field - 字段名
 * @param {Object} mapping - 映射对象
 * @param {string} alias - 别名
 * @returns {string} SQL CASE语句
 */
const generateStatusCaseSQL = (field, mapping, alias = 'status_text') => {
  const cases = Object.entries(mapping)
    .map(([key, value]) => `WHEN ${field} = '${key}' THEN '${value}'`)
    .join(' ');

  return `CASE ${cases} ELSE ${field} END as ${alias}`;
};

// ==================== 反向提取大写Key枚举 (为后端提供硬编码消纳) ====================
/**
 * 提取对象的所有 Key 并将其转化为大写形式，值仍为原先的英文 Key
 * 用于消除系统随处可见的硬编码（如将 status = 'draft' 替换为主控字典）
 */
const createKeys = (obj) => {
  const keys = {};
  for (const key in obj) {
    keys[key.toUpperCase()] = key;
  }
  return keys;
};

const TRANSFER_STATUS_KEYS = createKeys(TRANSFER_STATUS);
const ORDER_STATUS_KEYS = createKeys(ORDER_STATUS);
const QUALITY_STATUS_KEYS = createKeys(QUALITY_STATUS);
const PURCHASE_STATUS_KEYS = createKeys(PURCHASE_STATUS);
const SALES_STATUS_KEYS = createKeys(SALES_STATUS);
const INVENTORY_CHECK_STATUS_KEYS = createKeys(INVENTORY_CHECK_STATUS);
const PRODUCTION_STATUS_KEYS = createKeys(PRODUCTION_STATUS);
const EQUIPMENT_STATUS_KEYS = createKeys(EQUIPMENT_STATUS);
const COMMON_STATUS_KEYS = createKeys(COMMON_STATUS);
const FINANCE_TRANSACTION_TYPES_KEYS = createKeys(FINANCE_TRANSACTION_TYPES);
const APPROVAL_STATUS_KEYS = createKeys(APPROVAL_STATUS);
const USER_STATUS_KEYS = createKeys(USER_STATUS);
const ASSET_STATUS_KEYS = createKeys(ASSET_STATUS);
const ASSET_TYPES_KEYS = createKeys(ASSET_TYPES);
const SYSTEM_STATUS_KEYS = createKeys(SYSTEM_STATUS);

// ==================== 导出 ====================
module.exports = {
  // 常量定义
  WAREHOUSE_TYPES,
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_TRANSACTION_GROUPS,
  INBOUND_TYPES,
  INVENTORY_CHECK_STATUS,
  TRANSFER_STATUS,
  TRANSFER_STATUS_FLOW,
  ORDER_STATUS,
  ORDER_STATUS_FLOW,
  PURCHASE_STATUS,
  SALES_STATUS,
  ORDER_LOCK_STATUS,
  QUALITY_STATUS,
  PRODUCTION_STATUS,
  PRODUCTION_PLAN_STATUS_FLOW,
  PRODUCTION_TASK_STATUS_FLOW,
  PRODUCTION_PROCESS_STATUS_FLOW,
  EQUIPMENT_STATUS,
  COMMON_STATUS,
  FINANCE_TRANSACTION_TYPES,
  PRIORITY_LEVELS,
  APPROVAL_STATUS,
  USER_STATUS,
  ASSET_STATUS,
  ASSET_TYPES,
  DEPRECIATION_METHODS,
  SYSTEM_STATUS,
  VALIDATION_RULES,
  BUSINESS_RULES,

  // 工具函数
  getWarehouseTypeText,
  getInventoryTransactionTypeText,
  isIncreaseTransaction,
  isDecreaseTransaction,
  isTransferTransaction,
  getTransferStatusText,
  isValidStatusTransition,
  getOrderStatusText,
  getPurchaseStatusText,
  getSalesStatusText,
  getQualityStatusText,
  getProductionStatusText,
  getApprovalStatusText,
  getUserStatusText,
  getAssetStatusText,
  getAssetTypeText,
  getDepreciationMethodText,
  getEquipmentStatusText,
  getSystemStatusText,
  getCommonStatusText,
  generateStatusCaseSQL,

  // Soft-coding Keys
  TRANSFER_STATUS_KEYS,
  ORDER_STATUS_KEYS,
  QUALITY_STATUS_KEYS,
  PURCHASE_STATUS_KEYS,
  SALES_STATUS_KEYS,
  INVENTORY_CHECK_STATUS_KEYS,
  PRODUCTION_STATUS_KEYS,
  EQUIPMENT_STATUS_KEYS,
  COMMON_STATUS_KEYS,
  FINANCE_TRANSACTION_TYPES_KEYS,
  APPROVAL_STATUS_KEYS,
  USER_STATUS_KEYS,
  ASSET_STATUS_KEYS,
  ASSET_TYPES_KEYS,
  SYSTEM_STATUS_KEYS,
};
