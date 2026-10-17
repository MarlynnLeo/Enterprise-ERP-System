'use strict';

// Only register the missing default. Existing rules, sequence counters and
// historical batch identifiers (including frozen posting snapshots) stay intact.
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('coding_rules'))) return;

  await knex('coding_rules')
    .insert({
      business_type: 'batch_number',
      name: '批次号',
      prefix: 'G023-',
      date_format: 'YYMMDD',
      separator: '',
      sequence_length: 3,
      reset_cycle: 'daily',
      initial_value: 1,
      step: 1,
      description: '采购来料检验批次号：供应商编码-YYMMDD流水号；前缀示例为 G023-',
      is_active: 1,
    })
    .onConflict('business_type')
    .ignore();
};

exports.down = async function down() {
  // Keep an existing or now-used rule during application rollback.
};
