'use strict';

const RoleAccessService = require('../src/services/RoleAccessService');

async function ensurePermission(knex, code, name) {
  const existing = await knex('permissions').where({ code }).first('id');
  if (existing) return existing.id;
  const [id] = await knex('permissions').insert({
    code,
    name,
    module: 'finance',
    status: 1,
    source: 'migration',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('menus'))) return;

  const financeRoot = await knex('menus').where({ path: '/finance' }).first('id');
  if (!financeRoot) return;

  const permissionId = await ensurePermission(knex, 'finance:salary:approve', '工资财务审核');
  const values = {
    parent_id: financeRoot.id,
    name: '工资审核',
    path: '/finance/salary-approval',
    component: 'hr/Salary',
    icon: 'icon-money',
    permission: 'finance:salary:approve',
    permission_id: permissionId,
    type: 1,
    visible: 1,
    status: 1,
    sort_order: 87,
    updated_at: knex.fn.now(),
  };

  const existing = await knex('menus').where({ path: values.path }).first('id');
  if (existing) {
    await knex('menus').where({ id: existing.id }).update(values);
  } else {
    await knex('menus').insert({ ...values, created_at: knex.fn.now() });
  }

  await RoleAccessService.applyAllWithKnex(knex);
};

exports.down = async function down() {
  // Approval evidence and the navigation entry are retained for audit history.
};
