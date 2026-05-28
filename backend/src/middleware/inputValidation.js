/**
 * 全局输入验证和清理中间件
 * @description 防止XSS、SQL注入和其他恶意输入
 * @date 2025-11-21
 */

const validator = require('validator');
const { logger } = require('../utils/logger');
const { ResponseHandler } = require('../utils/responseHandler');

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

  // 转义HTML特殊字符
  return validator.escape(input);
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
  'drawing_no',
  'color_code', // 物料规格相关字段
  // ✅ 安全修复: 移除 'name' — 过于宽泛，几乎所有实体都有 name 字段，跳过会导致 XSS 风险
  // 如果某个 name 字段确实需要特殊字符，应在具体路由层单独处理
  'location_detail',
  'location', // 库位详细位置，可能包含特殊字符（如：J1-01-02/J1-01-03）
  'rule_value', // 考勤规则 JSON 值
  'split_details', // 薪资拆分详情 JSON
];

/**
 * 检查字段是否应该跳过 HTML 转义
 * @param {string} key - 字段名
 * @param {string} value - 字段值
 * @returns {boolean}
 */
const shouldSkipSanitize = (key, value) => {
  // 跳过白名单字段
  if (SKIP_SANITIZE_FIELDS.includes(key)) {
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
const sanitizeObject = (obj, depth = 0, maxDepth = 10, currentKey = '') => {
  // 防止递归过深
  if (depth > maxDepth) {
    logger.warn('对象递归深度超过限制');
    return obj;
  }

  if (typeof obj === 'string') {
    // 跳过文件路径等特殊字段
    if (shouldSkipSanitize(currentKey, obj)) {
      return obj;
    }
    return sanitizeHTML(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item, depth + 1, maxDepth, currentKey));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitized[key] = sanitizeObject(obj[key], depth + 1, maxDepth, key);
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

    // 清理请求体
    if (req.body && Object.keys(req.body).length > 0) {
      req.body = sanitizeObject(req.body);
    }

    // 清理查询参数
    if (req.query && Object.keys(req.query).length > 0) {
      req.query = sanitizeObject(req.query);
    }

    // 清理URL参数
    if (req.params && Object.keys(req.params).length > 0) {
      req.params = sanitizeObject(req.params);
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
      return sendInputError(
        res,
        `${fieldName} 必须在 ${min} 到 ${max} 之间`,
        'OUT_OF_RANGE',
        400,
        { min, max, actual: num }
      );
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
 * 防止SQL注入 - 检测危险字符
 * @param {*} input - 输入
 * @param {boolean} relaxed - 宽松模式：仅检测高危SQL关键字，跳过分号/引号/注释检测
 * @returns {boolean} 是否包含危险字符
 */
const containsSQLInjection = (input, relaxed = false) => {
  if (typeof input !== 'string') {
    return false;
  }

  // 高危 SQL 注入模式（所有模式下都检测）
  const highRiskPatterns = [
    /(\b(DROP|ALTER|EXEC|EXECUTE)\b)/i,
    /(UNION\s+SELECT)/i,
    /(OR\s+1\s*=\s*1)/i,
    /(AND\s+1\s*=\s*1)/i,
  ];

  // 标准模式额外检测的模式（业务文本字段在宽松模式下跳过）
  const standardPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|CREATE)\b)/i,
    /('|;|--)/, // 单引号、分号、双横线注释
    /(\/\*|\*\/)/, // SQL块注释标记
  ];

  if (highRiskPatterns.some((pattern) => pattern.test(input))) {
    return true;
  }

  // 宽松模式下跳过标准模式的检测（业务文本字段中分号、引号是常见字符）
  if (relaxed) {
    return false;
  }

  return standardPatterns.some((pattern) => pattern.test(input));
};

/**
 * SQL注入检测中间件
 */
const detectSQLInjection = (req, res, next) => {
  const pathLeaf = (path) => String(path || '').split('.').pop();
  const isPathField = (path, fields) => fields.includes(pathLeaf(path));
  const isBusinessNameField = (path) => {
    const leaf = pathLeaf(path);
    return (
      leaf.endsWith('_name') ||
      leaf.endsWith('Name') ||
      ['name', 'reason_name', 'reasonName', 'display_name', 'displayName', 'label', 'title'].includes(leaf)
    );
  };
  const relaxedTextFields = [
    'remark',
    'remarks',
    'description',
    'name',
    'standard',
    'standard_value',
    'issue_reason',
    'reason_name',
    'reasonName',
    'reason',
  ];
  // 跳过富文本内容字段的检查（HTML内容可能包含类似SQL的模式）
  const shouldSkipPath = (path) => {
    // 打印模板API的HTML内容字段
    if (req.path.startsWith('/api/print/')) {
      if (
        path === 'content' ||
        path === 'header_html' ||
        path === 'footer_html' ||
        path === 'body_html'
      ) {
        return true;
      }
    }
    // 技术交流API的富文本内容字段
    if (req.path.startsWith('/api/system/technical-communications')) {
      if (path === 'content' || path === 'solution' || path === 'description') {
        return true;
      }
    }
    // 附件/文件路径字段 - 这些字段包含合法的文件路径，不应该被SQL注入检测拦截
    const attachmentFields = [
      'attachment',
      'file_path',
      'fileUrl',
      'filePath',
      'url',
      'instructionDocs',
    ];
    if (
      attachmentFields.some(
        (field) => path.endsWith(field) || path.includes('.attachment') || path.includes('.url')
      )
    ) {
      return true;
    }
    // 物料规格/技术字段 — 完全跳过SQL注入检测
    // 这些字段包含合法的特殊字符（如 400*600*120mm、K22/25、base64图片数据）
    const technicalFields = [
      'specs',
      'specification',
      'model',
      'drawing_no',
      'color_code',
      'location_detail',
      'location',
      'avatar',
      'bio',
      'rule_value',
      'split_details',
    ];
    if (isPathField(path, technicalFields)) {
      return true;
    }

    // 业务文本字段 — 仅跳过分号和单引号检测（这些字段最常触发误报）
    // 但仍然保留对 DROP/UNION SELECT/OR 1=1 等高危模式的检测
    if (isPathField(path, relaxedTextFields)) {
      return false; // 不跳过，让 checkInput 继续执行，但会使用宽松模式
    }
    return false;
  };

  const checkInput = (obj, path = '') => {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const currentPath = path ? `${path}.${key}` : key;

        // 跳过特定路径
        if (shouldSkipPath(currentPath)) {
          continue;
        }

        // 根据字段类型选择检测模式：业务文本字段使用宽松模式
        const isRelaxed = isPathField(currentPath, relaxedTextFields) || isBusinessNameField(currentPath);

        if (typeof value === 'string' && containsSQLInjection(value, isRelaxed)) {
          logger.warn('检测到可疑的SQL注入尝试', {
            path: currentPath,
            value: value.substring(0, 100), // 只记录前100个字符
            ip: req.ip,
            user: req.user?.id,
            mode: isRelaxed ? 'relaxed' : 'strict',
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
  // 如果检测到注入，checkInput会返回响应对象，需要立即终止
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
