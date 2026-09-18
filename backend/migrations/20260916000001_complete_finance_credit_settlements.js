'use strict';

exports.up = async function (knex) {
  for (const table of ['ar_receipts', 'ap_payments']) {
    if (!(await knex.schema.hasColumn(table, 'refund_request_id'))) {
      await knex.schema.alterTable(table, builder => builder.string('refund_request_id', 64).nullable().unique());
    }
  }
  if (!(await knex.schema.hasColumn('tax_invoices', 'original_tax_invoice_id'))) {
    await knex.schema.alterTable('tax_invoices', builder => builder.integer('original_tax_invoice_id').nullable().index());
  }
  // Only repair disabled legacy codes when their named small-enterprise
  // counterpart and parent are enabled. Never enable a disabled account.
  for (const [oldCode, newCode, name] of [['660201', '560202', '办公费'], ['660203', '560204', '差旅费'], ['6602', '5602', '管理费用']]) {
    await knex.raw(`UPDATE expense_categories ec
      JOIN gl_accounts old ON old.account_code COLLATE utf8mb4_unicode_ci = ec.gl_account_code COLLATE utf8mb4_unicode_ci AND old.is_active = 0
      JOIN gl_accounts target ON target.account_code = ? AND target.account_name = ? AND target.is_active = 1
      LEFT JOIN gl_accounts parent ON parent.id = target.parent_id
      SET ec.gl_account_code = target.account_code
      WHERE ec.gl_account_code = ? AND (target.parent_id IS NULL OR parent.is_active = 1)`, [newCode, name, oldCode]);
  }
};

exports.down = async function () {
  throw new Error('Refund and red-letter invoice history must be retained; use a forward migration.');
};
