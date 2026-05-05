/**
 * paginationHelper.js
 * @description 兼容旧调用方的分页参数安全处理工具
 * @date 2026-04-10
 * @version 2.0.0
 */

const { parsePagination: parseSafePagination } = require('./safePagination');

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
    page: safePage,
    pageSize: safePageSize,
    offset: safeOffset,
  } = parseSafePagination(page, pageSize, options);
  const limitClause = `LIMIT ${safePageSize} OFFSET ${safeOffset}`;

  return { safePage, safePageSize, safeOffset, limitClause };
};

module.exports = { parsePagination };
