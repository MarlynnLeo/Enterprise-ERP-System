const db = require('../src/config/db');
const { INVENTORY_TRANSACTION_TYPES } = require('../src/constants/systemConstants');

const REQUIRED_SOURCE_CODES = [
  'inbound',
  'outbound',
  'inbound_cancel',
  'outbound_cancel',
  'transfer_cancel_in',
  'transfer_cancel_out',
];

async function run() {
  const [ledgerTypes] = await db.pool.query(
    `SELECT transaction_type, COUNT(*) AS count
     FROM inventory_ledger
     GROUP BY transaction_type
     ORDER BY transaction_type`
  );
  const [dictionaryTypes] = await db.pool.query(
    `SELECT code, name, category
     FROM business_types
     WHERE group_code = 'inventory_transaction' AND status = 1`
  );
  const dictionary = new Map(dictionaryTypes.map((item) => [item.code, item]));
  const codes = new Set([
    ...ledgerTypes.map((item) => item.transaction_type),
    ...REQUIRED_SOURCE_CODES,
  ]);

  const findings = [];
  for (const code of codes) {
    const backendLabel = INVENTORY_TRANSACTION_TYPES[code];
    const dictionaryItem = dictionary.get(code);
    if (!backendLabel) findings.push({ code, issue: 'missing_backend_mapping' });
    if (!dictionaryItem) findings.push({ code, issue: 'missing_dictionary_mapping' });
    if (dictionaryItem && (!dictionaryItem.name?.trim() || /^[?]+$/.test(dictionaryItem.name))) {
      findings.push({ code, issue: 'invalid_dictionary_name', name: dictionaryItem.name });
    }
    if (dictionaryItem && !['in', 'out', 'transfer', 'adjust'].includes(dictionaryItem.category)) {
      findings.push({ code, issue: 'invalid_dictionary_category', category: dictionaryItem.category });
    }
  }

  console.log(`inventory transaction types used: ${ledgerTypes.length}`);
  console.log(`inventory transaction mapping findings: ${findings.length}`);
  if (findings.length) {
    console.log(JSON.stringify(findings, null, 2));
    process.exitCode = 1;
  } else {
    console.log('Result: OK');
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
