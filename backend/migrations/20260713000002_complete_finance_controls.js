/**
 * 核心财务与库存控制补强：
 * - 凭证过账人、过账时间、过账方式与审批时间
 * - 手工库存单据创建人及入库单位成本
 * - DLQ 明确的 failed 终态
 * - 清理“草稿但启用”的标准成本标记
 */

async function hasIndex(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?`,
    [tableName, indexName]
  );
  return Number(rows?.[0]?.count || 0) > 0;
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('gl_entries', 'posted_by'))) {
    await knex.schema.alterTable('gl_entries', (table) => {
      table.integer('posted_by').nullable().comment('人工过账用户ID；自动过账为空');
    });
  }
  if (!(await knex.schema.hasColumn('gl_entries', 'posted_at'))) {
    await knex.schema.alterTable('gl_entries', (table) => {
      table.dateTime('posted_at').nullable().comment('实际过账时间');
    });
  }
  if (!(await knex.schema.hasColumn('gl_entries', 'posting_method'))) {
    await knex.schema.alterTable('gl_entries', (table) => {
      table.string('posting_method', 32).nullable().comment('manual/automatic/legacy_unknown');
    });
  }
  if (!(await knex.schema.hasColumn('gl_entries', 'approved_at'))) {
    await knex.schema.alterTable('gl_entries', (table) => {
      table.dateTime('approved_at').nullable().comment('审批时间');
    });
  }

  await knex.raw(`
    UPDATE gl_entries
       SET posted_at = COALESCE(posted_at, updated_at, created_at),
           posting_method = COALESCE(NULLIF(posting_method, ''), 'legacy_unknown')
     WHERE COALESCE(is_posted, 0) = 1
  `);

  if (!(await knex.schema.hasColumn('manual_transactions', 'unit_cost'))) {
    await knex.schema.alterTable('manual_transactions', (table) => {
      table.decimal('unit_cost', 18, 6).nullable().comment('手工入库单位成本；出库由批次成本取得');
    });
  }
  if (!(await knex.schema.hasColumn('manual_transactions', 'created_by'))) {
    await knex.schema.alterTable('manual_transactions', (table) => {
      table.integer('created_by').nullable().comment('制单用户ID');
    });
  }
  if (!(await hasIndex(knex, 'manual_transactions', 'idx_manual_transactions_created_by'))) {
    await knex.raw(
      'ALTER TABLE manual_transactions ADD INDEX idx_manual_transactions_created_by (created_by)'
    );
  }

  await knex.raw(`
    ALTER TABLE sys_failed_jobs
    MODIFY COLUMN status ENUM('pending','retrying','resolved','failed','ignored')
      NOT NULL DEFAULT 'pending'
  `);
  await knex.raw(`
    UPDATE sys_failed_jobs
       SET status = 'failed',
           next_retry_at = NULL,
           locked_at = NULL
     WHERE status = 'ignored'
       AND (
         task_name LIKE '%Finance%'
         OR task_name LIKE '%AP%'
         OR task_name LIKE '%Tax%'
         OR task_name LIKE '%Cost%'
         OR task_name LIKE '%Voucher%'
         OR task_name LIKE '%采购入库%'
         OR task_name LIKE '%销售成本%'
         OR task_name LIKE '%生产任务%'
         OR task_name LIKE '%财务凭证%'
       )
  `);

  await knex.raw(`
    UPDATE standard_costs
       SET is_active = 0,
           updated_at = CURRENT_TIMESTAMP
     WHERE COALESCE(is_active, 0) = 1
       AND COALESCE(status, 'draft') <> 'active'
  `);
};

exports.down = async function down(knex) {
  await knex.raw("UPDATE sys_failed_jobs SET status = 'ignored' WHERE status = 'failed'");
  await knex.raw(`
    ALTER TABLE sys_failed_jobs
    MODIFY COLUMN status ENUM('pending','retrying','resolved','ignored')
      NOT NULL DEFAULT 'pending'
  `);

  if (await hasIndex(knex, 'manual_transactions', 'idx_manual_transactions_created_by')) {
    await knex.raw(
      'ALTER TABLE manual_transactions DROP INDEX idx_manual_transactions_created_by'
    );
  }
  for (const column of ['created_by', 'unit_cost']) {
    if (await knex.schema.hasColumn('manual_transactions', column)) {
      await knex.schema.alterTable('manual_transactions', (table) => table.dropColumn(column));
    }
  }
  for (const column of ['approved_at', 'posting_method', 'posted_at', 'posted_by']) {
    if (await knex.schema.hasColumn('gl_entries', column)) {
      await knex.schema.alterTable('gl_entries', (table) => table.dropColumn(column));
    }
  }
};
