const textFromHex = (hex) => Buffer.from(hex, 'hex').toString('utf8');

exports.up = async function up(knex) {
  const apConfirmed = textFromHex('E5B7B2E7A1AEE8AEA4');
  const taxInput = textFromHex('E8BF9BE9A1B9');
  const taxUncertified = textFromHex('E69CAAE8AEA4E8AF81');
  const purchaseReceiptType = textFromHex('E98787E8B4ADE585A5E5BA93E58D95');
  const invoiced = textFromHex('E5B7B2E5BC80E7A5A8');

  await knex.transaction(async (trx) => {
    await trx.raw(`
      UPDATE purchase_receipts pr
      JOIN (
        SELECT
          receipt_id,
          ROUND(SUM(COALESCE(total_amount, COALESCE(amount_excluding_tax, 0) + COALESCE(tax_amount, 0))), 2) AS total_amount,
          ROUND(SUM(COALESCE(tax_amount, 0)), 2) AS total_tax_amount
        FROM purchase_receipt_items
        GROUP BY receipt_id
      ) x ON x.receipt_id = pr.id
      SET pr.total_amount = x.total_amount,
          pr.total_tax_amount = x.total_tax_amount,
          pr.updated_at = CURRENT_TIMESTAMP
      WHERE pr.deleted_at IS NULL
        AND ABS(ROUND(COALESCE(pr.total_amount, 0) - x.total_amount, 2)) > 0.01
    `);

    await trx.raw(`
      INSERT INTO ap_invoices (
        invoice_number, supplier_id, invoice_date, due_date, total_amount,
        paid_amount, balance_amount, currency_code, exchange_rate, status,
        terms, notes, created_at, updated_at, source_type, source_id, created_by, updated_by
      )
      SELECT
        CONCAT('AP-AUDIT-', pr.receipt_no),
        pr.supplier_id,
        COALESCE(STR_TO_DATE(NULLIF(CAST(pr.receipt_date AS CHAR), '0000-00-00'), '%Y-%m-%d'), DATE(pr.created_at), CURDATE()),
        DATE_ADD(COALESCE(STR_TO_DATE(NULLIF(CAST(pr.receipt_date AS CHAR), '0000-00-00'), '%Y-%m-%d'), DATE(pr.created_at), CURDATE()), INTERVAL 30 DAY),
        pr.total_amount,
        0,
        pr.total_amount,
        'CNY',
        1,
        ?,
        '30 days',
        CONCAT('Auto repaired from purchase receipt ', pr.receipt_no),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        'purchase_receipt',
        pr.id,
        1,
        1
      FROM purchase_receipts pr
      WHERE pr.deleted_at IS NULL
        AND pr.status = 'completed'
        AND COALESCE(pr.total_amount, 0) > 0.01
        AND NOT EXISTS (
          SELECT 1 FROM ap_invoices ai
          WHERE ai.source_type = 'purchase_receipt'
            AND ai.source_id = pr.id
        )
    `, [apConfirmed]);

    await trx.raw(`
      INSERT INTO ap_invoice_items (
        invoice_id, material_id, description, quantity, unit_price, amount, created_at, updated_at
      )
      SELECT
        ai.id,
        pri.material_id,
        COALESCE(NULLIF(pri.material_name, ''), NULLIF(pri.material_code, ''), CONCAT('Receipt item ', pri.id)),
        COALESCE(NULLIF(pri.qualified_quantity, 0), NULLIF(pri.received_quantity, 0), NULLIF(pri.quantity, 0), 1),
        CASE
          WHEN COALESCE(NULLIF(pri.qualified_quantity, 0), NULLIF(pri.received_quantity, 0), NULLIF(pri.quantity, 0), 0) > 0
            THEN ROUND(COALESCE(pri.total_amount, 0) / COALESCE(NULLIF(pri.qualified_quantity, 0), NULLIF(pri.received_quantity, 0), NULLIF(pri.quantity, 0)), 6)
          ELSE COALESCE(pri.price, 0)
        END,
        COALESCE(pri.total_amount, 0),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM ap_invoices ai
      JOIN purchase_receipt_items pri ON pri.receipt_id = ai.source_id
      WHERE ai.source_type = 'purchase_receipt'
        AND NOT EXISTS (
          SELECT 1 FROM ap_invoice_items existing
          WHERE existing.invoice_id = ai.id
        )
    `);

    await trx.raw(`
      INSERT INTO tax_invoices (
        invoice_type, invoice_number, invoice_code, invoice_date, supplier_id, customer_id,
        supplier_or_customer_name, supplier_tax_number, amount_excluding_tax, tax_rate,
        tax_amount, total_amount, status, certification_date, deduction_date,
        related_document_type, related_document_id, gl_entry_id, remark, created_by,
        created_at, updated_at
      )
      SELECT
        ?,
        CONCAT('TAX-AUDIT-', pr.receipt_no),
        NULL,
        COALESCE(STR_TO_DATE(NULLIF(CAST(pr.receipt_date AS CHAR), '0000-00-00'), '%Y-%m-%d'), DATE(pr.created_at), CURDATE()),
        pr.supplier_id,
        NULL,
        COALESCE(NULLIF(pr.supplier_name, ''), s.name, ''),
        NULL,
        ROUND(pr.total_amount - COALESCE(pr.total_tax_amount, 0), 2),
        CASE
          WHEN COALESCE(pr.total_amount - pr.total_tax_amount, 0) > 0
            THEN ROUND((pr.total_tax_amount / (pr.total_amount - pr.total_tax_amount)) * 100, 2)
          ELSE COALESCE(MAX(pri.tax_rate), 0) * CASE WHEN COALESCE(MAX(pri.tax_rate), 0) <= 1 THEN 100 ELSE 1 END
        END,
        COALESCE(pr.total_tax_amount, 0),
        pr.total_amount,
        ?,
        NULL,
        NULL,
        ?,
        pr.id,
        NULL,
        CONCAT('Auto repaired from purchase receipt ', pr.receipt_no),
        1,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM purchase_receipts pr
      LEFT JOIN suppliers s ON s.id = pr.supplier_id
      LEFT JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
      WHERE pr.deleted_at IS NULL
        AND pr.status = 'completed'
        AND COALESCE(pr.total_amount, 0) > 0.01
        AND NOT EXISTS (
          SELECT 1 FROM tax_invoices ti
          WHERE ti.related_document_type = ?
            AND ti.related_document_id = pr.id
        )
      GROUP BY pr.id, s.name
    `, [taxInput, taxUncertified, purchaseReceiptType, purchaseReceiptType]);

    await trx('purchase_receipts')
      .where({ status: 'completed' })
      .whereIn('id', trx('ap_invoices').select('source_id').where({ source_type: 'purchase_receipt' }))
      .update({
        invoice_status: invoiced,
        updated_at: trx.fn.now(),
      });
  });
};

exports.down = async function down() {
  // Data repair only. Do not remove regenerated financial closure data on rollback.
};
