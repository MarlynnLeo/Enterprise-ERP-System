'use strict';

const validationError = message => Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' });

function normalizeSalesDate(value, label = '业务日期') {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
    if (!match) throw validationError(`${label}格式无效`);
    const [, year, month, day] = match.map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
      throw validationError(`${label}不是有效的日历日期`);
    }
    if (value.length === 10) return value;
  } else if (!(value instanceof Date)) throw validationError(`${label}格式无效`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw validationError(`${label}格式无效`);
  // 兼容旧页面提交的 ISO 时间，按服务端业务时区恢复其选择的日期。
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function assertSalesLineQuantities(items) {
  if (!Array.isArray(items) || !items.length) throw validationError('销售明细不能为空');
  items.forEach((item, index) => {
    if (!Number.isSafeInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
      throw validationError(`第 ${index + 1} 行数量必须为正整数，不能保存小数或非正数`);
    }
  });
}

async function assertActiveSalesMaterials(connection, items) {
  const ids = [...new Set(items.map(item => Number(item.material_id ?? item.product_id)))];
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw validationError('请为每条销售明细选择有效物料');
  const [rows] = await connection.query('SELECT id FROM materials WHERE id IN (?) AND deleted_at IS NULL', [ids]);
  const valid = new Set(rows.map(row => Number(row.id)));
  const missing = ids.filter(id => !valid.has(id));
  if (missing.length) throw validationError(`以下物料不存在或已删除：${missing.join('、')}`);
}

module.exports = { validationError, normalizeSalesDate, assertSalesLineQuantities, assertActiveSalesMaterials };
