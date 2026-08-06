/**
 * 新增「应收待结算 / 应付待结算」独立菜单
 * 从发票列表页拆出结算明细看板
 */

const MENUS = [
  {
    id: 941,
    name: '应收待结算',
    path: '/finance/ar/settlement',
    component: 'finance/ar/Settlement',
    permission: 'finance:ar:view',
    icon: 'DataLine',
    sort_order: 41,
    // 挂在「应收管理/销售发票」同级：优先找 ar invoices 父级
    anchor_path: '/finance/ar/invoices',
    fallback_parent_path: '/finance',
  },
  {
    id: 951,
    name: '应付待结算',
    path: '/finance/ap/settlement',
    component: 'finance/ap/Settlement',
    permission: 'finance:ap:view',
    icon: 'DataLine',
    sort_order: 51,
    anchor_path: '/finance/ap/invoices',
    fallback_parent_path: '/finance',
  },
];

async function resolveParentId(trx, menu) {
  const anchor = await trx('menus').where('path', menu.anchor_path).first();
  if (anchor?.parent_id) return anchor.parent_id;
  if (anchor?.id) return anchor.parent_id || anchor.id;

  const finance = await trx('menus').where('path', menu.fallback_parent_path).first();
  return finance?.id || null;
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    for (const menu of MENUS) {
      const exists = await trx('menus')
        .where('path', menu.path)
        .orWhere({ id: menu.id })
        .first();

      const parentId = await resolveParentId(trx, menu);
      if (!parentId) continue;

      let menuId;
      if (exists) {
        await trx('menus')
          .where('id', exists.id)
          .update({
            name: menu.name,
            path: menu.path,
            component: menu.component,
            permission: menu.permission,
            icon: menu.icon,
            parent_id: parentId,
            type: 1,
            visible: 1,
            status: 1,
            sort_order: menu.sort_order,
            updated_at: trx.fn.now(),
          });
        menuId = exists.id;
      } else {
        const insertRow = {
          id: menu.id,
          parent_id: parentId,
          name: menu.name,
          path: menu.path,
          component: menu.component,
          permission: menu.permission,
          icon: menu.icon,
          type: 1,
          visible: 1,
          status: 1,
          sort_order: menu.sort_order,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        };
        // 某些库 id 自增，尝试固定 id；失败则不传 id
        try {
          await trx('menus').insert(insertRow);
          menuId = menu.id;
        } catch {
          delete insertRow.id;
          const [id] = await trx('menus').insert(insertRow);
          menuId = id;
        }
      }

      // 给 admin 角色挂菜单
      const adminRole = await trx('roles')
        .where('code', 'admin')
        .orWhere('name', '管理员')
        .orWhere('name', '超级管理员')
        .first();
      if (adminRole && menuId) {
        const link = await trx('role_menus')
          .where({ role_id: adminRole.id, menu_id: menuId })
          .first();
        if (!link) {
          await trx('role_menus').insert({
            role_id: adminRole.id,
            menu_id: menuId,
            created_at: trx.fn.now(),
          });
        }
      }

      // 绑定 permissions SSOT：permission_id + role_permissions（幂等）
      if (menuId && menu.permission) {
        let perm = await trx('permissions').where({ code: menu.permission }).first();
        if (!perm) {
          const moduleName = String(menu.permission).split(':')[0] || menu.permission;
          const [permId] = await trx('permissions').insert({
            code: menu.permission,
            name: menu.name || menu.permission,
            module: moduleName,
            status: 1,
            source: 'menu',
            created_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
          perm = { id: permId };
        }
        await trx('menus').where({ id: menuId }).update({
          permission_id: perm.id,
          updated_at: trx.fn.now(),
        });
        if (adminRole) {
          const rp = await trx('role_permissions')
            .where({ role_id: adminRole.id, permission_id: perm.id })
            .first();
          if (!rp) {
            await trx('role_permissions').insert({
              role_id: adminRole.id,
              permission_id: perm.id,
              created_at: trx.fn.now(),
            });
          }
        }
      }
    }
  });
};

exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    for (const menu of MENUS) {
      const row = await trx('menus').where('path', menu.path).orWhere({ id: menu.id }).first();
      if (!row) continue;
      await trx('role_menus').where('menu_id', row.id).del();
      await trx('menus').where('id', row.id).del();
    }
  });
};
