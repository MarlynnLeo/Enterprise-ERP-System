/**
 * 生产计划公开只读：各岗位仅保留 production:plans:view。
 * 新建/编辑/删除/下推仍只给有生产操作前缀的权限组。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

exports.up = async function up(knex) {
  await RoleAccessService.applyAllWithKnex(knex);
  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down() {
  console.warn('[20260814000006] down: 不回滚操作权限收口。');
};
