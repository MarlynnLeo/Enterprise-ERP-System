'use strict';

// Keep source links on voided invoices while enforcing one active tax invoice
// per source document. Reissuing must not erase the cancelled invoice history.
exports.up = async function (knex) {
  const [indices] = await knex.raw('SHOW INDEX FROM tax_invoices');
  const clauses = [];
  if (!(await knex.schema.hasColumn('tax_invoices', 'active_related_document_id'))) {
    clauses.push("ADD COLUMN active_related_document_id INT GENERATED ALWAYS AS (CASE WHEN status = '已作废' THEN NULL ELSE related_document_id END) STORED");
  }
  if (!indices.some(index => index.Key_name === 'uq_tax_active_source')) {
    clauses.push('ADD UNIQUE KEY uq_tax_active_source (related_document_type, active_related_document_id)');
  }
  for (const name of ['uq_related_doc', 'uk_tax_invoices_related_document']) {
    if (indices.some(index => index.Key_name === name)) clauses.push(`DROP INDEX ${name}`);
  }
  if (clauses.length) await knex.raw(`ALTER TABLE tax_invoices ${clauses.join(', ')}`);
};

exports.down = async function () {
  throw new Error('Voided and reissued tax invoices must retain their source history; use a reviewed forward migration.');
};
