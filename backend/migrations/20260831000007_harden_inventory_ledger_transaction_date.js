'use strict';

// Forward-only hardening for installations that already applied 000006.
exports.up = async function up(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_inventory_ledger_locked_update');
  await knex.raw(`
    CREATE TRIGGER trg_inventory_ledger_locked_update
    BEFORE UPDATE ON inventory_ledger
    FOR EACH ROW
    BEGIN
      IF OLD.posting_document_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM inventory_posting_documents d
            WHERE d.id = OLD.posting_document_id
              AND d.locked = 1
              AND d.is_legacy = 0
         )
         AND (
           NOT (OLD.material_id <=> NEW.material_id)
           OR NOT (OLD.location_id <=> NEW.location_id)
           OR NOT (OLD.transaction_type <=> NEW.transaction_type)
           OR NOT (OLD.transaction_no <=> NEW.transaction_no)
           OR NOT (OLD.reference_no <=> NEW.reference_no)
           OR NOT (OLD.reference_type <=> NEW.reference_type)
           OR NOT (OLD.quantity <=> NEW.quantity)
           OR NOT (OLD.before_quantity <=> NEW.before_quantity)
           OR NOT (OLD.after_quantity <=> NEW.after_quantity)
           OR NOT (OLD.transaction_date <=> NEW.transaction_date)
           OR NOT (OLD.unit_id <=> NEW.unit_id)
           OR NOT (OLD.batch_number <=> NEW.batch_number)
           OR NOT (OLD.operator <=> NEW.operator)
           OR NOT (OLD.remark <=> NEW.remark)
           OR NOT (OLD.unit_cost <=> NEW.unit_cost)
           OR NOT (OLD.total_value <=> NEW.total_value)
           OR NOT (OLD.supplier_id <=> NEW.supplier_id)
           OR NOT (OLD.supplier_name <=> NEW.supplier_name)
           OR NOT (OLD.production_date <=> NEW.production_date)
           OR NOT (OLD.expiry_date <=> NEW.expiry_date)
           OR NOT (OLD.warehouse_name <=> NEW.warehouse_name)
           OR NOT (OLD.issue_reason <=> NEW.issue_reason)
           OR NOT (OLD.is_excess <=> NEW.is_excess)
           OR NOT (OLD.bom_required_qty <=> NEW.bom_required_qty)
           OR NOT (OLD.total_issued_qty <=> NEW.total_issued_qty)
           OR NOT (OLD.purchase_order_id <=> NEW.purchase_order_id)
           OR NOT (OLD.purchase_order_no <=> NEW.purchase_order_no)
           OR NOT (OLD.receipt_id <=> NEW.receipt_id)
           OR NOT (OLD.receipt_no <=> NEW.receipt_no)
           OR NOT (OLD.posting_document_id <=> NEW.posting_document_id)
           OR NOT (OLD.posting_line_id <=> NEW.posting_line_id)
           OR NOT (OLD.reversal_of_ledger_id <=> NEW.reversal_of_ledger_id)
         )
      THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Finance-posted inventory ledger rows are immutable';
      END IF;
    END
  `);
};

exports.down = async function down() {
  // The previous trigger is intentionally not restored; this is a forward-only
  // integrity hardening and must remain active after rollback of later code.
};
