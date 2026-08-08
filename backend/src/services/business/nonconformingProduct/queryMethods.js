/**
 * NonconformingProductService — query methods (mixin)
 * @module nonconformingProduct/queryMethods
 */

const runtime = require('./runtime');
const {
  NonconformingProduct,
  logger,
  businessConfig,
  firstValidUserId,
  QualityIntegrationService,
  NotificationService,
  resolveActorLabel,
  resolveActorUserId,
  STATUS,
  VALID_DISPOSITIONS,
  SUPPLIER_REQUIRED_DISPOSITIONS,
  normalizeNumber,
  validateDispositionPayload,
  AUTO_DISPOSITION_RULES,
  AUTO_DISPOSITION_CONFIG,
} = runtime;


module.exports = {
  /**
     * Get NCP list with filters
     */
    async getList(params) {
      try {
        return await NonconformingProduct.getList(params);
      } catch (error) {
        logger.error('Failed to get NCP list:', error);
        throw error;
      }
    },

  /**
     * 获取自动处理配置
     */
    getAutoDispositionConfig() {
      return {
        ...AUTO_DISPOSITION_CONFIG,
        rules: Object.keys(AUTO_DISPOSITION_RULES).map((key) => ({
          name: key,
          ...AUTO_DISPOSITION_RULES[key],
        })),
      };
    },

  /**
     * 更新自动处理配置
     */
    updateAutoDispositionConfig(config) {
      if (config.enable !== undefined) {
        AUTO_DISPOSITION_CONFIG.enable = config.enable;
      }
      if (config.auto_complete !== undefined) {
        AUTO_DISPOSITION_CONFIG.auto_complete = config.auto_complete;
      }
      if (config.notify_users !== undefined) {
        AUTO_DISPOSITION_CONFIG.notify_users = config.notify_users;
      }
  
      logger.info('Auto disposition config updated', AUTO_DISPOSITION_CONFIG);
      return AUTO_DISPOSITION_CONFIG;
    },

  /**
     * Get NCP details
     */
    async getDetails(ncpId) {
      try {
        const ncp = await NonconformingProduct.getById(ncpId);
        if (!ncp) {
          throw new Error('NCP not found');
        }
  
        const actions = await NonconformingProduct.getActions(ncpId);
  
        return {
          ...ncp,
          actions,
        };
      } catch (error) {
        logger.error('Failed to get NCP details:', error);
        throw error;
      }
    },
};
