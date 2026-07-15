/** Harden approval concurrency, multi-approver execution, linkage and audit history. */

const BUSINESS_TABLES = [
  'purchase_orders',
  'purchase_requisitions',
  'contracts',
  'ecn_orders',
  'hr_leave_requests',
  'hr_overtime_requests',
];

async function hasIndex(knex, table, indexName) {
  const [rows] = await knex.raw(
    `SELECT 1 FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, indexName]
  );
  return rows.length > 0;
}

exports.up = async function up(knex) {
  await knex.raw(`
    UPDATE workflow_templates wt
    JOIN (
      SELECT business_type, MAX(id) AS keep_id
      FROM workflow_templates
      WHERE is_active = 1 AND deleted_at IS NULL
      GROUP BY business_type
      HAVING COUNT(*) > 1
    ) d ON d.business_type = wt.business_type
    SET wt.is_active = 0
    WHERE wt.is_active = 1 AND wt.deleted_at IS NULL AND wt.id <> d.keep_id
  `);

  if (await hasIndex(knex, 'workflow_templates', 'code')) {
    await knex.raw('ALTER TABLE workflow_templates DROP INDEX `code`');
  }
  if (!(await hasIndex(knex, 'workflow_templates', 'uk_workflow_template_code_version'))) {
    await knex.raw(`
      ALTER TABLE workflow_templates
      ADD UNIQUE INDEX uk_workflow_template_code_version (code, version)
    `);
  }
  if (!(await knex.schema.hasColumn('workflow_templates', 'active_business_type'))) {
    await knex.raw(`
      ALTER TABLE workflow_templates
      ADD COLUMN active_business_type VARCHAR(50)
        GENERATED ALWAYS AS (
          CASE WHEN is_active = 1 AND deleted_at IS NULL THEN business_type ELSE NULL END
        ) STORED,
      ADD UNIQUE INDEX uk_workflow_template_active_business (active_business_type)
    `);
  }

  await knex.raw(`
    UPDATE workflow_instances wi
    JOIN (
      SELECT business_type, business_id, MAX(id) AS keep_id
      FROM workflow_instances
      WHERE deleted_at IS NULL AND status IN ('pending', 'in_progress')
      GROUP BY business_type, business_id
      HAVING COUNT(*) > 1
    ) d ON d.business_type = wi.business_type AND d.business_id = wi.business_id
    SET wi.status = 'cancelled', wi.completed_at = COALESCE(wi.completed_at, NOW())
    WHERE wi.deleted_at IS NULL
      AND wi.status IN ('pending', 'in_progress')
      AND wi.id <> d.keep_id
  `);
  if (!(await knex.schema.hasColumn('workflow_instances', 'active_business_key'))) {
    await knex.raw(`
      ALTER TABLE workflow_instances
      ADD COLUMN active_business_key VARCHAR(120)
        GENERATED ALWAYS AS (
          CASE
            WHEN deleted_at IS NULL AND status IN ('pending', 'in_progress')
            THEN CONCAT(business_type, ':', business_id)
            ELSE NULL
          END
        ) STORED,
      ADD UNIQUE INDEX uk_workflow_active_business (active_business_key)
    `);
  }

  const nodeColumns = [
    ['approver_type', (table) => table.string('approver_type', 20)],
    ['approver_ids', (table) => table.json('approver_ids')],
    ['multi_approve_type', (table) => table.string('multi_approve_type', 20).notNullable().defaultTo('any')],
    ['allow_self_approval', (table) => table.boolean('allow_self_approval').notNullable().defaultTo(false)],
  ];
  for (const [column, add] of nodeColumns) {
    if (!(await knex.schema.hasColumn('workflow_instance_nodes', column))) {
      await knex.schema.alterTable('workflow_instance_nodes', add);
    }
  }
  if (!(await knex.schema.hasColumn('workflow_template_nodes', 'allow_self_approval'))) {
    await knex.schema.alterTable('workflow_template_nodes', (table) => {
      table.boolean('allow_self_approval').notNullable().defaultTo(false);
    });
  }

  if (!(await knex.schema.hasTable('workflow_node_approvers'))) {
    await knex.schema.createTable('workflow_node_approvers', (table) => {
      table.increments('id').primary();
      table.integer('instance_node_id').notNullable();
      table.integer('approver_id').notNullable();
      table.integer('sequence').notNullable().defaultTo(1);
      table.string('status', 20).notNullable().defaultTo('pending');
      table.text('comment');
      table.timestamp('acted_at');
      table.timestamp('assigned_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['instance_node_id', 'approver_id'], 'uk_workflow_node_approver');
      table.index(['approver_id', 'status'], 'idx_workflow_approver_pending');
      table.foreign('instance_node_id').references('workflow_instance_nodes.id').onDelete('CASCADE');
      table.foreign('approver_id').references('users.id');
    });
  }

  if (!(await knex.schema.hasTable('workflow_action_logs'))) {
    await knex.schema.createTable('workflow_action_logs', (table) => {
      table.bigIncrements('id').primary();
      table.integer('instance_id').notNullable();
      table.integer('node_id');
      table.string('action', 30).notNullable();
      table.integer('actor_id');
      table.string('actor_name', 100);
      table.string('from_status', 30);
      table.string('to_status', 30);
      table.text('comment');
      table.json('metadata');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['instance_id', 'created_at'], 'idx_workflow_action_instance');
      table.index(['actor_id', 'created_at'], 'idx_workflow_action_actor');
      table.foreign('instance_id').references('workflow_instances.id').onDelete('CASCADE');
      table.foreign('node_id').references('workflow_instance_nodes.id').onDelete('SET NULL');
    });
  }

  await knex.raw(`
    UPDATE workflow_instance_nodes win
    JOIN workflow_template_nodes wtn ON wtn.id = win.template_node_id
    SET win.approver_type = wtn.approver_type,
        win.approver_ids = wtn.approver_ids,
        win.multi_approve_type = wtn.multi_approve_type,
        win.allow_self_approval = wtn.allow_self_approval
    WHERE win.node_type = 'approval'
  `);
  await knex.raw(`
    INSERT IGNORE INTO workflow_node_approvers
      (instance_node_id, approver_id, sequence, status, comment, acted_at, assigned_at)
    SELECT id, approver_id, 1,
           CASE status
             WHEN 'approved' THEN 'approved'
             WHEN 'rejected' THEN 'rejected'
             WHEN 'skipped' THEN 'skipped'
             ELSE 'pending'
           END,
           comment, acted_at, created_at
    FROM workflow_instance_nodes
    WHERE node_type = 'approval' AND approver_id IS NOT NULL
  `);

  for (const tableName of BUSINESS_TABLES) {
    if (!(await knex.schema.hasTable(tableName))) continue;
    if (!(await knex.schema.hasColumn(tableName, 'workflow_instance_id'))) {
      await knex.schema.alterTable(tableName, (table) => {
        table.integer('workflow_instance_id').index();
      });
    }
    if (!(await knex.schema.hasColumn(tableName, 'workflow_status'))) {
      await knex.schema.alterTable(tableName, (table) => {
        table.string('workflow_status', 30).notNullable().defaultTo('not_started').index();
      });
    }
    if (!(await knex.schema.hasColumn(tableName, 'workflow_error'))) {
      await knex.schema.alterTable(tableName, (table) => table.text('workflow_error'));
    }
  }

  const links = [
    ['purchase_orders', 'purchase_order'],
    ['purchase_requisitions', 'purchase_requisition'],
    ['contracts', 'contract'],
    ['ecn_orders', 'ecn'],
    ['hr_leave_requests', 'hr_leave'],
    ['hr_overtime_requests', 'hr_overtime'],
  ];
  for (const [tableName, businessType] of links) {
    await knex.raw(`
      UPDATE \`${tableName}\` b
      JOIN workflow_instances wi ON wi.id = (
        SELECT latest.id FROM workflow_instances latest
        WHERE latest.business_type = ? AND latest.business_id = b.id AND latest.deleted_at IS NULL
        ORDER BY latest.id DESC LIMIT 1
      )
      SET b.workflow_instance_id = wi.id,
          b.workflow_status = wi.status,
          b.workflow_error = NULL
    `, [businessType]);
  }
};

exports.down = async function down() {
  // Preserve approval evidence, business links and concurrency constraints.
};
