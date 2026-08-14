/**
 * 金属价格本地种子与刷新节奏。
 * 实时行情与汇率只走 PublicMarketDataService / ExchangeRateService。
 */

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readString = (value) => (typeof value === 'string' ? value.trim() : '');

const MARKET_PRICE_CONFIG = Object.freeze({
  refreshCron: readString(process.env.METAL_PRICE_REFRESH_CRON) || '0 */4 * * *',
  startupDelayMs: parseNumber(process.env.METAL_PRICE_STARTUP_DELAY_MS, 5000),
  referencePrices: Object.freeze({
    GOLD: parseNumber(process.env.METAL_PRICE_GOLD_REFERENCE_CNY_PER_OZ, 29350),
    SILVER: parseNumber(process.env.METAL_PRICE_SILVER_REFERENCE_CNY_PER_OZ, 438),
    ALUMINUM: parseNumber(process.env.METAL_PRICE_ALUMINUM_REFERENCE_CNY_PER_TON, 23200),
    COPPER: parseNumber(process.env.METAL_PRICE_COPPER_REFERENCE_CNY_PER_TON, 98100),
  }),
});

module.exports = {
  MARKET_PRICE_CONFIG,
};
