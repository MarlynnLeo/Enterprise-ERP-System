/* global describe, expect, test */

const { normalizeUsername } = require('../../src/utils/usernameSecurity');

describe('username canonicalization', () => {
  test('normalizes case, Unicode form, and surrounding whitespace', () => {
    expect(normalizeUsername('  ADMIN  ')).toBe('admin');
  });

  test.each([null, 123, '', 'a', 'bad username', 'bad/username'])('rejects invalid username %#', (value) => {
    expect(normalizeUsername(value)).toBeNull();
  });
});
