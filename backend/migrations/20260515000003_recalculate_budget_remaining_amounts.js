/**
 * Recalculate cached budget remaining amounts after budget execution updates.
 */

exports.up = async function up(knex) {
  await knex.raw(`
    UPDATE budget_details
    SET remaining_amount = budget_amount - COALESCE(used_amount, 0)
  `);

  await knex.raw(`
    UPDATE budgets
    SET remaining_amount = total_amount - COALESCE(used_amount, 0)
  `);
};

exports.down = async function down() {
  // Cached remaining amounts are derived values; no rollback action is needed.
};
