const DEFAULT_EXCHANGE_RATE_TIMEOUT_MS = 5000;
const DEFAULT_EXCHANGE_RATE_FALLBACK = 7.24;
const DEFAULT_REFRESH_CRON = '0 */4 * * *';
const DEFAULT_STARTUP_DELAY_MS = 5000;

const DEFAULT_REFERENCE_PRICES = Object.freeze({
  GOLD: 34529.35,
  PLATINUM: 9020,
  ALUMINUM: 19150,
  COPPER: 69200,
});

const DEFAULT_EXTERNAL_BENCHMARKS = Object.freeze({
  GOLD_USD_PER_OZ: 2050,
  PLATINUM_USD_PER_OZ: 950,
});

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readString = (value) => (typeof value === 'string' ? value.trim() : '');

const MARKET_PRICE_CONFIG = Object.freeze({
  exchangeRateUrl: readString(process.env.METAL_PRICE_EXCHANGE_RATE_URL),
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
  referencePrices: Object.freeze({
    GOLD: parseNumber(process.env.METAL_PRICE_GOLD_REFERENCE_CNY_PER_OZ, DEFAULT_REFERENCE_PRICES.GOLD),
    PLATINUM: parseNumber(
      process.env.METAL_PRICE_PLATINUM_REFERENCE_CNY_PER_OZ,
      DEFAULT_REFERENCE_PRICES.PLATINUM
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
    PLATINUM_USD_PER_OZ: parseNumber(
      process.env.METAL_PRICE_PLATINUM_USD_PER_OZ,
      DEFAULT_EXTERNAL_BENCHMARKS.PLATINUM_USD_PER_OZ
    ),
  }),
});

module.exports = {
  MARKET_PRICE_CONFIG,
};
