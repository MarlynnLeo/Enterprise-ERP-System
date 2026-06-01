async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  if (!(await hasTable(knex, tableName))) return false;
  return knex.schema.hasColumn(tableName, columnName);
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if ((await hasTable(knex, tableName)) && !(await hasColumn(knex, tableName, columnName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function dropColumnIfExists(knex, tableName, columnName) {
  if (await hasColumn(knex, tableName, columnName)) {
    await knex.raw(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\``);
  }
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'opening_source_type',
    "VARCHAR(30) NOT NULL DEFAULT 'manual' AFTER `opening_balance_set`"
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'opening_source_details',
    'JSON NULL AFTER `opening_source_type`'
  );
  await addColumnIfMissing(
    knex,
    'gl_accounts',
    'opening_source_updated_at',
    'TIMESTAMP NULL AFTER `opening_source_details`'
  );

  await addColumnIfMissing(
    knex,
    'gl_opening_balance_history',
    'batch_no',
    'VARCHAR(64) NULL AFTER `account_id`'
  );
  await addColumnIfMissing(
    knex,
    'gl_opening_balance_history',
    'source_type',
    "VARCHAR(30) NOT NULL DEFAULT 'manual' AFTER `notes`"
  );
  await addColumnIfMissing(
    knex,
    'gl_opening_balance_history',
    'source_details',
    'JSON NULL AFTER `source_type`'
  );
};

exports.down = async function down(knex) {
  await dropColumnIfExists(knex, 'gl_opening_balance_history', 'source_details');
  await dropColumnIfExists(knex, 'gl_opening_balance_history', 'source_type');
  await dropColumnIfExists(knex, 'gl_opening_balance_history', 'batch_no');
  await dropColumnIfExists(knex, 'gl_accounts', 'opening_source_updated_at');
  await dropColumnIfExists(knex, 'gl_accounts', 'opening_source_details');
  await dropColumnIfExists(knex, 'gl_accounts', 'opening_source_type');
};
