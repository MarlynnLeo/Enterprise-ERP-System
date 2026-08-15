/**
 * 车间菜单补齐异常上报/设备监控，去掉 MRP/甘特等计划页。
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

exports.down = async function down() {};
