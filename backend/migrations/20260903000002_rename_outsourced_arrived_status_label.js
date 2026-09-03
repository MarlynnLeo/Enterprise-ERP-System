'use strict';

/**
 * 统一委外入库到货状态的显示名称。
 * 状态码仍保留为 arrived，避免影响既有单据和状态流转。
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('business_types'))) return;

  await knex('business_types')
    .where({ group_code: 'outsourced_status', code: 'arrived' })
    .update({
      name: '待检验',
      updated_at: knex.fn.now(),
    });
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('business_types'))) return;

  await knex('business_types')
    .where({ group_code: 'outsourced_status', code: 'arrived' })
    .update({
      name: '已到货/待检验',
      updated_at: knex.fn.now(),
    });
};
