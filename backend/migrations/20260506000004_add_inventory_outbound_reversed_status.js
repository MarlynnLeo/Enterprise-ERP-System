exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE inventory_outbound
    MODIFY COLUMN status ENUM(
      'draft',
      'confirmed',
      'partial_completed',
      'completed',
      'reversed',
      'cancelled'
    ) DEFAULT 'draft'
  `);
};

exports.down = async function down(knex) {
  await knex.raw("UPDATE inventory_outbound SET status = 'cancelled' WHERE status = 'reversed'");
  await knex.raw(`
    ALTER TABLE inventory_outbound
    MODIFY COLUMN status ENUM(
      'draft',
      'confirmed',
      'partial_completed',
      'completed',
      'cancelled'
    ) DEFAULT 'draft'
  `);
};
