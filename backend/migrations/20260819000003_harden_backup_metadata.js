'use strict';

async function columnExists(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return Number(rows[0]?.count || 0) > 0;
}

exports.up = async function up(knex) {
  const [tables] = await knex.raw(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_backups'`
  );
  if (!tables.length) return;

  if (!(await columnExists(knex, 'system_backups', 'encrypted'))) {
    await knex.raw(
      'ALTER TABLE system_backups ADD COLUMN encrypted TINYINT(1) NOT NULL DEFAULT 0 AFTER status'
    );
  }
  if (!(await columnExists(knex, 'system_backups', 'encryption_algorithm'))) {
    await knex.raw(
      'ALTER TABLE system_backups ADD COLUMN encryption_algorithm VARCHAR(32) NULL AFTER encrypted'
    );
  }
}

exports.down = async function down() {
  // Backup metadata is intentionally retained.  Removing the encryption flag
  // could make operators mistake ciphertext for plaintext during recovery.
  throw new Error('Backup hardening migration is forward-only');
};
