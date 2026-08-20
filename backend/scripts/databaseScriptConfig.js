'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

function requireEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for database diagnostic scripts`);
  }
  return value;
}

function readPort(name, defaultValue) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return defaultValue;

  const port = Number(rawValue);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

function readBoolean(name, defaultValue) {
  const rawValue = process.env[name]?.trim().toLowerCase();
  if (!rawValue) return defaultValue;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function getMysqlConnectionOptions(overrides = {}) {
  return {
    host: requireEnvironmentValue('DB_HOST'),
    port: readPort('DB_PORT', 3306),
    user: requireEnvironmentValue('DB_USER'),
    password: requireEnvironmentValue('DB_PASSWORD'),
    database: requireEnvironmentValue('DB_NAME'),
    ...overrides,
  };
}

function getLegacySqlServerConfig(overrides = {}) {
  const { options: optionOverrides = {}, ...connectionOverrides } = overrides;

  return {
    server: requireEnvironmentValue('LEGACY_DB_HOST'),
    port: readPort('LEGACY_DB_PORT', 1433),
    database: requireEnvironmentValue('LEGACY_DB_NAME'),
    user: requireEnvironmentValue('LEGACY_DB_USER'),
    password: requireEnvironmentValue('LEGACY_DB_PASSWORD'),
    options: {
      encrypt: readBoolean('LEGACY_DB_ENCRYPT', true),
      trustServerCertificate: readBoolean('LEGACY_DB_TRUST_SERVER_CERTIFICATE', false),
      ...optionOverrides,
    },
    ...connectionOverrides,
  };
}

module.exports = {
  getLegacySqlServerConfig,
  getMysqlConnectionOptions,
};
