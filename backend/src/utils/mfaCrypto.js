'use strict';

const crypto = require('crypto');

const VERSION = 'v1';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function decodeKey(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;
  if (/^[a-f0-9]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

function getMfaEncryptionKey() {
  const configured = decodeKey(process.env.MFA_ENCRYPTION_KEY);
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MFA_ENCRYPTION_KEY must encode exactly 32 bytes in production');
  }
  // Keep development/test secrets decryptable after a process restart without
  // reusing the JWT key directly. Production must always provide a dedicated
  // MFA_ENCRYPTION_KEY.
  const developmentRoot = String(process.env.JWT_SECRET || 'erp-test-only-mfa-root');
  return crypto
    .createHash('sha256')
    .update('KACON-ERP\0MFA\0', 'utf8')
    .update(developmentRoot, 'utf8')
    .digest();
}

function encryptSecret(value) {
  if (typeof value !== 'string' || !value) throw new Error('MFA secret must be a non-empty string');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptSecret(serialized) {
  const parts = String(serialized || '').split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Invalid MFA secret ciphertext');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const ciphertext = Buffer.from(parts[3], 'base64url');
  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH || ciphertext.length === 0) {
    throw new Error('Invalid MFA secret ciphertext');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMfaEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { getMfaEncryptionKey, encryptSecret, decryptSecret };
