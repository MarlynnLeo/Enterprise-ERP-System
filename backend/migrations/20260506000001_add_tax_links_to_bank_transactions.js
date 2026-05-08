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

async function indexExists(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName]
  );
  return Number(rows[0].count) > 0;
}

async function constraintExists(knex, tableName, constraintName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
     FROM information_schema.table_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = ?
       AND constraint_name = ?`,
    [tableName, constraintName]
  );
  return Number(rows[0].count) > 0;
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await columnExists(knex, tableName, columnName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN ${definition}`);
  }
}

async function addIndexIfMissing(knex, tableName, indexName, definition) {
  if (!(await indexExists(knex, tableName, indexName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
}

async function addConstraintIfMissing(knex, tableName, constraintName, definition) {
  if (!(await constraintExists(knex, tableName, constraintName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` ${definition}`);
  }
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'bank_transactions',
    'tax_return_id',
    'tax_return_id INT NULL COMMENT "关联税务申报ID" AFTER related_invoice_type'
  );

  await addColumnIfMissing(
    knex,
    'bank_transactions',
    'gl_entry_id',
    'gl_entry_id INT NULL COMMENT "关联总账凭证ID" AFTER tax_return_id'
  );

  await addIndexIfMissing(
    knex,
    'bank_transactions',
    'idx_bank_transactions_tax_return_id',
    'INDEX idx_bank_transactions_tax_return_id (tax_return_id)'
  );

  await addIndexIfMissing(
    knex,
    'bank_transactions',
    'idx_bank_transactions_gl_entry_id',
    'INDEX idx_bank_transactions_gl_entry_id (gl_entry_id)'
  );

  await addConstraintIfMissing(
    knex,
    'bank_transactions',
    'fk_bank_transactions_tax_return',
    'FOREIGN KEY (tax_return_id) REFERENCES tax_returns(id) ON DELETE SET NULL'
  );

  await addConstraintIfMissing(
    knex,
    'bank_transactions',
    'fk_bank_transactions_gl_entry',
    'FOREIGN KEY (gl_entry_id) REFERENCES gl_entries(id) ON DELETE SET NULL'
  );
};

exports.down = async function down(knex) {
  const constraints = [
    'fk_bank_transactions_gl_entry',
    'fk_bank_transactions_tax_return',
  ];

  for (const constraintName of constraints) {
    if (await constraintExists(knex, 'bank_transactions', constraintName)) {
      await knex.raw(`ALTER TABLE \`bank_transactions\` DROP FOREIGN KEY \`${constraintName}\``);
    }
  }

  const indexes = [
    'idx_bank_transactions_gl_entry_id',
    'idx_bank_transactions_tax_return_id',
  ];

  for (const indexName of indexes) {
    if (await indexExists(knex, 'bank_transactions', indexName)) {
      await knex.raw(`ALTER TABLE \`bank_transactions\` DROP INDEX \`${indexName}\``);
    }
  }

  const columns = ['gl_entry_id', 'tax_return_id'];
  for (const columnName of columns) {
    if (await columnExists(knex, 'bank_transactions', columnName)) {
      await knex.raw(`ALTER TABLE \`bank_transactions\` DROP COLUMN \`${columnName}\``);
    }
  }
};
