/**
 * Harden quality workflow closure metadata.
 */

async function addColumnIfMissing(knex, table, column, definition) {
  const exists = await knex.schema.hasTable(table);
  if (!exists) return;
  const hasColumn = await knex.schema.hasColumn(table, column);
  if (!hasColumn) {
    await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function getColumnType(knex, table, column) {
  const [rows] = await knex.raw(
    `SELECT COLUMN_TYPE
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [table, column]
  );
  return rows[0]?.COLUMN_TYPE || '';
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'rework_tasks',
    'progress',
    "`progress` DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT 'Rework progress percent'"
  );

  const scrapStatusType = await getColumnType(knex, 'scrap_records', 'status');
  if (
    scrapStatusType &&
    (!scrapStatusType.includes("'rejected'") || !scrapStatusType.includes("'cancelled'"))
  ) {
    await knex.raw(
      "ALTER TABLE `scrap_records` MODIFY COLUMN `status` ENUM('pending','approved','rejected','completed','cancelled') DEFAULT 'pending'"
    );
  }
};

exports.down = async function down() {
  // Intentionally no-op: status enum widening and progress history are backward-compatible data hardening.
};
