/**
 * 智能日志管理工具
 * 统一管理应用中的日志输出，支持开发和生产环境的不同日志级别
 */
// 检查是否为生产环境
const isProduction = import.meta.env.PROD || process.env.NODE_ENV === 'production';
/**
 * 日志级别枚举
 */
const LOG_LEVELS = {
  ERROR: 0,   // 错误：总是显示
  WARN: 1,    // 警告：生产环境显示
  INFO: 2,    // 信息：仅开发环境显示
  DEBUG: 3    // 调试：仅开发环境显示
};
/**
 * 当前环境的日志级别
 */
const CURRENT_LOG_LEVEL = isProduction ? LOG_LEVELS.WARN : LOG_LEVELS.DEBUG;
/**
 * 智能日志记录器
 */
class SafeLogger {
  constructor() {
    this.isProduction = isProduction;
    this.logLevel = CURRENT_LOG_LEVEL;
  }
  /**
   * 错误日志 - 总是显示
   */
  error(message, ...args) {
    if (this.logLevel >= LOG_LEVELS.ERROR) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
  /**
   * 警告日志 - 生产环境也显示
   */
  warn(message, ...args) {
    if (this.logLevel >= LOG_LEVELS.WARN) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }
  /**
   * 信息日志 - 仅开发环境显示
   */
  info( ..._args) {
    if (this.logLevel >= LOG_LEVELS.INFO) {
    }
  }
  /**
   * 开发跟踪日志 - 仅开发环境显示
   */
  debug( ..._args) {
    if (this.logLevel >= LOG_LEVELS.DEBUG) {
    }
  }
  /**
   * 权限相关的跟踪日志 - 可以单独控制
   */
  permission( ..._args) {
    const enablePermissionDebug = !this.isProduction &&
                                 localStorage.getItem('debug_permissions') === 'true';
    if (enablePermissionDebug) {
    }
  }
  /**
   * API请求日志 - 生产环境完全禁用
   */
  api(method, url, data = null) {
    if (!this.isProduction && this.isDebugEnabled) {
      console.group(`[API] ${method.toUpperCase()} ${url}`);
      if (data) {
      }
      console.groupEnd();
    }
  }
  /**
   * API响应日志 - 生产环境完全禁用
   */
  apiResponse(url) {
    if (!this.isProduction && this.isDebugEnabled) {
      console.group(`[API Response] ${url}`);
      console.groupEnd();
    }
  }
  /**
   * 性能日志 - 生产环境简化
   */
  performance(label, duration) {
    if (this.isProduction) {
      // 生产环境只记录性能标签，不记录具体数值
      if (duration > 1000) { // 只记录超过1秒的操作
        }
    } else {
      }
  }
  /**
   * 清理敏感对象信息
   */
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'auth',
      'authorization', 'cookie', 'session', 'csrf',
      'api_key', 'access_token', 'refresh_token'
    ];
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveFields.some(field => lowerKey.includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
  /**
   * 用户操作日志 - 生产环境记录但不包含敏感信息
   */
  userAction(_action) {
    if (this.isProduction) {
      } else {
      }
  }
}
// 创建全局日志实例
const logger = new SafeLogger();
export default logger;
// 便捷导出
export const { dev, debug, info, warn, error, api, apiResponse, performance, userAction } = logger;
