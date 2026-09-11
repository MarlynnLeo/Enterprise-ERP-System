'use strict';

const RoleAccessService = require('../src/services/RoleAccessService');

const FOUNDATION_VIEW_PERMISSIONS = [
  ['basedata:materials:view', '物料查看'],
  ['basedata:locations:view', '库位查看'],
  ['basedata:units:view', '单位查看'],
];

async function ensurePermission(knex, code, name) {
  const existing = await knex('permissions').where({ code }).first('id');
  if (existing) return existing.id;

  const [id] = await knex('permissions').insert({
    code,
    name,
    module: 'basedata',
    status: 1,
    source: 'migration',
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

exports.up = async function up(knex) {
  for (const [code, name] of FOUNDATION_VIEW_PERMISSIONS) {
    await ensurePermission(knex, code, name);
  }
  await RoleAccessService.applyAllWithKnex(knex);
};

exports.down = async function down() {
  // Forward-only access migration. Source document audit must remain available.
};

