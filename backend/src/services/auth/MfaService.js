'use strict';

const crypto = require('crypto');
const { TOTP, Secret } = require('otpauth');
const { pool } = require('../../config/db');
const { encryptSecret, decryptSecret } = require('../../utils/mfaCrypto');
const RefreshTokenService = require('./RefreshTokenService');
const { revokeUserSockets } = require('../../utils/sessionRevocation');

const CHALLENGE_TTL_SECONDS = 5 * 60;
const MAX_CHALLENGE_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

function hash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalizeRecoveryCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateRecoveryCode() {
  const raw = crypto.randomBytes(9).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 12);
  return raw.length === 12 ? `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}` : generateRecoveryCode();
}

function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  return Array.from({ length: count }, generateRecoveryCode);
}

function createTotp(secret, username) {
  return new TOTP({
    issuer: process.env.MFA_TOTP_ISSUER || 'KACON ERP',
    label: String(username || 'user'),
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
}

function validateTotpCounter(secret, username, token, timestamp = Date.now()) {
  const normalized = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const delta = createTotp(secret, username).validate({
    token: normalized,
    timestamp,
    window: 1,
  });
  if (delta === null) return null;
  return Math.floor(timestamp / 1000 / 30) + delta;
}

function requiredRoleCodes() {
  const configured = String(process.env.MFA_REQUIRED_ROLE_CODES || '').split(',').map((value) => value.trim()).filter(Boolean);
  return configured.length ? configured : ['admin', 'system_admin', 'finance_manager', 'hr_manager'];
}

class MfaService {
  static hashChallenge(challengeId) {
    return hash(challengeId);
  }

  static async getState(userId, connection = pool) {
    const [rows] = await connection.execute(
      `SELECT user_id, secret_ciphertext, pending_secret_ciphertext, enabled
              , last_totp_counter
         FROM user_mfa WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    return rows[0] || { user_id: userId, enabled: 0, secret_ciphertext: null, pending_secret_ciphertext: null };
  }

  static async isRequiredForUser(userId, connection = pool) {
    const codes = requiredRoleCodes();
    const placeholders = codes.map(() => '?').join(',');
    const [rows] = await connection.execute(
      `SELECT r.code, r.is_super_admin
         FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ? AND r.status = 1 AND (r.is_super_admin = 1 OR r.code IN (${placeholders}))
        LIMIT 1`,
      [userId, ...codes]
    );
    return rows.length > 0;
  }

  static async getLoginRequirement(userId, connection = pool) {
    const state = await this.getState(userId, connection);
    const required = process.env.NODE_ENV === 'production' && (await this.isRequiredForUser(userId, connection));
    return { enabled: Number(state.enabled) === 1 && Boolean(state.secret_ciphertext), required };
  }

  static async createChallenge({ userId, purpose = 'login', req, connection = pool }) {
    const challengeId = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);
    await connection.execute(
      `UPDATE mfa_login_challenges
          SET consumed_at = COALESCE(consumed_at, NOW())
        WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`,
      [userId, purpose]
    );
    await connection.execute(
      `INSERT INTO mfa_login_challenges
        (challenge_hash, user_id, purpose, expires_at, attempts, max_attempts, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, NOW())`,
      [hash(challengeId), userId, purpose, expiresAt, MAX_CHALLENGE_ATTEMPTS, String(req?.ip || '').slice(0, 45) || null, String(req?.get?.('User-Agent') || '').slice(0, 512) || null]
    );
    return { challengeId, expiresIn: CHALLENGE_TTL_SECONDS };
  }

  static async beginEnrollmentForChallenge(challengeId, username) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [challenges] = await connection.execute(
        `SELECT id, user_id, purpose, expires_at, attempts, max_attempts, consumed_at,
                expires_at <= NOW() AS expired,
                GREATEST(TIMESTAMPDIFF(SECOND, NOW(), expires_at), 0) AS ttl_seconds
           FROM mfa_login_challenges WHERE challenge_hash = ? LIMIT 1 FOR UPDATE`,
        [hash(challengeId)]
      );
      const challenge = challenges[0];
      if (!challenge || challenge.purpose !== 'enrollment' || challenge.consumed_at || Number(challenge.expired) === 1) {
        const error = new Error('MFA enrollment challenge is invalid or expired');
        error.code = 'MFA_CHALLENGE_INVALID';
        throw error;
      }
      const [userRows] = await connection.execute('SELECT username FROM users WHERE id = ? LIMIT 1', [challenge.user_id]);
      const challengeUsername = username || userRows[0]?.username || String(challenge.user_id);
      const [rows] = await connection.execute(
        'SELECT pending_secret_ciphertext FROM user_mfa WHERE user_id = ? LIMIT 1 FOR UPDATE',
        [challenge.user_id]
      );
      const pending = rows[0]?.pending_secret_ciphertext;
      let secret;
      if (pending) {
        secret = decryptSecret(pending);
      } else {
        secret = new Secret().base32;
        const encrypted = encryptSecret(secret);
        await connection.execute(
          `INSERT INTO user_mfa (user_id, pending_secret_ciphertext, enabled, created_at, updated_at)
           VALUES (?, ?, 0, NOW(), NOW())
           ON DUPLICATE KEY UPDATE pending_secret_ciphertext = VALUES(pending_secret_ciphertext), updated_at = NOW()`,
          [challenge.user_id, encrypted]
        );
      }
      await connection.commit();
      return {
        userId: challenge.user_id,
        secret,
        otpauthUri: createTotp(secret, challengeUsername).toString(),
        expiresIn: Math.max(1, Number(challenge.ttl_seconds || 0)),
      };
    } catch (error) {
      try { await connection.rollback(); } catch { /* preserve original */ }
      throw error;
    } finally {
      connection.release();
    }
  }

  static async setupForUser(userId, username) {
    const secret = new Secret().base32;
    await pool.execute(
      `INSERT INTO user_mfa (user_id, pending_secret_ciphertext, enabled, created_at, updated_at)
       VALUES (?, ?, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE pending_secret_ciphertext = VALUES(pending_secret_ciphertext), updated_at = NOW()`,
      [userId, encryptSecret(secret)]
    );
    return { secret, otpauthUri: createTotp(secret, username).toString() };
  }

  static async consumeInvalidAttempt(connection, challenge) {
    const attempts = Number(challenge.attempts || 0) + 1;
    await connection.execute(
      `UPDATE mfa_login_challenges
          SET attempts = ?, consumed_at = CASE WHEN ? >= max_attempts THEN NOW() ELSE consumed_at END
        WHERE id = ?`,
      [attempts, attempts, challenge.id]
    );
    const error = new Error(attempts >= Number(challenge.max_attempts || MAX_CHALLENGE_ATTEMPTS) ? 'MFA challenge locked' : 'Invalid MFA code');
    error.code = attempts >= Number(challenge.max_attempts || MAX_CHALLENGE_ATTEMPTS) ? 'MFA_CHALLENGE_LOCKED' : 'MFA_INVALID_CODE';
    return error;
  }

  static async verifyRecoveryCode(connection, userId, code) {
    const normalized = normalizeRecoveryCode(code);
    if (!normalized || normalized.length < 10) return false;
    const [rows] = await connection.execute(
      `SELECT id FROM mfa_recovery_codes
        WHERE user_id = ? AND code_hash = ? AND used_at IS NULL
        LIMIT 1 FOR UPDATE`,
      [userId, hash(normalized)]
    );
    if (!rows.length) return false;
    await connection.execute('UPDATE mfa_recovery_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [rows[0].id]);
    return true;
  }

  static async verifyAndConsumeTotp(connection, state, username, token, { pending = false } = {}) {
    const encryptedSecret = pending
      ? state?.pending_secret_ciphertext
      : state?.secret_ciphertext;
    if (!encryptedSecret) return null;

    const counter = validateTotpCounter(decryptSecret(encryptedSecret), username, token);
    if (counter === null) return null;

    if (!pending) {
      const previous = state?.last_totp_counter;
      if (previous !== null && previous !== undefined && counter <= Number(previous)) return null;
      const [result] = await connection.execute(
        `UPDATE user_mfa
            SET last_totp_counter = ?, updated_at = NOW()
          WHERE user_id = ?
            AND (last_totp_counter IS NULL OR last_totp_counter < ?)`,
        [counter, state.user_id, counter]
      );
      if (Number(result.affectedRows) !== 1) return null;
    }

    return counter;
  }

  static async replaceRecoveryCodes(connection, userId) {
    const codes = generateRecoveryCodes();
    await connection.execute('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
    for (const code of codes) {
      await connection.execute(
        'INSERT INTO mfa_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, NOW())',
        [userId, hash(normalizeRecoveryCode(code))]
      );
    }
    return codes;
  }

  static async verifyChallenge({ challengeId, token, recoveryCode }) {
    const connection = await pool.getConnection();
    let userId;
    let recoveryCodes = null;
    let enrolled = false;
    try {
      await connection.beginTransaction();
      const [challenges] = await connection.execute(
        `SELECT id, user_id, purpose, expires_at, attempts, max_attempts, consumed_at,
                expires_at <= NOW() AS expired
           FROM mfa_login_challenges WHERE challenge_hash = ? LIMIT 1 FOR UPDATE`,
        [hash(challengeId)]
      );
      const challenge = challenges[0];
      if (!challenge || challenge.consumed_at || Number(challenge.expired) === 1 || Number(challenge.attempts) >= Number(challenge.max_attempts)) {
        const error = new Error('MFA challenge is invalid or expired');
        error.code = 'MFA_CHALLENGE_INVALID';
        throw error;
      }
      userId = Number(challenge.user_id);
      const [users] = await connection.execute('SELECT id, username, status FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
      const user = users[0];
      if (!user || Number(user.status) !== 1) {
        const error = new Error('User is unavailable');
        error.code = 'ACCOUNT_DISABLED';
        throw error;
      }
      const [mfaRows] = await connection.execute('SELECT user_id, secret_ciphertext, pending_secret_ciphertext, enabled, last_totp_counter FROM user_mfa WHERE user_id = ? LIMIT 1 FOR UPDATE', [userId]);
      const state = mfaRows[0];
      let valid = false;
      let totpCounter = null;
      if (state) {
        totpCounter = await this.verifyAndConsumeTotp(
          connection,
          state,
          user.username,
          token,
          { pending: challenge.purpose === 'enrollment' }
        );
        valid = totpCounter !== null;
      }
      if (!valid && challenge.purpose === 'login' && recoveryCode) {
        valid = await this.verifyRecoveryCode(connection, userId, recoveryCode);
      }
      if (!valid) {
        const invalidError = await this.consumeInvalidAttempt(connection, challenge);
        await connection.commit();
        throw invalidError;
      }

      if (challenge.purpose === 'enrollment') {
        if (!state?.pending_secret_ciphertext) {
          const error = new Error('MFA enrollment has not been initialized');
          error.code = 'MFA_ENROLLMENT_NOT_READY';
          throw error;
        }
        await connection.execute(
          `UPDATE user_mfa SET secret_ciphertext = pending_secret_ciphertext,
             pending_secret_ciphertext = NULL, enabled = 1,
             last_totp_counter = ?, updated_at = NOW() WHERE user_id = ?`,
          [totpCounter, userId]
        );
        recoveryCodes = await this.replaceRecoveryCodes(connection, userId);
        enrolled = true;
      }
      await connection.execute('UPDATE mfa_login_challenges SET consumed_at = NOW() WHERE id = ?', [challenge.id]);
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch { /* preserve original */ }
      throw error;
    } finally {
      connection.release();
    }
    if (enrolled) await this.revokeSessions(userId);
    return { userId, recoveryCodes };
  }

  static async confirmForUser(userId, username, token) {
    const connection = await pool.getConnection();
    let recoveryCodes;
    try {
      await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT user_id, pending_secret_ciphertext, last_totp_counter FROM user_mfa WHERE user_id = ? LIMIT 1 FOR UPDATE', [userId]);
      const state = rows[0];
      const counter = await this.verifyAndConsumeTotp(connection, state, username, token, { pending: true });
      if (counter === null) {
        const error = new Error('Invalid MFA code');
        error.code = 'MFA_INVALID_CODE';
        throw error;
      }
      await connection.execute('UPDATE user_mfa SET secret_ciphertext = pending_secret_ciphertext, pending_secret_ciphertext = NULL, enabled = 1, last_totp_counter = ?, updated_at = NOW() WHERE user_id = ?', [counter, userId]);
      recoveryCodes = await this.replaceRecoveryCodes(connection, userId);
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch { /* preserve original */ }
      throw error;
    } finally {
      connection.release();
    }
    await this.revokeSessions(userId);
    return recoveryCodes;
  }

  static async verifyUserFactor(userId, username, token, recoveryCode, connection) {
    const state = await this.getState(userId, connection);
    if (!Number(state.enabled) || !state.secret_ciphertext) return false;
    if (token && (await this.verifyAndConsumeTotp(connection, state, username, token)) !== null) return true;
    return recoveryCode ? this.verifyRecoveryCode(connection, userId, recoveryCode) : false;
  }

  static async disableForUser(userId, username, token, recoveryCode) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      if (process.env.NODE_ENV === 'production' && (await this.isRequiredForUser(userId, connection))) {
        const error = new Error('MFA is required for this account role');
        error.code = 'MFA_REQUIRED_FOR_ROLE';
        throw error;
      }
      if (!(await this.verifyUserFactor(userId, username, token, recoveryCode, connection))) {
        const error = new Error('MFA verification required');
        error.code = 'MFA_INVALID_CODE';
        throw error;
      }
      await connection.execute('UPDATE user_mfa SET enabled = 0, secret_ciphertext = NULL, pending_secret_ciphertext = NULL, updated_at = NOW() WHERE user_id = ?', [userId]);
      await connection.execute('DELETE FROM mfa_recovery_codes WHERE user_id = ?', [userId]);
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch { /* preserve original */ }
      throw error;
    } finally {
      connection.release();
    }
    await this.revokeSessions(userId);
  }

  static async regenerateRecoveryCodes(userId, username, token, recoveryCode) {
    const connection = await pool.getConnection();
    let codes;
    try {
      await connection.beginTransaction();
      if (!(await this.verifyUserFactor(userId, username, token, recoveryCode, connection))) {
        const error = new Error('MFA verification required');
        error.code = 'MFA_INVALID_CODE';
        throw error;
      }
      codes = await this.replaceRecoveryCodes(connection, userId);
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch { /* preserve original */ }
      throw error;
    } finally {
      connection.release();
    }
    return codes;
  }

  static async revokeSessions(userId) {
    const { pool: dbPool } = require('../../config/db');
    await dbPool.execute('UPDATE users SET token_version = COALESCE(token_version, 0) + 1, updated_at = NOW() WHERE id = ?', [userId]);
    await RefreshTokenService.revokeUserTokens(userId);
    revokeUserSockets(userId, 'mfa_changed');
  }
}

module.exports = MfaService;
module.exports._test = {
  createTotp,
  validateTotpCounter,
  normalizeRecoveryCode,
  generateRecoveryCodes,
  requiredRoleCodes,
  CHALLENGE_TTL_SECONDS,
  MAX_CHALLENGE_ATTEMPTS,
};
