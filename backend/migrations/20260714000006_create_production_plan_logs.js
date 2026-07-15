/** Create the immutable production plan lifecycle audit trail. */

exports.up = async function up(knex) {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS production_plan_logs (
      id INT NOT NULL AUTO_INCREMENT,
      plan_id INT NOT NULL,
      action VARCHAR(50) NOT NULL,
      from_status VARCHAR(30),
      to_status VARCHAR(30),
      operator VARCHAR(50),
      remark TEXT,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_production_plan_logs_plan (plan_id),
      KEY idx_production_plan_logs_action (action),
      KEY idx_production_plan_logs_created (created_at),
      CONSTRAINT fk_production_plan_logs_plan
        FOREIGN KEY (plan_id) REFERENCES production_plans(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Production plan lifecycle audit trail'
  `);
};

exports.down = async function down() {
  // Audit records are intentionally retained.
};
