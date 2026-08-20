/* global describe, expect, test */

const PasswordSecurity = require('../../src/utils/passwordSecurity');

describe('PasswordSecurity policy', () => {
  test.each([
    [null, '密码格式无效'],
    [{ value: 'not-a-string' }, '密码格式无效'],
    ['a', '密码长度不能少于12个字符'],
    ['123456789012', '密码过于常见'],
    ['aaaaaaaaaaaa', '密码至少需要4个不同字符'],
    ['安全密码安全密码安全密码安全密码安全密码安全密码安全密码', '密码 UTF-8 长度不能超过72字节'],
  ])('rejects unsafe password input %#', (password, expectedError) => {
    const result = PasswordSecurity.validatePasswordStrength(password);

    expect(result.isValid).toBe(false);
    expect(result.errors.join(' ')).toContain(expectedError);
  });

  test('accepts a long password phrase without requiring artificial character classes', () => {
    expect(
      PasswordSecurity.validatePasswordStrength('correct horse battery staple')
    ).toEqual(expect.objectContaining({ isValid: true, errors: [] }));
  });

  test('hashing is also protected by the central policy', async () => {
    await expect(PasswordSecurity.hashPassword('short')).rejects.toMatchObject({
      code: 'WEAK_PASSWORD',
    });

    const password = 'correct horse battery staple';
    const hash = await PasswordSecurity.hashPassword(password);
    await expect(PasswordSecurity.verifyPassword(password, hash)).resolves.toBe(true);
  });
});
