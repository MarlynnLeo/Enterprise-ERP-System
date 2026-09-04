'use strict';

/**
 * 修复委外到货检验来源。
 *
 * 20260902000001 增加 source_type 后，后续由旧模型创建的检验单仍可能把
 * 该字段留空。若这类单据在结案时被当成采购来料，会错误调用采购订单闭环。
 * 本迁移只按明确的来源单号（或在 reference_no 为空时按 ID）回填，不对
 * 无法确认来源的记录做无条件覆盖。
 */

const isBlankReferenceNo = (column) => `(${column} IS NULL OR TRIM(${column}) = '')`;

exports.up = async function up(knex) {
  const hasQualityInspections = await knex.schema.hasTable('quality_inspections');
  const hasSourceType =
    hasQualityInspections && (await knex.schema.hasColumn('quality_inspections', 'source_type'));

  if (!hasQualityInspections || !hasSourceType) return;

  if (await knex.schema.hasTable('outsourced_processing_receipts')) {
    // 先修复明确匹配委外入库单号的记录。允许把此前错误回填为
    // purchase_order 的记录改回 outsourced_receipt。
    await knex.raw(`
      UPDATE quality_inspections qi
      INNER JOIN outsourced_processing_receipts opr
        ON (
          (
            NOT ${isBlankReferenceNo('qi.reference_no')}
            AND qi.reference_no = opr.receipt_no
          )
          OR (
            ${isBlankReferenceNo('qi.reference_no')}
            AND qi.reference_id = opr.id
          )
        )
       SET qi.source_type = 'outsourced_receipt'
     WHERE qi.inspection_type = 'incoming'
       AND qi.deleted_at IS NULL
       AND (qi.source_type IS NULL OR qi.source_type = '' OR qi.source_type = 'purchase_order')
    `);
  }

  if (await knex.schema.hasTable('purchase_orders')) {
    // 剩余能明确匹配采购订单的 NULL 来源回填为 purchase_order；已识别为
    // 委外的记录不会被覆盖。
    await knex.raw(`
      UPDATE quality_inspections qi
      INNER JOIN purchase_orders po
        ON (
          (
            NOT ${isBlankReferenceNo('qi.reference_no')}
            AND qi.reference_no = po.order_no
          )
          OR (
            ${isBlankReferenceNo('qi.reference_no')}
            AND qi.reference_id = po.id
          )
        )
       SET qi.source_type = 'purchase_order'
     WHERE qi.inspection_type = 'incoming'
       AND qi.deleted_at IS NULL
       AND (qi.source_type IS NULL OR qi.source_type = '')
    `);
  }
};

exports.down = async function down() {
  // 来源修复是前向数据治理，不能在回滚时把已确认来源重新清空。
};
