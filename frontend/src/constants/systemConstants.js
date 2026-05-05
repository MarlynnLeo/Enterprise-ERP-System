/**
 * systemConstants.js
 * 新版系统统一常量配置 (依赖于后端系统字典)
 * 该文件通过全局缓存进行无缝衔接
 */

import { reactive, watchEffect } from 'vue';
import { useDictionaryStore } from '@/stores/dictionary';
import { startCase } from 'lodash';

// =======================
// 后端字典缺省容灾配置 (FALLBACK)
// =======================
// 防御性编程：在面临新部署、后端升级数据丢失或外网波动时兜底显示
const FALLBACK_DICTIONARY = {
  production_status: {
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
        types.forEach(t => { state[t.code] = t.tag_type; });
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
export const PRODUCTION_STATUS = createDictionaryGroup('production_status');
export const PRODUCTION_STATUS_COLORS = createDictionaryColors('production_status');
export const EQUIPMENT_STATUS = createDictionaryGroup('equipment_status');
export const EQUIPMENT_STATUS_COLORS = createDictionaryColors('equipment_status');
export const COMMON_STATUS = createDictionaryGroup('common_status');
export const COMMON_STATUS_COLORS = createDictionaryColors('common_status');
export const FINANCE_TRANSACTION_TYPES = createDictionaryGroup('finance_transaction_type');
export const FINANCE_TRANSACTION_COLORS = createDictionaryColors('finance_transaction_type');
export const COSTING_METHOD = createDictionaryGroup('costing_method');
export const GL_TRANSACTION_TYPES = createDictionaryGroup('gl_transaction_type');
export const GL_TRANSACTION_COLORS = createDictionaryColors('gl_transaction_type');
export const PRIORITY_LEVELS = createDictionaryGroup('priority_level');
export const PRIORITY_COLORS = createDictionaryColors('priority_level');
export const APPROVAL_STATUS = createDictionaryGroup('approval_status');
export const APPROVAL_STATUS_COLORS = createDictionaryColors('approval_status');
export const USER_STATUS = createDictionaryGroup('user_status');
export const USER_STATUS_COLORS = createDictionaryColors('user_status');
export const ASSET_STATUS = createDictionaryGroup('asset_status');
export const ASSET_STATUS_COLORS = createDictionaryColors('asset_status');
export const ASSET_TYPES = createDictionaryGroup('asset_type');

// =======================
// OPTIONS 选项数组导出 (供 el-select 使用)
// =======================
// 向后兼容，如果需要在 <script setup> 内获得选项数组，建议直接调用 useDictionaryStore().getOptions(groupCode)

const createOptions = (groupCode, filterKeys = null) => {
  const state = reactive([]);
  watchEffect(() => {
    try {
      const store = useDictionaryStore();
      if (store.isLoaded) {
        state.splice(0, state.length); // clear array
        let opts = store.getOptions(groupCode);
        if (filterKeys) {
          opts = opts.filter(opt => filterKeys.includes(opt.value));
        }
        state.push(...opts);
      }
    } catch {}
  });
  return state;
};

export const INVENTORY_CHECK_STATUS_OPTIONS = createOptions('inventory_check_status');
export const PURCHASE_STATUS_OPTIONS = createOptions('purchase_status', ['draft', 'pending', 'approved', 'confirmed', 'received', 'inspecting', 'inspected', 'warehousing', 'partial_received', 'completed', 'cancelled']);
export const OUTSOURCED_STATUS_OPTIONS = createOptions('outsourced_status');
export const PURCHASE_RECEIPT_STATUS_OPTIONS = createOptions('purchase_receipt_status');
export const PURCHASE_RETURN_STATUS_OPTIONS = createOptions('purchase_return_status');
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
  INCREASE: ['inbound', 'in', 'purchase_inbound', 'production_inbound', 'outsourced_inbound', 'sales_return', 'sales_exchange_return', 'transfer_in', 'adjustment_in', 'initial_import', 'correction', 'outbound_cancel'],
  DECREASE: ['outbound', 'out', 'production_outbound', 'outsourced_outbound', 'sale', 'sales_outbound', 'sales_exchange_out', 'transfer_out', 'adjustment_out', 'purchase_return'],
  TRANSFER: ['transfer', 'transfer_in', 'transfer_out']
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
  try { 
    const storeObj = useDictionaryStore();
    // 强制触发响应式依赖追踪：直接读取 storeObj.groups 的内容
    // 并且读取 storeObj.isLoaded
    const isLoaded = storeObj.isLoaded;
    const groups = storeObj.groups;
    const groupData = groups[group] || [];
    
    // 查找字典项
    const item = groupData.find(i => i.code === code);
    
    if (item) {
      return item.name;
    }
    
    // 如果还没加载完或者没找到，尝试 fallback
    if (FALLBACK_DICTIONARY[group] && FALLBACK_DICTIONARY[group][code]) {
      // 容错时打印 warn 
      if (isLoaded) {
        console.warn(`[Dictionary Warning]: Fallback used for missing key '${code}' in '${group}'`);
      }
      return FALLBACK_DICTIONARY[group][code].name;
    }
    
    return startCase(code);
  } catch { 
    return startCase(code); 
  } 
};

const getColor = (group, code) => { 
  if (!code) return 'info';
  
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
    
    // （优先按 code，且优先获取后端发来的 tag_type）
    const item = groupData.find(i => i.code === code || i.name === code);
    if (item && item.tag_type && item.tag_type !== 'info') {
      return item.tag_type;
    }

    // 3. Fallback 到硬编码配置
    if (FALLBACK_DICTIONARY[group] && FALLBACK_DICTIONARY[group][code]) {
      return FALLBACK_DICTIONARY[group][code].color || 'info';
    }
  } catch {} 
  
  // 4. 终极智能语义匹配，保证全系统所有“已完成”等无论出于哪个界面的哪个模块，必定为统一样式
  const lowerCode = String(code).toLowerCase().trim();
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
export const getInventoryStatusText = (code) => getText('inventory_status', code);
export const getInventoryStatusColor = (code) => getColor('inventory_status', code);
export const getInboundOutboundStatusText = (code) => getText('inbound_outbound_status', code);
export const getInboundOutboundStatusColor = (code) => getColor('inbound_outbound_status', code);
export const getTransferStatusText = (code) => getText('transfer_status', code);
export const getTransferStatusColor = (code) => getColor('transfer_status', code);
export const getOrderStatusText = (code) => getText('order_status', code);
export const getOrderStatusColor = (code) => getColor('order_status', code);
export const getPurchaseStatusText = (code) => getText('purchase_status', code);
export const getPurchaseStatusColor = (code) => getColor('purchase_status', code);
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

// 额外补充特定 API
export const isValidStatusTransition = () => true; 
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
  getPurchaseStatusText,
  getPurchaseStatusColor,
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
  getFirstArticleResultText,
  getFirstArticleResultColor,
  PRODUCTION_STATUS,
  PRODUCTION_STATUS_COLORS,
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

  INVENTORY_CHECK_STATUS_OPTIONS,
  VALIDATION_RULES, BUSINESS_RULES, INVENTORY_TRANSACTION_GROUPS,
  isIncreaseTransaction, isDecreaseTransaction, isTransferTransaction, isValidStatusTransition, generateStatusCaseSQL
};
