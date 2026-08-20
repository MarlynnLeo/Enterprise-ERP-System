const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ARRAY_ITEMS = 100;
const DEFAULT_MAX_OBJECT_KEYS = 100;
const DEFAULT_MAX_STRING_LENGTH = 4000;
const DEFAULT_MAX_JSON_BYTES = 64 * 1024;

const SENSITIVE_KEY_PARTS = Object.freeze([
  'password',
  'passwd',
  'passphrase',
  'token',
  'secret',
  'authorization',
  'cookie',
  'credential',
  'privatekey',
  'private_key',
  'apikey',
  'api_key',
  'appsecret',
  'app_secret',
  'csrf',
  'aeskey',
  'aes_key',
]);

function isSensitiveKey(key) {
  const normalized = String(key || '').replace(/[\s-]/g, '_').toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

function sanitizeAuditValue(value, options = {}, state = null) {
  const settings = {
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxArrayItems: options.maxArrayItems ?? DEFAULT_MAX_ARRAY_ITEMS,
    maxObjectKeys: options.maxObjectKeys ?? DEFAULT_MAX_OBJECT_KEYS,
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
  };
  const current = state || { depth: 0, seen: new WeakSet() };

  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string') {
    return value.length > settings.maxStringLength
      ? `${value.slice(0, settings.maxStringLength)}...[TRUNCATED]`
      : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value instanceof Error) {
    return {
      name: String(value.name || 'Error').slice(0, 100),
      message: sanitizeAuditValue(value.message, settings, current),
      code: value.code ? String(value.code).slice(0, 100) : null,
    };
  }
  if (current.depth >= settings.maxDepth) return '[MAX_DEPTH]';
  if (current.seen.has(value)) return '[CIRCULAR]';

  current.seen.add(value);
  const nextState = { depth: current.depth + 1, seen: current.seen };
  let result;
  if (Array.isArray(value)) {
    result = value
      .slice(0, settings.maxArrayItems)
      .map((item) => sanitizeAuditValue(item, settings, nextState));
    if (value.length > settings.maxArrayItems) {
      result.push(`[${value.length - settings.maxArrayItems} MORE ITEMS]`);
    }
  } else {
    result = {};
    const keys = Object.keys(value);
    for (const key of keys.slice(0, settings.maxObjectKeys)) {
      result[key] = isSensitiveKey(key)
        ? '***REDACTED***'
        : sanitizeAuditValue(value[key], settings, nextState);
    }
    if (keys.length > settings.maxObjectKeys) {
      result._truncated_keys = keys.length - settings.maxObjectKeys;
    }
  }
  current.seen.delete(value);
  return result;
}

function serializeAuditPayload(value, options = {}) {
  if (value === null || value === undefined) return null;
  const sanitized = sanitizeAuditValue(value, options);
  const json = JSON.stringify(sanitized);
  const maxBytes = Math.max(1024, Number(options.maxJsonBytes) || DEFAULT_MAX_JSON_BYTES);
  const byteLength = Buffer.byteLength(json, 'utf8');
  if (byteLength <= maxBytes) return json;

  const previewLength = Math.min(Math.floor(maxBytes / 2), 24 * 1024);
  return JSON.stringify({
    _truncated: true,
    original_bytes: byteLength,
    preview: json.slice(0, previewLength),
  });
}

module.exports = {
  isSensitiveKey,
  sanitizeAuditValue,
  serializeAuditPayload,
};
