/**
 * 20260818000001_add_material_column_to_materials.js
 * @description 为 materials 表增加 material (材料/材质) 字段
 */

async function columnExists(knex, tableName, columnName) {
  const result = await knex.raw(
    `SELECT COUNT(*) AS count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  const rows = result[0] || result;
  return Number(rows[0]?.count || 0) > 0;
}

async function addColumnIfMissing(knex, tableName, columnName, columnSql) {
  if (!(await columnExists(knex, tableName, columnName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnSql}`);
  }
}

exports.up = async function (knex) {
  await addColumnIfMissing(knex, 'materials', 'material', '`material` VARCHAR(100) NULL COMMENT \'材料/材质\' AFTER `color_code`');
};

exports.down = async function (knex) {
  if (await columnExists(knex, 'materials', 'material')) {
    await knex.raw('ALTER TABLE `materials` DROP COLUMN `material`');
  }
};
