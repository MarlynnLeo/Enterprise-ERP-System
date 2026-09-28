const { normalizeSignatureCode } = require('../../src/utils/signatureCode');

test.each([undefined, null, '', '  '])('clears an empty signature binding %p', (value) => {
  expect(normalizeSignatureCode(value)).toBeNull();
});

test('normalizes an explicitly supplied font code', () => {
  expect(normalizeSignatureCode(' c ')).toBe('C');
});

test.each(['陈贤萍', 'AB', {}, ['C'], 1, true])(
  'rejects a name or malformed font code %p',
  (value) => {
    expect(() => normalizeSignatureCode(value)).toThrow('单个英文字母');
  }
);
