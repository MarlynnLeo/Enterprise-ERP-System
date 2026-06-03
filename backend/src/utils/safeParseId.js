/**
 * safeParseId.js
 * @description 安全解析请求参数中的 ID 值，防止 NaN 传入数据库
 */

/**
 * 安全解析 ID 参数
 * @param {*} value - 需要解析的值（通常来自 req.params.id 或 req.query.xxx）
 * @param {string} [fieldName='ID'] - 字段名称（用于错误提示）
 * @returns {number} 解析后的正整数
 * @throws {Error} 当值无效时抛出带 statusCode=400 的错误
 */
function safeParseId(value, fieldName = 'ID') {
  const id = parseInt(value, 10);
  if (isNaN(id) || id <= 0) {
    const err = new Error(`${fieldName}参数无效`);
    err.statusCode = 400;
    throw err;
  }
  return id;
}

module.exports = { safeParseId };
