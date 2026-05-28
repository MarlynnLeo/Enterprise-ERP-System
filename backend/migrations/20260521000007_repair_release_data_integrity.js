exports.up = async function up(knex) {
  await knex.transaction(async (trx) => {
    await trx.raw(`
      UPDATE ar_invoice_items item
      JOIN ar_invoices invoice ON invoice.id = item.invoice_id
      SET
        item.quantity = ABS(COALESCE(item.quantity, 0)),
        item.unit_price = ABS(COALESCE(item.unit_price, 0)),
        item.amount = ABS(COALESCE(item.amount, 0))
      WHERE COALESCE(invoice.total_amount, 0) < 0
         OR COALESCE(invoice.balance_amount, 0) < 0
    `);

    await trx.raw(`
      UPDATE ar_invoices
      SET
        paid_amount = LEAST(ABS(COALESCE(total_amount, 0)), GREATEST(COALESCE(paid_amount, 0), 0)),
        balance_amount = ABS(COALESCE(total_amount, 0)) - LEAST(ABS(COALESCE(total_amount, 0)), GREATEST(COALESCE(paid_amount, 0), 0)),
        total_amount = ABS(COALESCE(total_amount, 0))
      WHERE COALESCE(total_amount, 0) < 0
         OR COALESCE(balance_amount, 0) < 0
         OR COALESCE(paid_amount, 0) > COALESCE(total_amount, 0)
    `);

    await trx.raw(`
      UPDATE ap_invoice_items item
      JOIN ap_invoices invoice ON invoice.id = item.invoice_id
      SET
        item.quantity = ABS(COALESCE(item.quantity, 0)),
        item.unit_price = ABS(COALESCE(item.unit_price, 0)),
        item.amount = ABS(COALESCE(item.amount, 0))
      WHERE COALESCE(invoice.total_amount, 0) < 0
         OR COALESCE(invoice.balance_amount, 0) < 0
    `);

    await trx.raw(`
      UPDATE ap_invoices
      SET
        paid_amount = LEAST(ABS(COALESCE(total_amount, 0)), GREATEST(COALESCE(paid_amount, 0), 0)),
        balance_amount = ABS(COALESCE(total_amount, 0)) - LEAST(ABS(COALESCE(total_amount, 0)), GREATEST(COALESCE(paid_amount, 0), 0)),
        total_amount = ABS(COALESCE(total_amount, 0))
      WHERE COALESCE(total_amount, 0) < 0
         OR COALESCE(balance_amount, 0) < 0
         OR COALESCE(paid_amount, 0) > COALESCE(total_amount, 0)
    `);

    await trx.raw(`
      DELETE item FROM purchase_requisition_items item
      LEFT JOIN purchase_requisitions requisition ON requisition.id = item.requisition_id
      LEFT JOIN materials material ON material.id = item.material_id
      WHERE requisition.id IS NULL
         OR item.material_id IS NULL
         OR material.id IS NULL
    `);

    await trx.raw(`
      DELETE item FROM purchase_order_items item
      LEFT JOIN purchase_orders purchase_order ON purchase_order.id = item.order_id
      LEFT JOIN materials material ON material.id = item.material_id
      WHERE purchase_order.id IS NULL
         OR item.material_id IS NULL
         OR material.id IS NULL
    `);

    await trx.raw(`
      DELETE item FROM purchase_receipt_items item
      LEFT JOIN purchase_receipts receipt ON receipt.id = item.receipt_id
      WHERE receipt.id IS NULL
    `);

    await trx.raw(`
      UPDATE purchase_order_items
      SET
        received_quantity = LEAST(GREATEST(COALESCE(received_quantity, 0), 0), COALESCE(quantity, 0)),
        warehoused_quantity = LEAST(GREATEST(COALESCE(warehoused_quantity, 0), 0), COALESCE(quantity, 0)),
        inspected_quantity = LEAST(GREATEST(COALESCE(inspected_quantity, 0), 0), COALESCE(quantity, 0)),
        qualified_quantity = LEAST(GREATEST(COALESCE(qualified_quantity, 0), 0), COALESCE(quantity, 0)),
        unqualified_quantity = LEAST(GREATEST(COALESCE(unqualified_quantity, 0), 0), COALESCE(quantity, 0))
      WHERE COALESCE(received_quantity, 0) > COALESCE(quantity, 0)
         OR COALESCE(warehoused_quantity, 0) > COALESCE(quantity, 0)
         OR COALESCE(inspected_quantity, 0) > COALESCE(quantity, 0)
         OR COALESCE(qualified_quantity, 0) > COALESCE(quantity, 0)
         OR COALESCE(unqualified_quantity, 0) > COALESCE(quantity, 0)
         OR COALESCE(received_quantity, 0) < 0
         OR COALESCE(warehoused_quantity, 0) < 0
         OR COALESCE(inspected_quantity, 0) < 0
         OR COALESCE(qualified_quantity, 0) < 0
         OR COALESCE(unqualified_quantity, 0) < 0
    `);

    await trx.raw(`
      UPDATE purchase_order_items
      SET unqualified_quantity = GREATEST(COALESCE(inspected_quantity, 0) - COALESCE(qualified_quantity, 0), 0)
      WHERE COALESCE(qualified_quantity, 0) + COALESCE(unqualified_quantity, 0) > COALESCE(inspected_quantity, 0)
    `);

    await trx.raw(`
      UPDATE purchase_receipts receipt
      LEFT JOIN inventory_ledger ledger
        ON ledger.receipt_id = receipt.id
        OR ledger.receipt_no = receipt.receipt_no
        OR ledger.reference_no = receipt.receipt_no
      SET receipt.status = 'draft'
      WHERE receipt.status IN ('completed', 'warehoused')
        AND ledger.id IS NULL
    `);

    await trx.raw(`
      UPDATE sales_order_items item
      JOIN materials material ON material.specs = REPLACE(item.product_specs, '-TEST', '')
      SET
        item.material_id = material.id,
        item.product_code = material.code,
        item.product_specs = material.specs
      WHERE item.material_id IS NULL
        AND COALESCE(item.product_specs, '') <> ''
    `);

    await trx.raw(`
      DELETE item FROM sales_order_items item
      LEFT JOIN sales_orders sales_order ON sales_order.id = item.order_id
      LEFT JOIN materials material ON material.id = item.material_id
      WHERE sales_order.id IS NULL
         OR item.material_id IS NULL
         OR material.id IS NULL
    `);

    await trx.raw(`
      UPDATE sales_outbound_items item
      LEFT JOIN sales_orders sales_order ON sales_order.id = item.source_order_id
      SET
        item.source_order_id = NULL,
        item.source_order_no = NULL
      WHERE item.source_order_id IS NOT NULL
        AND sales_order.id IS NULL
    `);
  });
};

exports.down = async function down() {
  // Release data integrity repair; keep normalized test data on rollback.
};
