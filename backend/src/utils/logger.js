/**
 * 日志工具
 * @description 统一的日志记录工具
 * @author 系统
 * @date 2025-08-28
 */

// const logger = require('logger'); // 错误的导入，已注释
const fs = require('fs');
const path = require('path');

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 日志级别
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

// 当前日志级别（从环境变量读取，默认为 INFO）
const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

// 格式化时间
const formatTime = () => {
  return new Date().toISOString();
};

// 格式化日志消息
const formatMessage = (level, message, meta = {}) => {
  const timestamp = formatTime();

  // 处理Error对象
  let processedMeta = meta;
  if (meta instanceof Error) {
    processedMeta = {
      error: meta.message,
      stack: meta.stack,
      code: meta.code,
      name: meta.name,
    };
  } else if (meta && typeof meta === 'object') {
    // 深度处理meta中的Error对象
    processedMeta = {};
    for (const key in meta) {
      if (meta[key] instanceof Error) {
        processedMeta[key] = {
          message: meta[key].message,
          stack: meta[key].stack,
          code: meta[key].code,
          name: meta[key].name,
        };
      } else {
        processedMeta[key] = meta[key];
      }
    }
  }

  const logEntry = {
    timestamp,
    level,
    message,
    ...processedMeta,
  };

  return JSON.stringify(logEntry);
};

// 写入日志文件
const writeToFile = (level, message) => {
  const filename = `${level.toLowerCase()}-${new Date().toISOString().split('T')[0]}.log`;
  const filepath = path.join(logDir, filename);

  fs.appendFileSync(filepath, message + '\n', 'utf8');
};

// 控制台输出（带颜色）
const consoleOutput = (level, message) => {
  const colors = {
    ERROR: '\x1b[31m', // 红色
    WARN: '\x1b[33m', // 黄色
    INFO: '\x1b[36m', // 青色
    DEBUG: '\x1b[37m', // 白色
  };

  const reset = '\x1b[0m';
  const color = colors[level] || colors.INFO;

  process.stdout.write(`${color}${message}${reset}\n`);
};

// 日志记录函数
const log = (level, message, meta = {}) => {
  if (LOG_LEVELS[level] > currentLogLevel) {
    return; // 跳过低于当前级别的日志
  }

  const formattedMessage = formatMessage(level, message, meta);

  // 输出到控制台
  if (process.env.NODE_ENV !== 'production') {
    consoleOutput(level, formattedMessage);
  }

  // 写入文件
  writeToFile(level, formattedMessage);

  // 错误级别同时写入错误文件
  if (level === 'ERROR') {
    writeToFile('error', formattedMessage);
  }
};

// 导出的日志方法
const logger = {
  error: (message, meta = {}) => log('ERROR', message, meta),
  warn: (message, meta = {}) => log('WARN', message, meta),
  info: (message, meta = {}) => log('INFO', message, meta),
  debug: (message, meta = {}) => log('DEBUG', message, meta),

  // 性能日志
  performance: (operation, duration, meta = {}) => {
    log('INFO', `Performance: ${operation} took ${duration}ms`, meta);
  },

  // 审计日志
  audit: (action, userId, details = {}) => {
    log('INFO', `Audit: ${action}`, {
      userId,
      action,
      ...details,
      type: 'audit',
    });
  },

  // 安全日志
  security: (event, details = {}) => {
    log('WARN', `Security: ${event}`, {
      event,
      ...details,
      type: 'security',
    });
  },
};

// 清理旧日志文件（保留30天）
const cleanupOldLogs = () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    const files = fs.readdirSync(logDir);
    files.forEach((file) => {
      const filepath = path.join(logDir, file);
      const stats = fs.statSync(filepath);

      if (stats.mtime < thirtyDaysAgo) {
        fs.unlinkSync(filepath);
        logger.info(`Cleaned up old log file: ${file}`);
      }
    });
  } catch (error) {
    logger.error('Failed to cleanup old logs:', { error: error.message });
  }
};

// 定期清理日志（每天执行一次）
const logCleanupTimer = setInterval(cleanupOldLogs, 24 * 60 * 60 * 1000);
logCleanupTimer.unref?.();

module.exports = logger;
module.exports.logger = logger;
