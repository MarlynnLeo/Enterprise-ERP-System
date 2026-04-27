/**
 * 增强安全中间件
 * @description 提供额外的安全检查和防护措施
 * @author 系统
 * @date 2025-08-28
 * @updated 2026-04-18 - 移除 IP 黑名单（内部系统无需），保留输入检测
 */

const helmet = require('helmet');
const { logger } = require('../utils/logger');
const { UnifiedAppError } = require('./unifiedErrorHandler');

// SQL 注入检测模式（严格）— 用于普通字段
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
  /(\';|--)/, // 单引号、分号、双横线注释
  /(\/\*|\*\/)/, // SQL块注释标记
  /(\bOR\b|\bAND\b).*(\=|\<|\>)/i,
  /(UNION.*SELECT|SELECT.*FROM|INSERT.*INTO|UPDATE.*SET|DELETE.*FROM)/i,
];

// SQL 注入检测模式（宽松）— 用于 description/remark 等可能含特殊字符的业务字段
// 只检测高危组合，允许单引号、分号、注释符等单独出现
const SQL_INJECTION_PATTERNS_RELAXED = [
  /(UNION\s+ALL\s+SELECT|UNION\s+SELECT)/i,
  /(SELECT\s+.+\s+FROM\s+.+\s+WHERE)/i,
  /(INSERT\s+INTO\s+\w+)/i,
  /(UPDATE\s+\w+\s+SET\s+)/i,
  /(DELETE\s+FROM\s+\w+)/i,
  /(DROP\s+(TABLE|DATABASE|INDEX))/i,
  /(ALTER\s+TABLE\s+\w+)/i,
  /(EXEC(UTE)?\s*\()/i,
  /(;\s*DROP\s|;\s*DELETE\s|;\s*UPDATE\s|;\s*INSERT\s)/i,
];

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
  // 跳过富文本内容字段的检查（HTML内容可能包含类似SQL的模式）
  const shouldSkipField = (fieldPath) => {
    // 打印模板API的HTML内容字段
    if (req.path.startsWith('/api/print/')) {
      if (
        ['content', 'header_html', 'footer_html', 'body_html'].some((f) => fieldPath.endsWith(f))
      ) {
        return true;
      }
    }
    // 技术交流API的富文本内容字段
    if (req.path.startsWith('/api/technical-communications')) {
      if (['content', 'solution', 'description'].some((f) => fieldPath.endsWith(f))) {
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
        (field) =>
          fieldPath.endsWith(field) ||
          fieldPath.includes('.attachment') ||
          fieldPath.includes('.url')
      )
    ) {
      return true;
    }
    // 物料规格相关字段 - 可能包含 / * 等特殊字符，完全跳过检测
    const specFieldsSkip = [
      'specs',
      'specification',
      'model',
      'drawing_no',
      'color_code',
    ];
    if (specFieldsSkip.some((field) => fieldPath.endsWith(field))) {
      return 'skip';
    }
    // 业务文本字段 - 使用宽松规则（只检测高危组合）
    const relaxedFields = [
      'remark',
      'remarks',
      'description',
      'location_detail',
      'location',
    ];
    if (relaxedFields.some((field) => fieldPath.endsWith(field))) {
      return 'relaxed';
    }
    return false;
  };

  const checkValue = (value, path = '') => {
    const skipMode = shouldSkipField(path);
    // 完全跳过的字段（如富文本、文件路径、物料规格）
    if (skipMode === true || skipMode === 'skip') {
      return;
    }

    if (typeof value === 'string') {
      // 根据字段类型选择检测模式
      const patterns = skipMode === 'relaxed' ? SQL_INJECTION_PATTERNS_RELAXED : SQL_INJECTION_PATTERNS;
      for (const pattern of patterns) {
        if (pattern.test(value)) {
          logger.security('⚠️ 检测到SQL注入尝试', {
            ip: req.ip,
            url: req.originalUrl,
            path,
            mode: skipMode === 'relaxed' ? 'relaxed' : 'strict',
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
          logger.security('⚠️ 检测到XSS攻击尝试', {
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
      logger.security('⚠️ 检测到路径遍历攻击尝试', {
        ip: req.ip,
        url: req.originalUrl,
        userAgent: req.get('User-Agent'),
      });

      return res.status(400).json({
        success: false,
        message: 'Invalid request path',
      });
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

      // 检查文件类型
      const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];

      if (!allowedMimeTypes.includes(file.mimetype)) {
        logger.security('⚠️ 未授权文件类型上传尝试', {
          ip: req.ip,
          filename: file.originalname,
          mimetype: file.mimetype,
          userAgent: req.get('User-Agent'),
        });

        return res.status(400).json({
          success: false,
          message: '不支持的文件类型',
        });
      }

      // 检查文件大小（10MB 限制）
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: '文件大小超过限制',
        });
      }
    }
  }

  next();
};

// 增强的 Helmet 配置
const enhancedHelmet = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// 组合安全中间件（内部系统无需 IP 黑名单和可疑活动检测）
const securityMiddleware = [
  enhancedHelmet,
  pathTraversalDetection,
  sqlInjectionDetection,
  xssDetection,
  fileUploadSecurity,
];

module.exports = {
  securityMiddleware,
  sqlInjectionDetection,
  xssDetection,
  pathTraversalDetection,
  fileUploadSecurity,
  enhancedHelmet,
};
