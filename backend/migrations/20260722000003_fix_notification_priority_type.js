exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('notification_rules'))) return;
  await knex.raw(`
    ALTER TABLE notification_rules
    MODIFY COLUMN priority TINYINT UNSIGNED NOT NULL DEFAULT 1
    COMMENT '通知优先级：0=低 1=中 2=高'
  `);
};

exports.down = async function down() {
  // 保留非布尔优先级类型，避免高优先级 2 被连接层转换为 false。
};
