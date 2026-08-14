/**
 * userUtils.js
 * @description 用户相关的工具函数
 * @date 2026-01-06
 */

const { logger } = require('./logger');

/**
 * Normalize a user ID without accepting partial numeric strings.
 * @param {unknown} value
 * @returns {number|null}
 */
function normalizeUserId(value) {
  if (value === null || value === undefined || value === '') return null;

  const numericId = Number(value);
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

/**
 * Return the first valid user ID from an ordered set of trusted sources.
 * @param {...unknown} candidates
 * @returns {number|null}
 */
function firstValidUserId(...candidates) {
  for (const candidate of candidates) {
    const userId = normalizeUserId(candidate);
    if (userId) return userId;
  }
  return null;
}

/**
 * Resolve an exact username or user ID. Real names are intentionally excluded
 * because they are not unique identity keys.
 * @param {Object} connection - 数据库连接
 * @param {string|number} userIdentifier - 用户名(username)或用户ID
 * @returns {Promise<number>} 用户ID
 */
async function getUserIdByIdentifier(connection, userIdentifier) {
  if (userIdentifier === null || userIdentifier === undefined || userIdentifier === '') {
    throw new Error('用户标识不能为空');
  }

  const numericId = normalizeUserId(userIdentifier);
  if (numericId) {
    return numericId;
  }

  const normalizedIdentifier = String(userIdentifier).trim();

  try {
    const [users] = await connection.execute(
      'SELECT id FROM users WHERE BINARY username = BINARY ? AND status = 1 LIMIT 1',
      [normalizedIdentifier]
    );

    if (users.length > 0) {
      return users[0].id;
    }

    throw new Error(`有效用户名不存在: ${normalizedIdentifier}`);
  } catch (error) {
    logger.error(`查询用户ID失败: ${error.message}`);
    throw error;
  }
}

/**
 * 从请求对象中获取用户标识（优先使用真实姓名）
 * @param {Object} req - Express请求对象
 * @returns {string|number} 用户标识
 */
function getUserIdentifierFromRequest(req) {
  // 优先稳定 ID，避免姓名重名；无登录时返回 null（由 resolveActorUserId 落库）
  if (req?.user?.id != null) return req.user.id;
  return req?.user?.username || req?.user?.name || req?.user?.real_name || null;
}

/**
 * 解析凭证/单据操作人用户 ID（正规入口，禁止写入 'system' 字符串）
 * 顺序：候选 ID/用户名 → 连接池内第一个启用用户
 * @param {Object} connection - mysql 连接或 pool
 * @param {...unknown} candidates
 * @returns {Promise<number>}
 */
async function resolveActorUserId(connection, ...candidates) {
  const conn = connection || require('../config/db').pool;

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    if (candidate === 'system' || candidate === 'SYSTEM') continue;

    const asId = normalizeUserId(candidate);
    if (asId) {
      try {
        const [rows] = await conn.execute(
          'SELECT id FROM users WHERE id = ? AND status = 1 LIMIT 1',
          [asId]
        );
        if (rows.length) return rows[0].id;
      } catch {
        /* try next */
      }
      continue;
    }

    try {
      return await getUserIdByIdentifier(conn, candidate);
    } catch {
      /* try next candidate */
    }
  }

  const [fallback] = await conn.execute(
    'SELECT id FROM users WHERE status = 1 ORDER BY id ASC LIMIT 1'
  );
  if (!fallback.length) {
    throw new Error('系统中无启用用户，无法确定凭证/单据操作人');
  }
  return fallback[0].id;
}

/**
 * 解析操作人显示名（用于 operator / changed_by 等文本列）
 * 返回 real_name 或 username，绝不返回字面量 'system'
 * @param {Object} connection
 * @param {...unknown} candidates
 * @returns {Promise<string>}
 */
async function resolveActorLabel(connection, ...candidates) {
  const conn = connection || require('../config/db').pool;
  const id = await resolveActorUserId(conn, ...candidates);
  try {
    const [rows] = await conn.execute(
      `SELECT COALESCE(NULLIF(TRIM(real_name), ''), username) AS label
       FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    if (rows[0]?.label) return String(rows[0].label);
  } catch {
    /* fall through */
  }
  return String(id);
}

/**
 * 从 Express req 同步取操作人显示名（不查库）
 * 单据/记录展示用姓名；无姓名时才回退用户名或 id
 * @param {Object} req
 * @returns {string|null}
 */
function getRequestActorLabel(req) {
  if (!req?.user) return null;
  const u = req.user;
  const realName = String(u.realName || u.real_name || u.name || '').trim();
  if (realName) return realName;
  if (u.username) return String(u.username);
  if (u.id != null && u.id !== '') return String(u.id);
  return null;
}

module.exports = {
  normalizeUserId,
  firstValidUserId,
  getUserIdByIdentifier,
  getUserIdentifierFromRequest,
  resolveActorUserId,
  resolveActorLabel,
  getRequestActorLabel,
};
