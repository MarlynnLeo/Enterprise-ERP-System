/**
 * 销售角色不应持有 finance:cost:view（会解锁采购成本字段）。
 * 保留 sales:price:view / finance:pricing:view。
 * 采购角色剥离 finance:pricing:view（产品定价偏销售侧），保留 purchase:price:view。
 */

const SALES_ROLE_CODES = ['salesperson', 'sales_manager', 'XX'];
const PURCHASE_ROLE_CODES = ['purchase', 'purchase_manager', 'purchaser'];

const STRIP_FROM_SALES = [
  'finance:cost:view',
  'finance:cost:update',
  'finance:cost:export',
  'purchase:price:view',
  'purchase:price:update',
  'purchase:price:export',
  'basedata:materials:view_cost',
  'inventory:value:view',
  'inventory:value:update',
  'inventory:value:export',
];

const STRIP_FROM_PURCHASE = [
  'finance:pricing:view',
  'finance:pricing:create',
  'finance:pricing:update',
  'finance:pricing:delete',
  'finance:pricing:export',
  'sales:price:view',
  'sales:price:update',
  'sales:price:export',
  'basedata:materials:view_price',
];

async function stripMenusAndResync(knex, roleCodes, permissions) {
  const roles = await knex('roles').select('id', 'code').whereIn('code', roleCodes);
  if (!roles.length) return;

  const menus = await knex('menus').select('id').whereIn('permission', permissions);
  const menuIds = menus.map((m) => m.id);
  if (menuIds.length) {
    await knex('role_menus')
      .whereIn(
        'role_id',
        roles.map((r) => r.id)
      )
      .whereIn('menu_id', menuIds)
      .del();
  }

  for (const role of roles) {
    await knex('role_permissions').where({ role_id: role.id }).del();
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
      [role.id, role.id]
    );
  }
}

async function ensureMaterialsView(knex, roleCodes) {
  const menu = await knex('menus').where({ permission: 'basedata:materials:view' }).first();
  if (!menu) return;
  const roles = await knex('roles').select('id', 'code').whereIn('code', roleCodes);
  const perm = await knex('permissions').where({ code: 'basedata:materials:view' }).first();
  for (const role of roles) {
    const hasMenu = await knex('role_menus').where({ role_id: role.id, menu_id: menu.id }).first();
    if (!hasMenu) {
      await knex('role_menus').insert({
        role_id: role.id,
        menu_id: menu.id,
        created_at: knex.fn.now(),
      });
    }
    if (perm) {
      const hasPerm = await knex('role_permissions')
        .where({ role_id: role.id, permission_id: perm.id })
        .first();
      if (!hasPerm) {
        await knex('role_permissions').insert({
          role_id: role.id,
          permission_id: perm.id,
          created_at: knex.fn.now(),
        });
      }
    }
  }
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    await stripMenusAndResync(trx, SALES_ROLE_CODES, STRIP_FROM_SALES);
    await stripMenusAndResync(trx, PURCHASE_ROLE_CODES, STRIP_FROM_PURCHASE);
    // 销售需要能打开物料主文件查看（销售价可见、采购成本仍脱敏）
    await ensureMaterialsView(trx, SALES_ROLE_CODES);
    // 采购同样保证物料查看
    await ensureMaterialsView(trx, PURCHASE_ROLE_CODES);
  });
};

exports.down = async function down() {
  console.warn('[20260808000002] down: 不自动恢复销售/采购角色的交叉价格菜单');
};
