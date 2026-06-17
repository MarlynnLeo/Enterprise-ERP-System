// Open-Meteo 天气 API 配置（需在 .env 中设置 OPEN_METEO_BASE_URL）
const DEFAULT_OPEN_METEO_TIMEOUT_MS = 5000;
const DEFAULT_OPEN_METEO_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_OPEN_METEO_RETRIES = 1;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseNonNegativeInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const readString = (value) => (typeof value === 'string' ? value.trim() : '');

const OPEN_METEO_CONFIG = Object.freeze({
  baseUrl: readString(process.env.OPEN_METEO_BASE_URL),
  timeout: parsePositiveInt(process.env.OPEN_METEO_TIMEOUT_MS, DEFAULT_OPEN_METEO_TIMEOUT_MS),
  timezone: readString(process.env.OPEN_METEO_TIMEZONE) || DEFAULT_OPEN_METEO_TIMEZONE,
  retries: parseNonNegativeInt(process.env.OPEN_METEO_RETRIES, DEFAULT_OPEN_METEO_RETRIES),
});

module.exports = {
  OPEN_METEO_CONFIG,
};
