/**
 * 生产计划员权限组补齐：生产计划 / 任务 / 过程 / 报工。
 * 只改角色模板，不绑定账号。
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
  console.warn('[20260814000008] down: 不回滚生产计划员四页权限。');
};
