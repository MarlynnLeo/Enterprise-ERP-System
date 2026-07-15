/**
 * 日志工具
 * @description 统一的日志记录工具
 * @author 系统
 * @date 2025-08-28
 */

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
const configuredLogLevel = String(process.env.LOG_LEVEL || 'INFO').toUpperCase();
const currentLogLevel = LOG_LEVELS[configuredLogLevel] ?? LOG_LEVELS.INFO;

// 格式化时间
const formatTime = () => {
  return new Date().toISOString();
};

// 敏感字段名（值将被替换为 '***'）
const SENSITIVE_KEYS = new Set([
  'password', 'newPassword', 'oldPassword', 'confirmPassword',
  'secret', 'token', 'accessToken', 'refreshToken',
  'api_key', 'apiKey', 'authorization',
]);

// 敏感值正则脱敏规则
const SENSITIVE_VALUE_PATTERNS = [
  { pattern: /(\d{3})\d{4}(\d{4})/, replacement: '$1****$2', name: 'phone' },           // 手机号
  { pattern: /(\d{6})\d{8}(\d{4})/, replacement: '$1********$2', name: 'idcard' },       // 身份证
  { pattern: /(\d{4})\d{8,12}(\d{4})/, replacement: '$1****$2', name: 'bankcard' },      // 银行卡
  { pattern: /(\w{2})\w+(@\w+\.\w+)/, replacement: '$1***$2', name: 'email' },           // 邮箱
];

/**
 * JSON.stringify replacer —— 脱敏敏感数据
 */
const sanitizeReplacer = (key, value) => {
  if (typeof value !== 'string') return value;
  // 字段名级别脱敏
  if (SENSITIVE_KEYS.has(key)) return '***';
  // 值级别正则脱敏（仅对短字符串执行，避免性能开销）
  if (value.length > 6 && value.length < 50) {
    for (const rule of SENSITIVE_VALUE_PATTERNS) {
      if (rule.pattern.test(value)) {
        return value.replace(rule.pattern, rule.replacement);
      }
    }
  }
  return value;
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
  } else if (Array.isArray(meta)) {
    processedMeta = { meta };
  } else if (meta !== null && meta !== undefined && typeof meta !== 'object') {
    processedMeta = { meta };
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

  return JSON.stringify(logEntry, sanitizeReplacer);
};

// 写入日志文件（使用 WriteStream 异步缓冲，避免 appendFileSync 阻塞事件循环）
const _streams = new Map(); // key: "LEVEL-YYYY-MM-DD" -> WriteStream
let _lastDateStr = '';

const getWriteStream = (level) => {
  const dateStr = new Date().toISOString().split('T')[0];
  const key = `${level}-${dateStr}`;

  // 日期切换时关闭前一天的所有 stream
  if (dateStr !== _lastDateStr) {
    for (const [oldKey, oldStream] of _streams) {
      if (!oldKey.endsWith(dateStr)) {
        oldStream.end();
        _streams.delete(oldKey);
      }
    }
    _lastDateStr = dateStr;
  }

  if (!_streams.has(key)) {
    const filename = `${level.toLowerCase()}-${dateStr}.log`;
    const filepath = path.join(logDir, filename);
    const stream = fs.createWriteStream(filepath, { flags: 'a', encoding: 'utf8' });
    stream.on('error', (err) => {
      process.stderr.write(`[logger] WriteStream error: ${err.message}\n`);
    });
    _streams.set(key, stream);
  }

  return _streams.get(key);
};

const writeToFile = (level, message) => {
  const stream = getWriteStream(level);
  // write() 返回 false 时表示内部缓冲区已满，Node.js 会在 drain 后继续写入，
  // 此处不阻塞等待 drain，允许日志在极端情况下丢失而非阻塞请求处理。
  stream.write(message + '\n');
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
