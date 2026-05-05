const logger = require('../utils/logger');

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3100',
  'http://localhost:3101',
  'http://localhost:3102',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3100',
  'http://127.0.0.1:3101',
  'http://127.0.0.1:3102',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'https://localhost:3100',
  'https://localhost:3101',
  'https://localhost:3102',
  'https://127.0.0.1:3100',
  'https://127.0.0.1:3101',
  'https://127.0.0.1:3102',
];

const PRIVATE_NETWORK_ORIGIN = /^(http|https):\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/;

function parseAllowedOrigins(raw = process.env.ALLOWED_ORIGINS || '') {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin) {
  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = parseAllowedOrigins();

  if (!isProd) {
    if (!origin) return true;
    return (
      allowedOrigins.includes(origin) ||
      DEFAULT_DEV_ORIGINS.includes(origin) ||
      PRIVATE_NETWORK_ORIGIN.test(origin)
    );
  }

  if (allowedOrigins.length === 0) {
    return false;
  }

  if (!origin) {
    return true;
  }

  return allowedOrigins.includes(origin);
}

function createCorsOptions(overrides = {}) {
  return {
    origin(origin, callback) {
      const isProd = process.env.NODE_ENV === 'production';
      const allowedOrigins = parseAllowedOrigins();

      if (isProd && allowedOrigins.length === 0) {
        logger.error('生产环境未配置 ALLOWED_ORIGINS 环境变量');
        return callback(new Error('CORS配置错误'));
      }

      if (isOriginAllowed(origin)) {
        if (isProd && !origin) {
          logger.info('CORS: 允许无 Origin 请求');
        }
        return callback(null, true);
      }

      const envLabel = isProd ? '生产环境' : '开发环境';
      logger.warn(`${envLabel}拒绝未授权的CORS请求: ${origin}`);
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
    exposedHeaders: ['X-CSRF-Token', 'X-Request-ID'],
    maxAge: 86400,
    ...overrides,
  };
}

module.exports = {
  DEFAULT_DEV_ORIGINS,
  createCorsOptions,
  isOriginAllowed,
  parseAllowedOrigins,
};
