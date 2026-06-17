exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('planned_transactions');
  if (exists) return;

  await knex.schema.createTable('planned_transactions', (table) => {
    table.increments('id').primary();
    table.date('transaction_date').notNullable().comment('计划交易日期');
    table.decimal('amount', 15, 2).notNullable().comment('计划交易金额');
    table.string('transaction_type', 50).notNullable().comment('计划交易类型');
    table.string('description', 255).nullable().comment('计划交易说明');
    table
      .enu('status', ['planned', 'approved', 'cancelled', 'completed'])
      .notNullable()
      .defaultTo('planned')
      .comment('计划交易状态');
    table.integer('bank_account_id').unsigned().nullable().comment('关联银行账户');
    table.string('source_type', 50).nullable().comment('来源类型');
    table.integer('source_id').unsigned().nullable().comment('来源ID');
    table.integer('created_by').unsigned().nullable();
    table.integer('updated_by').unsigned().nullable();
    table.timestamps(true, true);

    table.index(['transaction_date', 'status'], 'idx_planned_tx_date_status');
    table.index(['bank_account_id'], 'idx_planned_tx_bank_account');
    table.index(['source_type', 'source_id'], 'idx_planned_tx_source');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('planned_transactions');
};
