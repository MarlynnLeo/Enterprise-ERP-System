const { pool } = require('../../config/db');
const { NOTIFICATION_SETTING_KEYS } = require('../../constants/notification');

const DEFAULTS = Object.freeze({
  broadcastBlockRatio: 0.8,
  broadcastWarningRatio: 0.5,
  minimumPopulation: 5,
  maxTargetsPerRule: 100,
  optionLimit: 1000,
  realtimeWindowMinutes: 5,
  adminRatioWarning: 0.2,
});

const CACHE_TTL_MS = 60 * 1000;

function parseConfig(raw) {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeConfig(input) {
  const config = { ...DEFAULTS, ...parseConfig(input) };
  const ratios = ['broadcastBlockRatio', 'broadcastWarningRatio', 'adminRatioWarning'];
  for (const key of ratios) {
    const value = Number(config[key]);
    config[key] = Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : DEFAULTS[key];
  }
  for (const key of ['minimumPopulation', 'maxTargetsPerRule', 'optionLimit', 'realtimeWindowMinutes']) {
    const value = Number(config[key]);
    config[key] = Number.isInteger(value) && value > 0 ? value : DEFAULTS[key];
  }
  if (config.broadcastWarningRatio > config.broadcastBlockRatio) {
    config.broadcastWarningRatio = config.broadcastBlockRatio;
  }
  return config;
}

class NotificationGovernanceConfig {
  async get() {
    if (this.cache && this.expiresAt > Date.now()) return this.cache;
    const [rows] = await pool.query(
      'SELECT value FROM system_settings WHERE `key` = ? LIMIT 1',
      [NOTIFICATION_SETTING_KEYS.GOVERNANCE]
    );
    this.cache = normalizeConfig(rows[0]?.value);
    this.expiresAt = Date.now() + CACHE_TTL_MS;
    return this.cache;
  }

  async save(value) {
    const normalized = normalizeConfig(value);
    await pool.query(
      `INSERT INTO system_settings (\`key\`, value, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), description = VALUES(description)`,
      [NOTIFICATION_SETTING_KEYS.GOVERNANCE, JSON.stringify(normalized), '通知治理阈值与容量配置']
    );
    this.cache = normalized;
    this.expiresAt = Date.now() + CACHE_TTL_MS;
    return normalized;
  }
}

module.exports = new NotificationGovernanceConfig();
module.exports.DEFAULTS = DEFAULTS;
