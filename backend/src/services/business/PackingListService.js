const { pool } = require('../../config/db');
const BusinessError = require('../../utils/BusinessError');
const Precision = require('../../utils/precision');
const { CodeGenerators } = require('../../utils/codeGenerator');
const { mapKeysToSnake } = require('../../utils/fieldMap');
const { SALES_PACKING_TRANSITIONS } = require('../../constants/statusRegistry');
const { softDelete } = require('../../utils/softDelete');

const fail = (message, status = 400) => { throw new BusinessError(message, null, 'PACKING_LIST_INVALID', status); };
const transaction = async work => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
};

async function lockDocument(connection, id) {
  const [[row]] = await connection.query('SELECT * FROM packing_lists WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
  if (!row) fail('装箱单不存在', 404);
  return row;
}

async function prepareDocument(connection, input) {
  const data = mapKeysToSnake(input || {});
  if (!data.customer_id || !/^\d{4}-\d{2}-\d{2}$/.test(data.packing_date || '')) fail('请填写客户和有效的装箱日期');
  if (!Array.isArray(data.details) || !data.details.length) fail('装箱单至少需要一条明细');
  const [[customer]] = await connection.query('SELECT id, name FROM customers WHERE id = ? AND deleted_at IS NULL', [data.customer_id]);
  if (!customer) fail('客户不存在');
  let order = null;
  if (data.sales_order_id) {
    [[order]] = await connection.query('SELECT id, order_no, customer_id FROM sales_orders WHERE id = ? AND deleted_at IS NULL', [data.sales_order_id]);
    if (!order || Number(order.customer_id) !== Number(customer.id)) fail('销售订单不存在或不属于所选客户');
  }

  const products = new Map();
  const units = new Map();
  const details = [];
  for (const [index, detail] of data.details.entries()) {
    const value = Number(detail.quantity);
    if (!Number.isFinite(value) || value <= 0) fail(`第 ${index + 1} 行数量必须大于零`);
    const quantity = Precision.round(value, 2);
    if (quantity <= 0 || quantity >= 100000000) fail(`第 ${index + 1} 行数量超出有效范围`);
    const productId = Number(detail.product_id);
    if (!products.has(productId)) {
      const [[product]] = await connection.query('SELECT id, code, name, specs, unit_id FROM materials WHERE id = ? AND deleted_at IS NULL', [productId || 0]);
      if (!product) fail(`第 ${index + 1} 行请选择有效产品`);
      products.set(productId, product);
    }
    const product = products.get(productId);
    const unitId = Number(detail.unit_id || product.unit_id);
    if (!units.has(unitId)) {
      const [[unit]] = await connection.query('SELECT id, name FROM units WHERE id = ? AND deleted_at IS NULL', [unitId || 0]);
      if (!unit) fail(`第 ${index + 1} 行请选择有效单位`);
      units.set(unitId, unit);
    }
    const measurement = key => {
      if (detail[key] === null || detail[key] === undefined || detail[key] === '') return null;
      const number = Number(detail[key]);
      if (!Number.isFinite(number) || number < 0 || number >= 10000000) fail(`第 ${index + 1} 行${key === 'weight' ? '重量' : '体积'}无效`);
      return Precision.round(number, 3);
    };
    details.push({
      product_id: product.id, product_code: product.code, product_name: product.name,
      product_specs: product.specs || '', quantity, unit_id: unitId, unit_name: units.get(unitId).name,
      item_no: detail.item_no || String(index + 1), box_no: detail.box_no || `BOX${String(index + 1).padStart(3, '0')}`,
      weight: measurement('weight'), volume: measurement('volume'), remark: detail.remark || '',
    });
  }
  const totalQuantity = Precision.add(...details.map(detail => detail.quantity));
  if (totalQuantity >= 100000000) fail('装箱总数量超出有效范围');
  return {
    header: {
      customer_id: customer.id, customer_name: customer.name,
      sales_order_id: order?.id || null, sales_order_no: order?.order_no || null,
      packing_date: data.packing_date, total_boxes: details.length,
      total_quantity: totalQuantity, remark: data.remark || '',
    },
    details,
  };
}

async function insertDetails(connection, id, details) {
  for (const detail of details) await connection.query('INSERT INTO packing_list_details SET ?', [{ packing_list_id: id, ...detail }]);
}

class PackingListService {
  static create(input, actor) {
    return transaction(async connection => {
      const { header, details } = await prepareDocument(connection, input);
      const packingListNo = await CodeGenerators.generatePackingListCode(connection);
      const [result] = await connection.query('INSERT INTO packing_lists SET ?', [{ ...header, packing_list_no: packingListNo, status: 'draft', created_by: actor }]);
      await insertDetails(connection, result.insertId, details);
      return { id: result.insertId, packing_list_no: packingListNo };
    });
  }

  static update(id, input, actor) {
    return transaction(async connection => {
      const existing = await lockDocument(connection, id);
      if (!['draft', 'confirmed'].includes(existing.status)) fail('只有草稿和已确认装箱单可以编辑', 409);
      if (input.status !== undefined && input.status !== existing.status) fail('请通过装箱单状态操作变更状态');
      const { header, details } = await prepareDocument(connection, input);
      await connection.query('UPDATE packing_lists SET ? WHERE id = ?', [{ ...header, updated_by: actor }, id]);
      await connection.query('DELETE FROM packing_list_details WHERE packing_list_id = ?', [id]);
      await insertDetails(connection, id, details);
      return { id: Number(id) };
    });
  }

  static changeStatus(id, status, actor, remark) {
    return transaction(async connection => {
      const existing = await lockDocument(connection, id);
      if (!(SALES_PACKING_TRANSITIONS[existing.status] || []).includes(status)) fail('当前装箱单状态不允许此操作', 409);
      if (status === 'confirmed') {
        const [[totals]] = await connection.query('SELECT COUNT(*) AS boxes, COALESCE(SUM(quantity), 0) AS quantity FROM packing_list_details WHERE packing_list_id = ?', [id]);
        if (!Number(totals.boxes) || Number(totals.quantity) <= 0) fail('请先完善装箱明细');
      }
      const patch = { status, updated_by: actor };
      if (remark !== undefined) patch.remark = remark;
      await connection.query('UPDATE packing_lists SET ? WHERE id = ?', [patch, id]);
      return { id: Number(id), status };
    });
  }

  static delete(id) {
    return transaction(async connection => {
      const existing = await lockDocument(connection, id);
      if (existing.status !== 'draft') fail('只有草稿装箱单可以删除', 409);
      await softDelete(connection, 'packing_lists', 'id', id);
    });
  }
}

module.exports = PackingListService;
