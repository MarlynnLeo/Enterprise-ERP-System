/* global describe, expect, test */

const PasswordSecurity = require('../../src/utils/passwordSecurity');

describe('PasswordSecurity policy (unrestricted)', () => {
  test.each([
    [null, '密码格式无效'],
    [{ value: 'not-a-string' }, '密码格式无效'],
    ['', '密码不能为空'],
    ['   ', '密码不能为空'],
  ])('rejects invalid/empty password input %#', (password, expectedError) => {
    const result = PasswordSecurity.validatePasswordStrength(password);

    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain(expectedError);
  });

  test.each([
    '123456',
    'a',
    '1',
    'admin',
    '123456789012',
    'aaaaaaaaaaaa',
    'correct horse battery staple',
  ])('accepts any non-empty password: %s', (password) => {
    expect(
      PasswordSecurity.validatePasswordStrength(password)
    ).toEqual(expect.objectContaining({ isValid: true, errors: [] }));
  });

  test('allows hashing and verifying any valid password', async () => {
    const passwords = ['123456', 'a', 'short', 'correct horse battery staple'];
    for (const password of passwords) {
      const hash = await PasswordSecurity.hashPassword(password);
      await expect(PasswordSecurity.verifyPassword(password, hash)).resolves.toBe(true);
    }
  });

  test('never requires password change or flags as expired', () => {
    expect(PasswordSecurity.isPasswordExpired(new Date('2020-01-01'))).toBe(false);
    expect(PasswordSecurity.isPasswordChangeRequired({ force_password_change: 1 })).toBe(false);
  });
});
