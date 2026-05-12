async function hasColumn(knex, tableName, columnName) {
  return knex.schema.hasColumn(tableName, columnName);
}

async function hasIndex(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT 1
       FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1`,
    [tableName, indexName]
  );
  return rows.length > 0;
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await hasColumn(knex, tableName, columnName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function addIndexIfMissing(knex, tableName, indexName, definition) {
  if (!(await hasIndex(knex, tableName, indexName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'cost_variance_records',
    'variance_rate',
    'DECIMAL(10,2) DEFAULT 0 AFTER total_variance'
  );
  await addColumnIfMissing(
    knex,
    'cost_variance_records',
    'created_at',
    'TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER recorded_at'
  );
  await addIndexIfMissing(
    knex,
    'cost_variance_records',
    'idx_cost_variance_created_at',
    'INDEX idx_cost_variance_created_at (`created_at`)'
  );

  await addColumnIfMissing(
    knex,
    'gl_entries',
    'status',
    "ENUM('draft','posted','reversed') DEFAULT 'draft' AFTER voucher_number"
  );
  await addColumnIfMissing(
    knex,
    'gl_entries',
    'transaction_type',
    'VARCHAR(50) DEFAULT NULL AFTER status'
  );
  await addColumnIfMissing(
    knex,
    'gl_entries',
    'transaction_id',
    'INT DEFAULT NULL AFTER transaction_type'
  );
  await addIndexIfMissing(
    knex,
    'gl_entries',
    'idx_gl_transaction_lookup',
    'INDEX idx_gl_transaction_lookup (`transaction_type`, `transaction_id`)'
  );

  await knex.raw(`
    UPDATE gl_entries ge
    JOIN production_tasks pt ON pt.code = ge.document_number
       SET ge.transaction_id = pt.id
     WHERE ge.transaction_id IS NULL
       AND ge.transaction_type IN ('PRODUCTION_MATERIAL', 'PRODUCTION_LABOR', 'PRODUCTION_OVERHEAD', 'PRODUCTION_COMPLETE')
  `);

  const [duplicates] = await knex.raw(`
    SELECT transaction_type, transaction_id, COUNT(*) AS cnt
      FROM gl_entries
     WHERE transaction_type IS NOT NULL
       AND transaction_id IS NOT NULL
     GROUP BY transaction_type, transaction_id
    HAVING COUNT(*) > 1
    LIMIT 1
  `);
  if (duplicates.length === 0) {
    await addIndexIfMissing(
      knex,
      'gl_entries',
      'uq_gl_transaction_once',
      'UNIQUE INDEX uq_gl_transaction_once (`transaction_type`, `transaction_id`)'
    );
  }
};

exports.down = async function down(knex) {
  if (await hasIndex(knex, 'gl_entries', 'uq_gl_transaction_once')) {
    await knex.raw('ALTER TABLE `gl_entries` DROP INDEX `uq_gl_transaction_once`');
  }
  if (await hasIndex(knex, 'gl_entries', 'idx_gl_transaction_lookup')) {
    await knex.raw('ALTER TABLE `gl_entries` DROP INDEX `idx_gl_transaction_lookup`');
  }
  if (await hasIndex(knex, 'cost_variance_records', 'idx_cost_variance_created_at')) {
    await knex.raw('ALTER TABLE `cost_variance_records` DROP INDEX `idx_cost_variance_created_at`');
  }
};
