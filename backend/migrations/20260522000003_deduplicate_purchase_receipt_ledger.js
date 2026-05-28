exports.up = async function up(knex) {
  await knex.raw(`
    DELETE duplicate_ledger
      FROM inventory_ledger duplicate_ledger
      JOIN inventory_ledger keep_ledger
        ON keep_ledger.id < duplicate_ledger.id
       AND keep_ledger.reference_type = duplicate_ledger.reference_type
       AND keep_ledger.transaction_type = duplicate_ledger.transaction_type
       AND COALESCE(keep_ledger.reference_no, '') = COALESCE(duplicate_ledger.reference_no, '')
       AND COALESCE(keep_ledger.receipt_id, 0) = COALESCE(duplicate_ledger.receipt_id, 0)
       AND COALESCE(keep_ledger.receipt_no, '') = COALESCE(duplicate_ledger.receipt_no, '')
       AND keep_ledger.material_id = duplicate_ledger.material_id
       AND keep_ledger.location_id = duplicate_ledger.location_id
       AND COALESCE(keep_ledger.batch_number, '') = COALESCE(duplicate_ledger.batch_number, '')
       AND keep_ledger.quantity = duplicate_ledger.quantity
     WHERE duplicate_ledger.reference_type = 'purchase_receipt'
       AND duplicate_ledger.transaction_type = 'purchase_inbound'
  `);
};

exports.down = async function down() {
  // Data repair only. Duplicate purchase receipt ledger rows should not be restored.
};
