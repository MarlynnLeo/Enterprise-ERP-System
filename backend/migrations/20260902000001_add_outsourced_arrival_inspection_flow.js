'use strict';

/**
 * 委外入库到货/来料检验流程。
 *
 * - quality_inspections.source_type 显式区分采购来料与委外入库来料，
 *   避免质检闭环把委外单误当成采购订单并自动生成采购入库单。
 * - outsourced_status 字典补充 arrived（已到货/待检验）。
 *
 * 迁移保持幂等，兼容已经存在部分字段或字典数据的部署环境。
 */

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('quality_inspections')) {
    if (!(await knex.schema.hasColumn('quality_inspections', 'source_type'))) {
      await knex.schema.alterTable('quality_inspections', (table) => {
        table
          .string('source_type', 30)
          .nullable()
          .comment('检验来源：purchase_order=采购订单，outsourced_receipt=委外入库单');
      });
    }

    // 历史 incoming 检验均来自采购订单；回填后旧数据仍走原采购闭环。
    await knex('quality_inspections')
      .where('inspection_type', 'incoming')
      .where((builder) => builder.whereNull('source_type').orWhere('source_type', ''))
      .update({ source_type: 'purchase_order' });
  }

  if (await knex.schema.hasTable('business_types')) {
    await knex('business_types')
      .insert({
        code: 'arrived',
        name: '已到货/待检验',
        category: 'transfer',
        group_code: 'outsourced_status',
        tag_type: 'warning',
        color: 'warning',
        sort_order: 3,
        description: '委外入库已到货，等待来料检验',
        is_system: 1,
        status: 1,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      })
      .onConflict(['group_code', 'code'])
      .merge({
        name: '已到货/待检验',
        category: 'transfer',
        tag_type: 'warning',
        color: 'warning',
        sort_order: 3,
        description: '委外入库已到货，等待来料检验',
        is_system: 1,
        status: 1,
        updated_at: knex.fn.now(),
      });
  }
};
exports.down = async function down(knex) {
  // 状态字典采用前向兼容策略，不删除 arrived，避免历史单据失去可读标签。
  if (
    (await knex.schema.hasTable('quality_inspections')) &&
    (await knex.schema.hasColumn('quality_inspections', 'source_type'))
  ) {
    await knex.schema.alterTable('quality_inspections', (table) => {
      table.dropColumn('source_type');
    });
  }
};
