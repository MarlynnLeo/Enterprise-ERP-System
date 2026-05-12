async function firstMenu(trx, where) {
  return trx('menus').where(where).orderBy('id').first();
}

async function adminRoleIds(trx) {
  const rows = await trx('roles')
    .select('id')
    .where('code', 'admin')
    .orWhere('id', 1)
    .orWhere('name', 'like', '%管理员%');
  return rows.map((row) => row.id);
}

async function roleIdsWithMenu(trx, menuId) {
  if (!menuId) return [];
  const rows = await trx('role_menus').distinct('role_id').where('menu_id', menuId);
  return rows.map((row) => row.role_id);
}

async function grantMenu(trx, menuId, roleIds) {
  for (const roleId of [...new Set(roleIds.filter(Boolean))]) {
    const existing = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!existing) {
      await trx('role_menus').insert({ role_id: roleId, menu_id: menuId, created_at: trx.fn.now() });
    }
  }
}

async function insertMenuByPath(trx, spec) {
  const existing = await firstMenu(trx, { path: spec.path });
  if (existing) return existing.id;

  const [id] = await trx('menus').insert({
    parent_id: spec.parentId,
    name: spec.name,
    path: spec.path,
    component: spec.component || '',
    icon: spec.icon || '',
    permission: spec.permission,
    type: 1,
    visible: 1,
    status: 1,
    sort_order: spec.sort,
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const productionRoot = await firstMenu(trx, { permission: 'production' });
    const qualityRoot = await firstMenu(trx, { permission: 'quality' });
    const adminRoles = await adminRoleIds(trx);

    const productionTask = await firstMenu(trx, { path: '/production/task' });
    if (!productionTask) {
      const overwrittenTask = await firstMenu(trx, { path: '/production/gantt' });
      if (overwrittenTask) {
        await trx('menus').where('id', overwrittenTask.id).update({
          parent_id: productionRoot?.id || overwrittenTask.parent_id,
          name: '生产任务',
          path: '/production/task',
          permission: 'production:tasks',
          type: 1,
          sort_order: 2,
          updated_at: trx.fn.now(),
        });
      }
    }

    const ganttId = await insertMenuByPath(trx, {
      parentId: productionRoot?.id || 0,
      name: '排程甘特图',
      path: '/production/gantt',
      permission: 'production:tasks',
      sort: 90,
    });
    await grantMenu(trx, ganttId, [
      ...(await roleIdsWithMenu(trx, productionRoot?.id)),
      ...adminRoles,
    ]);

    const supplierQuality = await firstMenu(trx, { path: '/quality/supplier-quality' });
    if (!supplierQuality) {
      const overwrittenSupplierQuality = await firstMenu(trx, { path: '/quality/spc' });
      if (overwrittenSupplierQuality) {
        await trx('menus').where('id', overwrittenSupplierQuality.id).update({
          parent_id: qualityRoot?.id || overwrittenSupplierQuality.parent_id,
          name: '供应商质量计分卡',
          path: '/quality/supplier-quality',
          permission: 'quality:reports',
          type: 1,
          sort_order: 14,
          updated_at: trx.fn.now(),
        });
      }
    }

    const spcId = await insertMenuByPath(trx, {
      parentId: qualityRoot?.id || 0,
      name: 'SPC控制图',
      path: '/quality/spc',
      permission: 'quality:reports',
      sort: 15,
    });
    await grantMenu(trx, spcId, [
      ...(await roleIdsWithMenu(trx, qualityRoot?.id)),
      ...adminRoles,
    ]);
  });
};

exports.down = async function down() {
  // Data repair is intentionally not rolled back.
};
