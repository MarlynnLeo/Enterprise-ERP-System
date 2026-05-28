/**
 * themeController.js
 * @description 主题设置控制器
 * @date 2025-10-23
 * @version 1.0.0
 */

const { pool } = require('../../config/db');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const {
  getDefaultThemeSettings,
  normalizeThemeSettings,
  validateThemeSettings,
} = require('../../config/themeConfig');

/**
 * 获取用户主题设置
 */
exports.getUserTheme = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.execute('SELECT theme_settings FROM users WHERE id = ?', [userId]);

    if (rows.length === 0) {
      return ResponseHandler.error(res, '用户不存在', 'NOT_FOUND', 404);
    }

    const themeSettings = rows[0].theme_settings
      ? normalizeThemeSettings(rows[0].theme_settings)
      : getDefaultThemeSettings();

    return ResponseHandler.success(res, themeSettings, '获取主题设置成功');
  } catch (error) {
    logger.error('获取主题设置失败:', error.message);
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
    await pool.execute('UPDATE users SET theme_settings = ?, updated_at = NOW() WHERE id = ?', [
      JSON.stringify(normalizedThemeSettings),
      userId,
    ]);

    return ResponseHandler.success(res, normalizedThemeSettings, '保存主题设置成功');
  } catch (error) {
    logger.error('保存主题设置失败:', error.message);
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

    await pool.execute('UPDATE users SET theme_settings = ?, updated_at = NOW() WHERE id = ?', [
      JSON.stringify(defaultTheme),
      userId,
    ]);

    return ResponseHandler.success(res, defaultTheme, '重置主题设置成功');
  } catch (error) {
    logger.error('重置主题设置失败:', error.message);
    return ResponseHandler.error(res, '重置主题设置失败', 'SERVER_ERROR', 500);
  }
};
