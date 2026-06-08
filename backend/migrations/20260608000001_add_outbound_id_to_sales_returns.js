async function columnExists(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) as cnt
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return rows[0].cnt > 0;
}

async function indexExists(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) as cnt
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName]
  );
  return rows[0].cnt > 0;
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('sales_returns'))) {
    return;
  }

  if (!(await columnExists(knex, 'sales_returns', 'outbound_id'))) {
    await knex.raw(`
      ALTER TABLE sales_returns
      ADD COLUMN outbound_id INT NULL COMMENT 'Source sales outbound ID' AFTER order_id
    `);
  }

  if (!(await indexExists(knex, 'sales_returns', 'idx_sales_returns_outbound_id'))) {
    await knex.raw(`
      ALTER TABLE sales_returns
      ADD INDEX idx_sales_returns_outbound_id (outbound_id)
    `);
  }

  if (await knex.schema.hasTable('sales_outbound')) {
    const hasDeletedAt = await columnExists(knex, 'sales_outbound', 'deleted_at');
    await knex.raw(`
      UPDATE sales_returns sr
      JOIN (
        SELECT order_id, MIN(id) AS outbound_id
        FROM sales_outbound
        WHERE ${hasDeletedAt ? 'deleted_at IS NULL' : '1 = 1'}
        GROUP BY order_id
      ) sob ON sob.order_id = sr.order_id
      SET sr.outbound_id = sob.outbound_id
      WHERE sr.outbound_id IS NULL
        AND sr.order_id IS NOT NULL
    `);
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('sales_returns'))) {
    return;
  }

  if (await indexExists(knex, 'sales_returns', 'idx_sales_returns_outbound_id')) {
    await knex.raw('ALTER TABLE sales_returns DROP INDEX idx_sales_returns_outbound_id');
  }

  if (await columnExists(knex, 'sales_returns', 'outbound_id')) {
    await knex.raw('ALTER TABLE sales_returns DROP COLUMN outbound_id');
  }
};
