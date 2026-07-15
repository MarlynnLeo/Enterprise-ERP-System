async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function ensureAuditTable(knex) {
  if (await hasTable(knex, 'finance_data_repair_audit')) return;

  await knex.schema.createTable('finance_data_repair_audit', (table) => {
    table.increments('id').primary();
    table.string('repair_key', 100).notNullable();
    table.string('scope', 50).notNullable();
    table.string('metric', 100).notNullable();
    table.string('value', 100).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.index(['repair_key', 'scope'], 'idx_finance_repair_audit_scope');
  });
}

async function logRepair(trx, scope, metric, value) {
  await trx('finance_data_repair_audit').insert({
    repair_key: '20260521000001_repair_finance_core_data_closure',
    scope,
    metric,
    value: String(value ?? 0),
    created_at: trx.fn.now(),
  });
}

function utf8Hex(hex) {
  return `CONVERT(UNHEX('${hex}') USING utf8mb4)`;
}

function hexLiteral(hex) {
  return `'${hex}'`;
}

function signedTransactionExpression(alias = 't') {
  const typeColumn = `${alias}.transaction_type`;
  const incomeTypes = [
    hexLiteral('E5AD98E6ACBE'),
    hexLiteral('E8BDACE585A5'),
    hexLiteral('E588A9E681AF'),
    hexLiteral('E694B6E585A5'),
    hexLiteral('696E636F6D65'),
    hexLiteral('6465706F736974'),
    hexLiteral('7472616E736665725F696E'),
    hexLiteral('696E746572657374'),
  ].join(',');
  const expenseTypes = [
    hexLiteral('E58F96E6ACBE'),
    hexLiteral('E8BDACE587BA'),
    hexLiteral('E8B4B9E794A8'),
    hexLiteral('E694AFE587BA'),
    hexLiteral('657870656E7365'),
    hexLiteral('7769746864726177616C'),
    hexLiteral('7472616E736665725F6F7574'),
    hexLiteral('666565'),
  ].join(',');

  return `
    CASE
      WHEN HEX(${typeColumn}) IN (${incomeTypes}) THEN ${alias}.amount
      WHEN HEX(${typeColumn}) IN (${expenseTypes}) THEN -${alias}.amount
      ELSE 0
    END
  `;
}

async function getTaxAccountIds(trx, requireComplete = true) {
  const rows = await trx('tax_account_config')
    .select('config_key', 'account_id')
    .whereIn('config_key', [
      'ACCOUNTS_PAYABLE',
      'ACCOUNTS_RECEIVABLE',
      'RAW_MATERIALS',
      'SALES_REVENUE',
      'VAT_INPUT_TAX',
      'VAT_OUTPUT_TAX',
    ])
    .whereRaw('COALESCE(is_active, 1) = 1');

  const ids = Object.fromEntries(rows.map((row) => [row.config_key, row.account_id]));
  for (const key of [
    'ACCOUNTS_PAYABLE',
    'ACCOUNTS_RECEIVABLE',
    'RAW_MATERIALS',
    'SALES_REVENUE',
    'VAT_INPUT_TAX',
    'VAT_OUTPUT_TAX',
  ]) {
    if (requireComplete && !ids[key]) {
      throw new Error(`Missing active tax account config: ${key}`);
    }
    if (!ids[key]) ids[key] = null;
  }
  return ids;
}

exports.up = async function up(knex) {
  await ensureAuditTable(knex);

  await knex.transaction(async (trx) => {
    if (
      (await hasTable(knex, 'ar_invoices')) &&
      (await hasTable(knex, 'ar_receipts')) &&
      (await hasTable(knex, 'ar_receipt_items'))
    ) {
      await trx.raw('DROP TEMPORARY TABLE IF EXISTS tmp_ar_single_overpaid');
      await trx.raw(`
        CREATE TEMPORARY TABLE tmp_ar_single_overpaid AS
        SELECT inv.id AS invoice_id,
               ROUND(inv.total_amount, 2) AS target_amount,
               MAX(ri.id) AS receipt_item_id,
               MAX(r.id) AS receipt_id,
               MAX(r.receipt_number) AS receipt_number,
               ROUND(COALESCE(SUM(ri.amount), 0) - ROUND(MAX(inv.total_amount), 2), 2) AS overpaid_amount
        FROM ar_invoices inv
        JOIN ar_receipt_items ri ON ri.invoice_id = inv.id
        JOIN ar_receipts r ON r.id = ri.receipt_id AND r.status = 'normal'
        JOIN (
          SELECT receipt_id, COUNT(*) AS receipt_item_count
          FROM ar_receipt_items
          GROUP BY receipt_id
        ) rc ON rc.receipt_id = r.id AND rc.receipt_item_count = 1
        WHERE ROUND(COALESCE(inv.total_amount, 0), 2) > 0
          AND COALESCE(inv.source_type, '') <> 'sales_return'
        GROUP BY inv.id
        HAVING COUNT(*) = 1
           AND ROUND(COALESCE(SUM(ri.amount), 0) - ROUND(MAX(inv.total_amount), 2), 2) >= 0.01
      `);

      const [overpaidRows] = await trx.raw(
        'SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(overpaid_amount), 0), 2) AS amount FROM tmp_ar_single_overpaid'
      );
      await logRepair(trx, 'ar', 'single_receipt_overpaid_invoices', overpaidRows[0]?.count || 0);
      await logRepair(trx, 'ar', 'single_receipt_overpaid_amount', overpaidRows[0]?.amount || 0);

      await trx.raw(`
        UPDATE ar_receipt_items ri
        JOIN tmp_ar_single_overpaid t ON t.receipt_item_id = ri.id
        SET ri.amount = t.target_amount
      `);

      await trx.raw(`
        UPDATE ar_receipts r
        JOIN tmp_ar_single_overpaid t ON t.receipt_id = r.id
        SET r.total_amount = t.target_amount
      `);

      if (await hasTable(knex, 'bank_transactions')) {
        await trx.raw(`
          UPDATE bank_transactions bt
          JOIN tmp_ar_single_overpaid t
            ON bt.related_invoice_id = t.invoice_id
           AND bt.related_invoice_type = 'AR'
           AND BINARY bt.transaction_number = BINARY t.receipt_number
          SET bt.amount = t.target_amount
        `);
      }

      await trx.raw(`
        UPDATE ar_invoices inv
        JOIN tmp_ar_single_overpaid t ON t.invoice_id = inv.id
        SET inv.paid_amount = t.target_amount,
            inv.balance_amount = 0,
            inv.status = ${utf8Hex('E5B7B2E4BB98E6ACBE')}
      `);
    }

    if ((await hasTable(knex, 'bank_accounts')) && (await hasTable(knex, 'bank_transactions'))) {
      const signedExpression = signedTransactionExpression('t');
      const [bankResult] = await trx.raw(`
        UPDATE bank_accounts a
        LEFT JOIN (
          SELECT bank_account_id,
                 ROUND(COALESCE(SUM(${signedExpression}), 0), 2) AS signed_amount,
                 MAX(transaction_date) AS last_transaction_date
          FROM bank_transactions t
          WHERE t.status IS NULL OR t.status = 'approved'
          GROUP BY bank_account_id
        ) tx ON tx.bank_account_id = a.id
        SET a.current_balance = ROUND(COALESCE(a.opening_balance, 0) + COALESCE(tx.signed_amount, 0), 2),
            a.last_transaction_date = COALESCE(tx.last_transaction_date, a.last_transaction_date)
        WHERE ABS(ROUND(
          COALESCE(a.current_balance, 0) -
          (COALESCE(a.opening_balance, 0) + COALESCE(tx.signed_amount, 0)),
          2
        )) >= 0.01
      `);
      await logRepair(trx, 'bank', 'recalculated_bank_current_balances', bankResult.affectedRows);
    }

    if (await hasTable(knex, 'gl_entry_items')) {
      const [negativeLineRows] = await trx.raw(`
        SELECT COUNT(*) AS count
        FROM gl_entry_items
        WHERE COALESCE(debit_amount, 0) < 0 OR COALESCE(credit_amount, 0) < 0
      `);

      const [negativeLineResult] = await trx.raw(`
        UPDATE gl_entry_items gi
        JOIN (
          SELECT id, debit_amount AS old_debit, credit_amount AS old_credit
          FROM gl_entry_items
          WHERE COALESCE(debit_amount, 0) < 0 OR COALESCE(credit_amount, 0) < 0
        ) x ON x.id = gi.id
        SET gi.debit_amount = CASE
              WHEN COALESCE(x.old_debit, 0) < 0 THEN 0
              WHEN COALESCE(x.old_credit, 0) < 0 THEN ABS(x.old_credit)
              ELSE gi.debit_amount
            END,
            gi.credit_amount = CASE
              WHEN COALESCE(x.old_credit, 0) < 0 THEN 0
              WHEN COALESCE(x.old_debit, 0) < 0 THEN ABS(x.old_debit)
              ELSE gi.credit_amount
            END
      `);
      await logRepair(trx, 'gl', 'negative_gl_lines_before_repair', negativeLineRows[0]?.count || 0);
      await logRepair(trx, 'gl', 'negative_gl_lines_repaired', negativeLineResult.affectedRows);
    }

    if (
      (await hasTable(knex, 'tax_invoices')) &&
      (await hasTable(knex, 'gl_entries')) &&
      (await hasTable(knex, 'gl_entry_items'))
    ) {
      await trx.raw('DROP TEMPORARY TABLE IF EXISTS tmp_tax_empty_gl');
      await trx.raw(`
        CREATE TEMPORARY TABLE tmp_tax_empty_gl AS
        SELECT ti.id AS tax_invoice_id,
               ti.gl_entry_id,
               ti.invoice_number,
               ti.invoice_type,
               ROUND(COALESCE(ti.amount_excluding_tax, 0), 2) AS amount_excluding_tax,
               ROUND(COALESCE(ti.tax_amount, 0), 2) AS tax_amount,
               ROUND(COALESCE(ti.total_amount, 0), 2) AS total_amount
        FROM tax_invoices ti
        JOIN gl_entries ge ON ge.id = ti.gl_entry_id
        LEFT JOIN gl_entry_items gi ON gi.entry_id = ge.id
        WHERE gi.id IS NULL
      `);

      const [taxEmptyRows] = await trx.raw('SELECT COUNT(*) AS count FROM tmp_tax_empty_gl');
      await logRepair(trx, 'tax', 'tax_invoices_linked_empty_gl', taxEmptyRows[0]?.count || 0);
      const accounts = await getTaxAccountIds(
        trx,
        Number(taxEmptyRows[0]?.count || 0) > 0
      );

      await trx.raw(`
        INSERT INTO gl_entry_items
          (entry_id, line_number, account_id, debit_amount, credit_amount, currency_code, exchange_rate, description)
        SELECT gl_entry_id, 1, ?, amount_excluding_tax, 0, 'CNY', 1, CONCAT('VAT input inventory - ', invoice_number)
        FROM tmp_tax_empty_gl
        WHERE HEX(invoice_type) = 'E8BF9BE9A1B9' AND total_amount > 0 AND amount_excluding_tax > 0
      `, [accounts.RAW_MATERIALS]);

      await trx.raw(`
        INSERT INTO gl_entry_items
          (entry_id, line_number, account_id, debit_amount, credit_amount, currency_code, exchange_rate, description)
        SELECT gl_entry_id, 2, ?, tax_amount, 0, 'CNY', 1, CONCAT('VAT input tax - ', invoice_number)
        FROM tmp_tax_empty_gl
        WHERE HEX(invoice_type) = 'E8BF9BE9A1B9' AND total_amount > 0 AND tax_amount > 0
      `, [accounts.VAT_INPUT_TAX]);

      await trx.raw(`
        INSERT INTO gl_entry_items
          (entry_id, line_number, account_id, debit_amount, credit_amount, currency_code, exchange_rate, description)
        SELECT gl_entry_id, 3, ?, 0, total_amount, 'CNY', 1, CONCAT('VAT input payable - ', invoice_number)
        FROM tmp_tax_empty_gl
        WHERE HEX(invoice_type) = 'E8BF9BE9A1B9' AND total_amount > 0
      `, [accounts.ACCOUNTS_PAYABLE]);

      await trx.raw(`
        INSERT INTO gl_entry_items
          (entry_id, line_number, account_id, debit_amount, credit_amount, currency_code, exchange_rate, description)
        SELECT gl_entry_id, 1, ?, total_amount, 0, 'CNY', 1, CONCAT('VAT output receivable - ', invoice_number)
        FROM tmp_tax_empty_gl
        WHERE HEX(invoice_type) = 'E99480E9A1B9' AND total_amount > 0
      `, [accounts.ACCOUNTS_RECEIVABLE]);

      await trx.raw(`
        INSERT INTO gl_entry_items
          (entry_id, line_number, account_id, debit_amount, credit_amount, currency_code, exchange_rate, description)
        SELECT gl_entry_id, 2, ?, 0, amount_excluding_tax, 'CNY', 1, CONCAT('VAT output revenue - ', invoice_number)
        FROM tmp_tax_empty_gl
        WHERE HEX(invoice_type) = 'E99480E9A1B9' AND total_amount > 0 AND amount_excluding_tax > 0
      `, [accounts.SALES_REVENUE]);

      await trx.raw(`
        INSERT INTO gl_entry_items
          (entry_id, line_number, account_id, debit_amount, credit_amount, currency_code, exchange_rate, description)
        SELECT gl_entry_id, 3, ?, 0, tax_amount, 'CNY', 1, CONCAT('VAT output tax - ', invoice_number)
        FROM tmp_tax_empty_gl
        WHERE HEX(invoice_type) = 'E99480E9A1B9' AND total_amount > 0 AND tax_amount > 0
      `, [accounts.VAT_OUTPUT_TAX]);

      const [taxPostedResult] = await trx.raw(`
        UPDATE gl_entries ge
        JOIN tmp_tax_empty_gl t ON t.gl_entry_id = ge.id
        JOIN gl_entry_items gi ON gi.entry_id = ge.id
        SET ge.status = 'posted',
            ge.is_posted = 1
        WHERE t.total_amount > 0
          AND ge.status = 'draft'
      `);
      await logRepair(trx, 'tax', 'rebuilt_tax_invoice_gl_entries', taxPostedResult.affectedRows);

      await trx.raw(`
        UPDATE tax_invoices ti
        JOIN tmp_tax_empty_gl t ON t.tax_invoice_id = ti.id
        SET ti.gl_entry_id = NULL
        WHERE t.total_amount <= 0
      `);
    }

    if ((await hasTable(knex, 'ap_invoices')) && (await hasTable(knex, 'purchase_returns'))) {
      const [apSourceResult] = await trx.raw(`
        UPDATE ap_invoices ai
        JOIN purchase_returns pr ON LOCATE(BINARY pr.return_no, BINARY ai.notes) > 0
        SET ai.source_type = 'purchase_return',
            ai.source_id = pr.id
        WHERE ROUND(COALESCE(ai.total_amount, 0), 2) < 0
          AND (ai.source_type IS NULL OR ai.source_id IS NULL)
      `);
      await logRepair(trx, 'ap', 'credit_notes_relinked_to_purchase_returns', apSourceResult.affectedRows);
    }

    if (await hasTable(knex, 'document_links')) {
      if ((await hasTable(knex, 'ar_invoices')) && (await hasTable(knex, 'sales_returns'))) {
        const [arLinkResult] = await trx.raw(`
          INSERT INTO document_links
            (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
          SELECT 'sales_return', sr.id, sr.return_no, 'ar_invoice', ai.id, ai.invoice_number,
                 'generate', 'finance credit note repair', NULL
          FROM ar_invoices ai
          JOIN sales_returns sr ON sr.id = ai.source_id
          WHERE ai.source_type = 'sales_return'
            AND NOT EXISTS (
              SELECT 1 FROM document_links dl
              WHERE dl.source_type = 'sales_return'
                AND dl.source_id = sr.id
                AND dl.target_type = 'ar_invoice'
                AND dl.target_id = ai.id
            )
        `);
        await logRepair(trx, 'ar', 'credit_note_document_links_inserted', arLinkResult.affectedRows);
      }

      if ((await hasTable(knex, 'ap_invoices')) && (await hasTable(knex, 'purchase_returns'))) {
        const [apLinkResult] = await trx.raw(`
          INSERT INTO document_links
            (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
          SELECT 'purchase_return', pr.id, pr.return_no, 'ap_invoice', ai.id, ai.invoice_number,
                 'generate', 'finance credit note repair', NULL
          FROM ap_invoices ai
          JOIN purchase_returns pr ON pr.id = ai.source_id
          WHERE ai.source_type = 'purchase_return'
            AND NOT EXISTS (
              SELECT 1 FROM document_links dl
              WHERE dl.source_type = 'purchase_return'
                AND dl.source_id = pr.id
                AND dl.target_type = 'ap_invoice'
                AND dl.target_id = ai.id
            )
        `);
        await logRepair(trx, 'ap', 'credit_note_document_links_inserted', apLinkResult.affectedRows);
      }
    }

    if (await hasTable(knex, 'fixed_assets')) {
      const [assetResult] = await trx.raw(`
        UPDATE fixed_assets
        SET current_value = ROUND(GREATEST(
              COALESCE(acquisition_cost, 0) -
              COALESCE(accumulated_depreciation, 0) -
              COALESCE(impairment_amount, 0),
              0
            ), 2),
            net_value = ROUND(GREATEST(
              COALESCE(acquisition_cost, 0) -
              COALESCE(accumulated_depreciation, 0) -
              COALESCE(impairment_amount, 0),
              0
            ), 2)
        WHERE (HEX(status) IN ('E59CA8E794A8', 'E997B2E7BDAE') OR status IN ('in_use', 'idle'))
          AND (
            ABS(ROUND(COALESCE(current_value, 0) - GREATEST(
              COALESCE(acquisition_cost, 0) -
              COALESCE(accumulated_depreciation, 0) -
              COALESCE(impairment_amount, 0),
              0
            ), 2)) >= 0.01
            OR ABS(ROUND(COALESCE(net_value, 0) - GREATEST(
              COALESCE(acquisition_cost, 0) -
              COALESCE(accumulated_depreciation, 0) -
              COALESCE(impairment_amount, 0),
              0
            ), 2)) >= 0.01
          )
      `);
      await logRepair(trx, 'assets', 'active_asset_book_values_recalculated', assetResult.affectedRows);
    }

    if ((await hasTable(knex, 'gl_entries')) && (await hasTable(knex, 'gl_entry_items'))) {
      const [deleteEmptyResult] = await trx.raw(`
        DELETE ge
        FROM gl_entries ge
        LEFT JOIN gl_entry_items gi ON gi.entry_id = ge.id
        WHERE gi.id IS NULL
          AND ge.status = 'draft'
          AND NOT EXISTS (SELECT 1 FROM tax_invoices ti WHERE ti.gl_entry_id = ge.id)
          AND NOT EXISTS (SELECT 1 FROM tax_returns tr WHERE tr.gl_entry_id = ge.id)
          AND NOT EXISTS (SELECT 1 FROM bank_transactions bt WHERE bt.gl_entry_id = ge.id)
          AND NOT EXISTS (SELECT 1 FROM cash_transactions ct WHERE ct.gl_entry_id = ge.id)
          AND NOT EXISTS (
            SELECT 1 FROM document_links dl
            WHERE dl.target_type = 'finance_voucher'
              AND dl.target_id = ge.id
          )
      `);
      await logRepair(trx, 'gl', 'deleted_unreferenced_empty_draft_entries', deleteEmptyResult.affectedRows);
    }
  });
};

exports.down = async function down() {
  // Financial data repair is intentionally not rolled back.
};
