/** Reconcile legacy purchase-order workflows that were bypassed before closure guards existed. */

const MIGRATION_ID = '20260714000015_reconcile_legacy_purchase_order_workflows';

exports.up = async function up(knex) {
  await knex.raw(`
    INSERT INTO workflow_action_logs
      (instance_id, node_id, action, actor_name, from_status, to_status, comment, metadata, created_at)
    SELECT wi.id,
           wi.current_node_id,
           'legacy_reconcile',
           'System migration',
           wi.status,
           CASE
             WHEN po.status = 'cancelled' THEN 'cancelled'
             WHEN po.status = 'draft' THEN 'withdrawn'
             ELSE 'approved'
           END,
           'Reconciled a legacy workflow after the purchase order had already left pending status',
           JSON_OBJECT('migration', ?, 'business_status', po.status),
           NOW()
    FROM workflow_instances wi
    JOIN purchase_orders po ON po.id = wi.business_id
    WHERE wi.business_type = 'purchase_order'
      AND wi.deleted_at IS NULL
      AND wi.status IN ('pending', 'in_progress')
      AND po.status <> 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM workflow_action_logs wal
        WHERE wal.instance_id = wi.id
          AND wal.action = 'legacy_reconcile'
          AND JSON_UNQUOTE(JSON_EXTRACT(wal.metadata, '$.migration')) = ?
      )
  `, [MIGRATION_ID, MIGRATION_ID]);

  await knex.raw(`
    UPDATE workflow_node_approvers wna
    JOIN workflow_instance_nodes win ON win.id = wna.instance_node_id
    JOIN workflow_instances wi ON wi.id = win.instance_id
    JOIN purchase_orders po ON po.id = wi.business_id
    SET wna.status = 'skipped',
        wna.comment = COALESCE(wna.comment, 'Legacy workflow reconciled by system migration'),
        wna.acted_at = COALESCE(wna.acted_at, NOW())
    WHERE wi.business_type = 'purchase_order'
      AND wi.deleted_at IS NULL
      AND wi.status IN ('pending', 'in_progress')
      AND po.status <> 'pending'
      AND wna.status = 'pending'
  `);

  await knex.raw(`
    UPDATE workflow_instance_nodes win
    JOIN workflow_instances wi ON wi.id = win.instance_id
    JOIN purchase_orders po ON po.id = wi.business_id
    SET win.status = 'skipped',
        win.comment = COALESCE(win.comment, 'Legacy workflow reconciled by system migration'),
        win.acted_at = COALESCE(win.acted_at, NOW())
    WHERE wi.business_type = 'purchase_order'
      AND wi.deleted_at IS NULL
      AND wi.status IN ('pending', 'in_progress')
      AND po.status <> 'pending'
      AND win.status IN ('pending', 'in_progress')
  `);

  await knex.raw(`
    UPDATE workflow_instances wi
    JOIN purchase_orders po ON po.id = wi.business_id
    SET wi.status = CASE
          WHEN po.status = 'cancelled' THEN 'cancelled'
          WHEN po.status = 'draft' THEN 'withdrawn'
          ELSE 'approved'
        END,
        wi.current_node_id = NULL,
        wi.result_comment = COALESCE(
          wi.result_comment,
          'Legacy workflow reconciled because the purchase order had already left pending status'
        ),
        wi.completed_at = COALESCE(wi.completed_at, NOW())
    WHERE wi.business_type = 'purchase_order'
      AND wi.deleted_at IS NULL
      AND wi.status IN ('pending', 'in_progress')
      AND po.status <> 'pending'
  `);

  await knex.raw(`
    UPDATE purchase_orders po
    JOIN workflow_instances wi
      ON wi.business_type = 'purchase_order' AND wi.business_id = po.id
    JOIN workflow_action_logs wal
      ON wal.instance_id = wi.id AND wal.action = 'legacy_reconcile'
    SET po.workflow_instance_id = wi.id,
        po.workflow_status = wi.status,
        po.workflow_error = NULL
    WHERE JSON_UNQUOTE(JSON_EXTRACT(wal.metadata, '$.migration')) = ?
  `, [MIGRATION_ID]);
};

exports.down = async function down() {
  // Preserve the repaired terminal state and its audit evidence.
};
