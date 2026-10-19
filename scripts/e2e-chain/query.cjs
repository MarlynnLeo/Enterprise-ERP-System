'use strict';
// Read-only diagnostics. Mutating fixtures and business actions have separate entry points.
const { dbConfig, requireBackend } = require('./config.cjs');
async function main() {
  const sql = process.argv[2];
  if (!/^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i.test(sql || '')) throw new Error('Read-only SQL required');
  const db = await requireBackend('mysql2/promise').createConnection(dbConfig);
  try { const [rows]=await db.query(sql); console.log(JSON.stringify(rows,null,2)); }
  finally { await db.end(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
