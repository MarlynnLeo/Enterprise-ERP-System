const { getBasicConfig } = require('./database-config');

const isProduction = process.env.NODE_ENV === 'production';

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const apiHost = process.env.API_HOST || (isProduction ? '' : 'localhost');
const apiPort = parsePositiveInt(process.env.PORT, 8080);
const defaultPublicApiBaseUrl = isProduction ? '' : `http://${apiHost}:${apiPort}`;

module.exports = {
  api: {
    baseUrl: process.env.API_BASE_URL || '',
    protocol: process.env.API_PROTOCOL || 'http',
    host: apiHost,
    port: apiPort,
  },

  server: {
    port: apiPort,
    publicApiBaseUrl:
      process.env.PUBLIC_API_BASE_URL ||
      process.env.API_BASE_URL ||
      defaultPublicApiBaseUrl,
    timeoutMs: parsePositiveInt(process.env.SERVER_TIMEOUT_MS, 120000),
    nodemonRestartDelayMs: parsePositiveInt(process.env.NODEMON_RESTART_DELAY_MS, 500),
    gcIntervalMs: parsePositiveInt(process.env.GC_INTERVAL_MS, 30 * 60 * 1000),
  },

  database: getBasicConfig(),

  system: {
    defaultPageSize: parsePositiveInt(process.env.DEFAULT_PAGE_SIZE, 10),
    maxPageSize: parsePositiveInt(process.env.MAX_PAGE_SIZE, 100),
  },
};
