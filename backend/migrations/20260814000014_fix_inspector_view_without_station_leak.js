/**
 * 收回检验员误授的 quality:inspections:* 落库码，改为本岗 :view + 作业只读。
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
  console.warn('[20260814000014] down: 不回滚检验员查看码收口。');
};
