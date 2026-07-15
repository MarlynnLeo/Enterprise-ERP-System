/**
 * 生产闭环历史残差修复：
 * 1) 终检关联的生产入库补全 reference_type/reference_id + 纠正 inbound_type
 * 2) 无库存证据的 E2E/测试脏任务（已完成）软删除
 * 3) 重建 production_plans.pushed_quantity
 * 4) 受影响计划状态按子任务重算
 */

async function backfillInboundTaskRefs(knex) {
  await knex.raw(`
    UPDATE inventory_inbound ii
    INNER JOIN quality_inspections qi
      ON qi.id = ii.inspection_id
     AND qi.inspection_type = 'final'
     AND qi.deleted_at IS NULL
    SET
      ii.inbound_type = 'production',
      ii.reference_type = 'production_task',
      ii.reference_id = COALESCE(qi.reference_id, qi.task_id),
      ii.updated_at = NOW()
    WHERE COALESCE(ii.is_deleted, 0) = 0
      AND ii.status <> 'cancelled'
      AND COALESCE(qi.reference_id, qi.task_id) IS NOT NULL
      AND (
        ii.inbound_type IS NULL
        OR ii.inbound_type IN ('', 'other')
        OR ii.reference_type IS NULL
        OR ii.reference_type = ''
        OR ii.reference_id IS NULL
      )
  `);
}

async function rebuildPlanPushedQuantity(knex) {
  await knex.raw(`
    UPDATE production_plans p
    LEFT JOIN (
      SELECT plan_id, COALESCE(SUM(quantity), 0) AS task_qty
      FROM production_tasks
      WHERE deleted_at IS NULL
        AND status <> 'cancelled'
        AND plan_id IS NOT NULL
      GROUP BY plan_id
    ) t ON t.plan_id = p.id
    SET p.pushed_quantity = COALESCE(t.task_qty, 0),
        p.updated_at = NOW()
    WHERE p.deleted_at IS NULL
  `);
}

async function softDeleteE2EOrphanCompletedTasks(knex) {
  const [orphans] = await knex.raw(`
    SELECT t.id, t.code, t.plan_id, t.remarks
    FROM production_tasks t
    WHERE t.deleted_at IS NULL
      AND t.status = 'completed'
      AND (
        t.remarks LIKE '%E2E%'
        OR t.remarks LIKE '%自动测试%'
        OR t.remarks LIKE '%全链路%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM inventory_inbound ii
        WHERE COALESCE(ii.is_deleted, 0) = 0
          AND ii.status IN ('completed', 'confirmed')
          AND ii.inbound_type = 'production'
          AND (
            (ii.reference_type = 'production_task' AND ii.reference_id = t.id)
            OR ii.inspection_id IN (
              SELECT qi.id FROM quality_inspections qi
              WHERE qi.inspection_type = 'final'
                AND qi.deleted_at IS NULL
                AND (qi.reference_id = t.id OR qi.task_id = t.id)
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM inventory_outbound o
        WHERE o.deleted_at IS NULL
          AND o.status IN ('completed', 'partial_completed', 'confirmed')
          AND (
            o.production_task_id = t.id
            OR (o.reference_type = 'production_task' AND o.reference_id = t.id)
            OR (
              o.reference_type = 'batch_production_tasks'
              AND o.source_task_ids LIKE CONCAT('%', t.id, '%')
            )
          )
      )
  `);

  const rows = Array.isArray(orphans) ? orphans : [];
  for (const row of rows) {
    await knex.raw(
      `UPDATE production_tasks
       SET deleted_at = NOW(),
           updated_at = NOW(),
           remarks = CONCAT(
             COALESCE(remarks, ''),
             ' [闭环修复:无库存证据的E2E任务已软删除 ',
             DATE_FORMAT(NOW(), '%Y-%m-%d'),
             ']'
           )
       WHERE id = ? AND deleted_at IS NULL`,
      [row.id]
    );
  }
  return rows;
}

async function resyncPlanStatus(knex, planId) {
  const [statsRows] = await knex.raw(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
       SUM(CASE WHEN status = 'allocated' THEN 1 ELSE 0 END) as allocated_count,
       SUM(CASE WHEN status = 'material_issuing' THEN 1 ELSE 0 END) as material_issuing_count,
       SUM(CASE WHEN status = 'preparing' THEN 1 ELSE 0 END) as preparing_count,
       SUM(CASE WHEN status = 'material_issued' THEN 1 ELSE 0 END) as material_issued_count,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
       SUM(CASE WHEN status = 'inspection' THEN 1 ELSE 0 END) as inspection_count,
       SUM(CASE WHEN status = 'warehousing' THEN 1 ELSE 0 END) as warehousing_count,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count
     FROM production_tasks
     WHERE plan_id = ? AND deleted_at IS NULL`,
    [planId]
  );
  const stats = statsRows[0] || { total: 0 };
  const total = Number(stats.total) || 0;
  const cancelled = Number(stats.cancelled_count) || 0;
  const activeTotal = total - cancelled;

  let newStatus = 'draft';
  if (activeTotal <= 0) {
    newStatus = 'draft';
  } else if (Number(stats.completed_count) === activeTotal) {
    newStatus = 'completed';
  } else if (Number(stats.warehousing_count) > 0) {
    newStatus = 'warehousing';
  } else if (Number(stats.inspection_count) > 0) {
    newStatus = 'inspection';
  } else if (Number(stats.in_progress_count) > 0) {
    newStatus = 'in_progress';
  } else if (Number(stats.material_issued_count) > 0) {
    newStatus = 'material_issued';
  } else if (
    Number(stats.preparing_count) > 0 ||
    Number(stats.material_issuing_count) > 0 ||
    Number(stats.allocated_count) > 0
  ) {
    newStatus = 'preparing';
  } else if (Number(stats.pending_count) === activeTotal) {
    newStatus = 'draft';
  }

  await knex('production_plans')
    .where({ id: planId })
    .whereNull('deleted_at')
    .update({ status: newStatus, updated_at: knex.fn.now() });

  return newStatus;
}

exports.up = async function up(knex) {
  await backfillInboundTaskRefs(knex);
  const orphans = await softDeleteE2EOrphanCompletedTasks(knex);
  await rebuildPlanPushedQuantity(knex);

  const planIds = [...new Set(orphans.map((o) => o.plan_id).filter(Boolean))];
  for (const planId of planIds) {
    await resyncPlanStatus(knex, planId);
  }
};

exports.down = async function down() {
  // 数据修复不可逆
};
