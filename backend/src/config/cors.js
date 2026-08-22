const { logger } = require('../utils/logger');

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
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

  if (isProd) {
    // Production: only explicit ALLOWED_ORIGINS. Private-LAN regex is
    // development convenience and must not widen the production CORS surface.
    if (allowedOrigins.length === 0) {
      return false;
    }
    // Same-origin / non-browser clients may omit Origin; allow only when
    // ALLOWED_ORIGINS is configured (CSRF still protects cookie sessions).
    if (!origin) return true;
    return allowedOrigins.includes(origin);
  }

  if (!origin) return true;
  return (
    allowedOrigins.includes(origin) ||
    LOCAL_DEV_ORIGIN.test(origin) ||
    PRIVATE_NETWORK_ORIGIN.test(origin)
  );
}

function createCorsOptions(overrides = {}) {
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }

      const isProd = process.env.NODE_ENV === 'production';
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
  LOCAL_DEV_ORIGIN,
  createCorsOptions,
  isOriginAllowed,
  parseAllowedOrigins,
};
