/* global afterEach, describe, expect, test */

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
};

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('MFA secret encryption', () => {
  afterEach(() => {
    restore('NODE_ENV', ORIGINAL_ENV.NODE_ENV);
    restore('MFA_ENCRYPTION_KEY', ORIGINAL_ENV.MFA_ENCRYPTION_KEY);
    restore('JWT_SECRET', ORIGINAL_ENV.JWT_SECRET);
  });

  test('encrypts with authenticated encryption and detects tampering', () => {
    process.env.MFA_ENCRYPTION_KEY = '11'.repeat(32);
    const { encryptSecret, decryptSecret } = require('../../src/utils/mfaCrypto');

    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP');
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted)).toBe('JBSWY3DPEHPK3PXP');

    const parts = encrypted.split('.');
    parts[3] = `${parts[3][0] === 'A' ? 'B' : 'A'}${parts[3].slice(1)}`;
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  test('uses a deterministic non-production derivation across module reloads', () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-root-secret-for-mfa-derivation';

    let cryptoModule = require('../../src/utils/mfaCrypto');
    const encrypted = cryptoModule.encryptSecret('PERSISTED-TEST-SECRET');
    delete require.cache[require.resolve('../../src/utils/mfaCrypto')];
    cryptoModule = require('../../src/utils/mfaCrypto');

    expect(cryptoModule.decryptSecret(encrypted)).toBe('PERSISTED-TEST-SECRET');
  });

  test('fails closed without a dedicated production key', () => {
    delete process.env.MFA_ENCRYPTION_KEY;
    process.env.NODE_ENV = 'production';
    const { getMfaEncryptionKey } = require('../../src/utils/mfaCrypto');
    expect(() => getMfaEncryptionKey()).toThrow(/MFA_ENCRYPTION_KEY/);
  });
});
