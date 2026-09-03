'use strict';

/**
 * The runtime authorization source of truth is user_roles.  Keep the
 * bootstrap administrator connected to the protected admin role even when a
 * database was initialized by an older migration chain that only populated
 * users.role.
 */
exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    const adminRole = await trx('roles')
      .where({ code: 'admin', is_super_admin: 1, status: 1 })
      .first('id');
    if (!adminRole) return;

    const adminUsers = await trx('users').where({ username: 'admin' }).select('id');
    for (const user of adminUsers) {
      await trx('user_roles')
        .insert({ user_id: user.id, role_id: adminRole.id, created_at: trx.fn.now() })
        .onConflict(['user_id', 'role_id'])
        .ignore();
    }
  });
};

exports.down = async function down() {
  // Keep the bootstrap administrator binding intact during rollback.
};
