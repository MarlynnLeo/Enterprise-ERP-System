exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('production_plan_materials');
  if (hasTable) {
    const hasGrossRequiredQuantity = await knex.schema.hasColumn(
      'production_plan_materials',
      'gross_required_quantity'
    );
    const hasIssueQuantity = await knex.schema.hasColumn('production_plan_materials', 'issue_quantity');
    const hasShortageQuantity = await knex.schema.hasColumn(
      'production_plan_materials',
      'shortage_quantity'
    );

    await knex.schema.alterTable('production_plan_materials', (table) => {
      if (!hasGrossRequiredQuantity) {
        table.decimal('gross_required_quantity', 18, 6).notNullable().defaultTo(0);
      }
      if (!hasIssueQuantity) {
        table.decimal('issue_quantity', 18, 6).notNullable().defaultTo(0);
      }
      if (!hasShortageQuantity) {
        table.decimal('shortage_quantity', 18, 6).notNullable().defaultTo(0);
      }
    });

    await knex('production_plan_materials')
      .whereRaw('COALESCE(gross_required_quantity, 0) = 0')
      .update({
        gross_required_quantity: knex.raw('COALESCE(required_quantity, 0)'),
        issue_quantity: knex.raw('COALESCE(required_quantity, 0)'),
        shortage_quantity: 0,
      });
  }

  const hasOutboundItemsTable = await knex.schema.hasTable('inventory_outbound_items');
  if (!hasOutboundItemsTable) return;

  const outboundColumns = {
    planned_quantity: await knex.schema.hasColumn('inventory_outbound_items', 'planned_quantity'),
    actual_quantity: await knex.schema.hasColumn('inventory_outbound_items', 'actual_quantity'),
    shortage_quantity: await knex.schema.hasColumn('inventory_outbound_items', 'shortage_quantity'),
    is_shortage: await knex.schema.hasColumn('inventory_outbound_items', 'is_shortage'),
    source_tasks: await knex.schema.hasColumn('inventory_outbound_items', 'source_tasks'),
  };

  await knex.schema.alterTable('inventory_outbound_items', (table) => {
    if (!outboundColumns.planned_quantity) {
      table.decimal('planned_quantity', 18, 6).notNullable().defaultTo(0);
    }
    if (!outboundColumns.actual_quantity) {
      table.decimal('actual_quantity', 18, 6).notNullable().defaultTo(0);
    }
    if (!outboundColumns.shortage_quantity) {
      table.decimal('shortage_quantity', 18, 6).notNullable().defaultTo(0);
    }
    if (!outboundColumns.is_shortage) {
      table.boolean('is_shortage').notNullable().defaultTo(false);
    }
    if (!outboundColumns.source_tasks) {
      table.text('source_tasks').nullable();
    }
  });

  await knex('inventory_outbound_items')
    .whereRaw('COALESCE(planned_quantity, 0) = 0')
    .update({
      planned_quantity: knex.raw('COALESCE(quantity, 0)'),
      actual_quantity: knex.raw(
        'CASE WHEN COALESCE(actual_quantity, 0) = 0 THEN COALESCE(quantity, 0) ELSE actual_quantity END'
      ),
      shortage_quantity: knex.raw('COALESCE(shortage_quantity, 0)'),
      is_shortage: knex.raw('CASE WHEN COALESCE(shortage_quantity, 0) > 0 THEN 1 ELSE 0 END'),
    });
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('production_plan_materials');
  if (hasTable) {
    const hasGrossRequiredQuantity = await knex.schema.hasColumn(
      'production_plan_materials',
      'gross_required_quantity'
    );
    const hasIssueQuantity = await knex.schema.hasColumn('production_plan_materials', 'issue_quantity');
    const hasShortageQuantity = await knex.schema.hasColumn(
      'production_plan_materials',
      'shortage_quantity'
    );

    await knex.schema.alterTable('production_plan_materials', (table) => {
      if (hasShortageQuantity) table.dropColumn('shortage_quantity');
      if (hasIssueQuantity) table.dropColumn('issue_quantity');
      if (hasGrossRequiredQuantity) table.dropColumn('gross_required_quantity');
    });
  }

  const hasOutboundItemsTable = await knex.schema.hasTable('inventory_outbound_items');
  if (!hasOutboundItemsTable) return;

  const outboundColumns = {
    planned_quantity: await knex.schema.hasColumn('inventory_outbound_items', 'planned_quantity'),
    actual_quantity: await knex.schema.hasColumn('inventory_outbound_items', 'actual_quantity'),
    shortage_quantity: await knex.schema.hasColumn('inventory_outbound_items', 'shortage_quantity'),
    is_shortage: await knex.schema.hasColumn('inventory_outbound_items', 'is_shortage'),
    source_tasks: await knex.schema.hasColumn('inventory_outbound_items', 'source_tasks'),
  };

  await knex.schema.alterTable('inventory_outbound_items', (table) => {
    if (outboundColumns.source_tasks) table.dropColumn('source_tasks');
    if (outboundColumns.is_shortage) table.dropColumn('is_shortage');
    if (outboundColumns.shortage_quantity) table.dropColumn('shortage_quantity');
    if (outboundColumns.actual_quantity) table.dropColumn('actual_quantity');
    if (outboundColumns.planned_quantity) table.dropColumn('planned_quantity');
  });
};
