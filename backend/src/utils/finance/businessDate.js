'use strict';

function validateBusinessDate(value, label = '业务日期') {
  const invalid = (message) => Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' });
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid(`${label}格式必须为YYYY-MM-DD`);
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) throw invalid(`${label}不是有效日期`);
  return value;
}
module.exports = { validateBusinessDate };
