/**
 * themeController.js
 * @description 主题设置控制器
 * @date 2025-10-23
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const {
  getDefaultThemeSettings,
  normalizeThemeSettings,
  validateThemeSettings,
} = require('../../config/themeConfig');
const ThemeService = require('../../services/auth/ThemeService');

/**
 * 获取用户主题设置
 */
exports.getUserTheme = async (req, res) => {
  try {
    const userId = req.user.id;

    const rawSettings = await ThemeService.getUserThemeSettings(userId);

    if (rawSettings === undefined) {
      return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
    }

    const themeSettings = rawSettings
      ? normalizeThemeSettings(rawSettings)
      : getDefaultThemeSettings();

    return ResponseHandler.success(res, themeSettings, '获取主题设置成功');
  } catch (error) {
    logger.error('[Theme] 获取主题设置失败:', error.message);
    return ResponseHandler.error(res, '获取主题设置失败', 'SERVER_ERROR', 500);
  }
};

/**
 * 保存用户主题设置
 */
exports.saveUserTheme = async (req, res) => {
  try {
    const userId = req.user.id;
    const themeSettings = req.body;

    const validationErrors = validateThemeSettings(themeSettings);
    if (Object.keys(validationErrors).length > 0) {
      return ResponseHandler.validationError(res, '主题设置验证失败', validationErrors);
    }

    const normalizedThemeSettings = normalizeThemeSettings(themeSettings);

    // 保存到数据库
    await ThemeService.saveUserThemeSettings(userId, JSON.stringify(normalizedThemeSettings));

    return ResponseHandler.success(res, normalizedThemeSettings, '保存主题设置成功');
  } catch (error) {
    logger.error('[Theme] 保存主题设置失败:', error.message);
    return ResponseHandler.error(res, '保存主题设置失败', 'SERVER_ERROR', 500);
  }
};

/**
 * 重置用户主题设置
 */
exports.resetUserTheme = async (req, res) => {
  try {
    const userId = req.user.id;

    const defaultTheme = getDefaultThemeSettings();

    await ThemeService.saveUserThemeSettings(userId, JSON.stringify(defaultTheme));

    return ResponseHandler.success(res, defaultTheme, '重置主题设置成功');
  } catch (error) {
    logger.error('[Theme] 重置主题设置失败:', error.message);
    return ResponseHandler.error(res, '重置主题设置失败', 'SERVER_ERROR', 500);
  }
};
