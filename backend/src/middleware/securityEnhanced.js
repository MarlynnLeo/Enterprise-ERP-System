/**
 * 增强安全中间件
 * @description 提供额外的安全检查和防护措施（高级安全功能）
 * @author 系统
 * @date 2025-08-28
 * @updated 2025-11-22 - 统一配置管理
 */

const helmet = require('helmet');
const { logger } = require('../utils/logger');
const { UnifiedAppError } = require('./unifiedErrorHandler');
const { RATE_LIMIT_CONFIG } = require('../config/security');

// IP 黑名单（可以从数据库或配置文件加载）
const blacklistedIPs = new Set();

// 可疑活动检测
const suspiciousActivity = new Map();

// SQL 注入检测模式
// 注意：移除了单独的 * 和 " 字符检测，因为在物料规格中 * 常用作乘号（如：400x600*120mm）
// 双引号在很多正常输入中也会出现
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
  /(\'|;|--)/, // 单引号、分号、双横线注释
  /(\/\*|\*\/)/, // SQL块注释标记
  /(\bOR\b|\bAND\b).*(\=|\<|\>)/i,
  /(UNION.*SELECT|SELECT.*FROM|INSERT.*INTO|UPDATE.*SET|DELETE.*FROM)/i,
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

// IP 黑名单检查中间件
const ipBlacklistCheck = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;

  if (blacklistedIPs.has(clientIP)) {
    logger.security('🚫 被封禁IP访问已拦截', {
      ip: clientIP,
      url: req.originalUrl,
      userAgent: req.get('User-Agent'),
    });

    return res.status(403).json({
      success: false,
      message: '访问被拒绝',
    });
  }

  next();
};

// 检查是否为内网IP
const isPrivateIP = (ip) => {
  const cleanIP = ip.replace('::ffff:', '');
  return (
    cleanIP.startsWith('192.168.') ||
    cleanIP.startsWith('10.') ||
    cleanIP.startsWith('172.16.') ||
    cleanIP.startsWith('127.') ||
    cleanIP === 'localhost'
  );
};

// 可疑活动检测中间件（高级安全功能）
// 使用统一配置，可通过环境变量控制
const suspiciousActivityDetection = (req, res, next) => {
  const config = RATE_LIMIT_CONFIG.suspiciousActivity;

  // 检查是否启用
  if (!config.enabled) {
    return next();
  }

  const clientIP = req.ip || req.connection.remoteAddress;

  // 开发环境跳过检查
  if (config.skipInDevelopment && process.env.NODE_ENV === 'development') {
    return next();
  }

  const now = Date.now();
  const timeWindow = config.timeWindow;
  // 对内网IP更宽松的限制
  const maxRequests = isPrivateIP(clientIP)
    ? config.maxRequestsInternal
    : config.maxRequestsExternal;

  if (!suspiciousActivity.has(clientIP)) {
    suspiciousActivity.set(clientIP, {
      requests: [],
      warnings: 0,
    });
  }

  const activity = suspiciousActivity.get(clientIP);

  // 清理过期的请求记录
  activity.requests = activity.requests.filter((time) => now - time < timeWindow);

  // 添加当前请求
  activity.requests.push(now);

  // 检查是否超过阈值
  if (activity.requests.length > maxRequests) {
    activity.warnings++;

    logger.security('⚠️ 检测到可疑活动', {
      ip: clientIP,
      requestCount: activity.requests.length,
      warnings: activity.warnings,
      url: req.originalUrl,
    });

    // 如果警告次数过多，加入黑名单（但不对内网IP加入黑名单）
    if (activity.warnings > config.maxWarnings && !isPrivateIP(clientIP)) {
      blacklistedIPs.add(clientIP);
      logger.security('🚫 IP已加入黑名单', { ip: clientIP });
    }

    return res.status(429).json({
      success: false,
      message: '请求过于频繁，请稍后再试',
    });
  }

  next();
};

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
    // 物料规格相关字段 - 可能包含 / * 等特殊字符（如：K22/25、400*600*120mm、水平/垂直可调整型、J1-01-02/J1-01-03）
    const specFields = [
      'specs',
      'specification',
      'model',
      'drawing_no',
      'color_code',
      'remark',
      'remarks',
      'description',
      'name',
      'location_detail',
      'location',
    ];
    if (specFields.some((field) => fieldPath.endsWith(field))) {
      return true;
    }
    return false;
  };

  const checkValue = (value, path = '') => {
    // 跳过白名单字段
    if (shouldSkipField(path)) {
      return;
    }

    if (typeof value === 'string') {
      for (const pattern of SQL_INJECTION_PATTERNS) {
        if (pattern.test(value)) {
          logger.security('⚠️ 检测到SQL注入尝试', {
            ip: req.ip,
            url: req.originalUrl,
            path,
            value: value.substring(0, 100), // 只记录前100个字符
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

// 组合安全中间件
const securityMiddleware = [
  enhancedHelmet,
  ipBlacklistCheck,
  suspiciousActivityDetection,
  pathTraversalDetection,
  sqlInjectionDetection,
  xssDetection,
  fileUploadSecurity,
];

// 清除黑名单的函数
const clearBlacklist = () => {
  blacklistedIPs.clear();
  suspiciousActivity.clear();
  logger.info('✅ 安全黑名单已清除');
};

// 移除特定IP的函数
const removeFromBlacklist = (ip) => {
  blacklistedIPs.delete(ip);
  suspiciousActivity.delete(ip);
  logger.info('✅ IP已从黑名单移除', { ip });
};

// 获取黑名单状态
const getSecurityStatus = () => {
  return {
    blacklistedIPs: Array.from(blacklistedIPs),
    suspiciousActivity: Array.from(suspiciousActivity.entries()).map(([ip, data]) => ({
      ip,
      requests: data.requests.length,
      warnings: data.warnings,
    })),
  };
};

module.exports = {
  securityMiddleware,
  ipBlacklistCheck,
  suspiciousActivityDetection,
  sqlInjectionDetection,
  xssDetection,
  pathTraversalDetection,
  fileUploadSecurity,
  enhancedHelmet,
  clearBlacklist,
  removeFromBlacklist,
  getSecurityStatus,
};
