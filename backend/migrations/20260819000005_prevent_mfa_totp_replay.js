/**
 * Prevent a valid TOTP value from being replayed during the same time step.
 * The counter is updated atomically while the MFA row is locked.
 */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('user_mfa', 'last_totp_counter'))) {
    await knex.schema.alterTable('user_mfa', (table) => {
      table.bigInteger('last_totp_counter').unsigned().nullable();
    });
  }
};

exports.down = async function down() {
  throw new Error('MFA replay protection migration is forward-only');
};
