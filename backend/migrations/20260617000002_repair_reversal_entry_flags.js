async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

exports.up = async function up(knex) {
  if (!(await hasTable(knex, 'gl_entries'))) return;

  await knex.raw(`
    UPDATE gl_entries reversal
    JOIN gl_entries original
      ON original.reversal_entry_id = reversal.id
    SET reversal.is_reversed = 0,
        reversal.status = CASE
          WHEN COALESCE(reversal.is_posted, 0) = 1 THEN 'posted'
          ELSE COALESCE(NULLIF(reversal.status, 'reversed'), 'draft')
        END
    WHERE COALESCE(reversal.is_reversed, 0) = 1
      AND reversal.reversal_entry_id IS NULL
  `);
};

exports.down = async function down() {
  // Historical data repair only. Do not re-mark reversal vouchers as reversed.
};
