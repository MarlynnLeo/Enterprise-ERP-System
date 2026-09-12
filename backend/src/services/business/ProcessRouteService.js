/** Compatibility facade: route and template APIs share one product definition. */
const definitions = require('../ProductProcessRouteService');
const { mapKeysToSnake } = require('../../utils/fieldMap');
const { jsonArray } = require('../../utils/productProcessDefinition');
const { pool } = require('../../config/db');

function routeView(route) {
  if (!route) return null;
  return {
    ...route, is_active: route.status,
    total_standard_minutes: route.details.reduce((sum, step) => sum + Number(step.standard_hours || 0) * 60, 0),
    step_count: route.details.length,
    steps: route.details.map(step => ({
      ...step, route_id: route.id, sequence: step.order_num, step_name: step.name,
      standard_minutes: Number(step.standard_hours || 0) * 60, materials: jsonArray(step.materials),
    })),
  };
}

function definitionInput(input) {
  const data = mapKeysToSnake(input);
  return {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.product_id !== undefined ? { product_id: data.product_id } : {}),
    ...(data.version !== undefined ? { version: data.version } : {}),
    ...(data.is_active !== undefined ? { status: Number(data.is_active) } : {}),
    ...(data.source_template_id ? { source_template_id: data.source_template_id } : {}),
    ...(data.steps !== undefined ? { details: data.steps.map((step, index) => ({
      ...step, name: step.step_name, order_num: step.sequence ?? index + 1,
      standard_hours: Number(step.standard_minutes || 0) / 60,
    })) } : {}),
  };
}

class ProcessRouteService {
  static async getList(params = {}) {
    const result = await definitions.getAll(params.page, params.pageSize, {
      productId: params.productId, status: params.isActive, name: params.keyword,
    });
    return { ...result, list: result.list.map(routeView) };
  }
  static async getById(id) { return routeView(await definitions.getById(id)); }
  static async getActiveByProduct(productId) { return routeView(await definitions.getByProductId(productId)); }
  static async create(data, userId) {
    return routeView(await definitions.create({ ...definitionInput(data), created_by: userId }));
  }
  static async update(id, data, userId) {
    const input = definitionInput(data);
    if (Object.keys(input).every(key => key === 'status')) return routeView(await definitions.updateStatus(id, input.status));
    return routeView(await definitions.update(id, { ...input, updated_by: userId }));
  }
  static async delete(id) { return definitions.delete(id); }
  static async suggestMaterialsFromBom(productId) {
    const [rows] = await pool.query(
      'SELECT bd.material_id, bd.quantity, m.code AS material_code, m.name AS material_name FROM bom_details bd JOIN bom_masters bm ON bm.id = bd.bom_id JOIN materials m ON m.id = bd.material_id WHERE bm.product_id = ? AND bm.status = 1 AND bm.deleted_at IS NULL ORDER BY bd.id',
      [productId]
    );
    return rows;
  }
}

module.exports = ProcessRouteService;
