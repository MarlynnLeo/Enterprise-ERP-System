/**
 * paginationHelper.js
 * @description 统一的分页参数安全处理工具
 * @date 2026-04-10
 * @version 2.0.0
 *
 * 设计原则：
 * LIMIT/OFFSET 只接受整数值，parseInt() 保证输出整数或 NaN。
 * Knex、Sequelize、TypeORM 等主流 ORM 均采用字符串插值处理 LIMIT/OFFSET，
 * 因为 parseInt() 后的值不存在 SQL 注入风险 — 它只能是整数。
 *
 * 本工具返回一个安全的 SQL 片段（而非 ? 占位符），
 * 彻底消除「参数数组 ? 数量 与 占位符不匹配」的系统性风险。
 */

/**
 * 安全解析分页参数
 * @param {*} page - 页码（从1开始）
 * @param {*} pageSize - 每页大小
 * @param {Object} options - 配置项
 * @param {number} options.maxPageSize - 最大每页大小（默认200）
 * @param {number} options.defaultPageSize - 默认每页大小（默认20）
 * @returns {{ safePage: number, safePageSize: number, safeOffset: number, limitClause: string }}
 */
const parsePagination = (page, pageSize, options = {}) => {
  const {
    maxPageSize = 200,
    defaultPageSize = 20,
  } = options;

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePageSize = Math.min(Math.max(parseInt(pageSize, 10) || defaultPageSize, 1), maxPageSize);
  const safeOffset = (safePage - 1) * safePageSize;

  // 安全的 SQL 片段 — 值已被 parseInt 强制为整数，不存在注入风险
  const limitClause = `LIMIT ${safePageSize} OFFSET ${safeOffset}`;

  return { safePage, safePageSize, safeOffset, limitClause };
};

module.exports = { parsePagination };
