/**
 * Add executable permission for finance automation actions.
 *
 * The finance automation page already separates read access
 * (finance:automation:view) from side-effect actions. This migration makes
 * finance:automation:execute assignable through the menu permission tree.
 */

const PERMISSION_CODE = 'finance:automation:execute';

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const automationMenu = await trx('menus')
      .where('path', '/finance/automation')
      .orWhere('permission', 'finance:automation:view')
      .orWhere('permission', 'finance:automation:manage')
      .orderByRaw("CASE WHEN path = '/finance/automation' THEN 0 ELSE 1 END")
      .first();

    if (!automationMenu) {
      return;
    }

    let executeMenu = await trx('menus').where('permission', PERMISSION_CODE).first();

    if (!executeMenu) {
      const [insertId] = await trx('menus').insert({
        parent_id: automationMenu.id,
        name: '执行',
        path: null,
        component: null,
        redirect: null,
        icon: null,
        permission: PERMISSION_CODE,
        type: 2,
        visible: 0,
        status: 1,
        sort_order: 10,
        created_at: trx.fn.now(),
        updated_at: trx.fn.now(),
      });

      executeMenu = { id: insertId };
    }

    const adminRole = await trx('roles')
      .where('code', 'admin')
      .orWhere('name', '管理员')
      .orWhere('name', '超级管理员')
      .first();

    if (adminRole) {
      const existingRoleMenu = await trx('role_menus')
        .where({ role_id: adminRole.id, menu_id: executeMenu.id })
        .first();

      if (!existingRoleMenu) {
        await trx('role_menus').insert({
          role_id: adminRole.id,
          menu_id: executeMenu.id,
          created_at: trx.fn.now(),
        });
      }
    }
  });
};

exports.down = async function down(knex) {
  const row = await knex('menus').where('permission', PERMISSION_CODE).first();
  if (!row) {
    return;
  }

  await knex.transaction(async (trx) => {
    await trx('role_menus').where('menu_id', row.id).del();
    await trx('menus').where('id', row.id).del();
  });
};
