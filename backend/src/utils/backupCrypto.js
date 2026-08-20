'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { once } = require('events');

const MAGIC = Buffer.from('ERP-BACKUP-ENC-1\n', 'ascii');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + IV_LENGTH;

function getEncryptionMode() {
  const configured = String(process.env.BACKUP_ENCRYPTION_MODE || '').trim().toLowerCase();
  if (configured === 'required' || configured === 'optional' || configured === 'disabled') {
    return configured;
  }
  return process.env.NODE_ENV === 'production' ? 'required' : 'disabled';
}

function getEncryptionKey() {
  const raw = String(process.env.BACKUP_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error('BACKUP_ENCRYPTION_KEY is required for encrypted backups');
  }

  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try {
      key = Buffer.from(raw, 'base64');
    } catch {
      key = null;
    }
  }
  if (!key || key.length !== 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must encode exactly 32 bytes');
  }
  return key;
}

async function writeChunk(stream, chunk) {
  if (!chunk || chunk.length === 0) return;
  if (!stream.write(chunk)) await once(stream, 'drain');
}

async function finishWrite(stream) {
  await new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end((error) => (error ? reject(error) : resolve()));
  });
}

async function readExactly(filePath, length) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return bytesRead === length ? buffer : null;
  } finally {
    await handle.close();
  }
}

async function isEncryptedBackup(filePath) {
  const prefix = await readExactly(filePath, MAGIC.length);
  return Boolean(prefix && prefix.equals(MAGIC));
}

async function encryptFile(inputPath, outputPath) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath, { mode: 0o600 });
  try {
    await writeChunk(output, MAGIC);
    await writeChunk(output, iv);
    for await (const chunk of input) await writeChunk(output, cipher.update(chunk));
    await writeChunk(output, cipher.final());
    await writeChunk(output, cipher.getAuthTag());
    await finishWrite(output);
  } catch (error) {
    input.destroy();
    output.destroy();
    throw error;
  }
}

async function decryptFile(inputPath, outputPath) {
  const stat = await fs.promises.stat(inputPath);
  if (stat.size < HEADER_LENGTH + TAG_LENGTH) throw new Error('Encrypted backup is truncated');
  const header = await readExactly(inputPath, HEADER_LENGTH);
  if (!header || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Unsupported backup encryption format');
  }
  const key = getEncryptionKey();
  const iv = header.subarray(MAGIC.length);
  const tagHandle = await fs.promises.open(inputPath, 'r');
  let tag;
  try {
    tag = Buffer.alloc(TAG_LENGTH);
    await tagHandle.read(tag, 0, TAG_LENGTH, stat.size - TAG_LENGTH);
  } finally {
    await tagHandle.close();
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const input = fs.createReadStream(inputPath, {
    start: HEADER_LENGTH,
    end: stat.size - TAG_LENGTH - 1,
  });
  const output = fs.createWriteStream(outputPath, { mode: 0o600 });
  try {
    for await (const chunk of input) await writeChunk(output, decipher.update(chunk));
    await writeChunk(output, decipher.final());
    await finishWrite(output);
  } catch (error) {
    input.destroy();
    output.destroy();
    throw new Error(`Encrypted backup authentication failed: ${error.message}`, { cause: error });
  }
}

module.exports = {
  MAGIC,
  getEncryptionMode,
  getEncryptionKey,
  isEncryptedBackup,
  encryptFile,
  decryptFile,
};
