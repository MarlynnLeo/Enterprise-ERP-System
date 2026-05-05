/**
 * 开发环境日志工具
 * @description 只在开发环境输出日志,生产环境自动禁用
 * @date 2025-11-13
 */

const isDev = import.meta.env.DEV;

/**
 * 开发环境日志工具
 */
export const devLogger = {
  /**
   * 普通日志 (仅开发环境)
   * @param {...any} args - 日志参数
   */
  log: () => {
    if (isDev) {
    }
  },

  /**
   * 警告日志 (仅开发环境)
   * @param {...any} args - 日志参数
   */
  warn: (...args) => {
    if (isDev) {
      console.warn(...args);
    }
  },

  /**
   * 错误日志 (所有环境)
   * @param {...any} args - 日志参数
   */
  error: (...args) => {
    console.error(...args);
  },

  /**
   * 开发跟踪日志 (仅开发环境)
   * @param {...any} args - 日志参数
   */
  debug: () => {
    if (isDev) {
    }
  },

  /**
   * 信息日志 (仅开发环境)
   * @param {...any} args - 日志参数
   */
  info: (...args) => {
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * 表格日志 (仅开发环境)
   * @param {*} data - 表格数据
   */
  table: (data) => {
    if (isDev) {
      console.table(data);
    }
  },

  /**
   * 分组日志开始 (仅开发环境)
   * @param {string} label - 分组标签
   */
  group: (label) => {
    if (isDev) {
      console.group(label);
    }
  },

  /**
   * 折叠分组日志开始 (仅开发环境)
   * @param {string} label - 分组标签
   */
  groupCollapsed: (label) => {
    if (isDev) {
      console.groupCollapsed(label);
    }
  },

  /**
   * 分组日志结束 (仅开发环境)
   */
  groupEnd: () => {
    if (isDev) {
      console.groupEnd();
    }
  },

  /**
   * 计时开始 (仅开发环境)
   * @param {string} label - 计时标签
   */
  time: (label) => {
    if (isDev) {
      console.time(label);
    }
  },

  /**
   * 计时结束 (仅开发环境)
   * @param {string} label - 计时标签
   */
  timeEnd: (label) => {
    if (isDev) {
      console.timeEnd(label);
    }
  }
};

/**
 * 创建带前缀的日志工具
 * @param {string} prefix - 日志前缀
 * @returns {Object} 日志工具对象
 * 
 * @example
 * const logger = createLogger('🔍 检验模块');
 * logger.log('开始查询模板...'); // 输出: 🔍 检验模块 开始查询模板...
 */
export const createLogger = (prefix) => {
  return {
    log: (...args) => devLogger.log(prefix, ...args),
    warn: (...args) => devLogger.warn(prefix, ...args),
    error: (...args) => devLogger.error(prefix, ...args),
    debug: (...args) => devLogger.debug(prefix, ...args),
    info: (...args) => devLogger.info(prefix, ...args)
  };
};

export default devLogger;
