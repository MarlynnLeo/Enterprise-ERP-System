'use strict';

/** Store BOM position numbers independently from drawing numbers or locations. */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('bom_details'))) return;
  if (await knex.schema.hasColumn('bom_details', 'position')) return;

  await knex.schema.alterTable('bom_details', (table) => {
    table.string('position', 100).nullable().comment('BOM 位号，如 E2-02-02');
    table.index(['bom_id', 'position'], 'idx_bom_details_position');
  });
};
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('bom_details'))) return;
  if (!(await knex.schema.hasColumn('bom_details', 'position'))) return;

  await knex.schema.alterTable('bom_details', (table) => {
    table.dropIndex(['bom_id', 'position'], 'idx_bom_details_position');
    table.dropColumn('position');
  });
};
