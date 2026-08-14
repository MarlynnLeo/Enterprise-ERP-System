/**
 * ExchangeRateService.js
 * @description 汇率管理 — 业务逻辑层
 * @date 2026-06-22
 *
 * A-3 架构改进: 从 enhancedModulesController 中提取内联 SQL 到 Service 层
 */

const { pool } = require('../../config/db');
const { softDelete } = require('../../utils/softDelete');
const cache = require('../../utils/cacheManager');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');
const { currentDateString } = require('../../utils/dateUtils');
const { logger } = require('../../utils/logger');

const RATE_COLUMNS =
  'id, from_currency, to_currency, rate, effective_date, source, created_by, created_at, deleted_at';

class ExchangeRateService {
  /**
   * 分页查询汇率列表
   * @param {Object} params - 查询参数
   * @param {string} [params.from_currency] - 源币种
   * @param {string} [params.to_currency] - 目标币种
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.pageSize=50] - 每页条数
   * @returns {Promise<{rows: Array, total: number, page: number, pageSize: number}>}
   */
  static async getList({ from_currency, to_currency, page = 1, pageSize = 50 } = {}) {
    const pagination = parsePagination(page, pageSize, { defaultPageSize: 50, maxPageSize: 100 });
    let where = 'WHERE deleted_at IS NULL';
    const vals = [];
    if (from_currency) {
      where += ' AND from_currency = ?';
      vals.push(from_currency);
    }
    if (to_currency) {
      where += ' AND to_currency = ?';
      vals.push(to_currency);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM exchange_rates ${where}`,
      vals
    );
    const listSql = appendPaginationSQL(
      `SELECT ${RATE_COLUMNS} FROM exchange_rates ${where} ORDER BY effective_date DESC, from_currency`,
      pagination.limit,
      pagination.offset
    );
    const [rows] = await pool.query(listSql, vals);
    return { rows, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  /**
   * 创建或更新汇率
   * @param {Object} data - 汇率数据
   * @param {string} data.from_currency - 源币种
   * @param {string} [data.to_currency='CNY'] - 目标币种
   * @param {number} data.rate - 汇率
   * @param {string} data.effective_date - 生效日期
   * @param {number} [userId] - 操作用户ID
   */
  static async upsert({ from_currency, to_currency, rate, effective_date }, userId) {
    const parsedRate = Number(rate);
    if (!from_currency || !effective_date || !Number.isFinite(parsedRate) || parsedRate <= 0) {
      throw new Error('from_currency, effective_date and positive rate are required');
    }
    await pool.query(
      `INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source, created_by)
       VALUES (?, ?, ?, ?, 'manual', ?) ON DUPLICATE KEY UPDATE rate = ?, source = 'manual'`,
      [
        String(from_currency).toUpperCase(),
        String(to_currency || 'CNY').toUpperCase(),
        parsedRate,
        effective_date,
        userId,
        parsedRate,
      ]
    );
    // 失效相关缓存
    cache.invalidatePrefix('rate:');
  }

  /**
   * 软删除汇率
   * @param {number} id - 汇率记录ID
   */
  static async delete(id) {
    await softDelete(pool, 'exchange_rates', 'id', id);
    cache.invalidatePrefix('rate:');
  }

  /**
   * 获取最新汇率
   * @param {string} from - 源币种
   * @param {string} [to='CNY'] - 目标币种
   * @returns {Promise<Object|null>}
   */
  static async getLatestRate(from, to = 'CNY') {
    if (!from) {
      throw new Error('from currency is required');
    }
    const cacheKey = `rate:${String(from).toUpperCase()}:${String(to).toUpperCase()}`;
    return cache.getOrSet(
      cacheKey,
      async () => {
        const [[row]] = await pool.query(
          `SELECT ${RATE_COLUMNS} FROM exchange_rates WHERE from_currency = ? AND to_currency = ? AND effective_date <= CURDATE() AND deleted_at IS NULL
         ORDER BY effective_date DESC LIMIT 1`,
          [String(from).toUpperCase(), String(to).toUpperCase()]
        );
        const today = currentDateString();
        const rowDate = row?.effective_date
          ? String(row.effective_date instanceof Date
              ? row.effective_date.toISOString().slice(0, 10)
              : row.effective_date).slice(0, 10)
          : '';
        // 无记录，或库内日期已过期：从公开 API 拉当天中间价
        if (!row || rowDate < today) {
          try {
            const synced = await this.syncFromPublicApi(from, to);
            return synced;
          } catch (error) {
            logger.warn(`[ExchangeRate] auto-sync failed: ${error.message}`);
            return row || null;
          }
        }
        return row;
      },
      300
    ); // TTL 5 分钟
  }

  /**
   * 从 public-apis 生态多源拉取汇率并 upsert
   * @param {string} from
   * @param {string} [to='CNY']
   * @param {number} [userId]
   */
  static async syncFromPublicApi(from = 'USD', to = 'CNY', userId = null) {
    const PublicMarketDataService = require('../external/PublicMarketDataService');
    const { rate, source } = await PublicMarketDataService.fetchExchangeRate(from, to);
    const effectiveDate = currentDateString();
    const fromC = String(from).toUpperCase();
    const toC = String(to).toUpperCase();

    await pool.query(
      `INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source, created_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rate = VALUES(rate), source = VALUES(source), effective_date = VALUES(effective_date)`,
      [fromC, toC, rate, effectiveDate, `public:${source}`, userId]
    );
    cache.invalidatePrefix('rate:');
    logger.info(`[ExchangeRate] synced ${fromC}/${toC}=${rate} via ${source}`);

    return {
      from_currency: fromC,
      to_currency: toC,
      rate,
      effective_date: effectiveDate,
      source: `public:${source}`,
    };
  }
}

module.exports = ExchangeRateService;
