/**
 * PublicMarketDataService
 * 基于 public-apis 生态中的免费公开接口，多源故障转移：
 * - 天气: Open-Meteo（public-apis / Weather）
 * - 汇率: open.er-api · Frankfurter · VATComply · fawazahmed0 currency-api
 * - 金属: 金/银现货（gold-api）→ Yahoo 期货；铝/铜 Yahoo 期货；再按 USD/CNY 折算
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
    name: 'open.er-api.com',
    // public-apis 相关 Free ExchangeRate-API open endpoint（按日更新，比 ECB T-1 更贴近当天）
    async fetch(base, quote) {
      const data = await getJson(`https://open.er-api.com/v6/latest/${base.toUpperCase()}`);
      if (data?.result !== 'success') throw new Error(data?.['error-type'] || 'er-api fail');
      const rate = data?.rates?.[quote.toUpperCase()];
      if (!Number.isFinite(Number(rate))) throw new Error('no rate');
      return { rate: Number(rate), date: data.time_last_update_utc, source: 'open.er-api.com' };
    },
  },
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

const TROY_OUNCE_GRAMS = 31.1034768;
const LB_PER_METRIC_TON = 2204.62262185;

const USD_SANITY = Object.freeze({
  GOLD: { min: 2500, max: 9000 },
  SILVER: { min: 20, max: 200 },
  ALUMINUM: { min: 1500, max: 8000 },
  COPPER: { min: 4000, max: 25000 },
});

const METALS = Object.freeze({
  GOLD: {
    name: '黄金',
    unitUsd: 'oz',
    sources: [
      { name: 'gold-api:XAU', fetch: () => fetchGoldApiSpot('XAU') },
      { name: 'yahoo:GC=F', fetch: () => fetchYahooQuote('GC=F') },
    ],
  },
  SILVER: {
    name: '白银',
    unitUsd: 'oz',
    sources: [
      { name: 'gold-api:XAG', fetch: () => fetchGoldApiSpot('XAG') },
      { name: 'yahoo:SI=F', fetch: () => fetchYahooQuote('SI=F') },
    ],
  },
  ALUMINUM: {
    name: '铝',
    unitUsd: 'ton',
    sources: [{ name: 'yahoo:ALI=F', fetch: () => fetchYahooQuote('ALI=F') }],
  },
  COPPER: {
    name: '铜',
    unitUsd: 'lb',
    sources: [{ name: 'yahoo:HG=F', fetch: () => fetchYahooQuote('HG=F') }],
  },
});

function assertUsdRange(symbol, usdPrice) {
  const bound = USD_SANITY[symbol];
  const value = Number(usdPrice);
  if (!bound) return value;
  if (!Number.isFinite(value) || value < bound.min || value > bound.max) {
    throw new Error(`${symbol} usd ${value} outside ${bound.min}-${bound.max}`);
  }
  return value;
}

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
  return { price: Number(price), source: `yahoo:${ticker}` };
}

async function fetchGoldApiSpot(code) {
  const data = await getJson(`https://api.gold-api.com/price/${code}`, null, 8000);
  const price = Number(data?.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`gold-api missing ${code}`);
  }
  return { price, source: `gold-api:${code}` };
}

async function fetchMetalUsd(symbol) {
  const def = METALS[symbol];
  const errors = [];
  for (const src of def.sources) {
    try {
      const quote = await src.fetch();
      let usd = quote.price;
      if (def.unitUsd === 'lb') usd *= LB_PER_METRIC_TON;
      return { usdPerUnit: assertUsdRange(symbol, usd), source: quote.source || src.name };
    } catch (error) {
      errors.push(`${src.name}: ${error.message}`);
      logger.warn(`[PublicMarket] ${symbol} ${src.name} failed: ${error.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}

/**
 * 拉取金属人民币价。金/银优先现货，失败再期货；铝/铜走期货。
 */
async function fetchMetalPricesCny(usdCnyRate) {
  if (!Number.isFinite(Number(usdCnyRate)) || usdCnyRate <= 0) {
    throw new Error('usdCnyRate required');
  }
  const result = {};
  const errors = [];

  for (const [symbol, def] of Object.entries(METALS)) {
    try {
      const quote = await fetchMetalUsd(symbol);
      result[symbol] = {
        price: quote.usdPerUnit * usdCnyRate,
        usdPrice: quote.usdPerUnit,
        source: quote.source,
        name: def.name,
        unit: def.unitUsd === 'oz' ? '¥/盎司' : '¥/吨',
      };
    } catch (error) {
      errors.push(`${symbol}: ${error.message}`);
    }
  }

  if (Object.keys(result).length === 0) {
    throw new Error(`All metal sources failed: ${errors.join(' | ')}`);
  }
  return result;
}

// ==================== 天气 ====================

const WEATHER_ENDPOINTS = ['https://api.open-meteo.com/v1/forecast'];

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
  METALS,
  TROY_OUNCE_GRAMS,
};
