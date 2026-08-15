/**
 * 生产计划按部门分配（公开可见）；各岗位模板统一带生产计划只读菜单。
 * 权限组 SSOT 见 roleAccessProfiles，本迁移只改表结构和角色绑定。
 */

const RoleAccessService = require('../src/services/RoleAccessService');

exports.up = async function up(knex) {
  const hasDepartment = await knex.schema.hasColumn('production_plans', 'department_id');
  if (!hasDepartment) {
    await knex.schema.alterTable('production_plans', (table) => {
      table.integer('department_id').nullable().index();
    });
  }
  const hasCreatedBy = await knex.schema.hasColumn('production_plans', 'created_by');
  if (!hasCreatedBy) {
    await knex.schema.alterTable('production_plans', (table) => {
      table.integer('created_by').nullable().index();
    });
  }

  await RoleAccessService.applyAllWithKnex(knex);

  try {
    const PermissionService = require('../src/services/PermissionService');
    await PermissionService.clearUserPermissionsCache();
  } catch {
    // ignore
  }
};

exports.down = async function down() {
  console.warn('[20260814000005] down: 不回滚生产计划公开查看与部门字段。');
};
