'use strict';

exports.up = async function up(knex) {
  if (
    (await knex.schema.hasTable('inventory_posting_documents')) &&
    !(await knex.schema.hasColumn('inventory_posting_documents', 'business_approved_by_id'))
  ) {
    await knex.schema.alterTable('inventory_posting_documents', (table) => {
      table.bigInteger('business_approved_by_id').nullable().after('finance_status');
    });
  }
};

exports.down = async function down(knex) {
  if (
    (await knex.schema.hasTable('inventory_posting_documents')) &&
    (await knex.schema.hasColumn('inventory_posting_documents', 'business_approved_by_id'))
  ) {
    await knex.schema.alterTable('inventory_posting_documents', (table) => {
      table.dropColumn('business_approved_by_id');
    });
  }
};
