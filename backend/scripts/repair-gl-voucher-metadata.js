'use strict';

// Default is a read-only dry run. Apply requires an explicitly named database.
// Examples:
//   node scripts/repair-gl-voucher-metadata.js --report=output/voucher-metadata.json
//   node scripts/repair-gl-voucher-metadata.js --database=erp_test --apply --entry-ids=12,13
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { getMysqlConnectionOptions } = require('./databaseScriptConfig');
const { runVoucherMetadataRepair } = require('../src/services/finance/glVoucherMetadataRepair');

async function main(args = process.argv.slice(2)) {
  const options = {};
  for (const arg of args) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--database=')) options.database = arg.slice(11);
    else if (arg.startsWith('--entry-ids=')) options.entryIds = arg.slice(12).split(',').map(Number);
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice(8));
    else if (arg.startsWith('--report=')) options.report = arg.slice(9);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.apply && options.dryRun) throw new Error('Choose --apply or --dry-run');
  if (options.apply && !options.database) throw new Error('--apply requires an explicit --database=name');
  const config = getMysqlConnectionOptions({ dateStrings: true, decimalNumbers: false, ...(options.database ? { database: options.database } : {}) });
  const connection = await mysql.createConnection(config);
  try {
    const report = await runVoucherMetadataRepair(connection, { ...options, expectedDatabase: config.database });
    if (options.report) {
      const target = path.resolve(options.report);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
    }
    const { changes, unresolved, ...summary } = report;
    console.log(JSON.stringify({ ...summary, sampleChanges: changes.slice(0, 5), sampleUnresolved: unresolved.slice(0, 10), reportPath: options.report ? path.resolve(options.report) : null }, null, 2));
    return report;
  } finally {
    await connection.end();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
