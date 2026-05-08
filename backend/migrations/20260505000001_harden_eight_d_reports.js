/**
 * Harden 8D report schema for workflow, audit logs, and attachments.
 */

async function addColumnIfMissing(knex, table, column, definitionSql) {
  const exists = await knex.schema.hasTable(table);
  if (!exists) return;

  const hasColumn = await knex.schema.hasColumn(table, column);
  if (!hasColumn) {
    await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${definitionSql}`);
  }
}

async function addIndexIfMissing(knex, table, indexName, columnsSql) {
  const exists = await knex.schema.hasTable(table);
  if (!exists) return;

  const [rows] = await knex.raw(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1
    `,
    [table, indexName],
  );

  if (!rows || rows.length === 0) {
    await knex.raw(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columnsSql})`);
  }
}

exports.up = async function up(knex) {
  const table = 'eight_d_reports';

  await addColumnIfMissing(knex, table, 'deleted_at', '`deleted_at` TIMESTAMP NULL COMMENT \'软删除标记\'');
  await addColumnIfMissing(knex, table, 'current_phase', "`current_phase` VARCHAR(30) DEFAULT 'draft' COMMENT '8D当前阶段'");
  await addColumnIfMissing(knex, table, 'initiated_by', '`initiated_by` VARCHAR(100) NULL COMMENT \'发起人\'');
  await addColumnIfMissing(knex, table, 'initiated_at', '`initiated_at` DATETIME NULL COMMENT \'发起时间\'');
  await addColumnIfMissing(knex, table, 'owner', '`owner` VARCHAR(100) NULL COMMENT \'主负责人\'');
  await addColumnIfMissing(knex, table, 'owner_department', '`owner_department` VARCHAR(100) NULL COMMENT \'负责人部门\'');
  await addColumnIfMissing(knex, table, 'customer_contact', '`customer_contact` VARCHAR(100) NULL COMMENT \'客户联系人\'');
  await addColumnIfMissing(knex, table, 'target_close_date', '`target_close_date` DATE NULL COMMENT \'目标关闭日期\'');
  await addColumnIfMissing(knex, table, 'd3_deadline', '`d3_deadline` DATETIME NULL COMMENT \'D3遏制期限\'');

  await addColumnIfMissing(knex, table, 'd2_responsible_person', '`d2_responsible_person` VARCHAR(100) NULL COMMENT \'D2责任人\'');
  await addColumnIfMissing(knex, table, 'd3_responsible_person', '`d3_responsible_person` VARCHAR(100) NULL COMMENT \'D3责任人\'');
  await addColumnIfMissing(knex, table, 'd4_responsible_person', '`d4_responsible_person` VARCHAR(100) NULL COMMENT \'D4责任人\'');
  await addColumnIfMissing(knex, table, 'd6_responsible_person', '`d6_responsible_person` VARCHAR(100) NULL COMMENT \'D6责任人\'');
  await addColumnIfMissing(knex, table, 'd7_responsible_person', '`d7_responsible_person` VARCHAR(100) NULL COMMENT \'D7责任人\'');
  await addColumnIfMissing(knex, table, 'd8_responsible_person', '`d8_responsible_person` VARCHAR(100) NULL COMMENT \'D8责任人\'');

  await addColumnIfMissing(knex, table, 'd3_attachments', '`d3_attachments` TEXT NULL COMMENT \'D3附件JSON\'');
  await addColumnIfMissing(knex, table, 'd5_attachments', '`d5_attachments` TEXT NULL COMMENT \'D5附件JSON\'');
  await addColumnIfMissing(knex, table, 'd6_attachments', '`d6_attachments` TEXT NULL COMMENT \'D6附件JSON\'');

  await addColumnIfMissing(knex, table, 'phase1_approved_by', '`phase1_approved_by` VARCHAR(100) NULL COMMENT \'初审人\'');
  await addColumnIfMissing(knex, table, 'phase1_approved_at', '`phase1_approved_at` DATETIME NULL COMMENT \'初审时间\'');
  await addColumnIfMissing(knex, table, 'phase2_approved_by', '`phase2_approved_by` VARCHAR(100) NULL COMMENT \'结案审核人\'');
  await addColumnIfMissing(knex, table, 'phase2_approved_at', '`phase2_approved_at` DATETIME NULL COMMENT \'结案审核时间\'');

  await addIndexIfMissing(knex, table, 'idx_eight_d_current_phase', '`current_phase`');
  await addIndexIfMissing(knex, table, 'idx_eight_d_deleted_status', '`deleted_at`, `status`');
  await addIndexIfMissing(knex, table, 'idx_eight_d_target_close', '`target_close_date`');

  if (await knex.schema.hasTable(table)) {
    await knex.raw(`
      UPDATE eight_d_reports
      SET current_phase = 'draft'
      WHERE current_phase IS NULL OR current_phase = ''
    `);

    await knex.raw(`
      UPDATE eight_d_reports
      SET d1_team_members = COALESCE(NULLIF(d1_team_members, ''), '[]'),
          d3_containment_actions = COALESCE(NULLIF(d3_containment_actions, ''), '[]'),
          d4_contributing_factors = COALESCE(NULLIF(d4_contributing_factors, ''), '[]'),
          d5_corrective_actions = COALESCE(NULLIF(d5_corrective_actions, ''), '[]'),
          d7_preventive_actions = COALESCE(NULLIF(d7_preventive_actions, ''), '[]'),
          d3_attachments = COALESCE(NULLIF(d3_attachments, ''), '[]'),
          d5_attachments = COALESCE(NULLIF(d5_attachments, ''), '[]'),
          d6_attachments = COALESCE(NULLIF(d6_attachments, ''), '[]')
    `);
  }

  await knex.raw(`
    CREATE TABLE IF NOT EXISTS eight_d_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      report_id INT NOT NULL,
      action VARCHAR(50) NOT NULL,
      old_phase VARCHAR(30) NULL,
      new_phase VARCHAR(30) NULL,
      comments TEXT NULL,
      operator VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_report_id (report_id),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='8D报告流转审计日志'
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TABLE IF EXISTS eight_d_logs');
};
