const { pool } = require('../../config/db');
const { logger } = require('../../utils/logger');
const { toNumber } = require('../../utils/money');

const DEFAULT_METAL_SYMBOL = 'ALUMINUM';

function optionalInt(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalString(value, maxLength = 255) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeMetalSymbol(value) {
  const symbol = optionalString(value, 32).toUpperCase();
  return symbol || DEFAULT_METAL_SYMBOL;
}

function formatDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function roundPrice(value, digits = 6) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(digits));
}

function buildBandLabel(min, max) {
  const left = Number(min);
  const right = Number(max);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return '';
  return String(Math.round(left)) + '-' + String(Math.round(right));
}

function parseBands(bands = []) {
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new Error('至少需要配置一个金属价区间');
  }
  const parsed = bands.map((band, index) => {
    const min = optionalNumber(band.metal_price_min ?? band.min ?? band.from);
    const max = optionalNumber(band.metal_price_max ?? band.max ?? band.to);
    if (min === null || max === null) {
      throw new Error('第 ' + (index + 1) + ' 个区间缺少有效的起止金属价');
    }
    if (max < min) {
      throw new Error('第 ' + (index + 1) + ' 个区间的结束价不能小于起始价');
    }
    return {
      band_index: optionalInt(band.band_index) || index,
      metal_price_min: roundPrice(min, 4),
      metal_price_max: roundPrice(max, 4),
      label: optionalString(band.label, 100) || buildBandLabel(min, max),
    };
  });
  parsed.sort((a, b) => a.metal_price_min - b.metal_price_min || a.band_index - b.band_index);
  for (let i = 1; i < parsed.length; i += 1) {
    if (parsed[i].metal_price_min <= parsed[i - 1].metal_price_max) {
      throw new Error('区间 ' + parsed[i - 1].label + ' 与 ' + parsed[i].label + ' 存在重叠');
    }
  }
  return parsed.map((band, index) => ({ ...band, band_index: index }));
}

function parseItems(items = [], bands = []) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('至少需要配置一个物料区间价');
  }
  const seenCodes = new Set();
  return items.map((item, index) => {
    const materialCode = optionalString(item.material_code ?? item.code, 100);
    if (!materialCode) throw new Error('第 ' + (index + 1) + ' 个物料缺少物料编码');
    if (seenCodes.has(materialCode)) throw new Error('物料编码重复: ' + materialCode);
    seenCodes.add(materialCode);
    const bandPricesInput = item.band_prices || item.prices || item.price_map || {};
    const bandPrices = bands.map((band, bandIndex) => {
      let rawPrice;
      if (Array.isArray(bandPricesInput)) {
        rawPrice = bandPricesInput[bandIndex];
        if (rawPrice && typeof rawPrice === 'object') {
          rawPrice = rawPrice.unit_price ?? rawPrice.price ?? rawPrice.value;
        }
      } else if (bandPricesInput && typeof bandPricesInput === 'object') {
        rawPrice = bandPricesInput[band.label] ?? bandPricesInput[String(bandIndex)] ?? bandPricesInput[band.band_index] ?? bandPricesInput[String(band.metal_price_min) + '-' + String(band.metal_price_max)];
      }
      const unitPrice = optionalNumber(rawPrice);
      if (unitPrice === null || unitPrice < 0) {
        throw new Error('物料 ' + materialCode + ' 缺少区间 ' + band.label + ' 的有效单价');
      }
      return { band_index: band.band_index, unit_price: roundPrice(unitPrice, 6) };
    });
    return {
      material_id: optionalInt(item.material_id),
      material_code: materialCode,
      material_name: optionalString(item.material_name ?? item.name, 255) || null,
      specification: optionalString(item.specification ?? item.specs, 255) || null,
      processing_fee: optionalNumber(item.processing_fee),
      unit_weight_g: optionalNumber(item.unit_weight_g ?? item.weight_g),
      price_step: optionalNumber(item.price_step ?? item.step),
      remark: optionalString(item.remark ?? item.remarks, 1000) || null,
      is_enabled: toBoolean(item.is_enabled, true),
      sort_order: optionalInt(item.sort_order) || index,
      band_prices: bandPrices,
    };
  });
}

async function runQuery(connection, sql, params = []) {
  const runner = connection && typeof connection.execute === 'function' ? connection.execute.bind(connection) : connection && typeof connection.query === 'function' ? connection.query.bind(connection) : pool.query.bind(pool);
  return runner(sql, params);
}

async function tableExists(connection, tableName) {
  const [rows] = await runQuery(connection, 'SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [tableName]);
  return Number(rows[0]?.cnt || 0) > 0;
}

async function ensureTablesAvailable(connection = pool) {
  const required = ['supplier_metal_price_schemes', 'supplier_metal_price_bands', 'supplier_metal_price_items', 'supplier_metal_price_item_bands'];
  for (const tableName of required) {
    if (!(await tableExists(connection, tableName))) {
      throw new Error('供应商金属区间报价表尚未初始化，请先执行数据库迁移');
    }
  }
}

async function resolveMaterialMap(connection, items) {
  const codes = [...new Set(items.map((item) => item.material_code).filter(Boolean))];
  const ids = [...new Set(items.map((item) => item.material_id).filter(Boolean))];
  if (codes.length === 0 && ids.length === 0) return { byCode: new Map(), byId: new Map() };
  const clauses = [];
  const params = [];
  if (ids.length > 0) { clauses.push('id IN (' + ids.map(() => '?').join(',') + ')'); params.push(...ids); }
  if (codes.length > 0) { clauses.push('code IN (' + codes.map(() => '?').join(',') + ')'); params.push(...codes); }
  const [rows] = await runQuery(connection, 'SELECT id, code, name, specs FROM materials WHERE deleted_at IS NULL AND (' + clauses.join(' OR ') + ')', params);
  const byCode = new Map();
  const byId = new Map();
  rows.forEach((row) => { byCode.set(String(row.code), row); byId.set(Number(row.id), row); });
  return { byCode, byId };
}

function mapSchemeRow(row) {
  return {
    id: row.id,
    supplier_id: row.supplier_id,
    name: row.name,
    metal_symbol: row.metal_symbol,
    metal_unit: row.metal_unit,
    band_step: toNumber(row.band_step, 0),
    is_enabled: Boolean(row.is_enabled),
    is_default: Boolean(row.is_default),
    effective_from: formatDateOnly(row.effective_from),
    effective_to: formatDateOnly(row.effective_to),
    remark: row.remark || '',
    created_by: row.created_by,
    updated_by: row.updated_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    item_count: row.item_count !== undefined ? Number(row.item_count) : undefined,
    band_count: row.band_count !== undefined ? Number(row.band_count) : undefined,
  };
}


async function loadSchemeDetail(connection, schemeId) {
  const [schemeRows] = await runQuery(connection, 'SELECT id, supplier_id, name, metal_symbol, metal_unit, band_step, is_enabled, is_default, effective_from, effective_to, remark, created_by, updated_by, created_at, updated_at FROM supplier_metal_price_schemes WHERE id = ?', [schemeId]);
  if (!schemeRows[0]) return null;
  const [bandRows] = await runQuery(connection, 'SELECT id, scheme_id, band_index, metal_price_min, metal_price_max, label FROM supplier_metal_price_bands WHERE scheme_id = ? ORDER BY band_index ASC, metal_price_min ASC', [schemeId]);
  const [itemRows] = await runQuery(connection, 'SELECT id, scheme_id, material_id, material_code, material_name, specification, processing_fee, unit_weight_g, price_step, remark, is_enabled, sort_order FROM supplier_metal_price_items WHERE scheme_id = ? ORDER BY sort_order ASC, id ASC', [schemeId]);
  const itemIds = itemRows.map((row) => row.id);
  let priceRows = [];
  if (itemIds.length > 0) {
    const [rows] = await runQuery(connection, 'SELECT ib.item_id, ib.band_id, ib.unit_price, b.band_index, b.label, b.metal_price_min, b.metal_price_max FROM supplier_metal_price_item_bands ib JOIN supplier_metal_price_bands b ON b.id = ib.band_id WHERE ib.item_id IN (' + itemIds.map(() => '?').join(',') + ') ORDER BY b.band_index ASC', itemIds);
    priceRows = rows;
  }
  const pricesByItem = new Map();
  priceRows.forEach((row) => {
    if (!pricesByItem.has(row.item_id)) pricesByItem.set(row.item_id, []);
    pricesByItem.get(row.item_id).push({ band_id: row.band_id, band_index: row.band_index, label: row.label, metal_price_min: toNumber(row.metal_price_min, 0), metal_price_max: toNumber(row.metal_price_max, 0), unit_price: toNumber(row.unit_price, 0) });
  });
  return {
    ...mapSchemeRow(schemeRows[0]),
    bands: bandRows.map((row) => ({ id: row.id, band_index: row.band_index, metal_price_min: toNumber(row.metal_price_min, 0), metal_price_max: toNumber(row.metal_price_max, 0), label: row.label || buildBandLabel(row.metal_price_min, row.metal_price_max) })),
    items: itemRows.map((row) => ({ id: row.id, material_id: row.material_id, material_code: row.material_code, material_name: row.material_name, specification: row.specification, processing_fee: optionalNumber(row.processing_fee), unit_weight_g: optionalNumber(row.unit_weight_g), price_step: optionalNumber(row.price_step), remark: row.remark || '', is_enabled: Boolean(row.is_enabled), sort_order: row.sort_order, band_prices: pricesByItem.get(row.id) || [] })),
  };
}

class SupplierMetalRangePriceService {
  static async listSchemes(supplierId, options = {}) {
    await ensureTablesAvailable();
    const id = optionalInt(supplierId);
    if (!id) throw new Error('缺少有效的供应商ID');
    const params = [id];
    let where = 's.supplier_id = ?';
    if (options.enabledOnly) where += ' AND s.is_enabled = 1';
    if (options.metalSymbol) { where += ' AND s.metal_symbol = ?'; params.push(normalizeMetalSymbol(options.metalSymbol)); }
    const [rows] = await pool.query('SELECT s.*, (SELECT COUNT(*) FROM supplier_metal_price_items i WHERE i.scheme_id = s.id) AS item_count, (SELECT COUNT(*) FROM supplier_metal_price_bands b WHERE b.scheme_id = s.id) AS band_count FROM supplier_metal_price_schemes s WHERE ' + where + ' ORDER BY s.is_default DESC, s.is_enabled DESC, s.id DESC', params);
    return rows.map(mapSchemeRow);
  }

  static async getSchemeById(schemeId) {
    await ensureTablesAvailable();
    const id = optionalInt(schemeId);
    if (!id) throw new Error('缺少有效的区间报价方案ID');
    return loadSchemeDetail(pool, id);
  }

  static async saveScheme(supplierId, payload = {}, actorId = null) {
    await ensureTablesAvailable();
    const supplier = optionalInt(supplierId);
    if (!supplier) throw new Error('缺少有效的供应商ID');
    const schemeId = optionalInt(payload.id);
    const name = optionalString(payload.name, 100) || '默认铝价区间报价';
    const metalSymbol = normalizeMetalSymbol(payload.metal_symbol);
    const metalUnit = optionalString(payload.metal_unit, 50) || '¥/吨';
    const bandStep = optionalNumber(payload.band_step) ?? 1000;
    const isEnabled = toBoolean(payload.is_enabled, true);
    const isDefault = toBoolean(payload.is_default, true);
    const effectiveFrom = formatDateOnly(payload.effective_from);
    const effectiveTo = formatDateOnly(payload.effective_to);
    const remark = optionalString(payload.remark, 1000) || null;
    const bands = parseBands(payload.bands || []);
    const items = parseItems(payload.items || [], bands);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [supplierRows] = await connection.query('SELECT id FROM suppliers WHERE id = ? AND deleted_at IS NULL', [supplier]);
      if (!supplierRows[0]) throw new Error('供应商不存在');
      let targetSchemeId = schemeId;
      if (targetSchemeId) {
        const [existing] = await connection.query('SELECT id FROM supplier_metal_price_schemes WHERE id = ? AND supplier_id = ?', [targetSchemeId, supplier]);
        if (!existing[0]) throw new Error('区间报价方案不存在或不属于该供应商');
        await connection.query('UPDATE supplier_metal_price_schemes SET name = ?, metal_symbol = ?, metal_unit = ?, band_step = ?, is_enabled = ?, is_default = ?, effective_from = ?, effective_to = ?, remark = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [name, metalSymbol, metalUnit, bandStep, isEnabled ? 1 : 0, isDefault ? 1 : 0, effectiveFrom, effectiveTo, remark, actorId, targetSchemeId]);
        await connection.query('DELETE FROM supplier_metal_price_bands WHERE scheme_id = ?', [targetSchemeId]);
        await connection.query('DELETE FROM supplier_metal_price_items WHERE scheme_id = ?', [targetSchemeId]);
      } else {
        const [insertResult] = await connection.query('INSERT INTO supplier_metal_price_schemes (supplier_id, name, metal_symbol, metal_unit, band_step, is_enabled, is_default, effective_from, effective_to, remark, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [supplier, name, metalSymbol, metalUnit, bandStep, isEnabled ? 1 : 0, isDefault ? 1 : 0, effectiveFrom, effectiveTo, remark, actorId, actorId]);
        targetSchemeId = insertResult.insertId;
      }
      if (isDefault) {
        await connection.query('UPDATE supplier_metal_price_schemes SET is_default = 0, updated_at = CURRENT_TIMESTAMP WHERE supplier_id = ? AND metal_symbol = ? AND id <> ?', [supplier, metalSymbol, targetSchemeId]);
      }
      const bandIdByIndex = new Map();
      for (const band of bands) {
        const [bandResult] = await connection.query('INSERT INTO supplier_metal_price_bands (scheme_id, band_index, metal_price_min, metal_price_max, label) VALUES (?, ?, ?, ?, ?)', [targetSchemeId, band.band_index, band.metal_price_min, band.metal_price_max, band.label]);
        bandIdByIndex.set(band.band_index, bandResult.insertId);
      }
      const materialMap = await resolveMaterialMap(connection, items);
      for (const item of items) {
        const material = (item.material_id && materialMap.byId.get(item.material_id)) || materialMap.byCode.get(item.material_code) || null;
        const [itemResult] = await connection.query('INSERT INTO supplier_metal_price_items (scheme_id, material_id, material_code, material_name, specification, processing_fee, unit_weight_g, price_step, remark, is_enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [targetSchemeId, material?.id || item.material_id || null, item.material_code, item.material_name || material?.name || null, item.specification || material?.specs || null, item.processing_fee, item.unit_weight_g, item.price_step, item.remark, item.is_enabled ? 1 : 0, item.sort_order]);
        for (const price of item.band_prices) {
          const bandId = bandIdByIndex.get(price.band_index);
          if (!bandId) continue;
          await connection.query('INSERT INTO supplier_metal_price_item_bands (item_id, band_id, unit_price) VALUES (?, ?, ?)', [itemResult.insertId, bandId, price.unit_price]);
        }
      }
      await connection.commit();
      return loadSchemeDetail(connection, targetSchemeId);
    } catch (error) {
      await connection.rollback();
      logger.error('保存供应商金属区间报价失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async deleteScheme(supplierId, schemeId) {
    await ensureTablesAvailable();
    const supplier = optionalInt(supplierId);
    const id = optionalInt(schemeId);
    if (!supplier || !id) throw new Error('缺少有效的供应商或方案ID');
    const [result] = await pool.query('DELETE FROM supplier_metal_price_schemes WHERE id = ? AND supplier_id = ?', [id, supplier]);
    return result.affectedRows > 0;
  }

  static async getCurrentMetalPrice(connection = pool, metalSymbol = DEFAULT_METAL_SYMBOL) {
    const symbol = normalizeMetalSymbol(metalSymbol);
    try {
      if (await tableExists(connection, 'metal_prices')) {
        const [rows] = await runQuery(connection, 'SELECT symbol, name, price, unit, source, last_update_at FROM metal_prices WHERE symbol = ? LIMIT 1', [symbol]);
        if (rows[0] && optionalNumber(rows[0].price) !== null) {
          return { symbol, name: rows[0].name, price: roundPrice(rows[0].price, 6), unit: rows[0].unit, source: rows[0].source || 'metal_prices', last_update_at: rows[0].last_update_at };
        }
      }
    } catch (error) {
      logger.warn('读取金属价格失败，将继续降级: ' + error.message);
    }
    return null;
  }

  static findMatchingBand(bands, metalPrice) {
    const price = optionalNumber(metalPrice);
    if (price === null || !Array.isArray(bands) || bands.length === 0) return null;
    const exact = bands.find((band) => {
      const min = toNumber(band.metal_price_min, Number.NEGATIVE_INFINITY);
      const max = toNumber(band.metal_price_max, Number.POSITIVE_INFINITY);
      return price >= min && price <= max;
    });
    if (exact) return exact;
    const sorted = [...bands].sort((a, b) => toNumber(a.metal_price_min, 0) - toNumber(b.metal_price_min, 0));
    if (price < toNumber(sorted[0].metal_price_min, 0)) return sorted[0];
    return sorted[sorted.length - 1];
  }

  static async resolveActiveScheme(connection, supplierId, metalSymbol, orderDate) {
    const supplier = optionalInt(supplierId);
    if (!supplier) return null;
    const symbol = normalizeMetalSymbol(metalSymbol);
    const date = formatDateOnly(orderDate) || formatDateOnly(new Date());
    const [rows] = await runQuery(connection, 'SELECT id FROM supplier_metal_price_schemes WHERE supplier_id = ? AND metal_symbol = ? AND is_enabled = 1 AND (effective_from IS NULL OR effective_from <= ?) AND (effective_to IS NULL OR effective_to >= ?) ORDER BY is_default DESC, id DESC LIMIT 1', [supplier, symbol, date, date]);
    if (!rows[0]) return null;
    return loadSchemeDetail(connection, rows[0].id);
  }

  static matchSchemeItem(scheme, request = {}) {
    if (!scheme || !Array.isArray(scheme.items)) return null;
    const materialId = optionalInt(request.materialId ?? request.material_id);
    const materialCode = optionalString(request.materialCode ?? request.material_code, 100);
    return scheme.items.find((item) => item.is_enabled !== false && materialId && item.material_id === materialId) || scheme.items.find((item) => item.is_enabled !== false && materialCode && item.material_code === materialCode) || null;
  }

  static buildPriceResult({ request = {}, scheme = null, item = null, band = null, metal = null, unitPrice = null }) {
    const price = optionalNumber(unitPrice);
    if (!scheme || !item || !band || price === null || price <= 0) {
      return { material_id: request.materialId || request.material_id || null, material_code: request.materialCode || request.material_code || null, supplier_id: request.supplierId || request.supplier_id || null, price: 0, unit_price: 0, tax_rate: 0, source: 'none', source_label: 'no_metal_range_price', auto_fill: false };
    }
    return {
      material_id: item.material_id || request.materialId || request.material_id || null,
      material_code: item.material_code || request.materialCode || request.material_code || null,
      supplier_id: scheme.supplier_id || request.supplierId || request.supplier_id || null,
      price: roundPrice(price, 6),
      unit_price: roundPrice(price, 6),
      tax_rate: 0,
      source: 'supplier_metal_range',
      source_label: 'supplier_metal_range',
      auto_fill: true,
      metal_symbol: scheme.metal_symbol,
      metal_price: metal?.price ?? null,
      metal_price_source: metal?.source || null,
      metal_price_date: formatDateOnly(metal?.last_update_at) || formatDateOnly(new Date()),
      metal_price_min: toNumber(band.metal_price_min, null),
      metal_price_max: toNumber(band.metal_price_max, null),
      metal_price_band_label: band.label || buildBandLabel(band.metal_price_min, band.metal_price_max),
      metal_price_scheme_id: scheme.id,
      metal_price_scheme_name: scheme.name,
      metal_price_item_id: item.id,
      processing_fee: item.processing_fee,
      price_step: item.price_step,
      last_date: formatDateOnly(metal?.last_update_at) || formatDateOnly(new Date()),
    };
  }

  static async resolveRangePrices(connection, requests = [], options = {}) {
    try { await ensureTablesAvailable(connection); } catch { return requests.map((request) => this.buildPriceResult({ request })); }
    const metalCache = new Map();
    const schemeCache = new Map();
    const results = [];
    for (const request of requests) {
      const supplierId = optionalInt(request.supplierId ?? request.supplier_id);
      const metalSymbol = normalizeMetalSymbol(request.metalSymbol ?? request.metal_symbol ?? options.metalSymbol);
      const orderDate = request.orderDate || request.order_date || options.orderDate || new Date();
      const explicitMetalPrice = optionalNumber(request.metalPrice ?? request.metal_price ?? options.metalPrice);
      if (!supplierId) { results.push(this.buildPriceResult({ request })); continue; }
      const schemeKey = String(supplierId) + ':' + metalSymbol + ':' + formatDateOnly(orderDate);
      if (!schemeCache.has(schemeKey)) schemeCache.set(schemeKey, await this.resolveActiveScheme(connection, supplierId, metalSymbol, orderDate));
      const scheme = schemeCache.get(schemeKey);
      if (!scheme) { results.push(this.buildPriceResult({ request })); continue; }
      let metal;
      if (explicitMetalPrice !== null) {
        metal = { symbol: metalSymbol, price: explicitMetalPrice, source: options.metalPriceSource || request.metal_price_source || 'MANUAL', last_update_at: orderDate };
      } else {
        if (!metalCache.has(metalSymbol)) metalCache.set(metalSymbol, await this.getCurrentMetalPrice(connection, metalSymbol));
        metal = metalCache.get(metalSymbol);
      }
      if (!metal || optionalNumber(metal.price) === null) { results.push(this.buildPriceResult({ request, scheme })); continue; }
      const item = this.matchSchemeItem(scheme, request);
      const band = this.findMatchingBand(scheme.bands, metal.price);
      const bandPrice = item?.band_prices?.find((price) => {
        if (band?.id && price.band_id) return Number(price.band_id) === Number(band.id);
        return Number(price.band_index) === Number(band?.band_index);
      });
      results.push(this.buildPriceResult({ request, scheme, item, band, metal, unitPrice: bandPrice?.unit_price }));
    }
    return results;
  }

  static async resolveRangePrice(connection, request = {}, options = {}) {
    const [result] = await this.resolveRangePrices(connection, [request], options);
    return result || this.buildPriceResult({ request });
  }
}

module.exports = SupplierMetalRangePriceService;
