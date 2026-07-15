/**
 * PublicMarketDataService
 * 基于 public-apis 生态中的免费公开接口，多源故障转移：
 * - 天气: Open-Meteo（public-apis / Weather）
 * - 汇率: Frankfurter · open.er-api · VATComply · fawazahmed0 currency-api
 * - 金属: Yahoo Finance 期货现货近似（公开 chart API）+ 汇率折算
 *
 * 设计：任一源失败自动试下一源；全部失败抛错由上层回退缓存/配置价。
 */

const { httpGet } = require('../../utils/httpClient');
const { logger } = require('../../utils/logger');

const DEFAULT_TIMEOUT = 8000;
const UA = { 'User-Agent': 'KACON-ERP/1.0 (public market data client)' };

async function getJson(url, params, timeout = DEFAULT_TIMEOUT) {
  const response = await httpGet(url, {
    params,
    timeout,
    retries: 1,
    headers: UA,
  });
  if (response.status && (response.status < 200 || response.status >= 300)) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }
  if (typeof response.data === 'string' && response.data.trim().startsWith('<')) {
    throw new Error(`Non-JSON HTML response from ${url}`);
  }
  return response.data;
}

// ==================== 汇率（USD → CNY 等） ====================

const FX_SOURCES = [
  {
    name: 'frankfurter.dev',
    // public-apis: Frankfurter
    async fetch(base, quote) {
      const data = await getJson('https://api.frankfurter.dev/v1/latest', {
        base: base.toUpperCase(),
        symbols: quote.toUpperCase(),
      });
      const rate = data?.rates?.[quote.toUpperCase()];
      if (!Number.isFinite(Number(rate))) throw new Error('no rate');
      return { rate: Number(rate), date: data.date, source: 'frankfurter.dev' };
    },
  },
  {
    name: 'open.er-api.com',
    // public-apis 相关 Free ExchangeRate-API open endpoint
    async fetch(base, quote) {
      const data = await getJson(`https://open.er-api.com/v6/latest/${base.toUpperCase()}`);
      if (data?.result !== 'success') throw new Error(data?.['error-type'] || 'er-api fail');
      const rate = data?.rates?.[quote.toUpperCase()];
      if (!Number.isFinite(Number(rate))) throw new Error('no rate');
      return { rate: Number(rate), date: data.time_last_update_utc, source: 'open.er-api.com' };
    },
  },
  {
    name: 'vatcomply.com',
    // public-apis: VATComply.com
    async fetch(base, quote) {
      const data = await getJson('https://api.vatcomply.com/rates', { base: base.toUpperCase() });
      const rate = data?.rates?.[quote.toUpperCase()];
      if (!Number.isFinite(Number(rate))) throw new Error('no rate');
      return { rate: Number(rate), date: data.date, source: 'vatcomply.com' };
    },
  },
  {
    name: 'fawazahmed0/currency-api',
    // public-apis: Currency-api (fawazahmed0)
    async fetch(base, quote) {
      const b = base.toLowerCase();
      const q = quote.toLowerCase();
      const data = await getJson(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${b}.json`
      );
      const rate = data?.[b]?.[q];
      if (!Number.isFinite(Number(rate))) throw new Error('no rate');
      return { rate: Number(rate), date: data.date, source: 'fawazahmed0/currency-api' };
    },
  },
];

/**
 * @param {string} [base='USD']
 * @param {string} [quote='CNY']
 * @returns {Promise<{rate:number,date?:string,source:string}>}
 */
async function fetchExchangeRate(base = 'USD', quote = 'CNY') {
  const errors = [];
  for (const src of FX_SOURCES) {
    try {
      const result = await src.fetch(base, quote);
      logger.info(`[PublicMarket] FX ${base}/${quote}=${result.rate} via ${result.source}`);
      return result;
    } catch (error) {
      errors.push(`${src.name}: ${error.message}`);
      logger.warn(`[PublicMarket] FX source failed ${src.name}: ${error.message}`);
    }
  }
  throw new Error(`All FX sources failed: ${errors.join(' | ')}`);
}

// ==================== 金属价格 ====================

/** Yahoo Finance 期货代码 → 我方金属符号 */
const YAHOO_METAL_SYMBOLS = Object.freeze({
  GOLD: { ticker: 'GC=F', unitUsd: 'oz', name: '黄金' },
  SILVER: { ticker: 'SI=F', unitUsd: 'oz', name: '白银' },
  // ALI=F COMEX 铝 ≈ USD/吨
  ALUMINUM: { ticker: 'ALI=F', unitUsd: 'ton', name: '铝' },
  // HG=F 铜 USD/磅 → 吨
  COPPER: { ticker: 'HG=F', unitUsd: 'lb', name: '铜' },
});

const LB_PER_METRIC_TON = 2204.62262185;

async function fetchYahooQuote(ticker) {
  const data = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}`,
    null,
    10000
  );
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice ?? meta?.previousClose;
  if (!Number.isFinite(Number(price))) {
    throw new Error(`Yahoo quote missing for ${ticker}`);
  }
  return {
    price: Number(price),
    currency: meta.currency || 'USD',
    symbol: ticker,
  };
}

/**
 * 拉取金属人民币参考价
 * @param {number} usdCnyRate
 * @returns {Promise<Record<string,{price:number,source:string,usdPrice:number}>>}
 */
async function fetchMetalPricesCny(usdCnyRate) {
  if (!Number.isFinite(Number(usdCnyRate)) || usdCnyRate <= 0) {
    throw new Error('usdCnyRate required');
  }
  const result = {};
  const errors = [];

  for (const [symbol, def] of Object.entries(YAHOO_METAL_SYMBOLS)) {
    try {
      const quote = await fetchYahooQuote(def.ticker);
      let usdPerUnit = quote.price;
      // 铜：USD/磅 → USD/吨
      if (def.unitUsd === 'lb') {
        usdPerUnit = quote.price * LB_PER_METRIC_TON;
      }
      const cnyPrice = usdPerUnit * usdCnyRate;
      result[symbol] = {
        price: cnyPrice,
        usdPrice: usdPerUnit,
        source: `yahoo:${def.ticker}`,
        name: def.name,
      };
    } catch (error) {
      errors.push(`${symbol}: ${error.message}`);
      logger.warn(`[PublicMarket] metal ${symbol} failed: ${error.message}`);
    }
  }

  if (Object.keys(result).length === 0) {
    throw new Error(`All metal sources failed: ${errors.join(' | ')}`);
  }
  return result;
}

// ==================== 天气 ====================

const WEATHER_ENDPOINTS = [
  'https://api.open-meteo.com/v1/forecast',
  'https://api.open-meteo.com/v1/forecast', // 主源；可扩展镜像
];

/**
 * Open-Meteo 当前天气
 */
async function fetchOpenMeteoCurrent({ latitude, longitude, timezone = 'Asia/Shanghai' }) {
  const params = {
    latitude,
    longitude,
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'surface_pressure',
      'visibility',
    ].join(','),
    timezone,
    wind_speed_unit: 'kmh',
  };

  let lastError;
  for (const baseUrl of WEATHER_ENDPOINTS) {
    try {
      const data = await getJson(baseUrl, params, 8000);
      if (!data?.current) throw new Error('missing current');
      return { data, source: baseUrl };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('weather fetch failed');
}

/**
 * wttr.in 备用（public 免费文本/json 天气）
 */
async function fetchWttrIn(city) {
  const data = await getJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, null, 10000);
  const current = data?.current_condition?.[0];
  if (!current) throw new Error('wttr.in missing current_condition');
  return {
    temperature: Number(current.temp_C),
    feelsLike: Number(current.FeelsLikeC),
    description: current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '未知',
    humidity: Number(current.humidity),
    windSpeed: Number(current.windspeedKmph),
    windDir: current.winddir16Point,
    pressure: Number(current.pressure),
    visibility: Number(current.visibility),
    source: 'wttr.in',
  };
}

module.exports = {
  fetchExchangeRate,
  fetchMetalPricesCny,
  fetchOpenMeteoCurrent,
  fetchWttrIn,
  FX_SOURCES,
  YAHOO_METAL_SYMBOLS,
};
