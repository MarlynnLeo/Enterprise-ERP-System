/**
 * Align live sys_failed_jobs table with the DLQ service contract.
 * Earlier environments could keep an older lightweight schema because
 * the original create migration used CREATE TABLE IF NOT EXISTS.
 */

async function hasColumn(knex, columnName) {
  const [rows] = await knex.raw(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sys_failed_jobs'
        AND COLUMN_NAME = ?
    `,
    [columnName]
  );
  return rows.length > 0;
}

async function hasIndex(knex, indexName) {
  const [rows] = await knex.raw(
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sys_failed_jobs'
        AND INDEX_NAME = ?
    `,
    [indexName]
  );
  return rows.length > 0;
}

exports.up = async function(knex) {
  const [tables] = await knex.raw("SHOW TABLES LIKE 'sys_failed_jobs'");
  if (tables.length === 0) {
    return;
  }

  const hasRetryCount = await hasColumn(knex, 'retry_count');
  const hasAttempts = await hasColumn(knex, 'attempts');
  const hasNextRetryAt = await hasColumn(knex, 'next_retry_at');
  const hasLockedAt = await hasColumn(knex, 'locked_at');
  const hasResolvedAt = await hasColumn(knex, 'resolved_at');

  if (!hasAttempts) {
    await knex.raw(
      'ALTER TABLE sys_failed_jobs ADD COLUMN attempts INT NOT NULL DEFAULT 0 AFTER status'
    );
  }

  if (hasRetryCount) {
    await knex.raw(
      'UPDATE sys_failed_jobs SET attempts = COALESCE(retry_count, 0) WHERE attempts = 0'
    );
  }

  if (!hasNextRetryAt) {
    await knex.raw(
      'ALTER TABLE sys_failed_jobs ADD COLUMN next_retry_at DATETIME NULL AFTER attempts'
    );
  }

  if (!hasLockedAt) {
    await knex.raw(
      'ALTER TABLE sys_failed_jobs ADD COLUMN locked_at DATETIME NULL AFTER next_retry_at'
    );
  }

  if (!hasResolvedAt) {
    await knex.raw(
      'ALTER TABLE sys_failed_jobs ADD COLUMN resolved_at DATETIME NULL AFTER locked_at'
    );
  }

  await knex.raw(`
    ALTER TABLE sys_failed_jobs
    MODIFY COLUMN task_name VARCHAR(191) NOT NULL,
    MODIFY COLUMN payload JSON NULL,
    MODIFY COLUMN error_message TEXT NULL,
    MODIFY COLUMN error_stack MEDIUMTEXT NULL,
    MODIFY COLUMN status ENUM('pending','retrying','resolved','ignored') NOT NULL DEFAULT 'pending',
    MODIFY COLUMN attempts INT NOT NULL DEFAULT 0,
    MODIFY COLUMN next_retry_at DATETIME NULL,
    MODIFY COLUMN locked_at DATETIME NULL,
    MODIFY COLUMN resolved_at DATETIME NULL
  `);

  await knex.raw(
    "UPDATE sys_failed_jobs SET resolved_at = COALESCE(resolved_at, updated_at) WHERE status = 'resolved' AND resolved_at IS NULL"
  );

  if (hasRetryCount) {
    await knex.raw('ALTER TABLE sys_failed_jobs DROP COLUMN retry_count');
  }

  if (!(await hasIndex(knex, 'idx_failed_jobs_status_created'))) {
    await knex.raw(
      'ALTER TABLE sys_failed_jobs ADD INDEX idx_failed_jobs_status_created (status, created_at)'
    );
  }

  if (!(await hasIndex(knex, 'idx_failed_jobs_task_name'))) {
    await knex.raw(
      'ALTER TABLE sys_failed_jobs ADD INDEX idx_failed_jobs_task_name (task_name)'
    );
  }

  if (!(await hasIndex(knex, 'idx_failed_jobs_next_retry'))) {
    await knex.raw(
      'ALTER TABLE sys_failed_jobs ADD INDEX idx_failed_jobs_next_retry (next_retry_at)'
    );
  }
};

exports.down = async function(knex) {
  const [tables] = await knex.raw("SHOW TABLES LIKE 'sys_failed_jobs'");
  if (tables.length === 0) {
    return;
  }

  if (await hasColumn(knex, 'attempts')) {
    if (!(await hasColumn(knex, 'retry_count'))) {
      await knex.raw(
        'ALTER TABLE sys_failed_jobs ADD COLUMN retry_count INT NOT NULL DEFAULT 0 AFTER status'
      );
    }
    await knex.raw('UPDATE sys_failed_jobs SET retry_count = COALESCE(attempts, 0)');
  }

  await knex.raw(`
    ALTER TABLE sys_failed_jobs
    MODIFY COLUMN status ENUM('pending','resolved') DEFAULT 'pending'
  `);

  if (await hasColumn(knex, 'resolved_at')) {
    await knex.raw('ALTER TABLE sys_failed_jobs DROP COLUMN resolved_at');
  }

  if (await hasColumn(knex, 'locked_at')) {
    await knex.raw('ALTER TABLE sys_failed_jobs DROP COLUMN locked_at');
  }

  if (await hasColumn(knex, 'next_retry_at')) {
    await knex.raw('ALTER TABLE sys_failed_jobs DROP COLUMN next_retry_at');
  }

  if (await hasColumn(knex, 'attempts')) {
    await knex.raw('ALTER TABLE sys_failed_jobs DROP COLUMN attempts');
  }
};
