/**
 * userHelper.js
 * @description 用户身份解析工具 - 从 JWT Token 中的 user.id 查询数据库获取真实姓名
 * @date 2026-04-09
 * @version 1.1.0
 *
 * 背景：JWT 安全策略只存储 { id, username }，不含 real_name。
 * 所有需要写入「操作人姓名」的场景，统一通过此工具解析。
 * 禁止回落字面量 'system'（不是合法用户身份）。
 */

const { pool } = require('../config/db');
const { logger } = require('./logger');
const { resolveActorLabel, getRequestActorLabel } = require('./userUtils');

// 内存级缓存，避免同一请求周期内重复查库
const nameCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟过期

/**
 * 获取当前请求用户的真实姓名（或 username）
 * @param {Object} req - Express 请求对象（需含 req.user）
 * @returns {Promise<string>} 用户显示名
 */
async function getCurrentUserName(req) {
  const syncLabel = getRequestActorLabel(req);
  if (!req?.user?.id) {
    // 无 id 时仍尽量用 username；再无则走全局 resolve
    if (syncLabel) return syncLabel;
    return resolveActorLabel(pool);
  }

  const userId = req.user.id;
  const cached = nameCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.name;
  }

  try {
    const [rows] = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(real_name), ''), username) AS label
       FROM users WHERE id = ? AND status = 1 LIMIT 1`,
      [userId]
    );
    const label =
      (rows.length > 0 && rows[0].label) ||
      syncLabel ||
      (await resolveActorLabel(pool, userId));

    nameCache.set(userId, { name: label, timestamp: Date.now() });
    return label;
  } catch (error) {
    logger.error('查询当前用户真实姓名失败:', error);
    if (syncLabel) return syncLabel;
    throw error;
  }
}

module.exports = { getCurrentUserName, getRequestActorLabel };
