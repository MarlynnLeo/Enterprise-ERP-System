/**
 * SystemConfigService.js
 * @description 系统配置服务
 * @date 2026-01-19
 * @version 1.0.0
 */

const db = require('../../config/db');
const logger = require('../../utils/logger');

class SystemConfigService {
  /**
   * 获取配置值
   * @param {string} configKey - 配置键
   * @param {string} defaultValue - 默认值
   * @returns {Promise<string>} 配置值
   */
  static async get(configKey, defaultValue = null) {
    try {
      const [rows] = await db.pool.execute(
        'SELECT config_value, config_type FROM system_config WHERE config_key = ? AND status = TRUE',
        [configKey]
      );

      if (rows.length === 0) {
        return defaultValue;
      }

      const { config_value, config_type } = rows[0];

      // 根据类型转换值
      switch (config_type) {
        case 'boolean':
          return config_value === 'true' || config_value === '1';
        case 'number':
          return parseFloat(config_value);
        case 'json':
          try {
            return JSON.parse(config_value);
          } catch {
            return config_value;
          }
        default:
          return config_value;
      }
    } catch (error) {
      logger.error('[SystemConfig] 获取配置失败:', { configKey, error: error.message });
      return defaultValue;
    }
  }

  /**
   * 设置配置值
   * @param {string} configKey - 配置键
   * @param {*} configValue - 配置值
   * @param {string} configType - 配置类型
   * @returns {Promise<boolean>} 是否成功
   */
  static async set(configKey, configValue, configType = 'string') {
    try {
      // 转换值为字符串
      let valueStr = configValue;
      if (configType === 'boolean') {
        valueStr = configValue ? 'true' : 'false';
      } else if (configType === 'json') {
        valueStr = JSON.stringify(configValue);
      } else {
        valueStr = String(configValue);
      }

      await db.pool.execute(
        `INSERT INTO system_config (config_key, config_value, config_type)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE config_value = ?, config_type = ?, updated_at = NOW()`,
        [configKey, valueStr, configType, valueStr, configType]
      );

      return true;
    } catch (error) {
      logger.error('[SystemConfig] 设置配置失败:', { configKey, error: error.message });
      return false;
    }
  }

  /**
   * 获取模块的所有配置
   * @param {string} module - 模块名称
   * @returns {Promise<Object>} 配置对象
   */
  static async getModuleConfigs(module) {
    try {
      const [rows] = await db.pool.execute(
        'SELECT config_key, config_value, config_type, description FROM system_config WHERE module = ? AND status = TRUE',
        [module]
      );

      const configs = {};
      for (const row of rows) {
        const { config_key, config_value, config_type } = row;

        // 根据类型转换值
        switch (config_type) {
          case 'boolean':
            configs[config_key] = config_value === 'true' || config_value === '1';
            break;
          case 'number':
            configs[config_key] = parseFloat(config_value);
            break;
          case 'json':
            try {
              configs[config_key] = JSON.parse(config_value);
            } catch {
              configs[config_key] = config_value;
            }
            break;
          default:
            configs[config_key] = config_value;
        }
      }

      return configs;
    } catch (error) {
      logger.error('[SystemConfig] 获取模块配置失败:', { module, error: error.message });
      return {};
    }
  }

  /**
   * 批量更新配置
   * @param {Array} configs - 配置数组 [{key, value, type}, ...]
   * @returns {Promise<boolean>} 是否成功
   */
  static async batchUpdate(configs) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const config of configs) {
        const { key, value, type = 'string' } = config;

        // 转换值为字符串
        let valueStr = value;
        if (type === 'boolean') {
          valueStr = value ? 'true' : 'false';
        } else if (type === 'json') {
          valueStr = JSON.stringify(value);
        } else {
          valueStr = String(value);
        }

        await connection.execute(
          `INSERT INTO system_config (config_key, config_value, config_type)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE config_value = ?, updated_at = NOW()`,
          [key, valueStr, type, valueStr]
        );
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('[SystemConfig] 批量更新配置失败:', error);
      return false;
    } finally {
      connection.release();
    }
  }
}

module.exports = SystemConfigService;
