/**
 * Create a durable failed-job table for asynchronous side effects.
 * This table is the operational inbox for finance, traceability, and event-bus
 * failures that cannot be rolled back with the already-committed business flow.
 */

exports.up = async function(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS sys_failed_jobs (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      task_name VARCHAR(191) NOT NULL,
      payload JSON NULL,
      error_message TEXT NULL,
      error_stack MEDIUMTEXT NULL,
      status ENUM('pending','retrying','resolved','ignored') NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      next_retry_at DATETIME NULL,
      locked_at DATETIME NULL,
      resolved_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_failed_jobs_status_created (status, created_at),
      INDEX idx_failed_jobs_task_name (task_name),
      INDEX idx_failed_jobs_next_retry (next_retry_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='异步副作用失败任务/死信队列'
  `);
};

exports.down = async function(knex) {
  await knex.raw('DROP TABLE IF EXISTS sys_failed_jobs');
};
