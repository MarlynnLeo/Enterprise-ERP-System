/**
 * 权限加固：
 * 1. inventory_outbound 补 created_by（DataScope 行级）
 * 2. 种子 todo:collaborate / system:audit:export 按钮权限
 */
async function ensureColumn(knex, table, column, builder) {
  const has = await knex.schema.hasColumn(table, column);
  if (!has) {
    await knex.schema.alterTable(table, builder);
  }
}

async function ensureMenu(knex, menu) {
  const existing = await knex('menus').where({ permission: menu.permission }).first();
  if (existing) return existing.id;

  let parentId = null;
  if (menu.parent_permission) {
    const parent = await knex('menus').where({ permission: menu.parent_permission }).first();
    parentId = parent ? parent.id : null;
  }
  if (!parentId) {
    const system = await knex('menus').where({ permission: 'system:users' }).first();
    parentId = system ? system.id : 0;
  }

  const row = {
    parent_id: parentId || 0,
    name: menu.name,
    path: menu.path || '',
    component: menu.component || '',
    permission: menu.permission,
    type: menu.type != null ? menu.type : 2, // 2 = 按钮
    icon: menu.icon || '',
    sort_order: menu.sort_order != null ? menu.sort_order : 999,
    status: 1,
    visible: menu.visible != null ? menu.visible : 0,
  };

  const [id] = await knex('menus').insert(row);
  return id;
}

exports.up = async function up(knex) {
  await ensureColumn(knex, 'inventory_outbound', 'created_by', (t) => {
    t.integer('created_by').nullable().comment('Creator user id for data-scope authorization');
  });

  try {
    await knex.raw(`
      UPDATE inventory_outbound o
      INNER JOIN users u ON BINARY u.username = BINARY o.operator
      SET o.created_by = u.id
      WHERE o.created_by IS NULL
        AND o.operator IS NOT NULL
        AND o.operator <> ''
        AND o.operator <> 'system'
    `);
  } catch (e) {
    console.warn('[20260710000003] backfill inventory_outbound.created_by:', e.message);
  }

  await ensureMenu(knex, {
    name: '协同选人',
    permission: 'todo:collaborate',
    parent_permission: 'system:users',
    type: 2,
    visible: 0,
    sort_order: 910,
  });

  await ensureMenu(knex, {
    name: '审计导出',
    permission: 'system:audit:export',
    parent_permission: 'system:users',
    type: 2,
    visible: 0,
    sort_order: 911,
  });

  // system:workflow:use 多数环境已有；缺失则补
  await ensureMenu(knex, {
    name: '使用工作流',
    permission: 'system:workflow:use',
    parent_permission: 'system:users',
    type: 2,
    visible: 0,
    sort_order: 912,
  });

  const adminRole = await knex('roles').where({ code: 'admin' }).first();
  if (adminRole) {
    const perms = ['todo:collaborate', 'system:audit:export', 'system:workflow:use'];
    for (const permission of perms) {
      const menu = await knex('menus').where({ permission }).first();
      if (!menu) continue;
      const link = await knex('role_menus')
        .where({ role_id: adminRole.id, menu_id: menu.id })
        .first();
      if (!link) {
        await knex('role_menus').insert({
          role_id: adminRole.id,
          menu_id: menu.id,
        });
      }
    }
  }
};

exports.down = async function down(knex) {
  const has = await knex.schema.hasColumn('inventory_outbound', 'created_by');
  if (has) {
    await knex.schema.alterTable('inventory_outbound', (t) => {
      t.dropColumn('created_by');
    });
  }
};
