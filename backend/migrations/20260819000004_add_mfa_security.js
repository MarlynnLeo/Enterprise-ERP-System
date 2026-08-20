/**
 * MFA security primitives. Secrets are encrypted at rest; recovery codes and
 * login challenges are stored only as hashes. The migration also quarantines
 * the legacy plaintext users.two_factor_secret field.
 */

const { encryptSecret } = require('../src/utils/mfaCrypto');

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS user_mfa (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      secret_ciphertext TEXT NULL,
      pending_secret_ciphertext TEXT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_mfa_user (user_id),
      CONSTRAINT fk_user_mfa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      code_hash CHAR(64) NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_mfa_recovery_code (user_id, code_hash),
      INDEX idx_mfa_recovery_user (user_id, used_at),
      CONSTRAINT fk_mfa_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS mfa_login_challenges (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      challenge_hash CHAR(64) NOT NULL,
      user_id INT NOT NULL,
      purpose ENUM('login', 'enrollment') NOT NULL DEFAULT 'login',
      expires_at DATETIME NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 5,
      consumed_at DATETIME NULL,
      ip_address VARCHAR(45) NULL,
      user_agent VARCHAR(512) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_mfa_challenge_hash (challenge_hash),
      INDEX idx_mfa_challenge_user (user_id, expires_at),
      CONSTRAINT fk_mfa_challenge_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // Migrate legacy enabled secrets only when they are present. Production
  // requires MFA_ENCRYPTION_KEY, so a deployment cannot silently retain a
  // plaintext secret. Existing rows are disabled until copied successfully.
  const [legacyRows] = await knex.raw(
    `SELECT id, two_factor_enabled, two_factor_secret
       FROM users
      WHERE two_factor_secret IS NOT NULL AND two_factor_secret <> ''`
  );
  for (const row of legacyRows) {
    const encrypted = encryptSecret(String(row.two_factor_secret));
    await knex('user_mfa')
      .insert({
        user_id: row.id,
        secret_ciphertext: encrypted,
        enabled: Number(row.two_factor_enabled) === 1 ? 1 : 0,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict('user_id')
      .merge({
        secret_ciphertext: encrypted,
        enabled: Number(row.two_factor_enabled) === 1 ? 1 : 0,
        updated_at: knex.fn.now(),
      });
  }

  if (legacyRows.length) {
    await knex('users').whereIn('id', legacyRows.map((row) => row.id)).update({
      two_factor_secret: null,
      two_factor_enabled: 0,
      updated_at: knex.fn.now(),
    });
  }
};

exports.down = async function down() {
  throw new Error('MFA security migration is forward-only; refusing destructive rollback');
};
