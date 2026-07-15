const db = require('../src/config/db');
const CodeGeneratorService = require('../src/services/business/CodeGeneratorService');

const NEEDED = [
  'ar_invoice',
  'ap_invoice',
  'ar_receipt',
  'ap_payment',
  'ar_receipt_batch',
  'ap_payment_batch',
  'budget',
  'expense',
  'expense_payment',
  'cash_transaction',
  'bank_transaction',
  'tax_payment',
  'asset',
  'asset_depreciation',
  'asset_disposal',
  'cost_version',
];

async function main() {
  const placeholders = NEEDED.map(() => '?').join(',');
  const [rows] = await db.pool.execute(
    `SELECT business_type, prefix, reset_cycle, is_active
     FROM coding_rules
     WHERE business_type IN (${placeholders})`,
    NEEDED
  );
  const map = new Map(rows.map((row) => [row.business_type, row]));

  console.log('=== coding rules ===');
  let missing = 0;
  for (const type of NEEDED) {
    const rule = map.get(type);
    if (!rule) {
      missing += 1;
      console.log(`${type}: MISSING`);
    } else {
      console.log(`${type}: OK ${rule.prefix}/${rule.reset_cycle} active=${rule.is_active}`);
    }
  }

  console.log('=== code preview (read-only) ===');
  for (const type of ['budget', 'tax_payment', 'bank_transaction', 'ar_invoice']) {
    const code = await CodeGeneratorService.previewCode(type);
    console.log(`${type} => ${code}`);
  }

  const [indexes] = await db.pool.execute(
    `SELECT INDEX_NAME, TABLE_NAME
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND INDEX_NAME IN (?, ?, ?)
     GROUP BY INDEX_NAME, TABLE_NAME`,
    ['uk_ar_invoices_source', 'uk_ap_invoices_source', 'uk_tax_invoices_related_document']
  );
  console.log('=== unique indexes ===');
  console.log(indexes);

  if (missing > 0) {
    process.exitCode = 1;
  }
  process.exit(process.exitCode || 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
