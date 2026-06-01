const permissionSpecs = [
  ['system:print:view', 'system:print', '查看打印管理'],
  ['system:print:create', 'system:print', '新增打印配置'],
  ['system:print:update', 'system:print', '编辑打印配置'],
  ['system:print:delete', 'system:print', '删除打印配置'],
];

const legacyToCanonical = {
  'system:print:add': 'system:print:create',
  'system:print:edit': 'system:print:update',
  'system:print:template:view': 'system:print:view',
  'system:print:template:add': 'system:print:create',
  'system:print:template:edit': 'system:print:update',
  'system:print:template:delete': 'system:print:delete',
};

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const printMenu = await trx('menus').where({ permission: 'system:print' }).first();
    const systemMenu = await trx('menus').where({ permission: 'system' }).first();
    const parentId = printMenu?.id || systemMenu?.id || null;

    for (const [permission, parentPermission, name] of permissionSpecs) {
      const existing = await trx('menus').where({ permission }).first();
      if (existing) continue;

      const parent = await trx('menus').where({ permission: parentPermission }).first();
      await trx('menus').insert({
        parent_id: parent?.id || parentId,
        name,
        path: '',
        component: '',
        permission,
        type: 2,
        icon: '',
        sort_order: 999,
        status: 1,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });
    }

    for (const [legacyPermission, canonicalPermission] of Object.entries(legacyToCanonical)) {
      const legacyMenu = await trx('menus').where({ permission: legacyPermission }).first();
      const canonicalMenu = await trx('menus').where({ permission: canonicalPermission }).first();
      if (!legacyMenu || !canonicalMenu) continue;

      const roleLinks = await trx('role_menus').where({ menu_id: legacyMenu.id }).select('role_id');
      for (const link of roleLinks) {
        const exists = await trx('role_menus')
          .where({ role_id: link.role_id, menu_id: canonicalMenu.id })
          .first();
        if (!exists) {
          await trx('role_menus').insert({
            role_id: link.role_id,
            menu_id: canonicalMenu.id,
            created_at: trx.fn.now(),
          });
        }
      }
    }

    await trx('print_templates')
      .where({ module: 'quality', template_type: 'quality_inspection' })
      .update({
        is_default: 0,
        status: 0,
        updated_at: trx.fn.now(),
      });
  });
};

exports.down = async function down() {
  // Permission normalization is intentionally not reversed to avoid stripping
  // roles that may have been edited after migration.
};
