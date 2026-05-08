exports.up = async function up(knex) {
  await knex.raw(`
    ALTER TABLE gl_entries
    MODIFY COLUMN document_number VARCHAR(50) NULL
  `);
};

exports.down = async function down(knex) {
  await knex.raw(`
    ALTER TABLE gl_entries
    MODIFY COLUMN document_number VARCHAR(30) NULL
  `);
};
