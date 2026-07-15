/** Complete runtime schema used by material price history and task detail APIs. */

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('material_price_history'))) {
    await knex.schema.createTable('material_price_history', (table) => {
      table.increments('id').primary();
      table.integer('material_id').notNullable();
      table.enu('price_type', ['cost', 'sales']).notNullable().defaultTo('cost');
      table.decimal('old_price', 10, 2).defaultTo(0);
      table.decimal('new_price', 10, 2).notNullable();
      table.string('source_type', 50);
      table.string('source_no', 50);
      table.integer('created_by');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.index('material_id', 'idx_material_id');
      table.index('created_at', 'idx_created_at');
      table
        .foreign('material_id')
        .references('materials.id')
        .onDelete('CASCADE');
    });
  }

  if (
    await knex.schema.hasTable('production_processes') &&
    !(await knex.schema.hasColumn('production_processes', 'sequence_number'))
  ) {
    await knex.raw(`
      ALTER TABLE production_processes
      ADD COLUMN sequence_number INT
        GENERATED ALWAYS AS (\`sequence\`) STORED
        COMMENT 'Process sequence alias'
    `);
  }
};

exports.down = async function down() {
  // Preserve runtime data and compatibility columns.
};
