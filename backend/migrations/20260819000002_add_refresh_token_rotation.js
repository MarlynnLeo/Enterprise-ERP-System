/**
 * Persist only hashes of refresh tokens and enforce one-time rotation.
 *
 * Earlier installations created a legacy refresh_tokens table containing a
 * plaintext `token` column.  This migration upgrades that shape in place so
 * the service never silently runs against an incompatible schema.
 */

async function columns(knex) {
  const [rows] = await knex.raw(
    `SELECT COLUMN_NAME AS name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens'`
  );
  return new Set(rows.map((row) => row.name));
}

async function addColumn(knex, existing, name, definition) {
  if (!existing.has(name)) {
    await knex.raw(`ALTER TABLE refresh_tokens ADD COLUMN ${name} ${definition}`);
    existing.add(name);
  }
}

exports.up = async function up(knex) {
  const [tables] = await knex.raw(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens'`
  );

  if (!tables.length) {
    await knex.raw(`
      CREATE TABLE refresh_tokens (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        jti CHAR(36) NOT NULL,
        family_id CHAR(36) NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        revoked_at DATETIME NULL,
        revoked_reason VARCHAR(255) NULL,
        replaced_by_jti CHAR(36) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_refresh_tokens_jti (jti),
        INDEX idx_refresh_tokens_user (user_id),
        INDEX idx_refresh_tokens_family (family_id),
        INDEX idx_refresh_tokens_expiry (expires_at),
        CONSTRAINT fk_refresh_tokens_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    return;
  }

  const existing = await columns(knex);
  await addColumn(knex, existing, 'jti', 'CHAR(36) NULL');
  await addColumn(knex, existing, 'family_id', 'CHAR(36) NULL');
  await addColumn(knex, existing, 'token_hash', 'CHAR(64) NULL');
  await addColumn(knex, existing, 'used_at', 'DATETIME NULL');
  await addColumn(knex, existing, 'replaced_by_jti', 'CHAR(36) NULL');
  await addColumn(knex, existing, 'revoked_at', 'DATETIME NULL');
  await addColumn(knex, existing, 'revoked_reason', 'VARCHAR(255) NULL');
  await addColumn(knex, existing, 'created_at', 'DATETIME NULL');

  if (existing.has('token')) {
    await knex.raw(
      `UPDATE refresh_tokens
          SET token_hash = SHA2(token, 256)
        WHERE token_hash IS NULL AND token IS NOT NULL`
    );
    // A plaintext refresh token is never needed after migration.  Mark rows
    // that cannot be safely upgraded as revoked before removing the column.
    await knex.raw(
      `UPDATE refresh_tokens
          SET revoked_at = COALESCE(revoked_at, NOW()),
              revoked_reason = COALESCE(revoked_reason, 'legacy_token_migration')
        WHERE token_hash IS NULL OR token_hash = ''`
    );

    const [tokenIndexes] = await knex.raw('SHOW INDEX FROM refresh_tokens');
    for (const index of new Set(
      tokenIndexes
        .filter((row) => String(row.Column_name).toLowerCase() === 'token')
        .map((row) => row.Key_name)
        .filter((name) => name && name !== 'PRIMARY')
    )) {
      await knex.raw(`ALTER TABLE refresh_tokens DROP INDEX \`${String(index).replace(/`/g, '``')}\``);
    }
    await knex.raw('ALTER TABLE refresh_tokens DROP COLUMN token');
    existing.delete('token');
  }
  if (existing.has('token_family')) {
    await knex.raw(
      `UPDATE refresh_tokens
          SET family_id = token_family
        WHERE family_id IS NULL AND token_family IS NOT NULL`
    );
  }
  if (existing.has('last_used_at')) {
    await knex.raw(
      `UPDATE refresh_tokens
          SET used_at = last_used_at
        WHERE used_at IS NULL AND last_used_at IS NOT NULL`
    );
  }
  if (existing.has('is_revoked') && existing.has('revoked_at')) {
    await knex.raw(
      `UPDATE refresh_tokens
          SET revoked_at = COALESCE(revoked_at, NOW())
        WHERE is_revoked = 1 AND revoked_at IS NULL`
    );
  }

  // Legacy rows have no trustworthy JTI/family. Generate non-secret random
  // identifiers so they cannot be rotated accidentally; clients must log in.
  await knex.raw(
    `UPDATE refresh_tokens
        SET jti = UUID()
      WHERE jti IS NULL`
  );
  await knex.raw(
    `UPDATE refresh_tokens
        SET family_id = UUID()
      WHERE family_id IS NULL`
  );
  await knex.raw(
    `UPDATE refresh_tokens
        SET created_at = COALESCE(created_at, NOW())
      WHERE created_at IS NULL`
  );

  // Rows from the legacy table may not have had a token to hash.  They remain
  // revoked, but receive a non-secret placeholder so the new schema can use a
  // strict NOT NULL invariant.
  await knex.raw(
    `UPDATE refresh_tokens
        SET token_hash = SHA2(CONCAT('revoked:', id, ':', UUID()), 256)
      WHERE token_hash IS NULL OR token_hash = ''`
  );

  // Repair duplicate legacy JTIs before installing the uniqueness invariant.
  // The loop is bounded and fails closed if a pathological table cannot be
  // normalized rather than silently skipping the unique index.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [duplicates] = await knex.raw(
      `SELECT jti, COUNT(*) AS duplicate_count
         FROM refresh_tokens
        GROUP BY jti
       HAVING COUNT(*) > 1`
    );
    if (!duplicates.length) break;
    await knex.raw(
      `UPDATE refresh_tokens a
         JOIN refresh_tokens b ON a.jti = b.jti AND a.id > b.id
          SET a.jti = UUID()`
    );
    if (attempt === 4) throw new Error('Unable to normalize duplicate refresh token JTIs');
  }

  const [indexes] = await knex.raw('SHOW INDEX FROM refresh_tokens');
  const indexNames = new Set(indexes.map((row) => row.Key_name));
  if (!indexNames.has('uq_refresh_tokens_jti')) {
    await knex.raw(
      'ALTER TABLE refresh_tokens ADD UNIQUE KEY uq_refresh_tokens_jti (jti)'
    );
  }
  if (!indexNames.has('idx_refresh_tokens_family')) {
    await knex.raw(
      'ALTER TABLE refresh_tokens ADD INDEX idx_refresh_tokens_family (family_id)'
    );
  }
  if (!indexNames.has('idx_refresh_tokens_user')) {
    await knex.raw(
      'ALTER TABLE refresh_tokens ADD INDEX idx_refresh_tokens_user (user_id)'
    );
  }
  if (!indexNames.has('idx_refresh_tokens_expiry')) {
    await knex.raw(
      'ALTER TABLE refresh_tokens ADD INDEX idx_refresh_tokens_expiry (expires_at)'
    );
  }

  await knex.raw('ALTER TABLE refresh_tokens MODIFY COLUMN jti CHAR(36) NOT NULL');
  await knex.raw('ALTER TABLE refresh_tokens MODIFY COLUMN family_id CHAR(36) NOT NULL');
  await knex.raw('ALTER TABLE refresh_tokens MODIFY COLUMN token_hash CHAR(64) NOT NULL');
};

exports.down = async function down(knex) {
  // Refresh-token history is security evidence and may be needed to detect
  // replay.  A rollback must never delete it.  This migration is intentionally
  // forward-only; restore a database snapshot or write an explicit, reviewed
  // compatibility migration if a downgrade is ever required.
  throw new Error('Refresh-token rotation migration is forward-only; refusing destructive rollback');
};
