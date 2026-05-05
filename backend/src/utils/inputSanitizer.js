/**
 * inputSanitizer.js
 * @description 输入数据清理和XSS防护工具
 * @date 2025-08-27
 * @version 1.0.0
 */

const validator = require('validator');

/**
 * 输入清理器类
 */
class InputSanitizer {
  /**
   * 清理字符串输入，防止XSS攻击
   * @param {string} input - 输入字符串
   * @param {Object} options - 清理选项
   * @returns {string} 清理后的字符串
   */
  static sanitizeString(input, options = {}) {
    if (typeof input !== 'string') {
      return '';
    }

    const { maxLength = 1000, allowHtml = false, trimWhitespace = true } = options;

    let sanitized = input;

    // 去除首尾空白字符
    if (trimWhitespace) {
      sanitized = sanitized.trim();
    }

    // 限制长度
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength);
    }

    // HTML转义
    if (!allowHtml) {
      sanitized = validator.escape(sanitized);
    }

    return sanitized;
  }

  /**
   * 清理对象中的所有字符串字段
   * @param {Object} obj - 要清理的对象
   * @param {Object} options - 清理选项
   * @returns {Object} 清理后的对象
   */
  static sanitizeObject(obj, options = {}) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value, options);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          typeof item === 'string' ? this.sanitizeString(item, options) : item
        );
      } else if (value && typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value, options);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 验证邮箱格式
   * @param {string} email - 邮箱地址
   * @returns {boolean} 是否为有效邮箱
   */
  static isValidEmail(email) {
    return validator.isEmail(email) && email.length <= 254;
  }

  /**
   * 验证URL格式
   * @param {string} url - URL地址
   * @returns {boolean} 是否为有效URL
   */
  static isValidURL(url) {
    return validator.isURL(url, {
      protocols: ['http', 'https'],
      require_protocol: true,
    });
  }

  /**
   * 清理SQL查询参数
   * @param {any} param - 查询参数
   * @returns {any} 清理后的参数
   */
  static sanitizeSQLParam(param) {
    if (typeof param === 'string') {
      // 移除潜在的SQL注入字符
      return param.replace(/[';\\x00\\n\\r\\x1a"]/g, '');
    }

    if (typeof param === 'number') {
      // 确保数字参数是有效的
      return Number.isFinite(param) ? param : 0;
    }

    return param;
  }

  /**
   * 验证密码强度
   * @param {string} password - 密码
   * @returns {Object} 验证结果
   */
  static validatePassword(password) {
    const result = {
      isValid: false,
      errors: [],
    };

    if (!password || typeof password !== 'string') {
      result.errors.push('密码不能为空');
      return result;
    }

    if (password.length < 8) {
      result.errors.push('密码长度至少8位');
    }

    if (password.length > 128) {
      result.errors.push('密码长度不能超过128位');
    }

    if (!/[a-z]/.test(password)) {
      result.errors.push('密码必须包含小写字母');
    }

    if (!/[A-Z]/.test(password)) {
      result.errors.push('密码必须包含大写字母');
    }

    if (!/\d/.test(password)) {
      result.errors.push('密码必须包含数字');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      result.errors.push('密码必须包含特殊字符');
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * 清理文件名
   * @param {string} filename - 文件名
   * @returns {string} 清理后的文件名
   */
  static sanitizeFilename(filename) {
    if (typeof filename !== 'string') {
      return 'unnamed_file';
    }

    // 移除危险字符
    // eslint-disable-next-line no-control-regex -- filenames must reject ASCII control characters.
    let sanitized = filename.replace(new RegExp('[<>:"/\\\\|?*\\x00-\\x1f]', 'g'), '');

    // 移除开头的点号（隐藏文件）
    sanitized = sanitized.replace(/^\.+/, '');

    // 限制长度
    if (sanitized.length > 255) {
      const ext = sanitized.substring(sanitized.lastIndexOf('.'));
      const name = sanitized.substring(0, 255 - ext.length);
      sanitized = name + ext;
    }

    return sanitized || 'unnamed_file';
  }

  /**
   * 验证数字范围
   * @param {number} value - 数值
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @returns {boolean} 是否在有效范围内
   */
  static isValidNumber(value, min = -Infinity, max = Infinity) {
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  }

  /**
   * 清理JSON数据
   * @param {string} jsonString - JSON字符串
   * @returns {Object|null} 解析后的对象或null
   */
  static sanitizeJSON(jsonString) {
    try {
      if (typeof jsonString !== 'string') {
        return null;
      }

      // 限制JSON字符串长度
      if (jsonString.length > 100000) {
        throw new Error('JSON data too large');
      }

      const parsed = JSON.parse(jsonString);

      // 递归清理对象
      return this.sanitizeObject(parsed);
    } catch {
      return null;
    }
  }
}

module.exports = InputSanitizer;
