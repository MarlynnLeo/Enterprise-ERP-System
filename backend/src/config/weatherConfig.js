// Open-Meteo 天气 API（public-apis / 免费无 Key）
// 默认写死可用公共 URL，避免未配置 OPEN_METEO_BASE_URL 时永远拉不到数据

const DEFAULT_OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
const DEFAULT_OPEN_METEO_TIMEOUT_MS = 8000;
const DEFAULT_OPEN_METEO_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_OPEN_METEO_RETRIES = 2;

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
  // 环境变量可覆盖；为空则使用官方免费 endpoint
  baseUrl: readString(process.env.OPEN_METEO_BASE_URL) || DEFAULT_OPEN_METEO_BASE_URL,
  timeout: parsePositiveInt(process.env.OPEN_METEO_TIMEOUT_MS, DEFAULT_OPEN_METEO_TIMEOUT_MS),
  timezone: readString(process.env.OPEN_METEO_TIMEZONE) || DEFAULT_OPEN_METEO_TIMEZONE,
  retries: parseNonNegativeInt(process.env.OPEN_METEO_RETRIES, DEFAULT_OPEN_METEO_RETRIES),
  // 备用：wttr.in
  enableWttrFallback:
    String(process.env.WEATHER_ENABLE_WTTR_FALLBACK || 'true').toLowerCase() !== 'false',
});

module.exports = {
  OPEN_METEO_CONFIG,
  DEFAULT_OPEN_METEO_BASE_URL,
};
