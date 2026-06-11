/**
 * ThemeService.js
 * @description 用户主题设置数据库操作服务
 * @date 2026-06-11
 */

const { pool } = require('../../config/db');

class ThemeService {
  /**
   * 获取用户主题设置原始值
   * @param {number} userId
   * @returns {Promise<string|null>} theme_settings JSON 字符串或 null
   */
  static async getUserThemeSettings(userId) {
    const [rows] = await pool.execute(
      'SELECT theme_settings FROM users WHERE id = ?',
      [userId]
    );
    if (rows.length === 0) return undefined; // 用户不存在
    return rows[0].theme_settings || null;
  }

  /**
   * 保存用户主题设置
   * @param {number} userId
   * @param {string} themeSettingsJson - 序列化后的 JSON 字符串
   */
  static async saveUserThemeSettings(userId, themeSettingsJson) {
    await pool.execute(
      'UPDATE users SET theme_settings = ?, updated_at = NOW() WHERE id = ?',
      [themeSettingsJson, userId]
    );
  }
}

module.exports = ThemeService;
