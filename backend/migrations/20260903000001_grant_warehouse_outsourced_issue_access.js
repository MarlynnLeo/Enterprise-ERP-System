'use strict';

/**
 * 仓储部负责委外加工单的原材料发料出库。
 *
 * 权限范围由 roleAccessProfiles 统一定义：仓储管理、零部件仓作业和
 * 兼容的通用仓储作业角色可以查看委外加工单并执行发料出库，但不具备
 * 委外建单或删除权限。迁移只重算权限图，不修改业务单据或用户绑定。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

const TARGET_ROLE_CODES = [
  'inventory_manager',
  'inventory_operator',
  'component_warehouse_operator',
];

exports.up = async function up(knex) {
  const roles = await knex('roles').whereIn('code', TARGET_ROLE_CODES).select('id');
  if (roles.length === 0) {
    throw new Error(`目标仓储角色不存在: ${TARGET_ROLE_CODES.join(', ')}`);
  }

  // 角色模板是权限 SSOT，统一重算以同步 role_menus、role_permissions 和
  // 已存在的菜单动作权限，避免只补一侧造成下次保存权限时回退。
  await RoleAccessService.applyAllWithKnex(knex);

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // 迁移环境可能没有可用 Redis；数据库权限图已在事务中更新。
  }
};

exports.down = async function down() {
  // 权限修复为前向数据变更，不回退为缺失委外发料权限的岗位模板。
};
