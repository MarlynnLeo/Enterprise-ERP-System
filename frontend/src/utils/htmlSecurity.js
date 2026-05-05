import DOMPurify from 'dompurify';

const ENTITY_MAP = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const PRINT_SANITIZE_OPTIONS = {
  WHOLE_DOCUMENT: true,
  ADD_TAGS: ['html', 'head', 'body', 'meta', 'title', 'style'],
  ADD_ATTR: [
    'style',
    'class',
    'id',
    'colspan',
    'rowspan',
    'align',
    'valign',
    'width',
    'height',
    'border',
    'cellpadding',
    'cellspacing',
  ],
};

export function decodeHtmlEntities(value) {
  if (value === null || value === undefined) return value;

  return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity[0] === '#') {
      const isHex = entity[1]?.toLowerCase() === 'x';
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return Object.prototype.hasOwnProperty.call(ENTITY_MAP, entity) ? ENTITY_MAP[entity] : match;
  });
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeHtml(html, options = {}) {
  return DOMPurify.sanitize(String(html ?? ''), options);
}

export function sanitizePrintHtml(html) {
  return sanitizeHtml(html, PRINT_SANITIZE_OPTIONS);
}

export function writeSafeHtmlDocument(targetWindow, html) {
  if (!targetWindow?.document) {
    throw new Error('打印窗口不可用');
  }

  const safeHtml = sanitizePrintHtml(html);
  targetWindow.document.open();
  targetWindow.document.write(safeHtml);
  targetWindow.document.close();
  return targetWindow;
}
