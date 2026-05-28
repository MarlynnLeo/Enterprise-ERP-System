const isProduction = import.meta.env.PROD;
const isDevelopment = import.meta.env.DEV;

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const currentLevel = isProduction ? LEVELS.warn : LEVELS.debug;

const SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'key',
  'auth',
  'authorization',
  'cookie',
  'session',
  'csrf',
  'api_key',
  'access_token',
  'refresh_token'
];

function shouldLog(level) {
  return currentLevel >= LEVELS[level];
}

function sanitize(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen));
  }

  return Object.entries(value).reduce((result, [key, itemValue]) => {
    const normalizedKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((field) => normalizedKey.includes(field));
    result[key] = isSensitive ? '[REDACTED]' : sanitize(itemValue, seen);
    return result;
  }, {});
}

function sanitizeArgs(args) {
  return args.map((item) => sanitize(item));
}

const logger = {
  isProduction,
  isDevelopment,

  error(message, ...args) {
    if (shouldLog('error')) {
      console.error(`[ERROR] ${message}`, ...sanitizeArgs(args));
    }
  },

  warn(message, ...args) {
    if (shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...sanitizeArgs(args));
    }
  },

  info(message, ...args) {
    if (shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...sanitizeArgs(args));
    }
  },

  log(message, ...args) {
    if (shouldLog('info')) {
      console.info(message, ...sanitizeArgs(args));
    }
  },

  debug(message, ...args) {
    if (shouldLog('debug')) {
      console.info(`[DEBUG] ${message}`, ...sanitizeArgs(args));
    }
  },

  dev(message, ...args) {
    if (isDevelopment) {
      console.info(`[DEV] ${message}`, ...sanitizeArgs(args));
    }
  },

  permission(message, ...args) {
    const enablePermissionDebug = isDevelopment && localStorage.getItem('debug_permissions') === 'true';
    if (enablePermissionDebug) {
      console.info(`[PERMISSION] ${message}`, ...sanitizeArgs(args));
    }
  },

  api(method, url, data = null) {
    if (!isDevelopment) {
      return;
    }

    console.groupCollapsed(`[API] ${String(method).toUpperCase()} ${url}`);
    if (data) {
      console.info(sanitize(data));
    }
    console.groupEnd();
  },

  apiResponse(url, data = null) {
    if (!isDevelopment) {
      return;
    }

    console.groupCollapsed(`[API Response] ${url}`);
    if (data) {
      console.info(sanitize(data));
    }
    console.groupEnd();
  },

  performance(label, duration) {
    if (isProduction && duration <= 1000) {
      return;
    }

    const method = duration > 1000 ? 'warn' : 'info';
    console[method](`[PERF] ${label}: ${duration}ms`);
  },

  userAction(action, payload = null) {
    const args = payload ? [sanitize(payload)] : [];
    if (isProduction) {
      console.info(`[USER_ACTION] ${action}`, ...args);
      return;
    }
    console.info(`[USER_ACTION] ${action}`, ...args);
  },

  sanitizeObject: sanitize
};

export const diagnosticLogger = {
  log: (...args) => {
    if (isDevelopment) {
      console.info(...sanitizeArgs(args));
    }
  },
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...sanitizeArgs(args));
    }
  },
  debug: (...args) => {
    if (isDevelopment) {
      console.info(...sanitizeArgs(args));
    }
  },
  info: (...args) => {
    if (isDevelopment) {
      console.info(...sanitizeArgs(args));
    }
  },
  error: (...args) => {
    if (shouldLog('error')) {
      console.error(...sanitizeArgs(args));
    }
  },
  table: (data) => {
    if (isDevelopment) {
      console.table(sanitize(data));
    }
  },
  group: (label) => {
    if (isDevelopment) {
      console.group(label);
    }
  },
  groupCollapsed: (label) => {
    if (isDevelopment) {
      console.groupCollapsed(label);
    }
  },
  groupEnd: () => {
    if (isDevelopment) {
      console.groupEnd();
    }
  },
  time: (label) => {
    if (isDevelopment) {
      console.time(label);
    }
  },
  timeEnd: (label) => {
    if (isDevelopment) {
      console.timeEnd(label);
    }
  }
};

export const createLogger = (prefix) => ({
  log: (...args) => diagnosticLogger.log(prefix, ...args),
  warn: (...args) => diagnosticLogger.warn(prefix, ...args),
  error: (...args) => diagnosticLogger.error(prefix, ...args),
  debug: (...args) => diagnosticLogger.debug(prefix, ...args),
  info: (...args) => diagnosticLogger.info(prefix, ...args)
});

export default logger;

export const dev = (...args) => logger.dev(...args);
export const debug = (...args) => logger.debug(...args);
export const info = (...args) => logger.info(...args);
export const warn = (...args) => logger.warn(...args);
export const error = (...args) => logger.error(...args);
export const api = (...args) => logger.api(...args);
export const apiResponse = (...args) => logger.apiResponse(...args);
export const performance = (...args) => logger.performance(...args);
export const userAction = (...args) => logger.userAction(...args);
