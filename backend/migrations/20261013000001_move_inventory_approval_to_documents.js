'use strict';

const RETIRED_PATHS = ['/finance/inventory-posting', '/finance/inventory-postings'];
const ACTIONS = [
  ['finance:inventory:view', '查看存货审核记录', 900],
  ['finance:inventory:approve', '审核存货过账', 901],
  ['finance:inventory:reverse', '申请存货冲销', 902],
];

exports.up = async function up(knex) {
  const finance = await knex('menus').where({ path: '/finance' }).first('id');
  if (!finance) throw new Error('页内存货审核迁移缺少财务根菜单');

  const menus = await knex('menus').select('id', 'path', 'type', 'permission', 'parent_id');
  const retired = menus.filter(menu => RETIRED_PATHS.includes(menu.path));
  const actions = new Map();

  for (const [code, name, sortOrder] of ACTIONS) {
    let permission = await knex('permissions').where({ code }).first('id');
    if (!permission) {
      const [id] = await knex('permissions').insert({
        code, name, module: 'finance', status: 1, source: 'migration',
        created_at: knex.fn.now(), updated_at: knex.fn.now(),
      });
      permission = { id };
    }
    // Reuse the old view menu identity so custom role assignments survive.
    let action = menus.find(menu => Number(menu.type) === 2 && menu.permission === code);
    if (!action && code === ACTIONS[0][0]) {
      action = retired.find(menu => menu.path === RETIRED_PATHS[1]) || retired[0];
    }
    const values = {
      parent_id: finance.id, name, path: '', component: '', icon: '',
      permission: code, permission_id: permission.id, type: 2,
      visible: 1, status: 1, sort_order: sortOrder, updated_at: knex.fn.now(),
    };
    if (action) await knex('menus').where({ id: action.id }).update(values);
    else {
      const [id] = await knex('menus').insert({ ...values, created_at: knex.fn.now() });
      action = { id };
    }
    actions.set(code, action.id);

    // Navigation identities follow existing permissions; no new role permission
    // is granted just because the user could open the retired page.
    const grants = await knex('role_permissions').where({ permission_id: permission.id }).select('role_id');
    for (const grant of grants) {
      await knex('role_menus').insert({ role_id: grant.role_id, menu_id: action.id })
        .onConflict(['role_id', 'menu_id']).ignore();
    }
  }

  const viewId = actions.get(ACTIONS[0][0]);
  for (const menu of retired) {
    // Preserve custom children alongside the three managed finance actions.
    await knex('menus').where({ parent_id: menu.id }).update({ parent_id: finance.id });
    if (menu.id === viewId) continue;
    const grants = await knex('role_menus').where({ menu_id: menu.id }).select('role_id');
    for (const grant of grants) {
      await knex('role_menus').insert({ role_id: grant.role_id, menu_id: viewId })
        .onConflict(['role_id', 'menu_id']).ignore();
    }
    await knex('role_menus').where({ menu_id: menu.id }).del();
    await knex('menus').where({ id: menu.id }).del();
  }
};

exports.down = async function down() {
  // Navigation-only forward migration. Do not resurrect a removed page or
  // revoke the permissions used by approval panels in business documents.
};
