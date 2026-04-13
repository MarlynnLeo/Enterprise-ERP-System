/**
 * userHelper.js
 * @description 用户身份解析工具 - 从 JWT Token 中的 user.id 查询数据库获取真实姓名
 * @date 2026-04-09
 * @version 1.0.0
 * 
 * 背景：JWT 安全策略只存储 { id, username }，不含 real_name。
 * 所有需要写入"操作人姓名"的场景，统一通过此工具解析。
 */

const { pool } = require('../config/db');

// 内存级缓存，避免同一请求周期内重复查库
const nameCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟过期

/**
 * 获取当前请求用户的真实姓名
 * @param {Object} req - Express 请求对象（需含 req.user）
 * @returns {Promise<string>} 用户真实姓名，兜底返回 username 或 'system'
 */
async function getCurrentUserName(req) {
  if (!req.user) return 'system';

  const userId = req.user.id;
  if (!userId) return req.user.username || 'system';

  // 检查缓存
  const cached = nameCache.get(userId);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    return cached.name;
  }

  try {
    const [rows] = await pool.query(
      'SELECT real_name FROM users WHERE id = ?',
      [userId]
    );
    const realName = (rows.length > 0 && rows[0].real_name)
      ? rows[0].real_name
      : (req.user.username || 'system');

    // 写入缓存
    nameCache.set(userId, { name: realName, timestamp: Date.now() });

    return realName;
  } catch (e) {
    // 查询失败时兜底
    return req.user.username || 'system';
  }
}

module.exports = { getCurrentUserName };
