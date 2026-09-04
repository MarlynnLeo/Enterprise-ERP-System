/**
 * Shared field policy for SQL-injection detection.
 *
 * Both input-validation middleware implementations must classify fields the
 * same way. Keeping the policy here prevents a field from being accepted by
 * one layer and rejected by another.
 */

const SQL_FIELD_MODES = Object.freeze({
  STRICT: 'strict',
  RELAXED: 'relaxed',
  SKIP: 'skip',
});

const STRICT_SQL_PATTERNS = Object.freeze([
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|SCRIPT)\b)/i,
  /('|;|--)/,
  /(\/\*|\*\/)/,
  /(\bOR\b|\bAND\b).*(=|<|>)/i,
  /(UNION.*SELECT|SELECT.*FROM|INSERT.*INTO|UPDATE.*SET|DELETE.*FROM)/i,
]);

// Business prose may legitimately contain quotes, semicolons and standard
// identifiers. It still must reject executable/high-risk SQL combinations.
const RELAXED_SQL_PATTERNS = Object.freeze([
  /(UNION\s+(?:ALL\s+)?SELECT)/i,
  /(SELECT\s+.+\s+FROM\s+.+\s+WHERE)/i,
  /(INSERT\s+INTO\s+\w+)/i,
  /(UPDATE\s+\w+\s+SET\s+)/i,
  /(DELETE\s+FROM\s+\w+)/i,
  /(DROP\s+(TABLE|DATABASE|INDEX))/i,
  /(ALTER\s+TABLE\s+\w+)/i,
  /(EXEC(?:UTE)?\s*\()/i,
  /(;\s*(?:DROP|DELETE|UPDATE|INSERT)\s)/i,
  /(\bOR\s+1\s*=\s*1\b)/i,
  /(\bAND\s+1\s*=\s*1\b)/i,
]);

const SKIP_SQL_FIELDS = new Set([
  'attachment',
  'attachments',
  'file_path',
  'filePath',
  'fileUrl',
  'url',
  'instructionDocs',
  'specs',
  'specification',
  'model',
  'drawing_no',
  'color_code',
  'material',
  'material_type',
  'avatar',
  'bio',
  'rule_value',
  'split_details',
]);

const RELAXED_SQL_FIELDS = new Set([
  'remark',
  'remarks',
  'description',
  'name',
  'standard',
  'standard_value',
  'method',
  'inspection_method',
  'inspectionMethod',
  'item_name',
  'itemName',
  'aqlLevel',
  'aql_level',
  'issue_reason',
  'reason_name',
  'reasonName',
  'reason',
  'title',
  'label',
  'location_detail',
  'location',
  'd2_problem_description',
  'd3_containment_actions',
  'd4_root_cause',
  'd4_contributing_factors',
  'd5_corrective_actions',
  'd6_verification_method',
  'd6_implementation_results',
  'd7_preventive_actions',
  'd7_standardization',
  'd8_summary',
  'd8_lessons_learned',
]);

const CLIENT_ERROR_FIELDS = new Set([
  'type',
  'message',
  'stack',
  'name',
  'componentName',
  'lifecycleHook',
  'url',
  'source',
  'userAgent',
]);

const ROUTE_SQL_BYPASSES = Object.freeze([
  {
    pathPrefix: '/api/print/',
    fields: new Set(['content', 'header_html', 'footer_html', 'body_html']),
  },
  {
    pathPrefix: '/api/system/technical-communications',
    fields: new Set(['content', 'solution', 'description']),
  },
]);

function normalizeRequestPath(requestPath) {
  return String(requestPath || '').split('?')[0];
}

function pathSegments(fieldPath) {
  return String(fieldPath || '')
    .split('.')
    .filter(Boolean)
    .filter((segment, index) => index !== 0 || !['body', 'query', 'params'].includes(segment));
}

function pathLeaf(fieldPath) {
  const segments = pathSegments(fieldPath);
  return segments[segments.length - 1] || '';
}

function pathMatchesField(fieldPath, fields) {
  const segments = pathSegments(fieldPath);
  const leaf = segments[segments.length - 1] || '';
  if (fields.has(leaf)) return true;

  // Arrays of strings are represented as field.0, field.1, etc.
  return /^\d+$/.test(leaf) && segments.length >= 2 && fields.has(segments[segments.length - 2]);
}

function isBusinessNameField(fieldPath) {
  const leaf = pathLeaf(fieldPath);
  return (
    leaf.endsWith('_name') ||
    leaf.endsWith('Name') ||
    ['name', 'display_name', 'displayName', 'label', 'title'].includes(leaf)
  );
}

function getSQLFieldMode(requestPath, fieldPath) {
  const normalizedPath = normalizeRequestPath(requestPath);

  if (
    normalizedPath === '/api/system/client-errors' &&
    pathMatchesField(fieldPath, CLIENT_ERROR_FIELDS)
  ) {
    return SQL_FIELD_MODES.SKIP;
  }

  const routeBypass = ROUTE_SQL_BYPASSES.some(
    ({ pathPrefix, fields }) =>
      normalizedPath.startsWith(pathPrefix) && pathMatchesField(fieldPath, fields)
  );
  if (routeBypass || pathMatchesField(fieldPath, SKIP_SQL_FIELDS)) {
    return SQL_FIELD_MODES.SKIP;
  }

  if (pathMatchesField(fieldPath, RELAXED_SQL_FIELDS) || isBusinessNameField(fieldPath)) {
    return SQL_FIELD_MODES.RELAXED;
  }

  return SQL_FIELD_MODES.STRICT;
}

function containsSQLInjection(value, mode = SQL_FIELD_MODES.STRICT) {
  if (typeof value !== 'string' || mode === SQL_FIELD_MODES.SKIP) {
    return false;
  }

  const patterns = mode === SQL_FIELD_MODES.RELAXED ? RELAXED_SQL_PATTERNS : STRICT_SQL_PATTERNS;
  return patterns.some((pattern) => pattern.test(value));
}

module.exports = {
  SQL_FIELD_MODES,
  containsSQLInjection,
  getSQLFieldMode,
};
