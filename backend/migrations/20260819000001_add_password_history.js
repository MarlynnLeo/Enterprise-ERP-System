/**
 * Store recent password hashes so password reuse can be enforced consistently
 * across self-service changes, administrator resets, and future import flows.
 */

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS password_history (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_password_history_user_created (user_id, created_at),
      CONSTRAINT fk_password_history_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS password_history');
};
