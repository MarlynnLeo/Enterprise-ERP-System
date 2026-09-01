/**
 * Add the free-text detection method used by QRZK inspection records.
 * The legacy `type` enum remains as an internal classification for dimension
 * tolerance logic; `method` is the user-facing field from the paper form.
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('inspection_items'))) return;

  if (!(await knex.schema.hasColumn('inspection_items', 'method'))) {
    await knex.schema.alterTable('inspection_items', (table) => {
      table.string('method', 200).nullable().comment('检测方法');
    });
  }

  // Give legacy reusable items a sensible display value without overwriting
  // methods entered by users after this column was introduced.
  await knex.raw(`
    UPDATE inspection_items
    SET method = CASE type
      WHEN 'visual' THEN '目测'
      WHEN 'dimension' THEN '卡尺'
      WHEN 'function' THEN '功能测试'
      WHEN 'performance' THEN '性能测试'
      WHEN 'safety' THEN '安全检查'
      ELSE '按文件'
    END
    WHERE method IS NULL OR TRIM(method) = ''
  `);
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('inspection_items') && await knex.schema.hasColumn('inspection_items', 'method')) {
    await knex.schema.alterTable('inspection_items', (table) => {
      table.dropColumn('method');
    });
  }
};
