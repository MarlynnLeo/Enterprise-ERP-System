'use strict';

const PRINT_PERMISSIONS = [
  ['system:print:view', '查看打印管理'],
  ['system:print:create', '新增打印配置'],
  ['system:print:update', '编辑打印配置'],
  ['system:print:delete', '删除打印配置'],
];

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const permissionIds = [];

    for (const [code, name] of PRINT_PERMISSIONS) {
      let permission = await trx('permissions').where({ code }).first('id');
      if (permission) {
        await trx('permissions').where({ id: permission.id }).update({
          name,
          module: 'system',
          status: 1,
          updated_at: trx.fn.now(),
        });
      } else {
        const [id] = await trx('permissions').insert({
          code,
          name,
          module: 'system',
          status: 1,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        });
        permission = { id };
      }
      permissionIds.push(permission.id);
    }

    for (const permissionId of permissionIds) {
      await trx.raw(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
         SELECT r.id, ?, NOW()
           FROM roles r
          WHERE r.is_super_admin = 1
             OR r.code = 'system_admin'
             OR EXISTS (
               SELECT 1
                 FROM role_permissions rp
                 JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = r.id
                  AND p.code = 'system:print'
             )`,
        [permissionId]
      );
    }
  });
};

exports.down = async function down(knex) {
  await knex('permissions')
    .whereIn(
      'code',
      PRINT_PERMISSIONS.map(([code]) => code)
    )
    .update({ status: 0, updated_at: knex.fn.now() });
};
