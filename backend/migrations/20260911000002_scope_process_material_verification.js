exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('assembly_verification_logs', 'process_id'))) {
    await knex.schema.alterTable('assembly_verification_logs', table => {
      table.integer('process_id').nullable();
      table.index(['task_id', 'process_id', 'material_id', 'result'], 'idx_process_material_verification');
    });
  }
};

exports.down = async function down() {
  // Preserve the link between an executed process and its material verification.
};
