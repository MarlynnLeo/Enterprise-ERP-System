'use strict';

exports.up = async function up(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_inventory_ledger_posting_gate');
  await knex.raw(`
    CREATE TRIGGER trg_inventory_ledger_posting_gate
    BEFORE INSERT ON inventory_ledger
    FOR EACH ROW
    BEGIN
      IF NEW.posting_document_id IS NULL OR NEW.posting_line_id IS NULL
         OR NOT EXISTS (
           SELECT 1
             FROM inventory_posting_documents d
            WHERE d.id = NEW.posting_document_id
              AND d.finance_status = 'approved'
              AND d.locked = 1
         )
         OR NOT EXISTS (
           SELECT 1
             FROM inventory_posting_lines l
            WHERE l.id = NEW.posting_line_id
              AND l.posting_document_id = NEW.posting_document_id
         )
      THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Inventory ledger requires an approved locked posting document';
      END IF;
    END
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_inventory_ledger_posting_gate');
};
