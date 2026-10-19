'use strict';

const Decimal = require('decimal.js');

// Only explicit auxiliary values belong on a voucher. Creator/approver identity
// and a material's default price are not substitutes for transaction metadata.
const LINE_METADATA_FIELDS = Object.freeze([
  'department_id',
  'cost_center_id',
  'customer_id',
  'supplier_id',
  'employee_id',
  'employee_source',
  'project_id',
  'project_name',
  'quantity',
  'unit_name',
  'unit_price',
  'settlement_method',
  'invoice_number',
]);

function pickLineMetadata(source = {}) {
  return Object.fromEntries(
    LINE_METADATA_FIELDS.filter((field) => source[field] !== undefined).map((field) => [
      field,
      source[field],
    ])
  );
}

function pickCommonLineMetadata(source = {}) {
  const metadata = pickLineMetadata(source);
  for (const field of [
    'customer_id',
    'supplier_id',
    'quantity',
    'unit_name',
    'unit_price',
    'invoice_number',
  ])
    delete metadata[field];
  return metadata;
}

function resolveCommonLineMetadata(sources = []) {
  const metadata = sources.map(pickCommonLineMetadata);
  const first = metadata[0] || {};
  for (const other of metadata.slice(1)) {
    for (const field of new Set([...Object.keys(first), ...Object.keys(other)])) {
      if (String(first[field] ?? '') !== String(other[field] ?? '')) {
        throw new Error('来源单据的部门、人员或项目等辅助核算不同，请分别生成凭证');
      }
    }
  }
  return first;
}

function singleMaterialMetadata(items = []) {
  if (!items.length) return {};
  const first = items[0];
  const materialId = first.material_id ?? first.product_id;
  const price = Number(first.unit_price ?? first.price);
  const unitName = first.unit_name ?? first.unitName ?? null;
  const quantitySign = Math.sign(Number(first.quantity));
  if (!Number.isFinite(price) || price < 0) return {};
  if (items.length > 1 && !materialId) return {};
  if (
    !items.every(
      (item) =>
        String(item.material_id ?? item.product_id ?? '') === String(materialId ?? '') &&
        Number(item.unit_price ?? item.price) === price &&
        (item.unit_name ?? item.unitName ?? null) === unitName &&
        Number.isFinite(Number(item.quantity)) &&
        Number(item.quantity) !== 0 &&
        Math.sign(Number(item.quantity)) === quantitySign
    )
  )
    return {};
  return {
    quantity: items
      .reduce((sum, item) => sum.plus(item.quantity), new Decimal(0))
      .abs()
      .toNumber(),
    unit_name: unitName,
    unit_price: price,
  };
}

module.exports = {
  LINE_METADATA_FIELDS,
  pickLineMetadata,
  pickCommonLineMetadata,
  resolveCommonLineMetadata,
  singleMaterialMetadata,
};
