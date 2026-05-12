/**
 * 质量相关服务
 * 注意：旧版 /quality/traceability/* 路由已废弃
 * 追溯功能已迁移至 InventoryTraceabilityService 和 BatchManagementService
 * 此服务保留为兼容适配层
 */
const { logger } = require('../../utils/logger');

// 质量API服务（兼容适配层）
const qualityApi = {
  // 自动创建追溯记录 — 新架构已通过 batch_relationships 自动管理
  autoCreateTraceability: async (triggerType, _data) => {
    logger.info(`[QualityService] 追溯记录已由 batch_relationships 自动管理, triggerType=${triggerType}`);
    return { success: true, message: '新架构已自动管理追溯' };
  },

  // 获取全链路追溯数据 — 已迁移至 InventoryTraceabilityService.getBatchTraceabilityChain
  getFullTraceability: async (type, code, batchNumber) => {
    try {
      const InventoryTraceabilityService = require('./InventoryTraceabilityService');
      return await InventoryTraceabilityService.getBatchTraceabilityChain(code, batchNumber, 'forward');
    } catch (error) {
      logger.error('获取全链路追溯数据失败:', error);
      throw error;
    }
  },

  // 自动生成所有可能的追溯记录 — 新架构不再需要
  autoGenerateAllTraceability: async () => {
    logger.info('[QualityService] 新架构已通过 batch_relationships 自动管理追溯，无需手动生成');
    return { success: true, message: '新架构已自动管理追溯', count: 0 };
  },
};

module.exports = {
  qualityApi,
};
