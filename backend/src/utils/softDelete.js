/**
 * softDelete.js
 * @description 软删除工具 — 提供统一的 UPDATE SET deleted_at = NOW() 替代 DELETE FROM
 * @date 2026-04-17
 * @version 1.0.0
 *
 * 用法:
 *   const { softDelete, softDeleteBatch, withNotDeleted } = require('../utils/softDelete');
 *
 *   // 单条软删除
 *   await softDelete(pool, 'customers', 'id', customerId);
 *
 *   // 批量软删除
 *   await softDeleteBatch(pool, 'materials', 'id', [1, 2, 3]);
 *
 *   // 给 SQL 追加 AND deleted_at IS NULL
 *   const sql = withNotDeleted('SELECT * FROM customers WHERE status = 1');
 */

const { logger } = require('./logger');

/**
 * 软删除单条记录
 * @param {object} conn - 数据库连接（pool 或 connection）
 * @param {string} table - 表名
 * @param {string} pkField - 主键字段名
 * @param {*} pkValue - 主键值
 * @returns {Promise<number>} affectedRows
 */
async function softDelete(conn, table, pkField, pkValue) {
  const exec = conn.execute || conn.query;
  const sql = `UPDATE \`${table}\` SET deleted_at = NOW() WHERE \`${pkField}\` = ? AND deleted_at IS NULL`;
  const [result] = await exec.call(conn, sql, [pkValue]);
  logger.debug(`[softDelete] ${table}.${pkField}=${pkValue} → affected=${result.affectedRows}`);
  return result.affectedRows;
}

/**
 * 批量软删除
 * @param {object} conn - 数据库连接
 * @param {string} table - 表名
 * @param {string} pkField - 主键字段名
 * @param {Array} pkValues - 主键值数组
 * @returns {Promise<number>} affectedRows
 */
async function softDeleteBatch(conn, table, pkField, pkValues) {
  if (!Array.isArray(pkValues) || pkValues.length === 0) return 0;
  const exec = conn.execute || conn.query;
  const placeholders = pkValues.map(() => '?').join(', ');
  const sql = `UPDATE \`${table}\` SET deleted_at = NOW() WHERE \`${pkField}\` IN (${placeholders}) AND deleted_at IS NULL`;
  const [result] = await exec.call(conn, sql, pkValues);
  logger.debug(`[softDelete] ${table}.${pkField} IN (${pkValues.length} ids) → affected=${result.affectedRows}`);
  return result.affectedRows;
}

/**
 * 给现有 SQL 追加 deleted_at IS NULL 条件
 * 适用于已有 WHERE 子句的 SQL
 * @param {string} sql
 * @param {string} [alias] - 表别名（如 'm'、'c'）
 * @returns {string}
 */
function withNotDeleted(sql, alias) {
  const prefix = alias ? `${alias}.` : '';
  // 如果 SQL 已包含 WHERE，追加 AND；否则追加 WHERE
  if (/\bWHERE\b/i.test(sql)) {
    return sql.replace(/\bWHERE\b/i, `WHERE ${prefix}deleted_at IS NULL AND`);
  }
  // 在 ORDER BY / LIMIT / GROUP BY 前插入 WHERE，或者追加到末尾
  const insertBefore = sql.match(/\b(ORDER|LIMIT|GROUP|HAVING)\b/i);
  if (insertBefore) {
    const idx = sql.indexOf(insertBefore[0]);
    return `${sql.slice(0, idx)} WHERE ${prefix}deleted_at IS NULL ${sql.slice(idx)}`;
  }
  return `${sql} WHERE ${prefix}deleted_at IS NULL`;
}

module.exports = {
  softDelete,
  softDeleteBatch,
  withNotDeleted,
};
