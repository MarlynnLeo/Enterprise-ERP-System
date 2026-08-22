'use strict';

/**
 * 零部件仓操作员需要同时处理库存入库与生产发料出库。
 * 权限和菜单统一由 roleAccessProfiles SSOT 重算，避免只修数据库一侧导致下次同步回退。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

const ROLE_CODE = 'component_warehouse_operator';

exports.up = async function up(knex) {
  const role = await knex('roles').where({ code: ROLE_CODE }).first('id');
  if (!role) {
    throw new Error(`角色 ${ROLE_CODE} 不存在`);
  }

  await knex('roles').where({ id: role.id }).update({
    name: '零部件仓操作员',
    description: '零部件仓库入库与生产发料出库，不含审批和销售出库',
    status: 1,
    updated_at: knex.fn.now(),
  });

  await RoleAccessService.applyAllWithKnex(knex);

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // 迁移阶段可能没有可用 Redis；权限表已完成事务内更新。
  }
};

exports.down = async function down() {
  // 权限修复保持向前兼容，不回退为错误的“仅出库”岗位模型。
};
