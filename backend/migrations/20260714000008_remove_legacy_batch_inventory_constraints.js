/**
 * Traceability now uses the immutable inventory ledger and batch numbers.
 * Legacy numeric batch IDs referenced an archived table and are optional metadata.
 */

async function dropForeignKeysForColumn(knex, tableName, columnName) {
  const [rows] = await knex.raw(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [tableName, columnName]
  );

  for (const row of rows) {
    await knex.raw(`ALTER TABLE ?? DROP FOREIGN KEY ??`, [tableName, row.CONSTRAINT_NAME]);
  }
}

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('batch_relationships')) {
    await dropForeignKeysForColumn(knex, 'batch_relationships', 'parent_batch_id');
    await dropForeignKeysForColumn(knex, 'batch_relationships', 'child_batch_id');
    await knex.raw(`
      ALTER TABLE batch_relationships
      MODIFY parent_batch_id INT NULL,
      MODIFY child_batch_id INT NULL
    `);
  }

  if (await knex.schema.hasTable('product_sales_traceability')) {
    await dropForeignKeysForColumn(knex, 'product_sales_traceability', 'product_batch_id');
    await knex.raw(`
      ALTER TABLE product_sales_traceability
      MODIFY product_batch_id INT NULL
    `);
  }
};

exports.down = async function down() {
  // The archived legacy batch table is not a valid runtime dependency anymore.
};
