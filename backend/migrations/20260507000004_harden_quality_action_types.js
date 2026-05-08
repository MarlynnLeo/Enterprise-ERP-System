/**
 * Align NCP action history enum with all automatic downstream actions.
 */

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
  const actionType = await getColumnType(knex, 'nonconforming_product_actions', 'action_type');
  if (actionType && !actionType.includes("'auto_replacement'")) {
    await knex.raw(
      "ALTER TABLE `nonconforming_product_actions` MODIFY COLUMN `action_type` ENUM('create','isolate','evaluate','dispose','close','auto_receipt','auto_return','auto_scrap','auto_rework','auto_replacement') NOT NULL"
    );
  }
};

exports.down = async function down() {
  // No-op: widening an action-history enum is backward-compatible.
};
