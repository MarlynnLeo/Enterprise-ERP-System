/**
 * 全站字段契约工具（SSOT 基础层）
 *
 * 边界：
 * - HTTP API：camelCase
 * - DB / 模型内部 / SQL：snake_case
 * - 转换只发生在 Controller 入参 / 出参
 *
 * 禁止在业务层写 `a || a_snake` 双读。
 */

const { toNumber, roundMoney } = require('./money');
const { resolveUnitPrice } = require('./unitPriceFields');

function snakeToCamel(key) {
  return String(key).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function camelToSnake(key) {
  return String(key)
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/**
 * Sequelize / 类实例 → 纯 JSON，避免 Object.entries 走到原型环或循环关联。
 */
function toPlainJson(value) {
  if (value == null) return value;
  if (typeof value.toJSON === 'function') {
    try {
      // Sequelize Model / DataTypes 实例
      if (value.dataValues || value._modelOptions || value.isNewRecord !== undefined) {
        return value.toJSON();
      }
    } catch {
      /* fall through */
    }
  }
  return value;
}

/**
 * 将 DB/模型 snake 行递归转为 API camel（边界出参通用）
 * Date / Buffer 原样保留；Sequelize 模型先 toJSON；循环引用安全截断。
 */
function mapKeysToCamel(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;

  value = toPlainJson(value);

  if (Array.isArray(value)) {
    return value.map((v) => mapKeysToCamel(v, seen));
  }
  if (!isPlainObject(value)) return value;

  if (seen.has(value)) return null;
  seen.add(value);

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    // 跳过内部/不可枚举噪音键
    if (k === 'password' || k === 'password_hash' || k.startsWith('_')) continue;
    out[snakeToCamel(k)] = mapKeysToCamel(v, seen);
  }
  return out;
}

/**
 * 将 HTTP camel 体递归转为 DB snake（边界入参通用）
 */
function mapKeysToSnake(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (value instanceof Date) return value;
  if (Buffer.isBuffer(value)) return value;

  value = toPlainJson(value);

  if (Array.isArray(value)) {
    return value.map((v) => mapKeysToSnake(v, seen));
  }
  if (!isPlainObject(value)) return value;

  if (seen.has(value)) return null;
  seen.add(value);

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k.startsWith('_')) continue;
    out[camelToSnake(k)] = mapKeysToSnake(v, seen);
  }
  return out;
}

function formatDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return formatDate(d);
}

/**
 * 创建域 FieldMap
 * @param {object} schema
 * @param {Record<string,string>} schema.fields API camel → DB snake
 * @param {string[]} [schema.dateFields] API 侧日期字段（camel）
 * @param {string[]} [schema.numberFields] API 侧数字字段
 * @param {object} [schema.item] 明细 schema（同结构）
 * @param {string} [schema.itemKey='items']
 * @param {Function} [schema.afterToApi]
 * @param {Function} [schema.afterFromApi]
 */
function createFieldMap(schema = {}) {
  const fields = schema.fields || {};
  const apiToDb = { ...fields };
  const dbToApi = Object.fromEntries(Object.entries(apiToDb).map(([a, b]) => [b, a]));
  const dateFields = new Set(schema.dateFields || []);
  const numberFields = new Set(schema.numberFields || []);
  const itemKey = schema.itemKey || 'items';
  const itemMap = schema.item ? createFieldMap(schema.item) : null;

  function pickApi(body, camelKey) {
    if (!body || typeof body !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(body, camelKey)) return body[camelKey];
    return undefined;
  }

  function fromApi(body = {}) {
    if (!isPlainObject(body) && !Array.isArray(body)) return body;
    const row = {};
    for (const [apiKey, dbKey] of Object.entries(apiToDb)) {
      const raw = pickApi(body, apiKey);
      if (raw === undefined) continue;
      if (dateFields.has(apiKey)) {
        row[dbKey] = formatDate(raw);
      } else if (numberFields.has(apiKey)) {
        if (raw === null || raw === '') row[dbKey] = raw === '' ? null : null;
        else row[dbKey] = toNumber(raw, 0);
      } else {
        row[dbKey] = raw;
      }
    }
    if (itemMap && Array.isArray(body[itemKey])) {
      row[itemKey] = body[itemKey].map((it) => itemMap.fromApi(it));
    }
    if (typeof schema.afterFromApi === 'function') {
      schema.afterFromApi(row, body);
    }
    return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  }

  function toApi(row) {
    if (row == null) return null;
    if (Array.isArray(row)) return row.map((r) => toApi(r));
    if (!isPlainObject(row)) return row;

    // 先全量 snake→camel，再用 schema 覆盖类型/日期规范化
    const api = mapKeysToCamel(row);
    for (const [dbKey, apiKey] of Object.entries(dbToApi)) {
      if (!Object.prototype.hasOwnProperty.call(row, dbKey) && !Object.prototype.hasOwnProperty.call(row, apiKey)) {
        continue;
      }
      let raw = Object.prototype.hasOwnProperty.call(row, dbKey) ? row[dbKey] : row[apiKey];
      if (dateFields.has(apiKey)) raw = formatDate(raw);
      else if (numberFields.has(apiKey) && raw != null && raw !== '') raw = toNumber(raw, 0);
      api[apiKey] = raw === undefined ? null : raw;
    }

    // 明细
    if (itemMap && Array.isArray(row[itemKey])) {
      api[itemKey] = row[itemKey].map((it) => itemMap.toApi(it));
    } else if (itemMap && Array.isArray(row.items)) {
      api.items = row.items.map((it) => itemMap.toApi(it));
    } else if (itemMap && Array.isArray(row.details)) {
      api.details = row.details.map((it) => itemMap.toApi(it));
    }

    if (typeof schema.afterToApi === 'function') {
      schema.afterToApi(api, row);
    }
    return api;
  }

  /** 列表 query：只认 camel query 键 → snake filters */
  function fromListQuery(query = {}, filterKeys = null) {
    const filters = {};
    const keys = filterKeys || Object.keys(apiToDb);
    for (const apiKey of keys) {
      const dbKey = apiToDb[apiKey] || camelToSnake(apiKey);
      if (query[apiKey] !== undefined && query[apiKey] !== null && query[apiKey] !== '') {
        filters[dbKey] = query[apiKey];
      }
    }
    // 常用分页外过滤别名
    if (query.startDate) filters.start_date = query.startDate;
    if (query.endDate) filters.end_date = query.endDate;
    if (query.keyword) filters.keyword = query.keyword;
    if (query.search) filters.search = query.search;
    if (query.status) filters.status = query.status;
    return filters;
  }

  return {
    apiToDb,
    dbToApi,
    fromApi,
    toApi,
    fromListQuery,
    formatDate,
  };
}

/**
 * 明细单价：API unitPrice → 指定 DB 列（price 或 unit_price）
 */
function mapLineUnitPrice(item = {}, dbColumn = 'unit_price') {
  const unitPrice = resolveUnitPrice(item);
  const quantity = toNumber(item.quantity, 0);
  const amount =
    item.amount != null && item.amount !== ''
      ? roundMoney(item.amount)
      : roundMoney(quantity * unitPrice);
  const line = {
    quantity,
    amount,
    description: item.description ?? null,
  };
  line[dbColumn] = unitPrice;
  return line;
}

module.exports = {
  createFieldMap,
  snakeToCamel,
  camelToSnake,
  mapKeysToCamel,
  mapKeysToSnake,
  formatDate,
  mapLineUnitPrice,
  isPlainObject,
  toNumber,
  roundMoney,
  resolveUnitPrice,
};
