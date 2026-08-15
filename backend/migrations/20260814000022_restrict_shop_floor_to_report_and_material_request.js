/**
 * 车间操作员不许建计划/任务，只保留报工和补料/换料申请。
 */
const RoleAccessService = require('../src/services/RoleAccessService');

const CODES = [
  { code: 'production:supplement:create', name: '申请补料' },
  { code: 'production:exchange:create', name: '申请换料' },
];

exports.up = async function up(knex) {
  for (const item of CODES) {
    const existing = await knex('permissions').where({ code: item.code }).first('id');
    if (!existing) {
      await knex('permissions').insert({
        code: item.code,
        name: item.name,
        module: 'production',
        status: 1,
        source: 'profile',
        created_at: knex.fn.now(),
        updated_at: knex.fn.now(),
      });
    }
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
  // 权限组回滚会覆盖后续岗位范围，这里不自动撤。
};
