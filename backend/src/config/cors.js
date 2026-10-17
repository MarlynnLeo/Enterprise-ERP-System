const { isIPv4 } = require('node:net');
const { logger } = require('../utils/logger');

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isPrivateNetworkOrigin(origin) {
  try {
    const url = new URL(origin);
    // Validate the actual host, not a prefix that an attacker-owned domain
    // or URL userinfo can imitate. Origin headers contain no path or credentials.
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      !isIPv4(url.hostname)
    ) {
      return false;
    }
    const [first, second] = url.hostname.split('.').map(Number);
    return (
      first === 10 ||
      (first === 192 && second === 168) ||
      (first === 172 && second >= 16 && second <= 31)
    );
  } catch {
    return false;
  }
}

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
    if (allowedOrigins.length === 0) {
      return false;
    }
    if (!origin) return true;
    return (
      allowedOrigins.includes(origin) ||
      isPrivateNetworkOrigin(origin) ||
      LOCAL_DEV_ORIGIN.test(origin)
    );
  }

  if (!origin) return true;
  return (
    allowedOrigins.includes(origin) ||
    LOCAL_DEV_ORIGIN.test(origin) ||
    isPrivateNetworkOrigin(origin)
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
      return callback(null, false);
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
