/**
 * 权限收口：出库/质检等业务操作角色不可查看物料采购价/销售价/成本金额。
 *
 * 背景：
 * - desensitizer 中任一 PRICE_VIEW 权限即可解锁全部敏感金额字段
 * - 库存操作员、质检员等角色被批量挂上 finance:cost:view / finance:pricing:view，
 *   导致物料主文件采购价对出库/质检可见
 *
 * 本迁移（仅改 role_menus / role_permissions，可回滚策略见 down）：
 * 1. 从受限角色剥离价格/金额/成本/定价相关菜单
 * 2. 保证受限角色仍有 basedata:materials:view（查看物料主数据，不含价格）
 * 3. 给采购/销售/财务等需要看价的角色补齐专用价格查看菜单
 * 4. 按剩余菜单重同步 role_permissions
 */

/** 禁止查看价格/金额的操作类角色 */
const PRICE_RESTRICTED_ROLE_CODES = [
  'inventory_operator',
  'inventory_manager',
  'quality_inspector',
  'quality_manager',
  '100001', // 品质部
  'production_operator',
  'production_manager',
  'employee',
  'user',
];

/** 会解锁 desensitizer 的权限码（及同族维护/导出） */
const PRICE_SENSITIVE_PERMISSIONS = [
  'finance:price:view',
  'finance:price:update',
  'finance:price:export',
  'finance:pricing:view',
  'finance:pricing:create',
  'finance:pricing:update',
  'finance:pricing:delete',
  'finance:pricing:export',
  'finance:cost:view',
  'finance:cost:update',
  'finance:cost:export',
  'purchase:price:view',
  'purchase:price:update',
  'purchase:price:export',
  'sales:price:view',
  'sales:price:update',
  'sales:price:export',
  'inventory:value:view',
  'inventory:value:update',
  'inventory:value:export',
  'basedata:materials:view_price',
  'basedata:materials:view_cost',
];

const GRANT_PURCHASE_PRICE_VIEW = ['purchase', 'purchase_manager', 'purchaser', 'admin', 'finance_manager', 'accountant'];
const GRANT_SALES_PRICE_VIEW = ['XX', 'sales_manager', 'salesperson', 'admin', 'finance_manager', 'accountant'];
const GRANT_FINANCE_PRICE_VIEW = ['finance_manager', 'accountant', 'admin'];

async function loadRoleIds(knex, codes) {
  return knex('roles').select('id', 'code').whereIn('code', codes);
}

async function ensurePermissionRow(knex, code, name) {
  const existing = await knex('permissions').where({ code }).first();
  if (existing) return existing.id;
  const moduleName = String(code).split(':')[0] || null;
  const [id] = await knex('permissions').insert({
    code,
    name: name || code,
    module: moduleName,
    status: 1,
    source: 'migration',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

async function ensureMenuByPermission(knex, permission, defaults = {}) {
  const existing = await knex('menus').where({ permission }).first();
  if (existing) {
    // 绑定 permission_id
    const pid = await ensurePermissionRow(knex, permission, defaults.name || existing.name);
    if (!existing.permission_id || Number(existing.permission_id) !== Number(pid)) {
      await knex('menus').where({ id: existing.id }).update({ permission_id: pid, updated_at: knex.fn.now() });
    }
    return existing.id;
  }

  const parentPermission = defaults.parentPermission || permission.split(':')[0];
  const parent = await knex('menus').where({ permission: parentPermission }).orderBy('id').first();
  const pid = await ensurePermissionRow(knex, permission, defaults.name || permission);

  const [id] = await knex('menus').insert({
    parent_id: parent?.id || null,
    name: defaults.name || permission,
    path: '',
    component: '',
    icon: '',
    permission,
    permission_id: pid,
    type: 2,
    visible: 0,
    status: 1,
    sort_order: defaults.sortOrder || 900,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

async function grantMenuToRoles(knex, roleIds, menuId) {
  for (const roleId of roleIds) {
    const exists = await knex('role_menus').where({ role_id: roleId, menu_id: menuId }).first();
    if (!exists) {
      await knex('role_menus').insert({
        role_id: roleId,
        menu_id: menuId,
        created_at: knex.fn.now(),
      });
    }
  }
}

/**
 * 按 role_menus 重建 role_permissions（与 PermissionRegistry 语义一致）
 */
async function resyncRolePermissionsFromMenus(knex, roleId) {
  await knex('role_permissions').where({ role_id: roleId }).del();

  // 兼容 menus.permission / permissions.code 不同 collation
  await knex.raw(
    `
    INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
    SELECT DISTINCT ?, COALESCE(m.permission_id, p.id), NOW()
    FROM role_menus rm
    JOIN menus m ON m.id = rm.menu_id
    LEFT JOIN permissions p
      ON p.code COLLATE utf8mb4_unicode_ci = m.permission COLLATE utf8mb4_unicode_ci
     AND p.status = 1
    WHERE rm.role_id = ?
      AND m.permission IS NOT NULL
      AND m.permission <> ''
      AND COALESCE(m.permission_id, p.id) IS NOT NULL
    `,
    [roleId, roleId]
  );
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const materialsViewMenuId = await ensureMenuByPermission(trx, 'basedata:materials:view', {
      name: '查看物料',
      parentPermission: 'basedata:materials',
      sortOrder: 1,
    });
    const purchasePriceViewMenuId = await ensureMenuByPermission(trx, 'purchase:price:view', {
      name: '采购价格查看',
      parentPermission: 'purchase',
      sortOrder: 900,
    });
    const salesPriceViewMenuId = await ensureMenuByPermission(trx, 'sales:price:view', {
      name: '销售价格查看',
      parentPermission: 'sales',
      sortOrder: 900,
    });
    const financePriceViewMenuId = await ensureMenuByPermission(trx, 'finance:price:view', {
      name: '价格查看',
      parentPermission: 'finance',
      sortOrder: 900,
    });

    const restrictedRoles = await loadRoleIds(trx, PRICE_RESTRICTED_ROLE_CODES);
    if (restrictedRoles.length) {
      const sensitiveMenus = await trx('menus').select('id').whereIn('permission', PRICE_SENSITIVE_PERMISSIONS);
      const sensitiveMenuIds = sensitiveMenus.map((m) => m.id);
      if (sensitiveMenuIds.length) {
        await trx('role_menus')
          .whereIn(
            'role_id',
            restrictedRoles.map((r) => r.id)
          )
          .whereIn('menu_id', sensitiveMenuIds)
          .del();
      }
      await grantMenuToRoles(
        trx,
        restrictedRoles.map((r) => r.id),
        materialsViewMenuId
      );
    }

    const purchaseRoles = await loadRoleIds(trx, GRANT_PURCHASE_PRICE_VIEW);
    await grantMenuToRoles(
      trx,
      purchaseRoles.map((r) => r.id),
      purchasePriceViewMenuId
    );

    const salesRoles = await loadRoleIds(trx, GRANT_SALES_PRICE_VIEW);
    await grantMenuToRoles(
      trx,
      salesRoles.map((r) => r.id),
      salesPriceViewMenuId
    );

    const financeRoles = await loadRoleIds(trx, GRANT_FINANCE_PRICE_VIEW);
    await grantMenuToRoles(
      trx,
      financeRoles.map((r) => r.id),
      financePriceViewMenuId
    );

    const affectedCodes = [
      ...new Set([
        ...PRICE_RESTRICTED_ROLE_CODES,
        ...GRANT_PURCHASE_PRICE_VIEW,
        ...GRANT_SALES_PRICE_VIEW,
        ...GRANT_FINANCE_PRICE_VIEW,
      ]),
    ];
    const affected = await loadRoleIds(trx, affectedCodes);
    for (const role of affected) {
      await resyncRolePermissionsFromMenus(trx, role.id);
    }
  });
};

exports.down = async function down() {
  // 不自动把成本/定价菜单重新铺给出库/质检，避免回滚再次泄露价格。
  console.warn(
    '[20260808000001] down: 不自动恢复受限角色的成本/价格菜单，请在系统管理→角色权限中人工调整。'
  );
};
