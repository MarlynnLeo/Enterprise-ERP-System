'use strict';

function invalidInput(message) {
  return Object.assign(new Error(message), { statusCode: 400, code: 'INVALID_INPUT' });
}

function parsePostingId(value, label = '库存过账单') {
  if (
    !['string', 'number'].includes(typeof value) ||
    !/^\d+$/.test(String(value).trim()) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) <= 0
  ) {
    throw invalidInput(`${label}参数无效，请选择有效单据`);
  }
  return Number(value);
}

function readAlias(query, camel, snake) {
  const value = query[camel] ?? query[snake];
  if (query[camel] != null && query[snake] != null && String(query[camel]) !== String(query[snake])) {
    throw invalidInput('查询参数不一致，请刷新后重试');
  }
  return value;
}

function readText(value, label, maxLength) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > maxLength) {
    throw invalidInput(`${label}参数无效`);
  }
  return value.trim();
}

function parseSourceType(value) {
  const sourceType = readText(value, '来源类型', 64);
  if (sourceType && !/^[a-z][a-z0-9_]*$/.test(sourceType)) {
    throw invalidInput('来源类型参数无效');
  }
  return sourceType;
}

function parsePostingSource(query = {}) {
  const sourceType = parseSourceType(readAlias(query, 'sourceType', 'source_type'));
  const rawId = readAlias(query, 'sourceId', 'source_id');
  const sourceId = rawId == null || rawId === '' ? null : parsePostingId(rawId, '来源单据');
  const sourceNo = readText(readAlias(query, 'sourceNo', 'source_no'), '来源单号', 100);
  if (!sourceType || (!sourceId && !sourceNo)) {
    throw invalidInput('请提供来源类型及有效来源单据或单号');
  }
  return { sourceType, sourceId, sourceNo };
}

function parsePostingQuery(query = {}) {
  const result = {
    sourceType: parseSourceType(readAlias(query, 'sourceType', 'source_type')),
    financeStatus: readText(readAlias(query, 'financeStatus', 'finance_status'), '审核状态', 20),
    keyword: readText(query.keyword, '搜索关键字', 100),
  };
  if (result.financeStatus && !['pending', 'approved', 'rejected', 'reversed'].includes(result.financeStatus)) {
    throw invalidInput('审核状态参数无效');
  }
  for (const [key, rawValue] of [
    ['page', query.page],
    ['pageSize', readAlias(query, 'pageSize', 'page_size')],
  ]) {
    if (rawValue != null && rawValue !== '') result[key] = parsePostingId(rawValue, '分页');
  }
  return result;
}

const JSON_FIELDS = new Set(['payload_json', 'payloadJson', 'event_data', 'eventData']);

// MySQL can return JSON as strings. Decode these before the common price masker,
// otherwise a masked unitCost remains visible inside the frozen payload string.
// Work on a copy: masking an HTTP response must never alter a stored snapshot.
function postingHttpData(value) {
  if (Array.isArray(value)) return value.map(postingHttpData);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (JSON_FIELDS.has(key) && typeof child === 'string') {
      try {
        child = JSON.parse(child);
      } catch {
        child = null;
      }
      if (!child || typeof child !== 'object') child = null;
    }
    return [key, postingHttpData(child)];
  }));
}

module.exports = { parsePostingId, parsePostingSource, parsePostingQuery, postingHttpData };
