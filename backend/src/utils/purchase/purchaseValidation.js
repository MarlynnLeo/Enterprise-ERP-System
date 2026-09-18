'use strict';

const Decimal = require('decimal.js');

const purchaseValidationError = (message, statusCode = 400) => Object.assign(new Error(message), {
  statusCode, code: statusCode === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR',
});

function normalizePurchaseDate(value, label = '业务日期', { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === '' || value === '-')) return null;
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value);
    if (!match) throw purchaseValidationError(`${label}格式无效`);
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw purchaseValidationError(`${label}不是有效的日历日期`);
    }
    if (value.length === 10) return value;
  } else if (!(value instanceof Date)) throw purchaseValidationError(`${label}格式无效`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw purchaseValidationError(`${label}格式无效`);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function purchaseQuantity(value, label = '数量', { allowZero = false, scale = 2 } = {}) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw purchaseValidationError(`${label}无效`);
  let quantity;
  try { quantity = new Decimal(value); } catch { throw purchaseValidationError(`${label}无效`); }
  if (!quantity.isFinite() || quantity.lt(0) || (!allowZero && quantity.eq(0))) {
    throw purchaseValidationError(`${label}必须${allowZero ? '大于或等于' : '大于'}0`);
  }
  if (quantity.decimalPlaces() > scale || quantity.gt('99999999.99')) {
    throw purchaseValidationError(`${label}最多支持${scale}位小数，且不能超过99999999.99`);
  }
  return quantity.toNumber();
}

function assertPurchaseLines(items, label = '采购') {
  if (!Array.isArray(items) || items.length === 0) throw purchaseValidationError(`${label}必须包含至少一条明细`);
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') throw purchaseValidationError(`第${index + 1}条${label}明细无效`);
    purchaseQuantity(item.quantity ?? item.qty, `第${index + 1}行数量`);
  });
}

async function normalizeRequisitionMaterials(connection, items) {
  assertPurchaseLines(items, '请购');
  const result = [];
  for (const item of items) {
    const id = Number(item.material_id ?? item.materialId ?? item.id);
    const code = item.material_code ?? item.materialCode ?? item.code;
    const [materials] = await connection.query(
      `SELECT m.id, m.code, m.name, m.specs, m.unit_id, u.name AS unit
         FROM materials m LEFT JOIN units u ON u.id = m.unit_id AND u.deleted_at IS NULL
        WHERE ${id ? 'm.id = ?' : 'm.code = ?'} AND m.deleted_at IS NULL AND m.status = 1 LIMIT 1`,
      [id || code || null]
    );
    const material = materials[0];
    if (!material) throw purchaseValidationError(`请购物料不存在或已停用：${id || code || '未选择物料'}`);
    result.push({ material_id: material.id, material_code: material.code, material_name: material.name,
      specification: item.specification || item.specs || material.specs || '', unit_id: material.unit_id,
      unit: material.unit || '', quantity: purchaseQuantity(item.quantity ?? item.qty) });
  }
  return result;
}

module.exports = { purchaseValidationError, normalizePurchaseDate, purchaseQuantity, assertPurchaseLines, normalizeRequisitionMaterials };
