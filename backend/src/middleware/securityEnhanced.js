/**
 * 增强安全中间件
 * @description 提供额外的安全检查和防护措施
 * @author 系统
 * @date 2025-08-28
 * @updated 2026-04-18 - 移除 IP 黑名单（内部系统无需），保留输入检测
 */

const { logger } = require('../utils/logger');
const { ResponseHandler } = require('../utils/responseHandler');
const { UnifiedAppError } = require('./unifiedErrorHandler');
const { SQL_FIELD_MODES, containsSQLInjection, getSQLFieldMode } = require('./inputSecurityPolicy');
const path = require('path');
const {
  ATTACHMENT_MIME_TYPES,
  ATTACHMENT_EXTENSIONS,
  EXCEL_EXTENSIONS,
} = require('../config/fileUploadPolicy');

// XSS 检测模式
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
];

// 路径遍历检测模式
const PATH_TRAVERSAL_PATTERNS = [/\.\.\//g, /\.\.\\/g, /%2e%2e%2f/gi, /%2e%2e%5c/gi];

// SQL 注入检测中间件
const sqlInjectionDetection = (req, res, next) => {
  const requestPath = req.path || req.originalUrl || '';

  const checkValue = (value, path = '') => {
    const fieldMode = getSQLFieldMode(requestPath, path);
    if (fieldMode === SQL_FIELD_MODES.SKIP) {
      return;
    }

    if (typeof value === 'string') {
      if (containsSQLInjection(value, fieldMode)) {
        logger.security('Security event: SQL injection attempt detected', {
          ip: req.ip,
          url: req.originalUrl,
          path,
          mode: fieldMode,
          value: value.substring(0, 100),
          userAgent: req.get('User-Agent'),
        });

        throw new UnifiedAppError('INVALID_REQUEST', 'Invalid input detected');
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, `${path}.${key}`);
      }
    }
  };

  try {
    // 检查查询参数
    checkValue(req.query, 'query');

    // 检查请求体
    if (req.body) {
      checkValue(req.body, 'body');
    }

    // 检查路径参数
    checkValue(req.params, 'params');

    next();
  } catch (error) {
    next(error);
  }
};

// XSS 检测中间件
const xssDetection = (req, res, next) => {
  const checkValue = (value, path = '') => {
    if (typeof value === 'string') {
      for (const pattern of XSS_PATTERNS) {
        if (pattern.test(value)) {
          logger.security('Security event: XSS attempt detected', {
            ip: req.ip,
            url: req.originalUrl,
            path,
            value: value.substring(0, 100),
            userAgent: req.get('User-Agent'),
          });

          throw new UnifiedAppError('INVALID_REQUEST', 'Invalid input detected');
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        checkValue(val, `${path}.${key}`);
      }
    }
  };

  try {
    checkValue(req.query, 'query');
    if (req.body) {
      checkValue(req.body, 'body');
    }
    checkValue(req.params, 'params');

    next();
  } catch (error) {
    next(error);
  }
};

// 路径遍历检测中间件
const pathTraversalDetection = (req, res, next) => {
  const url = req.originalUrl;

  for (const pattern of PATH_TRAVERSAL_PATTERNS) {
    if (pattern.test(url)) {
      logger.security('Security event: path traversal attempt detected', {
        ip: req.ip,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
      });

      return ResponseHandler.error(res, 'Invalid request path', 'INVALID_REQUEST_PATH', 400);
    }
  }

  next();
};

// 文件上传安全检查
const fileUploadSecurity = (req, res, next) => {
  if (req.files || req.file) {
    const files = req.files ? Object.values(req.files).flat() : [req.file];

    for (const file of files) {
      if (!file) continue;

      // Keep this legacy guard aligned with unifiedFileUpload.  The latter is
      // authoritative and additionally checks magic bytes after multer writes
      // the file; this guard still prevents drift for callers that use it
      // directly.
      const mimetype = String(file.mimetype || '').toLowerCase();
      const ext = path.extname(String(file.originalname || '')).toLowerCase();
      if (
        !ATTACHMENT_MIME_TYPES.includes(mimetype) ||
        !ATTACHMENT_EXTENSIONS.includes(ext) ||
        (mimetype === 'application/octet-stream' && !EXCEL_EXTENSIONS.includes(ext))
      ) {
        logger.security('Security event: disallowed file type uploaded', {
          ip: req.ip,
          filename: file.originalname,
          mimetype,
          ext,
        });

        return ResponseHandler.error(res, 'File type not allowed', 'INVALID_FILE_TYPE', 400);
      }

      // 检查文件扩展名
      const dangerousExtensions = new Set([
        '.exe',
        '.dll',
        '.bat',
        '.cmd',
        '.sh',
        '.php',
        '.jsp',
        '.asp',
        '.aspx',
        '.js',
        '.vbs',
      ]);

      if (dangerousExtensions.has(ext)) {
        logger.security('Security event: dangerous file extension uploaded', {
          ip: req.ip,
          filename: file.originalname,
          ext,
        });

        return ResponseHandler.error(res, 'Dangerous file type', 'DANGEROUS_FILE_TYPE', 400);
      }
    }
  }

  next();
};

module.exports = {
  sqlInjectionDetection,
  xssDetection,
  pathTraversalDetection,
  fileUploadSecurity,
};
