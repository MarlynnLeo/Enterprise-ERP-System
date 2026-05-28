/**
 * Normalize legacy purchase return statuses.
 *
 * Older test data used "pending" for purchase returns, but the current
 * workflow is draft -> confirmed -> completed/cancelled. Keeping pending rows
 * leaves the operation column with view-only actions because the backend no
 * longer accepts pending as a transition source.
 */

exports.up = async function up(knex) {
  await knex('purchase_returns')
    .where({ status: 'pending' })
    .update({ status: 'draft' });
};

exports.down = async function down() {
  // The original pending rows cannot be distinguished from normal draft rows.
};
