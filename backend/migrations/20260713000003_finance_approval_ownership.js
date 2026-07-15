/** Add reliable maker ownership to finance approval documents that lacked it. */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('fixed_assets', 'created_by'))) {
    await knex.schema.alterTable('fixed_assets', (table) => {
      table.string('created_by', 50).nullable().comment('资产制单人用户名');
    });
    await knex.raw(`
      UPDATE fixed_assets
         SET created_by = 'legacy_unknown'
       WHERE created_by IS NULL OR created_by = ''
    `);
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('fixed_assets', 'created_by')) {
    await knex.schema.alterTable('fixed_assets', (table) => table.dropColumn('created_by'));
  }
};
