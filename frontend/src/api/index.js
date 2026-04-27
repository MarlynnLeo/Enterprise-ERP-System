/**
 * API统一入口文件
 * 重新导出所有API模块，保持向后兼容
 */

// 从services/api.js重新导出所有实际存在的API
export { 
  api,
  fastApi,
  salesApi,
  baseDataApi,
  inventoryApi,
  productionApi,
  purchaseApi,
  supplierApi,
  materialApi,
  qualityApi,
  userApi,
  todoApi,
  financeApi,
  commonApi,
  metalPricesApi,
  systemApi,
  equipmentApi,
  workflowApi,
  contractApi,
  mrpApi,
  codingRuleApi,
  docLinkApi,
  exchangeRateApi,
  performanceApi,
  ecnApi,
  documentApi,
  alertApi
} from '../services/api.js';

// 默认导出主API实例
export { api as default } from '../services/api.js';
