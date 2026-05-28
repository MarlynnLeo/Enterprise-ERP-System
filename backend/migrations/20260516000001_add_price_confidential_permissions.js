const PRICE_PERMISSIONS = [
  { parentPermission: 'finance', permission: 'finance:price:view', name: '价格查看', sortOrder: 900 },
  { parentPermission: 'finance', permission: 'finance:price:update', name: '价格维护', sortOrder: 901 },
  { parentPermission: 'finance', permission: 'finance:price:export', name: '价格导出', sortOrder: 902 },
  { parentPermission: 'purchase', permission: 'purchase:price:view', name: '采购价格查看', sortOrder: 900 },
  { parentPermission: 'purchase', permission: 'purchase:price:update', name: '采购价格维护', sortOrder: 901 },
  { parentPermission: 'purchase', permission: 'purchase:price:export', name: '采购价格导出', sortOrder: 902 },
  { parentPermission: 'sales', permission: 'sales:price:view', name: '销售价格查看', sortOrder: 900 },
  { parentPermission: 'sales', permission: 'sales:price:update', name: '销售价格维护', sortOrder: 901 },
  { parentPermission: 'sales', permission: 'sales:price:export', name: '销售价格导出', sortOrder: 902 },
  { parentPermission: 'inventory', permission: 'inventory:value:view', name: '库存金额查看', sortOrder: 900 },
  { parentPermission: 'inventory', permission: 'inventory:value:update', name: '库存金额维护', sortOrder: 901 },
  { parentPermission: 'inventory', permission: 'inventory:value:export', name: '库存金额导出', sortOrder: 902 },
];

async function findParentMenu(trx, parentPermission) {
  return trx('menus')
    .where({ permission: parentPermission })
    .orWhere({ path: `/${parentPermission}` })
    .orderBy('id')
    .first();
}

async function adminRoleIds(trx) {
  const rows = await trx('roles')
    .select('id')
    .where('code', 'admin')
    .orWhere('id', 1);
  return rows.map((row) => row.id);
}

async function grantMenuToAdmins(trx, menuId) {
  const roleIds = await adminRoleIds(trx);
  for (const roleId of roleIds) {
    const exists = await trx('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!exists) {
      await trx('role_menus').insert({
        role_id: roleId,
        menu_id: menuId,
        created_at: trx.fn.now(),
      });
    }
  }
}

async function ensurePermissionMenu(trx, config) {
  const parent = await findParentMenu(trx, config.parentPermission);
  const payload = {
    parent_id: parent?.id || null,
    name: config.name,
    path: '',
    component: '',
    icon: '',
    permission: config.permission,
    type: 2,
    visible: 0,
    status: 1,
    sort_order: config.sortOrder,
    updated_at: trx.fn.now(),
  };

  const existing = await trx('menus').where({ permission: config.permission }).first();
  if (existing) {
    await trx('menus').where({ id: existing.id }).update(payload);
    await grantMenuToAdmins(trx, existing.id);
    return;
  }

  const [id] = await trx('menus').insert({
    ...payload,
    created_at: trx.fn.now(),
  });
  await grantMenuToAdmins(trx, id);
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const config of PRICE_PERMISSIONS) {
      await ensurePermissionMenu(trx, config);
    }
  });
};

exports.down = async function down() {
  // Permission data repair is intentionally retained.
};
