'use strict';

exports.up = async function up(knex) {
  if (
    (await knex.schema.hasTable('quality_inspections')) &&
    !(await knex.schema.hasColumn('quality_inspections', 'sampling_plan'))
  ) {
    await knex.schema.alterTable('quality_inspections', (table) => {
      table.text('sampling_plan').nullable().comment('检验时选用的抽样方案名称快照');
    });
  }
  if (await knex.schema.hasTable('quality_aql_standards')) {
    await knex.schema.alterTable('quality_aql_standards', (table) => {
      // Critical-defect AQLs such as 0.065 must not round to 0.07.
      table.decimal('aql_level', 8, 5).notNullable().alter();
    });
  }
};

// Do not erase recorded plans or round existing AQL values on rollback.
exports.down = async function down() {};
exports.config = { transaction: false };
