const { normalizeTaxRate, toNumber } = require('../../utils/money');

function toPositiveNumber(value) {
  const number = toNumber(value, 0);
  return number > 0 ? number : 0;
}

function optionalInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

async function runQuery(connection, sql, params = []) {
  const runner = typeof connection.execute === 'function'
    ? connection.execute.bind(connection)
    : connection.query.bind(connection);
  return runner(sql, params);
}

function makeEmptyResult(request = {}) {
  return {
    material_id: request.materialId || request.material_id || null,
    material_code: request.materialCode || request.material_code || null,
    supplier_id: request.supplierId || request.supplier_id || null,
    price: 0,
    unit_price: 0,
    tax_rate: 0,
    source: 'none',
    source_label: 'no_purchase_price',
    auto_fill: false,
  };
}

function makeResult(row, source) {
  const price = toPositiveNumber(row.price);
  return {
    material_id: row.material_id || null,
    material_code: row.material_code || null,
    supplier_id: row.supplier_id || null,
    price,
    unit_price: price,
    tax_rate: normalizeTaxRate(row.tax_rate, 0),
    source,
    source_label: source,
    auto_fill: price > 0,
    last_date: row.order_date || row.receipt_date || null,
    last_supplier: row.supplier_name || null,
    source_order_no: row.order_no || null,
    source_receipt_no: row.receipt_no || null,
  };
}

function buildWhereForMaterials(materialIds, materialCodes, alias) {
  const parts = [];
  const params = [];

  if (materialIds.length > 0) {
    parts.push(`${alias}.material_id IN (${materialIds.map(() => '?').join(',')})`);
    params.push(...materialIds);
  }

  if (materialCodes.length > 0) {
    parts.push(`${alias}.material_code IN (${materialCodes.map(() => '?').join(',')})`);
    params.push(...materialCodes);
  }

  return {
    clause: parts.length > 0 ? `(${parts.join(' OR ')})` : '1=0',
    params,
  };
}

function buildMaterialMasterWhere(materialIds, materialCodes) {
  const parts = [];
  const params = [];

  if (materialIds.length > 0) {
    parts.push(`id IN (${materialIds.map(() => '?').join(',')})`);
    params.push(...materialIds);
  }

  if (materialCodes.length > 0) {
    parts.push(`code IN (${materialCodes.map(() => '?').join(',')})`);
    params.push(...materialCodes);
  }

  return {
    clause: parts.length > 0 ? `(${parts.join(' OR ')})` : '1=0',
    params,
  };
}

class PurchasePriceService {
  static normalizeRequests(requests = []) {
    return requests.map((request, index) => ({
      index,
      key: `req:${index}`,
      materialId: optionalInt(request.materialId ?? request.material_id),
      materialCode: optionalString(request.materialCode ?? request.material_code),
      supplierId: optionalInt(request.supplierId ?? request.supplier_id),
      raw: request,
    })).filter((request) => request.materialId || request.materialCode);
  }

  static indexRequests(requests) {
    const bySupplierMaterial = new Map();
    const byMaterial = new Map();

    for (const request of requests) {
      const materialKeys = [];
      if (request.materialId) materialKeys.push(`id:${request.materialId}`);
      if (request.materialCode) materialKeys.push(`code:${request.materialCode}`);

      for (const materialKey of materialKeys) {
        if (!byMaterial.has(materialKey)) byMaterial.set(materialKey, []);
        byMaterial.get(materialKey).push(request.key);

        if (request.supplierId) {
          const supplierKey = `${materialKey}:supplier:${request.supplierId}`;
          if (!bySupplierMaterial.has(supplierKey)) bySupplierMaterial.set(supplierKey, []);
          bySupplierMaterial.get(supplierKey).push(request.key);
        }
      }
    }

    return { bySupplierMaterial, byMaterial };
  }

  static applySupplierRow(row, source, state) {
    const materialKeys = [];
    if (row.material_id) materialKeys.push(`id:${row.material_id}`);
    if (row.material_code) materialKeys.push(`code:${row.material_code}`);

    for (const materialKey of materialKeys) {
      const keys = state.bySupplierMaterial.get(`${materialKey}:supplier:${row.supplier_id}`) || [];
      for (const key of keys) {
        if (state.unresolved.has(key)) {
          state.results.set(key, makeResult(row, source));
          state.unresolved.delete(key);
        }
      }
    }
  }

  static applyMaterialRow(row, source, state) {
    const materialKeys = [];
    if (row.material_id) materialKeys.push(`id:${row.material_id}`);
    if (row.material_code) materialKeys.push(`code:${row.material_code}`);

    for (const materialKey of materialKeys) {
      const keys = state.byMaterial.get(materialKey) || [];
      for (const key of keys) {
        if (state.unresolved.has(key)) {
          state.results.set(key, makeResult(row, source));
          state.unresolved.delete(key);
        }
      }
    }
  }

  static async resolvePurchasePrice(connection, request) {
    const prices = await this.resolvePurchasePrices(connection, [request]);
    return prices[0] || makeEmptyResult(request);
  }

  static async resolvePurchasePrices(connection, requests = []) {
    const normalized = this.normalizeRequests(requests);
    const defaults = requests.map((request) => makeEmptyResult(request));
    if (normalized.length === 0) return defaults;

    const results = new Map();
    const unresolved = new Set(normalized.map((request) => request.key));
    const { bySupplierMaterial, byMaterial } = this.indexRequests(normalized);
    const state = { results, unresolved, bySupplierMaterial, byMaterial };

    const materialIds = [...new Set(normalized.map((request) => request.materialId).filter(Boolean))];
    const materialCodes = [...new Set(normalized.map((request) => request.materialCode).filter(Boolean))];
    const supplierIds = [...new Set(normalized.map((request) => request.supplierId).filter(Boolean))];

    if (supplierIds.length > 0) {
      await this.resolveSupplierOrderHistory(connection, materialIds, materialCodes, supplierIds, state);
    }

    if (unresolved.size > 0 && supplierIds.length > 0) {
      await this.resolveSupplierReceiptHistory(connection, materialIds, materialCodes, supplierIds, state);
    }

    if (unresolved.size > 0) {
      await this.resolveGlobalOrderHistory(connection, materialIds, materialCodes, state);
    }

    if (unresolved.size > 0) {
      await this.resolveMaterialCost(connection, materialIds, materialCodes, state);
    }

    return requests.map((request, index) => {
      const normalizedRequest = normalized.find((item) => item.index === index);
      if (!normalizedRequest) return defaults[index];
      return results.get(normalizedRequest.key) || makeEmptyResult(request);
    });
  }

  static async resolveSupplierOrderHistory(connection, materialIds, materialCodes, supplierIds, state) {
    const materialWhere = buildWhereForMaterials(materialIds, materialCodes, 'poi');
    const supplierWhere = supplierIds.map(() => '?').join(',');
    const [rows] = await runQuery(
      connection,
      `
      SELECT
        poi.material_id,
        poi.material_code,
        po.supplier_id,
        poi.price,
        poi.tax_rate,
        po.order_no,
        po.order_date,
        s.name AS supplier_name
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.order_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE ${materialWhere.clause}
        AND po.supplier_id IN (${supplierWhere})
        AND po.status NOT IN ('cancelled')
        AND poi.price > 0
      ORDER BY po.order_date DESC, po.id DESC, poi.id DESC
      `,
      [...materialWhere.params, ...supplierIds]
    );

    for (const row of rows) {
      this.applySupplierRow(row, 'supplier_history', state);
    }
  }

  static async resolveSupplierReceiptHistory(connection, materialIds, materialCodes, supplierIds, state) {
    const materialWhere = buildWhereForMaterials(materialIds, materialCodes, 'pri');
    const supplierWhere = supplierIds.map(() => '?').join(',');
    const [rows] = await runQuery(
      connection,
      `
      SELECT
        pri.material_id,
        pri.material_code,
        pr.supplier_id,
        pri.price,
        poi.tax_rate,
        pr.receipt_no,
        pr.receipt_date,
        pr.supplier_name
      FROM purchase_receipt_items pri
      JOIN purchase_receipts pr ON pri.receipt_id = pr.id
      LEFT JOIN purchase_order_items poi ON pr.order_id = poi.order_id AND pri.material_id = poi.material_id
      WHERE ${materialWhere.clause}
        AND pr.supplier_id IN (${supplierWhere})
        AND pr.status NOT IN ('cancelled')
        AND pri.price > 0
      ORDER BY pr.receipt_date DESC, pr.id DESC, pri.id DESC
      `,
      [...materialWhere.params, ...supplierIds]
    );

    for (const row of rows) {
      this.applySupplierRow(row, 'supplier_receipt_history', state);
    }
  }

  static async resolveGlobalOrderHistory(connection, materialIds, materialCodes, state) {
    const materialWhere = buildWhereForMaterials(materialIds, materialCodes, 'poi');
    const [rows] = await runQuery(
      connection,
      `
      SELECT
        poi.material_id,
        poi.material_code,
        po.supplier_id,
        poi.price,
        poi.tax_rate,
        po.order_no,
        po.order_date,
        s.name AS supplier_name
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.order_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE ${materialWhere.clause}
        AND po.status NOT IN ('cancelled')
        AND poi.price > 0
      ORDER BY po.order_date DESC, po.id DESC, poi.id DESC
      `,
      materialWhere.params
    );

    for (const row of rows) {
      this.applyMaterialRow(row, 'other_supplier_history', state);
    }
  }

  static async resolveMaterialCost(connection, materialIds, materialCodes, state) {
    const materialWhere = buildMaterialMasterWhere(materialIds, materialCodes);
    const [rows] = await runQuery(
      connection,
      `
      SELECT
        id AS material_id,
        code AS material_code,
        NULL AS supplier_id,
        cost_price AS price,
        tax_rate
      FROM materials
      WHERE ${materialWhere.clause}
      `,
      materialWhere.params
    );

    for (const row of rows) {
      if (toPositiveNumber(row.price) > 0) {
        this.applyMaterialRow(row, 'material_cost', state);
      }
    }
  }
}

module.exports = PurchasePriceService;
