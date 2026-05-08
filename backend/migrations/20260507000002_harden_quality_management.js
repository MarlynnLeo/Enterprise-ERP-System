/**
 * Harden quality-management closure and permission metadata.
 */

async function addColumnIfMissing(knex, table, column, definition) {
  const exists = await knex.schema.hasTable(table);
  if (!exists) return;
  const hasColumn = await knex.schema.hasColumn(table, column);
  if (!hasColumn) {
    await knex.raw(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

async function addIndexIfMissing(knex, table, indexName, columns) {
  const [rows] = await knex.raw(
    `SELECT COUNT(1) AS count
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [table, indexName]
  );

  if (Number(rows[0]?.count || 0) === 0) {
    await knex.raw(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${columns})`);
  }
}

async function findMenuId(knex, permission) {
  const row = await knex('menus').where({ permission }).orderBy('id', 'asc').first('id');
  return row?.id || null;
}

async function upsertMenu(knex, data) {
  const lookup = data.path
    ? { path: data.path, type: data.type }
    : { permission: data.permission, type: data.type };
  const existing = await knex('menus').where(lookup).first('id');
  if (existing) {
    await knex('menus').where({ id: existing.id }).update({
      parent_id: data.parent_id,
      name: data.name,
      path: data.path || null,
      component: data.component || null,
      icon: data.icon || null,
      visible: data.visible ?? 1,
      status: data.status ?? 1,
      sort_order: data.sort_order ?? 0,
      updated_at: knex.fn.now(),
    });
    return existing.id;
  }

  const [id] = await knex('menus').insert({
    parent_id: data.parent_id,
    name: data.name,
    path: data.path || null,
    component: data.component || null,
    icon: data.icon || null,
    permission: data.permission,
    type: data.type,
    visible: data.visible ?? 1,
    status: data.status ?? 1,
    sort_order: data.sort_order ?? 0,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  await addColumnIfMissing(
    knex,
    'nonconforming_products',
    'deleted_at',
    '`deleted_at` TIMESTAMP NULL COMMENT \'软删除标记\''
  );
  await addIndexIfMissing(
    knex,
    'nonconforming_products',
    'idx_ncp_deleted_status',
    '`deleted_at`, `status`'
  );

  const qualityRootId = await findMenuId(knex, 'quality');
  if (qualityRootId) {
    await upsertMenu(knex, {
      parent_id: qualityRootId,
      name: 'AQL标准',
      path: '/quality/aql-standards',
      component: 'quality/AQLStandards',
      icon: 'icon-setting',
      permission: 'quality:settings',
      type: 1,
      sort_order: 11,
    });
    await upsertMenu(knex, {
      parent_id: qualityRootId,
      name: '量具管理',
      path: '/quality/gauges',
      component: 'quality/GaugeManagement',
      icon: 'icon-odometer',
      permission: 'quality:settings',
      type: 1,
      sort_order: 12,
    });
    await upsertMenu(knex, {
      parent_id: qualityRootId,
      name: 'SPC控制图',
      path: '/quality/spc',
      component: 'quality/SPCControlChart',
      icon: 'icon-data-line',
      permission: 'quality:reports',
      type: 1,
      sort_order: 13,
    });
    await upsertMenu(knex, {
      parent_id: qualityRootId,
      name: '供应商质量计分卡',
      path: '/quality/supplier-quality',
      component: 'quality/SupplierQualityScorecard',
      icon: 'icon-trophy',
      permission: 'quality:reports',
      type: 1,
      sort_order: 14,
    });
  }

  const qualityStatsId = await findMenuId(knex, 'quality:statistics');
  if (qualityStatsId) {
    await upsertMenu(knex, {
      parent_id: qualityStatsId,
      name: '生成质量报表',
      path: null,
      component: null,
      icon: 'icon-refresh',
      permission: 'quality:reports:update',
      type: 2,
      sort_order: 20,
    });
  }
};

exports.down = async function down(knex) {
  await knex('menus')
    .whereIn('permission', ['quality:reports:update'])
    .andWhere({ type: 2 })
    .delete();
};
