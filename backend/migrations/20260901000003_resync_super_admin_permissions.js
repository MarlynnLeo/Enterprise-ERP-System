'use strict';

exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const superAdminRoles = await trx('roles').where({ is_super_admin: 1 }).select('id');

    for (const role of superAdminRoles) {
      await trx('role_permissions').where({ role_id: role.id }).del();
      await trx.raw(
        `INSERT INTO role_permissions (role_id, permission_id, created_at)
         SELECT ?, id, NOW() FROM permissions WHERE status = 1`,
        [role.id]
      );
    }
  });
};

exports.down = async function down() {
  // Super-admin completeness is an invariant and is not rolled back.
};
