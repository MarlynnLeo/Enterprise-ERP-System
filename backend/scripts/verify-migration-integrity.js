'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const migrationsDir = path.resolve(__dirname, '..', 'migrations');
const manifestPath = path.join(migrationsDir, 'checksums.json');
const writeMode = process.argv.includes('--write');

function checksum(filePath) {
  const normalized = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function readCurrentMigrations() {
  return Object.fromEntries(
    fs
      .readdirSync(migrationsDir)
      .filter((name) => /^\d{14}_.+\.js$/.test(name))
      .sort()
      .map((name) => [name, checksum(path.join(migrationsDir, name))])
  );
}

const current = readCurrentMigrations();

if (writeMode) {
  fs.writeFileSync(manifestPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
  console.log(`Wrote checksums for ${Object.keys(current).length} migrations.`);
  process.exit(0);
}

if (!fs.existsSync(manifestPath)) {
  throw new Error('Migration checksum manifest is missing. Run npm run migrations:manifest.');
}

const expected = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const missing = Object.keys(expected).filter((name) => !current[name]);
const unregistered = Object.keys(current).filter((name) => !expected[name]);
const changed = Object.keys(expected).filter(
  (name) => current[name] && current[name] !== expected[name]
);

if (missing.length || unregistered.length || changed.length) {
  const details = [
    missing.length ? `Missing migration files: ${missing.join(', ')}` : '',
    unregistered.length
      ? `Unregistered migration files: ${unregistered.join(', ')} (regenerate the manifest intentionally)`
      : '',
    changed.length
      ? `Modified immutable migrations: ${changed.join(', ')} (create a forward migration instead)`
      : '',
  ].filter(Boolean);
  throw new Error(`Migration integrity check failed:\n- ${details.join('\n- ')}`);
}

console.log(`Migration integrity verified: ${Object.keys(current).length} files.`);
