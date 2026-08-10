/**
 * 修复历史请购脏数据：
 * 1) 明细 material_id 为空但主表有 source_material_id → 回填
 * 2) 明细有 material_id 但 code/name 空 → 从 materials 补全
 * 3) 明细完全无法关联的记录打日志（不删除）
 */

exports.up = async function up(knex) {
  // 1) 主表 source_material_id 回填明细
  await knex.raw(`
    UPDATE purchase_requisition_items pri
    JOIN purchase_requisitions pr ON pr.id = pri.requisition_id AND pr.deleted_at IS NULL
    JOIN materials m ON m.id = pr.source_material_id AND m.deleted_at IS NULL
    SET pri.material_id = m.id,
        pri.material_code = COALESCE(NULLIF(pri.material_code, ''), m.code),
        pri.material_name = COALESCE(NULLIF(pri.material_name, ''), m.name),
        pri.specification = COALESCE(NULLIF(pri.specification, ''), m.specs, ''),
        pri.unit_id = COALESCE(pri.unit_id, m.unit_id)
    WHERE (pri.material_id IS NULL OR pri.material_id = 0)
      AND pr.source_material_id IS NOT NULL
  `);

  // 2) 有 material_id 但编码/名称为空
  await knex.raw(`
    UPDATE purchase_requisition_items pri
    JOIN materials m ON m.id = pri.material_id AND m.deleted_at IS NULL
    SET pri.material_code = COALESCE(NULLIF(pri.material_code, ''), m.code),
        pri.material_name = COALESCE(NULLIF(pri.material_name, ''), m.name),
        pri.specification = COALESCE(NULLIF(pri.specification, ''), m.specs, ''),
        pri.unit_id = COALESCE(pri.unit_id, m.unit_id)
    WHERE pri.material_id IS NOT NULL
      AND (
        pri.material_code IS NULL OR pri.material_code = ''
        OR pri.material_name IS NULL OR pri.material_name = ''
      )
  `);

  // 3) 有 material_code 无 material_id
  await knex.raw(`
    UPDATE purchase_requisition_items pri
    JOIN materials m ON m.code = pri.material_code AND m.deleted_at IS NULL
    SET pri.material_id = m.id,
        pri.material_name = COALESCE(NULLIF(pri.material_name, ''), m.name),
        pri.unit_id = COALESCE(pri.unit_id, m.unit_id)
    WHERE (pri.material_id IS NULL OR pri.material_id = 0)
      AND pri.material_code IS NOT NULL
      AND pri.material_code <> ''
  `);

  const [bad] = await knex.raw(`
    SELECT COUNT(*) AS c
    FROM purchase_requisition_items pri
    JOIN purchase_requisitions pr ON pr.id = pri.requisition_id AND pr.deleted_at IS NULL
    WHERE pri.material_id IS NULL
       OR pri.material_code IS NULL OR pri.material_code = ''
       OR pri.material_name IS NULL OR pri.material_name = ''
  `);
  const remaining = Number(bad?.[0]?.c || bad?.c || 0);
  if (remaining > 0) {
    console.warn(
      `[20260808000004] 仍有 ${remaining} 条请购明细物料不完整，需人工处理`
    );
  }
};

exports.down = async function down() {
  // 数据修复不可回滚
};
