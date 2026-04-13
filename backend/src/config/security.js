/**
 * 安全配置
 * @description 系统安全相关配置
 * @author 系统
 * @date 2025-08-28
 */

// 密码策略配置
const PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  maxAttempts: 5, // 最大登录尝试次数（超过后锁定账户）
  lockoutDuration: 15 * 60 * 1000, // 锁定时间（毫秒）
  passwordHistory: 5, // 记住最近5个密码
};

// JWT 配置
const JWT_CONFIG = {
  accessTokenExpiry: '2h', // 访问令牌过期时间（2小时）
  refreshTokenExpiry: '7d', // 刷新令牌过期时间
  issuer: 'erp-system',
  audience: 'erp-users',
  algorithm: 'HS256',
};

// 会话配置
const SESSION_CONFIG = {
  maxAge: 24 * 60 * 60 * 1000, // 24小时
  secure: process.env.NODE_ENV === 'production', // 生产环境使用 HTTPS
  httpOnly: true,
  sameSite: 'strict',
};

// 速率限制配置
const RATE_LIMIT_CONFIG = {
  // 全局限制 - 从环境变量读取，支持批量操作场景
  global: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 默认15分钟
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 500, // 默认500次（支持批量处理）
    message: {
      success: false,
      message: '请求过于频繁，请稍后再试',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // 跳过健康检查端点
      return req.path === '/api/ping' || req.path === '/api/health';
    },
  },

  // 登录限制 - 防止暴力破解（已禁用）
  login: {
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 20, // 15分钟内最多20次登录尝试
    message: {
      success: false,
      message: '登录尝试次数过多，请15分钟后再试',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
    },
    skipSuccessfulRequests: true,
  },

  // 可疑活动检测配置（高级安全功能）
  suspiciousActivity: {
    enabled: process.env.ENABLE_SUSPICIOUS_ACTIVITY_DETECTION !== 'false',
    timeWindow: 60000, // 1分钟
    maxRequestsExternal: 200, // 外网IP每分钟最大请求数
    maxRequestsInternal: 1000, // 内网IP每分钟最大请求数
    maxWarnings: 3, // 最大警告次数后加入黑名单
    skipInDevelopment: true, // 开发环境跳过检查
  },

  // 文件上传限制
  upload: {
    windowMs: 60 * 60 * 1000, // 1小时
    max: 50, // 每个IP每小时最多50次上传
  },
};

// 文件上传安全配置
const FILE_UPLOAD_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 10, // 最多10个文件
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
    'text/plain',
  ],
  allowedExtensions: [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.pdf',
    '.xls',
    '.xlsx',
    '.doc',
    '.docx',
    '.csv',
    '.txt',
  ],
  uploadPath: './uploads/',
  tempPath: './temp/',
};

// 数据库安全配置
const DATABASE_CONFIG = {
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true,
  ssl:
    process.env.NODE_ENV === 'production'
      ? {
          rejectUnauthorized: false,
        }
      : false,
};

// CORS 配置
// @deprecated — 此配置未被任何模块消费，实际CORS配置在 app.js 中内联定义
// TODO: 下个版本移除此常量，将 app.js 中的 CORS 配置迁移至此处统一管理
const CORS_CONFIG = {
  origin: function (origin, callback) {
    // 从环境变量获取允许的源，如果未设置则根据环境使用默认值
    let allowedOrigins;
    if (process.env.ALLOWED_ORIGINS) {
      allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
    } else if (process.env.NODE_ENV === 'production') {
      // 生产环境必须明确设置 ALLOWED_ORIGINS
      allowedOrigins = [];
    } else {
      // 开发环境使用默认值
      allowedOrigins = ['http://localhost:3000', 'http://localhost:3100', 'http://localhost:8080'];
    }

    // 允许没有 origin 的请求（如移动应用）
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
};

// 内容安全策略
const CSP_CONFIG = {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    scriptSrc: ["'self'", "'unsafe-eval'"], // 开发环境可能需要 unsafe-eval
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: ["'self'", 'ws:', 'wss:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
  },
  reportOnly: process.env.NODE_ENV === 'development',
};

// 安全头配置
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

// 输入验证配置
const INPUT_VALIDATION = {
  // 字符串长度限制
  maxStringLength: 1000,
  maxTextLength: 10000,

  // 数字范围限制
  maxInteger: Number.MAX_SAFE_INTEGER,
  minInteger: Number.MIN_SAFE_INTEGER,

  // 数组长度限制
  maxArrayLength: 1000,

  // 对象深度限制
  maxObjectDepth: 10,

  // 禁止的字符
  // eslint-disable-next-line no-script-url
  forbiddenChars: ['<script', '</script>', 'javascript:', 'vbscript:', 'onload=', 'onerror='],
};

// 审计日志配置
const AUDIT_CONFIG = {
  enabled: true,
  logLevel: 'info',
  includeRequestBody: false, // 不记录请求体以保护敏感信息
  includeResponseBody: false,
  sensitiveFields: ['password', 'token', 'secret', 'key', 'auth'],
  retentionDays: 90,
};

// 加密配置
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  tagLength: 16,
  saltRounds: 12, // bcrypt 盐轮数
};

module.exports = {
  PASSWORD_POLICY,
  JWT_CONFIG,
  SESSION_CONFIG,
  RATE_LIMIT_CONFIG,
  FILE_UPLOAD_CONFIG,
  DATABASE_CONFIG,
  CORS_CONFIG,
  CSP_CONFIG,
  SECURITY_HEADERS,
  INPUT_VALIDATION,
  AUDIT_CONFIG,
  ENCRYPTION_CONFIG,
};
