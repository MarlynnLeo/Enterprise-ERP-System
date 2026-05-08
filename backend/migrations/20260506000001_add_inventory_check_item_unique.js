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
  const tableName = 'inventory_check_items';
  const indexName = 'uniq_inventory_check_item_material';

  if (!(await knex.schema.hasTable(tableName)) || (await indexExists(knex, tableName, indexName))) {
    return;
  }

  await knex.raw(`
    DELETE ici1
    FROM inventory_check_items ici1
    JOIN inventory_check_items ici2
      ON ici1.check_id = ici2.check_id
     AND ici1.material_id = ici2.material_id
     AND ici1.id > ici2.id
  `);

  await knex.raw(
    `ALTER TABLE \`${tableName}\`
     ADD UNIQUE KEY \`${indexName}\` (\`check_id\`, \`material_id\`)`
  );
};

exports.down = async function down(knex) {
  const tableName = 'inventory_check_items';
  const indexName = 'uniq_inventory_check_item_material';

  if (await indexExists(knex, tableName, indexName)) {
    await knex.raw(`ALTER TABLE \`${tableName}\` DROP INDEX \`${indexName}\``);
  }
};
