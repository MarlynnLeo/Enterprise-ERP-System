'use strict';

/**
 * 统一“外委加工”为当前业务用语“委外加工”，历史迁移保持不可变。
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('coding_rules'))) return;

  await knex('coding_rules').where({ business_type: 'outsourced_processing' }).update({
    name: '委外加工单',
    description: '委外加工订单',
  });
  await knex('coding_rules').where({ business_type: 'outsourced_receipt' }).update({
    name: '委外收货单',
    description: '委外入库收货',
  });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('coding_rules'))) return;

  await knex('coding_rules').where({ business_type: 'outsourced_processing' }).update({
    name: '外委加工单',
    description: '外委加工订单',
  });
  await knex('coding_rules').where({ business_type: 'outsourced_receipt' }).update({
    name: '外委收货单',
    description: '外委加工入库收货',
  });
};
