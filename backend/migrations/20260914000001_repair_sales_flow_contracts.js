'use strict';

// Forward migration: preserve sales prices end-to-end and align persisted states
// with the status registry. No orders, inventory ledgers or finance rows are deleted.
exports.up = async function (knex) {
  if (!(await knex.schema.hasColumn('sales_exchanges', 'outbound_id'))) {
    await knex.schema.alterTable('sales_exchanges', table => {
      table.integer('outbound_id').unsigned().nullable().index();
    });
  }
  if (!(await knex.schema.hasColumn('sales_exchange_items', 'tax_percent'))) {
    await knex.schema.alterTable('sales_exchange_items', table => {
      // NULL identifies legacy lines; completed documents keep their posted amounts.
      table.decimal('tax_percent', 8, 6).nullable();
      table.decimal('tax_amount', 15, 2).nullable();
    });
  }
  await knex.raw("ALTER TABLE sales_outbound_items MODIFY price DECIMAL(15,4) NULL DEFAULT 0.0000");
  await knex.raw("ALTER TABLE sales_quotation_items MODIFY unit_price DECIMAL(15,4) NOT NULL, MODIFY tax_percent DECIMAL(8,6) NULL DEFAULT 0.000000");
  await knex.raw("ALTER TABLE sales_exchange_items MODIFY unit_price DECIMAL(15,4) NULL DEFAULT 0.0000");
  await knex.raw("ALTER TABLE contract_items MODIFY unit_price DECIMAL(15,4) NOT NULL DEFAULT 0.0000");
  await knex.raw("ALTER TABLE sales_quotations MODIFY status ENUM('draft','sent','accepted','converted','rejected','expired','cancelled') NULL DEFAULT 'draft'");
  await knex.raw("ALTER TABLE contracts MODIFY status ENUM('draft','pending_approval','active','executing','completed','terminated','expired','cancelled') NOT NULL DEFAULT 'draft'");
  await knex.raw("ALTER TABLE sales_exchanges MODIFY status VARCHAR(20) NULL DEFAULT 'pending'");
  await knex.raw("UPDATE sales_exchanges SET status = CASE status WHEN '待处理' THEN 'pending' WHEN '处理中' THEN 'processing' WHEN '已完成' THEN 'completed' WHEN '已拒绝' THEN 'rejected' ELSE status END WHERE status IN ('待处理','处理中','已完成','已拒绝')");
  await knex.raw("UPDATE sales_quotations q SET q.status='converted' WHERE EXISTS (SELECT 1 FROM sales_orders o WHERE o.quotation_id=q.id)");
};

exports.down = async function () {
  throw new Error('Sales price precision and terminal states must not be truncated; use a reviewed forward migration.');
};
