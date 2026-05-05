/**
 * 稀有金属价格控制器
 */
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { pool } = require('../../config/db');

const axios = require('axios');

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundPrice = (value) => parseFloat(Number(value).toFixed(2));

const calculateChange = (oldPrice, newPrice) => {
  const change = Number(newPrice) - Number(oldPrice || 0);
  const changePercent = oldPrice > 0 ? (change / oldPrice) * 100 : 0;
  return {
    change: roundPrice(change),
    changePercent: parseFloat(changePercent.toFixed(2)),
  };
};

const MARKET_PRICE_CONFIG = {
  exchangeRateUrl:
    process.env.METAL_PRICE_EXCHANGE_RATE_URL ||
    'https://api.frankfurter.app/latest?from=USD&to=CNY',
  exchangeRateFallback: parseNumber(process.env.METAL_PRICE_USD_CNY_FALLBACK, 7.24),
  refreshCron: process.env.METAL_PRICE_REFRESH_CRON || '0 */4 * * *',
  startupDelayMs: parseNumber(process.env.METAL_PRICE_STARTUP_DELAY_MS, 5000),
  referencePrices: {
    GOLD: parseNumber(process.env.METAL_PRICE_GOLD_REFERENCE_CNY_PER_OZ, 34529.35),
    PLATINUM: parseNumber(process.env.METAL_PRICE_PLATINUM_REFERENCE_CNY_PER_OZ, 9020),
    ALUMINUM: parseNumber(process.env.METAL_PRICE_ALUMINUM_REFERENCE_CNY_PER_TON, 19150),
    COPPER: parseNumber(process.env.METAL_PRICE_COPPER_REFERENCE_CNY_PER_TON, 69200),
  },
  externalBenchmarks: {
    GOLD_USD_PER_OZ: parseNumber(process.env.METAL_PRICE_GOLD_USD_PER_OZ, 2050),
    PLATINUM_USD_PER_OZ: parseNumber(process.env.METAL_PRICE_PLATINUM_USD_PER_OZ, 950),
  },
};

const METAL_DEFINITIONS = {
  GOLD: { name: '黄金', unit: '¥/盎司' },
  PLATINUM: { name: '白金', unit: '¥/盎司' },
  ALUMINUM: { name: '铝', unit: '¥/吨' },
  COPPER: { name: '铜', unit: '¥/吨' },
};

const createInitialMetalPrices = () =>
  Object.entries(METAL_DEFINITIONS).reduce((result, [symbol, definition]) => {
    result[symbol] = {
      name: definition.name,
      symbol,
      price: MARKET_PRICE_CONFIG.referencePrices[symbol],
      change: 0,
      changePercent: 0,
      unit: definition.unit,
      source: 'CONFIGURED_REFERENCE',
      lastUpdate: new Date(),
    };
    return result;
  }, {});

const metalPricesData = createInitialMetalPrices();

// 价格历史数据
const priceHistory = {
  GOLD: [],
  PLATINUM: [],
  ALUMINUM: [],
  COPPER: [],
};

let persistenceAvailable = null;

const tableExists = async (tableName) => {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [tableName]
  );
  return rows[0].cnt > 0;
};

const ensurePersistenceAvailable = async () => {
  if (persistenceAvailable === true) {
    return true;
  }

  try {
    const available =
      (await tableExists('metal_prices')) && (await tableExists('metal_price_history'));
    persistenceAvailable = available ? true : null;
    return available;
  } catch (error) {
    logger.warn(`金属价格持久化不可用，使用进程内缓存: ${error.message}`);
    return false;
  }
};

const mapDbRowToMetalPrice = (row) => ({
  name: row.name,
  symbol: row.symbol,
  price: roundPrice(row.price),
  change: roundPrice(row.change_amount),
  changePercent: parseFloat(Number(row.change_percent || 0).toFixed(2)),
  unit: row.unit,
  source: row.source,
  lastUpdate: row.last_update_at ? new Date(row.last_update_at) : new Date(),
});

const persistMetalPrice = async (symbol, metal, { addHistory = true } = {}) => {
  if (!(await ensurePersistenceAvailable())) return;

  try {
    await pool.execute(
      `INSERT INTO metal_prices
        (symbol, name, price, change_amount, change_percent, unit, source, last_update_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         price = VALUES(price),
         change_amount = VALUES(change_amount),
         change_percent = VALUES(change_percent),
         unit = VALUES(unit),
         source = VALUES(source),
         last_update_at = VALUES(last_update_at),
         updated_at = NOW()`,
      [
        symbol,
        metal.name,
        metal.price,
        metal.change,
        metal.changePercent,
        metal.unit,
        metal.source,
        metal.lastUpdate,
      ]
    );

    if (addHistory) {
      await pool.execute(
        `INSERT INTO metal_price_history (symbol, price, source, recorded_at)
         VALUES (?, ?, ?, ?)`,
        [symbol, metal.price, metal.source, metal.lastUpdate]
      );
    }
  } catch (error) {
    persistenceAvailable = null;
    logger.warn(`金属价格持久化写入失败，已保留内存数据: ${error.message}`);
  }
};

const seedMetalPricesIfNeeded = async () => {
  if (!(await ensurePersistenceAvailable())) return;

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM metal_prices');
  if (total > 0) return;

  for (const [symbol, metal] of Object.entries(metalPricesData)) {
    await persistMetalPrice(symbol, metal, { addHistory: true });
  }
};

const loadPersistedMetalPrices = async () => {
  if (!(await ensurePersistenceAvailable())) return false;

  try {
    await seedMetalPricesIfNeeded();
    const [rows] = await pool.query('SELECT * FROM metal_prices ORDER BY symbol');
    rows.forEach((row) => {
      if (metalPricesData[row.symbol]) {
        metalPricesData[row.symbol] = mapDbRowToMetalPrice(row);
      }
    });

    return rows.length > 0;
  } catch (error) {
    persistenceAvailable = null;
    logger.warn(`读取金属价格持久化数据失败，使用内存数据: ${error.message}`);
    return false;
  }
};

const loadPersistedHistory = async (symbol) => {
  if (!(await ensurePersistenceAvailable())) return null;

  try {
    const params = [];
    let sql = 'SELECT symbol, price, source, recorded_at FROM metal_price_history';
    if (symbol) {
      sql += ' WHERE symbol = ?';
      params.push(symbol);
    }
    sql += ' ORDER BY recorded_at DESC LIMIT 100';

    const [rows] = await pool.query(sql, params);
    const history = rows
      .map((row) => ({
        time: new Date(row.recorded_at).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        price: roundPrice(row.price),
        source: row.source,
        timestamp: row.recorded_at,
      }))
      .reverse();

    if (symbol) {
      return history;
    }

    return rows.reverse().reduce((result, row) => {
      if (!result[row.symbol]) result[row.symbol] = [];
      result[row.symbol].push({
        time: new Date(row.recorded_at).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        price: roundPrice(row.price),
        source: row.source,
        timestamp: row.recorded_at,
      });
      return result;
    }, {});
  } catch (error) {
    persistenceAvailable = null;
    logger.warn(`读取金属价格历史失败，使用内存历史: ${error.message}`);
    return null;
  }
};

// 汇率缓存
let cachedExchangeRate = MARKET_PRICE_CONFIG.exchangeRateFallback;

/**
 * 获取免费汇率数据
 */
const fetchExchangeRate = async () => {
  try {
    const response = await axios.get(MARKET_PRICE_CONFIG.exchangeRateUrl, { timeout: 5000 });
    if (response.data && response.data.rates && response.data.rates.CNY) {
      cachedExchangeRate = response.data.rates.CNY;
      logger.info(`汇率更新成功: 1 USD = ${cachedExchangeRate} CNY`);
      return cachedExchangeRate;
    }
  } catch (error) {
    logger.warn(`获取汇率失败，使用缓存值 ${cachedExchangeRate}: ${error.message}`);
  }
  return cachedExchangeRate;
};

/**
 * 获取金属价格（使用免费公开数据 + 配置基准价）
 * 由于完全免费的实时金属API很少，采用以下策略：
 * 1. 获取最新汇率（USD/CNY）
 * 2. 基于配置的国际基准价格生成人民币参考价
 */
const fetchRealMetalPrices = async () => {
  logger.info('开始更新金属价格...');
  try {
    const rate = await fetchExchangeRate();

    await applyMetalPrice(
      'GOLD',
      MARKET_PRICE_CONFIG.externalBenchmarks.GOLD_USD_PER_OZ * rate,
      'EXTERNAL_REFERENCE'
    );
    await applyMetalPrice(
      'PLATINUM',
      MARKET_PRICE_CONFIG.externalBenchmarks.PLATINUM_USD_PER_OZ * rate,
      'EXTERNAL_REFERENCE'
    );
    await applyMetalPrice('ALUMINUM', MARKET_PRICE_CONFIG.referencePrices.ALUMINUM, 'CONFIGURED_REFERENCE');
    await applyMetalPrice('COPPER', MARKET_PRICE_CONFIG.referencePrices.COPPER, 'CONFIGURED_REFERENCE');

    logger.info('金属价格更新完成 (数据源: 汇率API + 配置基准价)');
  } catch (error) {
    logger.error(`更新金属价格失败: ${error.message}`);
  }
};

/**
 * 内部更新金属价格的辅助函数
 */
const updateMetalPrice = (symbol, newPrice, source) => {
  const metal = metalPricesData[symbol];
  if (!metal) return;

  const oldPrice = metal.price;
  const { change, changePercent } = calculateChange(oldPrice, newPrice);

  metalPricesData[symbol] = {
    ...metal,
    price: roundPrice(newPrice),
    change,
    changePercent,
    lastUpdate: new Date(),
    source: source,
  };

  // 添加到历史记录
  const now = new Date();
  priceHistory[symbol].push({
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    price: roundPrice(newPrice),
    timestamp: now,
  });

  if (priceHistory[symbol].length > 50) {
    priceHistory[symbol].shift();
  }
};

const applyMetalPrice = async (symbol, newPrice, source) => {
  updateMetalPrice(symbol, newPrice, source);
  if (metalPricesData[symbol]) {
    await persistMetalPrice(symbol, metalPricesData[symbol]);
  }
};

/**
 * 获取实时金属价格
 * 返回当前金属价格，价格刷新由显式接口或定时任务触发。
 */
const getRealTimeMetalPrices = async (req, res) => {
  try {
    await loadPersistedMetalPrices();
    ResponseHandler.success(res, { ...metalPricesData, timestamp: new Date() }, '获取金属价格成功');
  } catch (error) {
    logger.error('获取金属价格失败:', error);
    ResponseHandler.error(res, '获取金属价格失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取金属价格历史数据
 */
const getMetalPriceHistory = async (req, res) => {
  try {
    const { symbol, period = '1d' } = req.query;
    const normalizedSymbol = String(symbol || '').toUpperCase();

    const persistedHistory = await loadPersistedHistory(normalizedSymbol || null);
    if (persistedHistory) {
      ResponseHandler.success(
        res,
        normalizedSymbol
          ? { symbol: normalizedSymbol, history: persistedHistory, period }
          : persistedHistory,
        '获取价格历史成功'
      );
      return;
    }

    if (normalizedSymbol && priceHistory[normalizedSymbol]) {
      ResponseHandler.success(
        res,
        {
          symbol: normalizedSymbol,
          history: priceHistory[normalizedSymbol],
          period,
        },
        '获取价格历史成功'
      );
    } else {
      ResponseHandler.success(res, priceHistory, '操作成功');
    }
  } catch (error) {
    logger.error('获取金属价格历史失败:', error);
    ResponseHandler.error(res, '获取金属价格历史失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取特定金属价格
 */
const getMetalPrice = async (req, res) => {
  try {
    const { symbol } = req.params;
    const normalizedSymbol = String(symbol || '').toUpperCase();

    await loadPersistedMetalPrices();

    if (!metalPricesData[normalizedSymbol]) {
      return ResponseHandler.error(res, '未找到该金属价格数据', 'NOT_FOUND', 404);
    }

    ResponseHandler.success(res, metalPricesData[normalizedSymbol], '操作成功');
  } catch (error) {
    logger.error('获取金属价格失败:', error);
    ResponseHandler.error(res, '获取金属价格失败', 'SERVER_ERROR', 500, error);
  }
};

// 初始化历史数据
const initializeHistoryData = () => {
  const now = new Date();
  Object.keys(metalPricesData).forEach((symbol) => {
    priceHistory[symbol].push({
      time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      price: metalPricesData[symbol].price,
      timestamp: now,
    });
  });
};

initializeHistoryData();

/**
 * 更新金属价格
 */
const updatePrice = async (req, res) => {
  try {
    const { symbol, price } = req.body;
    const normalizedSymbol = String(symbol || '').toUpperCase();

    // 验证参数
    if (!normalizedSymbol || price === undefined || price === null || price === '') {
      return ResponseHandler.error(res, '缺少必填字段: symbol 或 price', 'VALIDATION_ERROR', 400);
    }

    // 验证金属符号是否存在
    if (!metalPricesData[normalizedSymbol]) {
      return ResponseHandler.error(res, `无效的金属符号: ${normalizedSymbol}`, 'VALIDATION_ERROR', 400);
    }

    // 验证价格是否为正数
    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      return ResponseHandler.error(res, '价格必须是正数', 'VALIDATION_ERROR', 400);
    }

    // 计算价格变化
    const oldPrice = metalPricesData[normalizedSymbol].price;
    const { change, changePercent } = calculateChange(oldPrice, numPrice);

    // 更新价格数据
    metalPricesData[normalizedSymbol].price = roundPrice(numPrice);
    metalPricesData[normalizedSymbol].change = change;
    metalPricesData[normalizedSymbol].changePercent = changePercent;
    metalPricesData[normalizedSymbol].source = 'MANUAL';
    metalPricesData[normalizedSymbol].lastUpdate = new Date();

    // 添加到历史数据
    const now = new Date();
    priceHistory[normalizedSymbol].push({
      time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      price: roundPrice(numPrice),
      timestamp: now,
    });

    // 保持历史数据不超过100条
    if (priceHistory[normalizedSymbol].length > 100) {
      priceHistory[normalizedSymbol].shift();
    }

    await persistMetalPrice(normalizedSymbol, metalPricesData[normalizedSymbol]);

    logger.info(
      `金属价格已更新: ${normalizedSymbol} = ${numPrice} (变化: ${change.toFixed(2)}, ${changePercent.toFixed(2)}%)`
    );

    return ResponseHandler.success(res, metalPricesData[normalizedSymbol], '金属价格更新成功');
  } catch (error) {
    logger.error('更新金属价格失败:', error);
    return ResponseHandler.error(res, '更新金属价格失败', 'SERVER_ERROR', 500, error);
  }
};

// 自动更新价格（优先使用 API，失败则降级）
const initScheduledUpdate = () => {
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    return;
  }

  const cron = require('node-cron');

  cron.schedule(MARKET_PRICE_CONFIG.refreshCron, async () => {
    logger.info('触发定时任务: 更新金属价格');
    await fetchRealMetalPrices();
    logger.info('定时任务完成');
  });

  const startupUpdateTimer = setTimeout(() => {
    logger.info('服务启动: 首次尝试刷新金属参考价格');
    fetchRealMetalPrices();
  }, MARKET_PRICE_CONFIG.startupDelayMs);
  startupUpdateTimer.unref?.();

  logger.info(`金属价格定时更新任务已初始化: ${MARKET_PRICE_CONFIG.refreshCron}`);
};

// 初始化定时任务
initScheduledUpdate();

module.exports = {
  getRealTimeMetalPrices,
  getMetalPriceHistory,
  getMetalPrice,
  updatePrice,
  fetchRealMetalPrices,
};
