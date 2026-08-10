/**
 * 幂等：销售/采购角色保证有 basedata:materials:view（可开物料主文件）。
 * 价格字段仍由 sales/purchase 专用权限控制。
 */

const ROLE_CODES = [
  'salesperson',
  'sales_manager',
  'XX',
  'purchase',
  'purchase_manager',
  'purchaser',
];

exports.up = async function up(knex) {
  const menu = await knex('menus').where({ permission: 'basedata:materials:view' }).first();
  if (!menu) return;

  let perm = await knex('permissions').where({ code: 'basedata:materials:view' }).first();
  if (!perm) {
    const [id] = await knex('permissions').insert({
      code: 'basedata:materials:view',
      name: '查看物料',
      module: 'basedata',
      status: 1,
      source: 'migration',
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
    perm = { id };
  }

  const roles = await knex('roles').select('id', 'code').whereIn('code', ROLE_CODES);
  for (const role of roles) {
    const hasMenu = await knex('role_menus').where({ role_id: role.id, menu_id: menu.id }).first();
    if (!hasMenu) {
      await knex('role_menus').insert({
        role_id: role.id,
        menu_id: menu.id,
        created_at: knex.fn.now(),
      });
    }
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
};

exports.down = async function down() {
  // 保留物料查看授权
};
