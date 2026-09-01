'use strict';

/**
 * 注册 lookup:read（跨模块只读查找权限）。
 *
 * 背景：用户/部门/财务往来单位等下拉选项接口原先复用 'dashboard' 做权限码。
 * dashboard 在 roleAccessProfiles.COMMON_PERMISSIONS 里，每个受管角色都有，
 * 所以这些端点实际是「已登录即可读」——但从路由上看像是首页看板权限，
 * 审计时看不出真实授权面。
 *
 * 这里把语义显式化：注册 lookup:read 并下发给所有启用中的角色。
 * 授权面与改动前完全一致（原本人人可读，现在仍然人人可读），
 * 只是权限码不再借用 dashboard。lookupPermissions.js 仍同时接受 dashboard，
 * 因此本迁移未执行、或角色尚未回填时不会断权。
 */

const PERMISSION_CODE = 'lookup:read';
const PERMISSION_NAME = '跨模块只读查找';
const PERMISSION_DESCRIPTION =
  '用户/部门/往来单位等下拉选项与字典的只读访问；等价于已登录可读，勿用于敏感字段接口';

async function ensurePermissionRow(trx) {
  const existing = await trx('permissions').where({ code: PERMISSION_CODE }).first();
  if (existing) {
    if (Number(existing.status) !== 1) {
      await trx('permissions')
        .where({ id: existing.id })
        .update({ status: 1, updated_at: trx.fn.now() });
    }
    return existing.id;
  }

  const insert = {
    code: PERMISSION_CODE,
    name: PERMISSION_NAME,
    module: 'common',
    status: 1,
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  };
  if (await trx.schema.hasColumn('permissions', 'description')) {
    insert.description = PERMISSION_DESCRIPTION;
  }
  if (await trx.schema.hasColumn('permissions', 'source')) {
    insert.source = 'system';
  }

  const [id] = await trx('permissions').insert(insert);
  return id;
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const permissionId = await ensurePermissionRow(trx);

    // 下发给所有启用中的角色：与 dashboard 的既有授权面保持一致。
    const roles = await trx('roles').select('id').where({ status: 1 });
    for (const role of roles) {
      const exists = await trx('role_permissions')
        .where({ role_id: role.id, permission_id: permissionId })
        .first();
      if (!exists) {
        await trx('role_permissions').insert({
          role_id: role.id,
          permission_id: permissionId,
          created_at: trx.fn.now(),
        });
      }
    }
  });
};

exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    const permission = await trx('permissions').where({ code: PERMISSION_CODE }).first();
    if (!permission) return;
    await trx('role_permissions').where({ permission_id: permission.id }).del();
    await trx('permissions').where({ id: permission.id }).del();
  });
};
