/**
 * 金属 / 汇率外部数据源配置
 * 默认接入 public-apis 生态免费源（多源故障转移见 PublicMarketDataService）
 */

const DEFAULT_EXCHANGE_RATE_TIMEOUT_MS = 8000;
const DEFAULT_EXCHANGE_RATE_FALLBACK = 7.24;
const DEFAULT_REFRESH_CRON = '0 */4 * * *';
const DEFAULT_STARTUP_DELAY_MS = 5000;

// 默认汇率 URL：Frankfurter（public-apis Currency Exchange，No Auth）
// 注意：api.frankfurter.app 会 301，使用 api.frankfurter.dev
const DEFAULT_EXCHANGE_RATE_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY';

const DEFAULT_REFERENCE_PRICES = Object.freeze({
  GOLD: 34529.35,
  SILVER: 450,
  ALUMINUM: 19150,
  COPPER: 69200,
});

const DEFAULT_EXTERNAL_BENCHMARKS = Object.freeze({
  GOLD_USD_PER_OZ: 2050,
  SILVER_USD_PER_OZ: 30,
});

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readString = (value) => (typeof value === 'string' ? value.trim() : '');

const MARKET_PRICE_CONFIG = Object.freeze({
  // 单 URL（兼容旧逻辑）；真正拉取走 PublicMarketDataService 多源
  exchangeRateUrl: readString(process.env.METAL_PRICE_EXCHANGE_RATE_URL) || DEFAULT_EXCHANGE_RATE_URL,
  exchangeRateTimeoutMs: parseNumber(
    process.env.METAL_PRICE_EXCHANGE_RATE_TIMEOUT_MS,
    DEFAULT_EXCHANGE_RATE_TIMEOUT_MS
  ),
  exchangeRateFallback: parseNumber(
    process.env.METAL_PRICE_USD_CNY_FALLBACK,
    DEFAULT_EXCHANGE_RATE_FALLBACK
  ),
  refreshCron: readString(process.env.METAL_PRICE_REFRESH_CRON) || DEFAULT_REFRESH_CRON,
  startupDelayMs: parseNumber(process.env.METAL_PRICE_STARTUP_DELAY_MS, DEFAULT_STARTUP_DELAY_MS),
  // 是否启用 Yahoo 金属期货公开接口
  enableYahooMetals: String(process.env.METAL_PRICE_ENABLE_YAHOO || 'true').toLowerCase() !== 'false',
  referencePrices: Object.freeze({
    GOLD: parseNumber(process.env.METAL_PRICE_GOLD_REFERENCE_CNY_PER_OZ, DEFAULT_REFERENCE_PRICES.GOLD),
    SILVER: parseNumber(
      process.env.METAL_PRICE_SILVER_REFERENCE_CNY_PER_OZ,
      DEFAULT_REFERENCE_PRICES.SILVER
    ),
    ALUMINUM: parseNumber(
      process.env.METAL_PRICE_ALUMINUM_REFERENCE_CNY_PER_TON,
      DEFAULT_REFERENCE_PRICES.ALUMINUM
    ),
    COPPER: parseNumber(
      process.env.METAL_PRICE_COPPER_REFERENCE_CNY_PER_TON,
      DEFAULT_REFERENCE_PRICES.COPPER
    ),
  }),
  externalBenchmarks: Object.freeze({
    GOLD_USD_PER_OZ: parseNumber(
      process.env.METAL_PRICE_GOLD_USD_PER_OZ,
      DEFAULT_EXTERNAL_BENCHMARKS.GOLD_USD_PER_OZ
    ),
    SILVER_USD_PER_OZ: parseNumber(
      process.env.METAL_PRICE_SILVER_USD_PER_OZ,
      DEFAULT_EXTERNAL_BENCHMARKS.SILVER_USD_PER_OZ
    ),
  }),
});

module.exports = {
  MARKET_PRICE_CONFIG,
  DEFAULT_EXCHANGE_RATE_URL,
};
