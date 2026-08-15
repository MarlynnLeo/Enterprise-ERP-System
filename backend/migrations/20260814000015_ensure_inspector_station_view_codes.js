/**
 * 补齐本岗检验查看码（quality:incoming:view / quality:final:view 等）并回写角色模板。
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
  console.warn('[20260814000015] down: 不删除检验查看码。');
};
