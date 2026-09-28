'use strict';

function normalizeSignatureCode(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value !== 'string' || !/^[a-z]$/i.test(value.trim())) {
    throw Object.assign(new Error('电子签名代号必须是单个英文字母'), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  return value.trim().toUpperCase();
}

module.exports = { normalizeSignatureCode };
