/**
 * 财务设置控制器
 * 用于管理财务模块的系统配置
 */

const { financeConfig, DEFAULT_FINANCE_CONFIG } = require('../../../config/financeConfig');
const { ResponseHandler } = require('../../../utils/responseHandler');
const db = require('../../../config/db');
const { logger } = require('../../../utils/logger');

/**
 * 获取财务配置
 */
const getSettings = async (req, res) => {
  try {
    // 从数据库加载最新配置
    await financeConfig.loadFromDatabase(db);
    const config = financeConfig.getAll();

    ResponseHandler.success(res, config, '获取财务配置成功');
  } catch (error) {
    logger.error('获取财务配置失败:', error);
    ResponseHandler.error(res, '获取财务配置失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 更新财务配置
 */
const updateSettings = async (req, res) => {
  try {
    const newConfig = req.body;

    // 验证配置
    if (!newConfig || typeof newConfig !== 'object') {
      return ResponseHandler.error(res, '无效的配置数据', 'BAD_REQUEST', 400);
    }

    // 加载现有配置
    await financeConfig.loadFromDatabase(db);

    // 合并配置
    const mergedConfig = financeConfig.deepMerge(financeConfig.getAll(), newConfig);

    // 保存到数据库
    await financeConfig.saveToDatabase(db, mergedConfig);

    // 重新加载配置
    financeConfig.clearCache();
    await financeConfig.loadFromDatabase(db);

    ResponseHandler.success(res, financeConfig.getAll(), '财务配置已更新');
  } catch (error) {
    logger.error('更新财务配置失败:', error);
    ResponseHandler.error(res, '更新财务配置失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取默认配置
 */
const getDefaultSettings = async (req, res) => {
  try {
    ResponseHandler.success(res, DEFAULT_FINANCE_CONFIG, '获取默认配置成功');
  } catch (error) {
    logger.error('获取默认配置失败:', error);
    ResponseHandler.error(res, '获取默认配置失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 重置为默认配置
 */
const resetSettings = async (req, res) => {
  try {
    // 清除数据库中的配置
    await db.pool.execute("DELETE FROM system_settings WHERE `key` = 'finance.config'");

    // 清除缓存
    financeConfig.clearCache();

    ResponseHandler.success(res, DEFAULT_FINANCE_CONFIG, '已重置为默认配置');
  } catch (error) {
    logger.error('重置配置失败:', error);
    ResponseHandler.error(res, '重置配置失败', 'SERVER_ERROR', 500, error);
  }
};

module.exports = {
  getSettings,
  updateSettings,
  getDefaultSettings,
  resetSettings,
};
