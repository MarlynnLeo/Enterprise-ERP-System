/**
 * API 服务层 — 统一导出入口
 * @description 所有 API 模块从此文件 re-export，保持现有 import 路径兼容
 * @date 2025-12-27
 * @version 2.1.0 — 拆分为 client + modules 结构
 */

// Axios 实例（默认导出）
export { default } from './client'

// 业务 API 模块
export { inventoryApi } from './modules/inventory'
export { productionApi } from './modules/production'
export { salesApi } from './modules/sales'
export { purchaseApi } from './modules/purchase'
export { baseDataApi } from './modules/baseData'
export { financeApi } from './modules/finance'
export { qualityApi } from './modules/quality'
export { equipmentApi } from './modules/equipment'
export { hrApi } from './modules/hr'
export { authApi } from './modules/auth'
export { systemApi } from './modules/system'
export { chatApi } from './modules/chat'
export { workflowApi } from './modules/workflow'
