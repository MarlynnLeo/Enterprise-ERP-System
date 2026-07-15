/** Seed runtime coding rules that are directly required by document creation flows. */

const RULES = [
  {
    business_type: 'production_report', name: '生产报工单', prefix: 'PRD',
    date_format: 'YYYYMMDD', separator: '-', sequence_length: 4, reset_cycle: 'daily',
    description: 'Production completion report number',
  },
  {
    business_type: 'eight_d_report', name: '8D报告', prefix: '8D',
    date_format: 'YYYYMM', separator: '-', sequence_length: 4, reset_cycle: 'monthly',
    description: '8D quality report number',
  },
  {
    business_type: 'replacement_order', name: '质量换货单', prefix: 'QRO',
    date_format: 'YYYYMMDD', separator: '-', sequence_length: 4, reset_cycle: 'daily',
    description: 'Quality replacement order number',
  },
  {
    business_type: 'document', name: '系统文档', prefix: 'DOC',
    date_format: 'YYYYMMDD', separator: '-', sequence_length: 4, reset_cycle: 'daily',
    description: 'System document number',
  },
];

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('coding_rules'))) return;
  for (const rule of RULES) {
    const exists = await knex('coding_rules').where({ business_type: rule.business_type }).first('id');
    if (!exists) {
      await knex('coding_rules').insert({
        ...rule,
        initial_value: 1,
        step: 1,
        is_active: 1,
      });
    }
  }
};

exports.down = async function down() {
  // Retain rules and allocated document sequences.
};
