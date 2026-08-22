/**
 * Remove the retired multi-factor authentication feature and its stored data.
 * Historical migrations remain intact so existing installations can continue
 * to verify and advance their migration history safely.
 */

exports.up = async function up(knex) {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_REMOVE_MULTI_FACTOR_AUTHENTICATION !== 'true'
  ) {
    throw new Error(
      'Refusing to remove MFA in production without ALLOW_REMOVE_MULTI_FACTOR_AUTHENTICATION=true'
    );
  }

  await knex.schema.dropTableIfExists('mfa_login_challenges');
  await knex.schema.dropTableIfExists('mfa_recovery_codes');
  await knex.schema.dropTableIfExists('user_mfa');

  const legacyColumns = ['two_factor_enabled', 'two_factor_secret'];
  for (const column of legacyColumns) {
    if (await knex.schema.hasColumn('users', column)) {
      await knex.schema.alterTable('users', (table) => {
        table.dropColumn(column);
      });
    }
  }
};

exports.down = async function down() {
  throw new Error('Multi-factor authentication removal is forward-only');
};
