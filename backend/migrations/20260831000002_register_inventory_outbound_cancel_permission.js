'use strict';

/**
 * 保证 inventory:outbound:cancel 权限码已注册（幂等兜底）。
 *
 * 背景：出库单取消一直用这个权限码做校验（outboundStatusController），
 * 但控制器读的是 req.user.permissions —— access token 载荷里没有这个字段，
 * 恒为空数组，于是：
 *   - 单据状态口 PUT /outbound/:id/status 对所有人（含超管）恒 403；
 *   - 批量口 PUT /outbound/batch-status 干脆不校验，成了绕过路径。
 * 代码侧已改为读 req.userPermissions 并给批量口补上同一校验。
 *
 * 授权归属：roleAccessProfiles 里没有任何岗位模板放行该权限
 * （仓储类角色更是写进 WAREHOUSE_DENY 明确拒绝），
 * 即设计意图是「取消出库属于超管动作」。因此这里只做两件事：
 *   1. 确保权限码存在于 permissions 表（新库/未种子化环境）；
 *   2. 确保 is_super_admin 角色持有它。
 * 不下发给业务角色 —— 那会与岗位模板冲突，
 * 且 RoleAccessService.applyRole 重放模板时会立刻被裁掉。
 *
 * 若后续要让某个业务岗位可以取消出库，正确做法是先在
 * roleAccessProfiles 里放行，再单独写迁移下发，两处保持一致。
 */

const PERMISSION_CODE = 'inventory:outbound:cancel';
const PERMISSION_NAME = '取消出库单';
const PERMISSION_MODULE = '库存管理';

async function ensurePermissionRow(trx) {
  const existing = await trx('permissions').where({ code: PERMISSION_CODE }).first();
  if (existing) {
    if (Number(existing.status) !== 1) {
      await trx('permissions')
        .where({ id: existing.id })
        .update({ status: 1, updated_at: trx.fn.now() });
    }
    return existing.id;
  }

  const insert = {
    code: PERMISSION_CODE,
    name: PERMISSION_NAME,
    module: PERMISSION_MODULE,
    status: 1,
    created_at: trx.fn.now(),
    updated_at: trx.fn.now(),
  };
  if (await trx.schema.hasColumn('permissions', 'source')) {
    insert.source = 'system';
  }

  const [id] = await trx('permissions').insert(insert);
  return id;
}

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const permissionId = await ensurePermissionRow(trx);

    // 超管角色即便走 '*' 通配符判定，也保持 role_permissions 数据完整，
    // 以便权限管理页面和 grantAllAccess 的既有数据保持一致。
    const superRoles = await trx('roles').select('id').where({ is_super_admin: 1, status: 1 });
    for (const role of superRoles) {
      const exists = await trx('role_permissions')
        .where({ role_id: role.id, permission_id: permissionId })
        .first();
      if (!exists) {
        await trx('role_permissions').insert({
          role_id: role.id,
          permission_id: permissionId,
          created_at: trx.fn.now(),
        });
      }
    }
  });
};

exports.down = async function down() {
  // 权限码注册属于数据修复：回滚不删除权限，避免把既有授权一并抹掉。
};
