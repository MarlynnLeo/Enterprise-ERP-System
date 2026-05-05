/**
 * userUtils.js
 * @description 用户相关的工具函数
 * @date 2026-01-06
 */

const { logger } = require('./logger');

/**
 * 根据用户名、真实姓名或ID获取用户ID
 * @param {Object} connection - 数据库连接
 * @param {string|number} userIdentifier - 用户名(username)、真实姓名(real_name)或用户ID
 * @returns {Promise<number>} 用户ID
 */
async function getUserIdByIdentifier(connection, userIdentifier) {
  if (userIdentifier === null || userIdentifier === undefined || userIdentifier === '') {
    throw new Error('用户标识不能为空');
  }

  const numericId = Number.parseInt(userIdentifier, 10);
  if (Number.isInteger(numericId) && String(userIdentifier).trim() === String(numericId)) {
    return numericId;
  }

  const normalizedIdentifier = String(userIdentifier).trim();

  try {
    const params = [normalizedIdentifier, normalizedIdentifier];
    let sql = 'SELECT id FROM users WHERE real_name = ? OR username = ?';

    if (['system', 'admin'].includes(normalizedIdentifier.toLowerCase())) {
      sql += ' OR username IN (?, ?)';
      params.push('system', 'admin');
    }

    sql += ' ORDER BY CASE WHEN username = ? THEN 0 WHEN real_name = ? THEN 1 ELSE 2 END, id ASC LIMIT 1';
    params.push(normalizedIdentifier, normalizedIdentifier);

    const [users] = await connection.execute(sql, params);

    if (users.length > 0) {
      return users[0].id;
    }

    throw new Error(`用户不存在: ${normalizedIdentifier}`);
  } catch (error) {
    logger.error(`查询用户ID失败: ${error.message}`);
    throw error;
  }
}

/**
 * 从请求对象中获取用户标识（优先使用真实姓名）
 * @param {Object} req - Express请求对象
 * @returns {string} 用户标识（真实姓名、用户名或'system'）
 */
function getUserIdentifierFromRequest(req) {
  return req.user?.real_name || req.user?.name || req.user?.username || 'system';
}

module.exports = {
  getUserIdByIdentifier,
  getUserIdentifierFromRequest,
};
