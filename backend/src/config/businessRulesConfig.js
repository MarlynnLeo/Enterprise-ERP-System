/**
 * businessRulesConfig.js
 * @description 业务规则配置管理服务
 * @date 2025-12-13
 * @version 1.0.0
 *
 * 配置优先级：
 * 1. 数据库配置（system_settings表）- 最高优先级
 * 2. 环境变量配置（.env文件）- 中等优先级
 * 3. 默认配置（本文件）- 最低优先级（后备配置）
 */

const { pool } = require('./db');
const { logger } = require('../utils/logger');

// 默认业务规则配置
const DEFAULT_BUSINESS_RULES = {
  // 库存管理规则
  inventory: {
    allowNegativeStock: false, // 是否允许负库存
    lowStockThreshold: 10, // 低库存阈值
    maxTransferQuantity: 999999, // 最大调拨数量
    autoAllocateStock: true, // 是否自动分配库存
    enableBatchTracking: true, // 是否启用批次追踪
    enableSerialNumberTracking: false, // 是否启用序列号追踪
    stockCheckFrequencyDays: 30, // 库存盘点频率（天）
  },

  // 订单管理规则
  order: {
    autoExpireDays: 30, // 订单自动过期天数
    maxOrderItems: 100, // 订单最大明细数
    allowPartialDelivery: true, // 是否允许部分发货
    requireApprovalAmount: 100000, // 需要审批的订单金额阈值
    autoConfirmPayment: false, // 是否自动确认付款
    paymentTermDays: 30, // 默认付款期限（天）
  },

  // 生产管理规则
  production: {
    leadTimeDays: 7, // 默认生产提前期（天）
    maxBatchSize: 10000, // 最大批次数量
    allowOverProduction: true, // 是否允许超产
    overProductionPercentage: 10, // 允许超产百分比
    requireQualityInspection: true, // 是否需要质量检验
    autoCreateWorkOrder: true, // 是否自动创建工单
    enableProcessTracking: true, // 是否启用工序追踪
  },

  // 采购管理规则
  purchase: {
    minOrderAmount: 100, // 最小采购金额
    maxOrderAmount: 1000000, // 最大采购金额
    requireMultipleQuotes: true, // 是否需要多家报价
    minQuotesRequired: 3, // 最少报价数量
    autoCreatePR: false, // 低库存预警是否自动创建采购申请
    // 生产发料/出库缺料完成时，自动按缺料记录生成草稿请购（默认开启，可关）
    autoCreatePROnIssueShortage: true,
    // 缺料请购生成后是否自动提交工作流审批（默认开启；失败则保留 draft 不阻断出库）
    autoSubmitPROnIssueShortage: true,
    leadTimeDays: 15, // 默认采购提前期（天）
  },

  // 质量管理规则
  quality: {
    enableFirstArticleInspection: true, // 是否启用首检
    firstArticleQuantity: 5, // 首检数量
    enableInProcessInspection: true, // 是否启用过程检验
    enableFinalInspection: true, // 是否启用终检
    defectRateThreshold: 0.05, // 不良率阈值（5%）
    autoQuarantine: true, // 是否自动隔离不合格品
    requireReworkApproval: true, // 返工是否需要审批
  },

  // 财务管理规则
  finance: {
    allowNegativeBalance: false, // 是否允许负余额
    enforceBalancedEntry: true, // 是否强制借贷平衡
    amountPrecision: 2, // 金额精度（小数位数）
    autoReconciliation: false, // 是否自动对账
    paymentTermDays: 30, // 默认付款期限（天）
    creditLimitCheckEnabled: true, // 是否启用信用额度检查
  },

  // 审批管理规则
  approval: {
    enableMultiLevelApproval: true, // 是否启用多级审批
    maxApprovalLevels: 5, // 最大审批级数
    autoApproveThreshold: 1000, // 自动审批金额阈值
    approvalTimeoutDays: 7, // 审批超时天数
    enableDelegation: true, // 是否启用审批委托
    requireComment: false, // 是否必须填写审批意见
  },
};

// 配置缓存
let configCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 从数据库加载业务规则配置
 */
async function loadConfigFromDatabase() {
  try {
    const [rows] = await pool.execute('SELECT `value` FROM system_settings WHERE `key` = ?', [
      'business.rules',
    ]);

    if (rows.length > 0 && rows[0].value) {
      const dbConfig =
        typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;

      logger.info('业务规则配置已从数据库加载');
      return dbConfig;
    }
  } catch (error) {
    logger.warn('从数据库加载业务规则配置失败，使用默认配置:', error.message);
  }

  return null;
}

/**
 * 从环境变量加载业务规则配置
 */
function loadConfigFromEnv() {
  const envConfig = {};

  // 库存规则
  if (process.env.BUSINESS_ALLOW_NEGATIVE_STOCK !== undefined) {
    envConfig.inventory = envConfig.inventory || {};
    envConfig.inventory.allowNegativeStock = process.env.BUSINESS_ALLOW_NEGATIVE_STOCK === 'true';
  }
  if (process.env.BUSINESS_LOW_STOCK_THRESHOLD) {
    envConfig.inventory = envConfig.inventory || {};
    envConfig.inventory.lowStockThreshold = parseInt(process.env.BUSINESS_LOW_STOCK_THRESHOLD);
  }

  // 订单规则
  if (process.env.BUSINESS_AUTO_EXPIRE_DAYS) {
    envConfig.order = envConfig.order || {};
    envConfig.order.autoExpireDays = parseInt(process.env.BUSINESS_AUTO_EXPIRE_DAYS);
  }

  // 生产规则
  if (process.env.BUSINESS_LEAD_TIME_DAYS) {
    envConfig.production = envConfig.production || {};
    envConfig.production.leadTimeDays = parseInt(process.env.BUSINESS_LEAD_TIME_DAYS);
  }

  return Object.keys(envConfig).length > 0 ? envConfig : null;
}

/**
 * 深度合并配置对象
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * 获取业务规则配置
 * 配置优先级：数据库 > 环境变量 > 默认配置
 */
async function getBusinessRules() {
  // 检查缓存
  const now = Date.now();
  if (configCache && cacheTimestamp && now - cacheTimestamp < CACHE_TTL) {
    return configCache;
  }

  // 从默认配置开始
  let config = { ...DEFAULT_BUSINESS_RULES };

  // 合并环境变量配置
  const envConfig = loadConfigFromEnv();
  if (envConfig) {
    config = deepMerge(config, envConfig);
  }

  // 合并数据库配置（最高优先级）
  const dbConfig = await loadConfigFromDatabase();
  if (dbConfig) {
    config = deepMerge(config, dbConfig);
  }

  // 更新缓存
  configCache = config;
  cacheTimestamp = now;

  return config;
}

/**
 * 获取特定模块的业务规则
 * @param {string} module - 模块名称（inventory, order, production等）
 */
async function getModuleRules(module) {
  const allRules = await getBusinessRules();
  return allRules[module] || {};
}

/**
 * 清除配置缓存
 */
function clearCache() {
  configCache = null;
  cacheTimestamp = null;
  logger.info('业务规则配置缓存已清除');
}

/**
 * 更新业务规则配置到数据库
 * @param {object} newConfig - 新的配置对象
 */
async function updateBusinessRules(newConfig) {
  try {
    await pool.execute(
      `INSERT INTO system_settings (\`key\`, \`value\`, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = NOW()`,
      ['business.rules', JSON.stringify(newConfig), '业务规则配置']
    );

    // 清除缓存
    clearCache();

    logger.info('业务规则配置已更新到数据库');
    return true;
  } catch (error) {
    logger.error('更新业务规则配置失败:', error);
    throw error;
  }
}

// 导出配置和方法
module.exports = {
  DEFAULT_BUSINESS_RULES,
  getBusinessRules,
  getModuleRules,
  clearCache,
  updateBusinessRules,
};
