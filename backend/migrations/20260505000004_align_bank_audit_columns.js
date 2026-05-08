async function columnExists(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await columnExists(knex, tableName, columnName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  }
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'bank_transactions',
    'created_by',
    'created_by INT NULL COMMENT "创建人ID" AFTER updated_at'
  );
  await addColumnIfMissing(
    knex,
    'bank_transactions',
    'updated_by',
    'updated_by INT NULL COMMENT "更新人ID" AFTER created_by'
  );
  await addColumnIfMissing(
    knex,
    'bank_accounts',
    'opening_balance',
    'opening_balance DECIMAL(15,2) NULL DEFAULT 0 COMMENT "期初余额" AFTER current_balance'
  );
  await addColumnIfMissing(
    knex,
    'bank_accounts',
    'created_by',
    'created_by INT NULL COMMENT "创建人ID" AFTER updated_at'
  );
  await addColumnIfMissing(
    knex,
    'bank_accounts',
    'updated_by',
    'updated_by INT NULL COMMENT "更新人ID" AFTER created_by'
  );
};

exports.down = async function down(knex) {
  const columns = [
    ['bank_transactions', 'updated_by'],
    ['bank_transactions', 'created_by'],
    ['bank_accounts', 'updated_by'],
    ['bank_accounts', 'created_by'],
    ['bank_accounts', 'opening_balance'],
  ];

  for (const [tableName, columnName] of columns) {
    if (await columnExists(knex, tableName, columnName)) {
      await knex.raw(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
    }
  }
};
