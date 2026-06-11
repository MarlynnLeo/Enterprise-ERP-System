/**
 * Add soft-delete support for purchase returns.
 *
 * The purchase return controller filters on deleted_at and uses the shared
 * softDelete helper, but the original purchase return table baseline omitted
 * this column.
 */

async function hasIndex(knex, table, indexName) {
  const [rows] = await knex.raw(
    `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1`,
    [table, indexName]
  );
  return rows.length > 0;
}

exports.up = async function up(knex) {
  const table = 'purchase_returns';
  const exists = await knex.schema.hasTable(table);
  if (!exists) return;

  const hasDeletedAt = await knex.schema.hasColumn(table, 'deleted_at');
  if (!hasDeletedAt) {
    await knex.schema.alterTable(table, (t) => {
      t.timestamp('deleted_at').nullable().comment('soft delete marker');
    });
  }

  const indexName = 'idx_purchase_returns_deleted_at';
  if (!(await hasIndex(knex, table, indexName))) {
    await knex.schema.alterTable(table, (t) => {
      t.index(['deleted_at'], indexName);
    });
  }
};

exports.down = async function down(knex) {
  const table = 'purchase_returns';
  const exists = await knex.schema.hasTable(table);
  if (!exists) return;

  const hasDeletedAt = await knex.schema.hasColumn(table, 'deleted_at');
  if (!hasDeletedAt) return;

  const indexName = 'idx_purchase_returns_deleted_at';
  const hasDeletedAtIndex = await hasIndex(knex, table, indexName);
  await knex.schema.alterTable(table, (t) => {
    if (hasDeletedAtIndex) {
      t.dropIndex(['deleted_at'], indexName);
    }
    t.dropColumn('deleted_at');
  });
};
