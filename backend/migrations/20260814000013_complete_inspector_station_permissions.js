/**
 * 检验员专岗补齐作业所需只读/动作码：检验单 view、来料选采购单、线上/成品选生产任务。
 * 只改角色模板落库，不按人名写权限。
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
  console.warn('[20260814000013] down: 不回滚检验员作业权限补齐。');
};
