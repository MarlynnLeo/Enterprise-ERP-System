/**
 * 稀有金属价格控制器
 */
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const { pool } = require('../../config/db');
const { MARKET_PRICE_CONFIG } = require('../../config/metalPriceConfig');
const PublicMarketDataService = require('../../services/external/PublicMarketDataService');
const ExchangeRateService = require('../../services/business/ExchangeRateService');

const STALE_MS = 15 * 60 * 1000;
const roundPrice = (value) => parseFloat(Number(value).toFixed(2));

const calculateChange = (oldPrice, newPrice) => {
  const change = Number(newPrice) - Number(oldPrice || 0);
  const changePercent = oldPrice > 0 ? (change / oldPrice) * 100 : 0;
  return {
    change: roundPrice(change),
    changePercent: parseFloat(changePercent.toFixed(2)),
  };
};

const METAL_DEFINITIONS = {
  GOLD: { name: '黄金', unit: '¥/盎司' },
  SILVER: { name: '白银', unit: '¥/盎司' },
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
  SILVER: [],
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
    const [rows] = await pool.query('SELECT id, symbol, name, price, change_amount, change_percent, unit, source, last_update_at, created_at, updated_at FROM metal_prices ORDER BY symbol');
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

const resolveUsdCnyRate = async () => {
  const row = await ExchangeRateService.getLatestRate('USD', 'CNY');
  const rate = Number(row?.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('USD/CNY rate unavailable');
  }
  return rate;
};

const fetchRealMetalPrices = async () => {
  logger.info('开始更新金属价格...');
  try {
    const rate = await resolveUsdCnyRate();
    const metals = await PublicMarketDataService.fetchMetalPricesCny(rate);
    for (const [symbol, info] of Object.entries(metals)) {
      await applyMetalPrice(symbol, info.price, info.source);
    }
    logger.info(`金属价格更新完成 FX=${rate.toFixed(4)}, 成功 ${Object.keys(metals).length} 种`);
  } catch (error) {
    // External market feeds are best-effort. Keep last good / configured
    // reference prices so dashboard widgets stay available offline.
    logger.error(`更新金属价格失败，保留缓存/参考价: ${error.message}`);
    for (const [symbol, metal] of Object.entries(metalPricesData)) {
      if (!metal) continue;
      if (!metal.source || metal.source === 'CONFIGURED_REFERENCE') {
        metal.source = 'STALE_OR_REFERENCE';
      }
      metal.lastUpdate = metal.lastUpdate || new Date();
      logger.warn(
        `[MetalPrices] ${symbol} 使用既有价格 ${metal.price} (${metal.source})`
      );
    }
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

const isMetalSnapshotStale = () => {
  const stamps = Object.values(metalPricesData)
    .map((item) => new Date(item.lastUpdate).getTime())
    .filter((value) => Number.isFinite(value));
  if (stamps.length === 0) return true;
  return Date.now() - Math.max(...stamps) > STALE_MS;
};

let metalRefreshPromise = null;
const ensureFreshMetalPrices = async ({ force = false } = {}) => {
  if (metalRefreshPromise) return metalRefreshPromise;
  if (!force && !isMetalSnapshotStale()) return false;
  metalRefreshPromise = fetchRealMetalPrices()
    .then(() => true)
    .finally(() => {
      metalRefreshPromise = null;
    });
  return metalRefreshPromise;
};

const buildMetalPricePayload = () => ({ ...metalPricesData, timestamp: new Date() });

const serveMetalPrices = async (req, res, { force = false } = {}) => {
  try {
    await loadPersistedMetalPrices();
    await ensureFreshMetalPrices({ force });
    ResponseHandler.success(
      res,
      buildMetalPricePayload(),
      force ? '金属价格已刷新' : '获取金属价格成功'
    );
  } catch (error) {
    logger.error('获取金属价格失败:', error);
    ResponseHandler.error(res, '获取金属价格失败', 'SERVER_ERROR', 500, error);
  }
};

const getRealTimeMetalPrices = (req, res) => serveMetalPrices(req, res, { force: false });
const refreshMetalPrices = (req, res) => serveMetalPrices(req, res, { force: true });

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

    const numPrice = Number(price);
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      return ResponseHandler.error(res, '价格必须是正数', 'VALIDATION_ERROR', 400);
    }

    await applyMetalPrice(normalizedSymbol, numPrice, 'MANUAL');
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

  if (process.env.DISABLE_CRON === 'true') {
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
  refreshMetalPrices,
  getMetalPriceHistory,
  getMetalPrice,
  updatePrice,
  fetchRealMetalPrices,
};
