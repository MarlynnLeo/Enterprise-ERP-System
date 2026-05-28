exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE cost_variance_records
    MODIFY COLUMN variance_rate DECIMAL(10,2) DEFAULT 0
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE cost_variance_records
    MODIFY COLUMN variance_rate DECIMAL(5,2) DEFAULT 0
  `);
};
