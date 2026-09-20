'use strict';

// Keep old migrations immutable. Add the record fields already exposed by the
// equipment forms and normalize legacy monitoring statuses to the ledger domain.
const canonicalStatuses = ['normal', 'idle', 'maintenance', 'repair', 'scrapped', 'offline'];
const legacyStatuses = ['online', 'running', 'error', 'fault'];

async function assertKnownValues(knex, table, column, known) {
  if (!(await knex.schema.hasTable(table)) || !(await knex.schema.hasColumn(table, column))) return;
  const unknown = await knex(table).distinct(column).whereNotNull(column).whereNotIn(column, known);
  if (unknown.length)
    throw new Error(`Unknown ${table}.${column} values; reconcile before migrating`);
}

async function alignStatus(knex, table, column, nullable, defaultValue = null) {
  if (!(await knex.schema.hasTable(table)) || !(await knex.schema.hasColumn(table, column))) return;
  const known = [...canonicalStatuses, ...legacyStatuses];
  const nullSql = nullable ? 'NULL' : 'NOT NULL';
  const defaultSql = defaultValue ? ` DEFAULT '${defaultValue}'` : nullable ? ' DEFAULT NULL' : '';
  await knex.raw(
    `ALTER TABLE ?? MODIFY COLUMN ?? ENUM(${known.map(() => '?').join(',')}) ${nullSql}${defaultSql}`,
    [table, column, ...known]
  );
  await knex(table)
    .whereIn(column, ['online', 'running'])
    .update({ [column]: 'normal' });
  await knex(table)
    .whereIn(column, ['error', 'fault'])
    .update({ [column]: 'repair' });
  await knex.raw(
    `ALTER TABLE ?? MODIFY COLUMN ?? ENUM(${canonicalStatuses.map(() => '?').join(',')}) ${nullSql}${defaultSql}`,
    [table, column, ...canonicalStatuses]
  );
}

exports.up = async function up(knex) {
  // MySQL DDL auto-commits: check every status domain before the first ALTER.
  for (const [table, column] of [
    ['equipment', 'status'],
    ['equipment_status_history', 'previous_status'],
    ['equipment_status_history', 'current_status'],
  ]) {
    await assertKnownValues(knex, table, column, [...canonicalStatuses, ...legacyStatuses]);
  }
  await assertKnownValues(knex, 'equipment_maintenance', 'status', [
    'planned',
    'pending',
    'in_progress',
    'completed',
  ]);
  await alignStatus(knex, 'equipment', 'status', true, 'normal');
  await alignStatus(knex, 'equipment_status_history', 'previous_status', true);
  await alignStatus(knex, 'equipment_status_history', 'current_status', false);

  if (await knex.schema.hasTable('equipment_maintenance')) {
    for (const [column, type] of [
      ['maintenance_staff', 'string'],
      ['next_maintenance_date', 'date'],
      ['remarks', 'text'],
    ]) {
      if (!(await knex.schema.hasColumn('equipment_maintenance', column))) {
        await knex.schema.alterTable('equipment_maintenance', (table) =>
          table[type](column).nullable()
        );
      }
    }
    if (await knex.schema.hasColumn('equipment_maintenance', 'maintenance_person')) {
      await knex.raw(
        'UPDATE equipment_maintenance SET maintenance_staff = maintenance_person WHERE maintenance_staff IS NULL'
      );
    }
    await knex.raw(
      "ALTER TABLE equipment_maintenance MODIFY COLUMN status ENUM('planned','pending','in_progress','completed') DEFAULT 'pending'"
    );
    await knex('equipment_maintenance').where('status', 'planned').update({ status: 'pending' });
    await knex.raw(
      "ALTER TABLE equipment_maintenance MODIFY COLUMN status ENUM('pending','in_progress','completed') DEFAULT 'pending'"
    );
  }

  if (await knex.schema.hasTable('equipment_inspection')) {
    for (const [column, type] of [
      ['inspection_result', 'string'],
      ['inspection_type', 'string'],
      ['inspection_items', 'text'],
      ['abnormal_items', 'text'],
      ['action_taken', 'text'],
    ]) {
      if (!(await knex.schema.hasColumn('equipment_inspection', column))) {
        await knex.schema.alterTable('equipment_inspection', (table) =>
          table[type](column).nullable()
        );
      }
    }
    if (await knex.schema.hasColumn('equipment_inspection', 'result')) {
      await knex.raw(`UPDATE equipment_inspection SET inspection_result = CASE result
        WHEN 'normal' THEN 'pass' WHEN 'passed' THEN 'pass' WHEN 'abnormal' THEN 'fail'
        WHEN 'failed' THEN 'fail' ELSE result END WHERE inspection_result IS NULL`);
    }
  }

  if (await knex.schema.hasTable('business_types')) {
    const statuses = [
      ['normal', '正常', 'success'],
      ['idle', '闲置', 'info'],
      ['maintenance', '维护中', 'warning'],
      ['repair', '故障维修', 'danger'],
      ['scrapped', '已报废', 'info'],
      ['offline', '离线', 'info'],
    ];
    for (const [index, [code, name, tagType]] of statuses.entries()) {
      const values = {
        name,
        category: 'status',
        tag_type: tagType,
        sort_order: index + 1,
        is_system: 1,
        status: 1,
        updated_at: knex.fn.now(),
      };
      await knex('business_types')
        .insert({
          ...values,
          code,
          group_code: 'equipment_status',
          created_at: knex.fn.now(),
        })
        .onConflict(['group_code', 'code'])
        .merge(values);
    }
    await knex('business_types')
      .where('group_code', 'equipment_status')
      .whereIn('code', legacyStatuses)
      .update({ status: 0 });
  }
};

exports.down = async function down() {
  // Forward-only data normalization. Preserve recorded inspection/maintenance
  // details and status history instead of deleting business data on rollback.
};
