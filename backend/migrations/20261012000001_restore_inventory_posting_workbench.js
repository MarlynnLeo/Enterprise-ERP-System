'use strict';

const { getProfile, permissionAllowed } = require('../src/authorization/roleAccessProfiles');

const MENU_PATH = '/finance/inventory-postings';
const LEGACY_PATH = '/finance/inventory-posting';
const ACCESS = [
  ['finance:inventory:view', '查看存货过账', null],
  ['finance:inventory:approve', '审核存货过账', 901],
  ['finance:inventory:reverse', '申请存货冲销', 902],
];

exports.up = async function up(knex) {
  const finance = await knex('menus').where({ path: '/finance' }).first('id');
  if (!finance) throw new Error('存货过账工作台迁移缺少财务根菜单');

  const permissionIds = new Map();
  for (const [code, name] of ACCESS) {
    let permission = await knex('permissions').where({ code }).first('id');
    if (!permission) {
      const [id] = await knex('permissions').insert({
        code, name, module: 'finance', status: 1, source: 'migration',
        created_at: knex.fn.now(), updated_at: knex.fn.now(),
      });
      permission = { id };
    } else {
      await knex('permissions').where({ id: permission.id }).update({ status: 1, updated_at: knex.fn.now() });
    }
    permissionIds.set(code, permission.id);
  }

  const legacy = await knex('menus').where({ path: LEGACY_PATH }).first('id');
  let menu = await knex('menus').where({ path: MENU_PATH }).first('id');
  const values = {
    parent_id: finance.id, name: '存货过账审核', path: MENU_PATH,
    component: 'finance/InventoryPostings', icon: 'Stamp',
    permission: ACCESS[0][0], permission_id: permissionIds.get(ACCESS[0][0]),
    type: 1, visible: 1, status: 1, sort_order: 18, updated_at: knex.fn.now(),
  };
  if (!menu && legacy) menu = legacy;
  if (menu) await knex('menus').where({ id: menu.id }).update(values);
  else {
    const [id] = await knex('menus').insert({ ...values, created_at: knex.fn.now() });
    menu = { id };
  }

  // Preserve existing navigation grants and action identities if both versions existed.
  if (legacy && legacy.id !== menu.id) {
    const grants = await knex('role_menus').where({ menu_id: legacy.id }).select('role_id');
    for (const grant of grants) {
      await knex('role_menus').insert({ role_id: grant.role_id, menu_id: menu.id })
        .onConflict(['role_id', 'menu_id']).ignore();
    }
    await knex('menus').where({ parent_id: legacy.id }).update({ parent_id: menu.id });
    await knex('role_menus').where({ menu_id: legacy.id }).del();
    await knex('menus').where({ id: legacy.id }).del();
  }

  const menuIds = new Map([[ACCESS[0][0], menu.id]]);
  for (const [permission, name, sortOrder] of ACCESS.slice(1)) {
    let action = await knex('menus').where({ permission, type: 2 }).first('id');
    const actionValues = {
      parent_id: menu.id, name, path: '', component: '', icon: '', permission,
      permission_id: permissionIds.get(permission), type: 2, visible: 1,
      status: 1, sort_order: sortOrder, updated_at: knex.fn.now(),
    };
    if (action) await knex('menus').where({ id: action.id }).update(actionValues);
    else {
      const [id] = await knex('menus').insert({ ...actionValues, created_at: knex.fn.now() });
      action = { id };
    }
    menuIds.set(permission, action.id);
  }

  // Limit synchronization to this workbench; preserve unrelated and custom role grants.
  const roles = await knex('roles').select('id', 'code', 'is_super_admin');
  for (const role of roles) {
    const profile = getProfile(role.code);
    const superAdmin = Number(role.is_super_admin) === 1 || ['admin', 'system_admin'].includes(role.code);
    const existing = await knex('role_permissions').where({ role_id: role.id }).select('permission_id');
    const granted = new Set(existing.map(row => Number(row.permission_id)));
    const allowedCodes = new Set(ACCESS.map(([code]) => code).filter(code =>
      superAdmin || granted.has(Number(permissionIds.get(code))) || (profile && permissionAllowed(code, profile))
    ));
    if (allowedCodes.size) allowedCodes.add(ACCESS[0][0]);
    for (const code of allowedCodes) {
      const permissionId = permissionIds.get(code);
      await knex('role_permissions').insert({ role_id: role.id, permission_id: permissionId, created_at: knex.fn.now() })
        .onConflict(['role_id', 'permission_id']).ignore();
      for (const menuId of [finance.id, menu.id, menuIds.get(code)]) {
        await knex('role_menus').insert({ role_id: role.id, menu_id: menuId })
          .onConflict(['role_id', 'menu_id']).ignore();
      }
    }
  }
};

exports.down = async function down() {
  // Forward-only navigation consolidation; approval evidence and grants remain available.
};
