/**
 * safePagination.js
 * @description 安全分页工具 — 统一处理 LIMIT/OFFSET 参数，防止 SQL 注入
 * @date 2026-04-17
 */

/**
 * 解析并验证分页参数
 * @param {*} page - 页码（从1开始）
 * @param {*} pageSize - 每页条数
 * @param {Object} [options] - 可选配置
 * @param {number} [options.maxPageSize=500] - 允许的最大每页条数
 * @param {number} [options.defaultPageSize=20] - 默认每页条数
 * @returns {{ limit: number, offset: number, page: number, pageSize: number }}
 */
function parsePagination(page, pageSize, options = {}) {
  const { maxPageSize = 500, defaultPageSize = 20 } = options;

  let parsedPage = parseInt(page, 10);
  let parsedPageSize = parseInt(pageSize, 10);

  if (isNaN(parsedPage) || parsedPage < 1) parsedPage = 1;
  if (isNaN(parsedPageSize) || parsedPageSize < 1) parsedPageSize = defaultPageSize;
  if (parsedPageSize > maxPageSize) parsedPageSize = maxPageSize;

  const limit = parsedPageSize;
  const offset = (parsedPage - 1) * limit;

  return { limit, offset, page: parsedPage, pageSize: parsedPageSize };
}

/**
 * 为 SQL 查询追加安全的 LIMIT OFFSET 子句
 * @param {string} sql - 原始 SQL（不含 LIMIT）
 * @param {number} limit - 每页条数（已通过 parsePagination 验证）
 * @param {number} offset - 偏移量（已通过 parsePagination 验证）
 * @returns {string} 带 LIMIT OFFSET 的 SQL
 */
function appendPaginationSQL(sql, limit, offset) {
  // 二次防御：再次强制整数化，即使调用方传入非法值也安全
  const safeLimit = Math.max(1, Math.min(Math.floor(Number(limit)) || 20, 500));
  const safeOffset = Math.max(0, Math.floor(Number(offset)) || 0);
  return `${sql} LIMIT ${safeLimit} OFFSET ${safeOffset}`;
}

module.exports = {
  parsePagination,
  appendPaginationSQL,
};
