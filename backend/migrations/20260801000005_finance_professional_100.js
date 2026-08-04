/**
 * 财务专业化 100% 收口：
 * 1) 删除重复的 source 唯一索引 v2（保留原始 uk_*）
 * 2) 启用财务审批菜单
 * 3) 确保付款审批审计表存在（运行时也会 ensure）
 */

exports.up = async function up(knex) {
  const drops = [
    ['ar_invoices', 'uk_ar_invoices_source_v2'],
    ['ap_invoices', 'uk_ap_invoices_source_v2'],
    ['tax_invoices', 'uk_tax_invoices_related_v2'],
  ];
  for (const [table, indexName] of drops) {
    try {
      const hasTable = await knex.schema.hasTable(table);
      if (!hasTable) continue;
      const [rows] = await knex.raw(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
         LIMIT 1`,
        [table, indexName]
      );
      if (rows && rows.length) {
        await knex.raw(`ALTER TABLE \`${table}\` DROP INDEX \`${indexName}\``);
      }
    } catch {
      /* index may not exist or in use */
    }
  }

  if (await knex.schema.hasTable('menus')) {
    await knex('menus')
      .where('permission', 'like', 'finance:approval%')
      .orWhere('name', 'like', '%财务审批%')
      .update({ status: 1, visible: 1, updated_at: knex.fn.now() });
  }

  if (!(await knex.schema.hasTable('finance_payment_approvals'))) {
    await knex.schema.createTable('finance_payment_approvals', (t) => {
      t.increments('id').primary();
      t.string('payment_ref', 100).nullable();
      t.decimal('amount', 18, 2).notNullable().defaultTo(0);
      t.decimal('threshold', 18, 2).notNullable().defaultTo(0);
      t.string('approval_no', 100).nullable();
      t.string('workflow_status', 50).nullable();
      t.integer('approved_by').unsigned().nullable();
      t.boolean('skip_approval').notNullable().defaultTo(false);
      t.string('remark', 500).nullable();
      t.timestamp('created_at').defaultTo(knex.fn.now());
      t.index(['created_at']);
      t.index(['approval_no']);
    });
  }
};

exports.down = async function down() {
  // 不恢复重复索引；审批表保留
};
