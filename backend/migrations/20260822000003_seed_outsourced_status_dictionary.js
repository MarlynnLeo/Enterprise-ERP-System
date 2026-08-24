'use strict';

/**
 * 委外加工/委外入库共用状态字典，供 /system/business-types/dictionary 消费。
 * 使用 (group_code, code) 幂等更新，保证重复部署不会产生重复状态。
 */
const STATUSES = [
  ['pending', '待确认', 'warning', 1],
  ['confirmed', '已确认', 'primary', 2],
  ['in_progress', '加工中', 'primary', 3],
  ['completed', '已完成', 'success', 4],
  ['cancelled', '已取消', 'danger', 5],
];

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('business_types'))) return;

  for (const [code, name, tagType, sortOrder] of STATUSES) {
    await knex('business_types')
      .insert({
        code,
        name,
        category: 'transfer',
        group_code: 'outsourced_status',
        tag_type: tagType,
        color: tagType,
        sort_order: sortOrder,
        description: `委外业务状态：${name}`,
        is_system: 1,
        status: 1,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict(['group_code', 'code'])
      .merge({
        name,
        category: 'transfer',
        tag_type: tagType,
        color: tagType,
        sort_order: sortOrder,
        description: `委外业务状态：${name}`,
        is_system: 1,
        status: 1,
        updated_at: knex.fn.now(),
      });
  }
};

exports.down = async function down() {
  // 保留字典项，避免历史单据状态失去可读标签。
};
