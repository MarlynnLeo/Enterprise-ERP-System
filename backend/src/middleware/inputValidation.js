/**
 * 全局输入验证和清理中间件
 * @description 防止XSS、SQL注入和其他恶意输入
 * @date 2025-11-21
 */

const validator = require('validator');
const { logger } = require('../utils/logger');
const { ResponseHandler } = require('../utils/responseHandler');
const { SQL_FIELD_MODES, containsSQLInjection, getSQLFieldMode } = require('./inputSecurityPolicy');

const sendInputError = (res, message, errorCode, statusCode = 400, details = null) => {
  const error = details ? { details } : null;
  return ResponseHandler.error(res, message, errorCode, statusCode, error);
};

/**
 * XSS防护 - 清理HTML标签
 * @param {string} input - 输入字符串
 * @returns {string} 清理后的字符串
 */
const sanitizeHTML = (input) => {
  if (typeof input !== 'string') {
    return input;
  }

  // “/”在文本节点中无需转义。validator.escape() 会把它编码为
  // &#x2F;，导致 GB/T、目测/通止规等正常业务值在后续编辑时漂移。
  return validator.escape(input).replace(/&#x2F;/gi, '/');
};

const LEGACY_SLASH_ENTITY_PATTERN = /&#(?:x0*2f|0*47);/gi;

const normalizeLegacySlashEntities = (input) => {
  if (typeof input !== 'string') return input;
  return input.replace(LEGACY_SLASH_ENTITY_PATTERN, '/');
};

// 不需要 HTML 转义的字段（文件路径、URL、规格型号等）
const SKIP_SANITIZE_FIELDS = [
  'attachment',
  'file_path',
  'filePath',
  'fileUrl',
  'url',
  'instructionDocs',
  'path',
  'image_url',
  'avatar',
  'logo',
  'specs',
  'specification',
  'model',
  'standard',
  'standard_value',
  // AQL 级别可以是 "GB/T 2828.1 II" 这类标准标识，斜杠不应被转义为 HTML 实体
  'aqlLevel',
  'aql_level',
  'drawing_no',
  'color_code',
  'material', // 物料材料/材质字段
  'material_type',
  // ✅ 安全修复: 移除 'name' — 过于宽泛，几乎所有实体都有 name 字段，跳过会导致 XSS 风险
  // 如果某个 name 字段确实需要特殊字符，应在具体路由层单独处理
  'location_detail',
  'location', // 库位详细位置，可能包含特殊字符（如：J1-01-02/J1-01-03）
  'rule_value', // 考勤规则 JSON 值
  'split_details', // 薪资拆分详情 JSON
];

const ROUTE_SANITIZE_FIELD_BYPASSES = [
  {
    pathPrefix: '/api/print/',
    fields: ['content', 'header_html', 'footer_html', 'body_html'],
  },
  {
    pathPrefix: '/api/system/technical-communications',
    fields: ['content', 'solution', 'description'],
  },
];

const pathLeaf = (path) =>
  String(path || '')
    .split('.')
    .pop();

/**
 * 检查字段是否应该跳过 HTML 转义
 * @param {string} key - 字段名
 * @param {string} value - 字段值
 * @returns {boolean}
 */
const shouldSkipSanitize = (key, value, requestPath = '') => {
  const leaf = pathLeaf(key);

  if (
    ROUTE_SANITIZE_FIELD_BYPASSES.some(
      ({ pathPrefix, fields }) => requestPath.startsWith(pathPrefix) && fields.includes(leaf)
    )
  ) {
    return true;
  }

  // 跳过白名单字段
  if (SKIP_SANITIZE_FIELDS.includes(leaf)) {
    return true;
  }
  // 跳过以 /uploads/ 开头的值（文件路径）
  if (typeof value === 'string' && value.startsWith('/uploads/')) {
    return true;
  }
  return false;
};

/**
 * 递归清理对象中的所有字符串
 * @param {*} obj - 要清理的对象
 * @param {number} depth - 当前递归深度
 * @param {number} maxDepth - 最大递归深度
 * @param {string} currentKey - 当前字段名
 * @returns {*} 清理后的对象
 */
const sanitizeObject = (obj, depth = 0, maxDepth = 10, currentKey = '', requestPath = '') => {
  // 防止递归过深
  if (depth > maxDepth) {
    logger.warn('对象递归深度超过限制');
    return obj;
  }

  if (typeof obj === 'string') {
    const normalizedValue = normalizeLegacySlashEntities(obj);
    // 跳过文件路径等特殊字段
    if (shouldSkipSanitize(currentKey, normalizedValue, requestPath)) {
      return normalizedValue;
    }
    return sanitizeHTML(normalizedValue);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1, maxDepth, currentKey, requestPath));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const nextKey = currentKey ? `${currentKey}.${key}` : key;
        sanitized[key] = sanitizeObject(obj[key], depth + 1, maxDepth, nextKey, requestPath);
      }
    }
    return sanitized;
  }

  return obj;
};

/**
 * 验证和清理输入的中间件
 */
const validateAndSanitizeInput = (req, res, next) => {
  try {
    // 跳过文件上传请求
    if (req.is('multipart/form-data')) {
      return next();
    }

    const requestPath = (req.originalUrl || req.path || '').split('?')[0];

    // 清理请求体
    if (req.body && Object.keys(req.body).length > 0) {
      req.body = sanitizeObject(req.body, 0, 10, '', requestPath);
    }

    // 清理查询参数
    if (req.query && Object.keys(req.query).length > 0) {
      req.query = sanitizeObject(req.query, 0, 10, '', requestPath);
    }

    // 清理URL参数
    if (req.params && Object.keys(req.params).length > 0) {
      req.params = sanitizeObject(req.params, 0, 10, '', requestPath);
    }

    next();
  } catch (error) {
    logger.error('输入验证失败:', error);
    sendInputError(res, '输入数据格式错误', 'INVALID_INPUT');
  }
};

/**
 * 验证必需字段
 * @param {Array<string>} fields - 必需字段列表
 * @returns {Function} Express中间件
 */
const requireFields = (fields) => {
  return (req, res, next) => {
    const missingFields = [];

    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      return sendInputError(
        res,
        `缺少必需字段: ${missingFields.join(', ')}`,
        'MISSING_REQUIRED_FIELDS',
        400,
        { missingFields }
      );
    }

    next();
  };
};

/**
 * 验证邮箱格式
 * @param {string} fieldName - 字段名
 * @returns {Function} Express中间件
 */
const validateEmail = (fieldName = 'email') => {
  return (req, res, next) => {
    const email = req.body[fieldName];

    if (!email) {
      return next();
    }

    if (!validator.isEmail(email)) {
      return sendInputError(res, `${fieldName} 格式无效`, 'INVALID_EMAIL');
    }

    next();
  };
};

/**
 * 验证手机号格式（中国大陆）
 * @param {string} fieldName - 字段名
 * @returns {Function} Express中间件
 */
const validatePhone = (fieldName = 'phone') => {
  return (req, res, next) => {
    const phone = req.body[fieldName];

    if (!phone) {
      return next();
    }

    // 中国大陆手机号正则
    const phoneRegex = /^1[3-9]\d{9}$/;

    if (!phoneRegex.test(phone)) {
      return sendInputError(res, `${fieldName} 格式无效`, 'INVALID_PHONE');
    }

    next();
  };
};

/**
 * 验证字符串长度
 * @param {string} fieldName - 字段名
 * @param {Object} options - 选项 { min, max }
 * @returns {Function} Express中间件
 */
const validateLength = (fieldName, options = {}) => {
  const { min = 0, max = Infinity } = options;

  return (req, res, next) => {
    const value = req.body[fieldName];

    if (!value) {
      return next();
    }

    if (typeof value !== 'string') {
      return sendInputError(res, `${fieldName} 必须是字符串`, 'INVALID_TYPE');
    }

    const length = value.length;

    if (length < min || length > max) {
      return sendInputError(
        res,
        `${fieldName} 长度必须在 ${min} 到 ${max} 之间`,
        'INVALID_LENGTH',
        400,
        { min, max, actual: length }
      );
    }

    next();
  };
};

/**
 * 验证数值范围
 * @param {string} fieldName - 字段名
 * @param {Object} options - 选项 { min, max }
 * @returns {Function} Express中间件
 */
const validateRange = (fieldName, options = {}) => {
  const { min = -Infinity, max = Infinity } = options;

  return (req, res, next) => {
    const value = req.body[fieldName];

    if (value === undefined || value === null) {
      return next();
    }

    const num = Number(value);

    if (isNaN(num)) {
      return sendInputError(res, `${fieldName} 必须是数字`, 'INVALID_NUMBER');
    }

    if (num < min || num > max) {
      return sendInputError(res, `${fieldName} 必须在 ${min} 到 ${max} 之间`, 'OUT_OF_RANGE', 400, {
        min,
        max,
        actual: num,
      });
    }

    next();
  };
};

/**
 * 验证日期格式
 * @param {string} fieldName - 字段名
 * @returns {Function} Express中间件
 */
const validateDate = (fieldName) => {
  return (req, res, next) => {
    const dateStr = req.body[fieldName];

    if (!dateStr) {
      return next();
    }

    if (!validator.isISO8601(dateStr)) {
      return sendInputError(res, `${fieldName} 日期格式无效，请使用ISO8601格式`, 'INVALID_DATE');
    }

    next();
  };
};

/**
 * SQL注入检测中间件
 */
const detectSQLInjection = (req, res, next) => {
  const requestPath = req.path || req.originalUrl || '';

  const checkInput = (obj, path = '') => {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const currentPath = path ? `${path}.${key}` : key;

        const fieldMode = getSQLFieldMode(requestPath, currentPath);
        if (fieldMode === SQL_FIELD_MODES.SKIP) {
          continue;
        }

        if (typeof value === 'string' && containsSQLInjection(value, fieldMode)) {
          logger.warn('检测到可疑的SQL注入尝试', {
            path: currentPath,
            value: value.substring(0, 100), // 只记录前100个字符
            ip: req.ip,
            user: req.user?.id,
            mode: fieldMode,
          });

          return sendInputError(res, '检测到非法输入', 'SUSPICIOUS_INPUT', 403);
        }

        if (typeof value === 'object' && value !== null) {
          const result = checkInput(value, currentPath);
          if (result) return result;
        }
      }
    }
  };

  // 检查请求体、查询参数和URL参数
  if (checkInput(req.body || {})) return;
  if (checkInput(req.query || {})) return;
  if (checkInput(req.params || {})) return;

  next();
};

module.exports = {
  validateAndSanitizeInput,
  requireFields,
  validateEmail,
  validatePhone,
  validateLength,
  validateRange,
  validateDate,
  detectSQLInjection,
  sanitizeHTML,
  sanitizeObject,
};
