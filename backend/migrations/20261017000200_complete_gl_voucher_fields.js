/** Preserve voucher source data explicitly; unknown historical values stay NULL. */
const columns = {
  gl_entries: {
    attachment_count: 'INT UNSIGNED NULL DEFAULT NULL',
    approval_comment: 'VARCHAR(500) NULL DEFAULT NULL',
  },
  gl_entry_items: {
    department_id: 'INT NULL DEFAULT NULL',
    quantity: 'DECIMAL(18,6) NULL DEFAULT NULL',
    unit_name: 'VARCHAR(50) NULL DEFAULT NULL',
    unit_price: 'DECIMAL(18,6) NULL DEFAULT NULL',
    foreign_amount: 'DECIMAL(15,2) NULL DEFAULT NULL',
    base_rounding_adjustment: 'DECIMAL(3,2) NOT NULL DEFAULT 0',
    settlement_method: 'VARCHAR(50) NULL DEFAULT NULL',
    invoice_number: 'VARCHAR(100) NULL DEFAULT NULL',
    project_name: 'VARCHAR(200) NULL DEFAULT NULL',
    employee_source: "VARCHAR(20) NULL DEFAULT NULL COMMENT 'user:users.id; hr:hr_employees.id; NULL:legacy unknown'",
  },
};

exports.up = async function up(knex) {
  for (const [table, definitions] of Object.entries(columns)) {
    for (const [column, definition] of Object.entries(definitions)) {
      if (!(await knex.schema.hasColumn(table, column))) {
        await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
      }
    }
  }
  await knex.raw('ALTER TABLE gl_entry_items MODIFY COLUMN exchange_rate DECIMAL(18,8) DEFAULT 1');
};

exports.down = async function down(knex) {
  // Refuse lossy rate rollback rather than silently rounding posted evidence.
  const row = await knex('gl_entry_items').whereRaw('exchange_rate <> ROUND(exchange_rate, 5)').first('id');
  if (row) throw new Error('汇率已使用8位精度，不能无损回滚到5位精度');
  await knex.raw('ALTER TABLE gl_entry_items MODIFY COLUMN exchange_rate DECIMAL(15,5) DEFAULT 1');
  for (const [table, definitions] of Object.entries(columns).reverse()) {
    for (const column of Object.keys(definitions).reverse()) {
      if (await knex.schema.hasColumn(table, column)) {
        await knex.raw(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
      }
    }
  }
};
