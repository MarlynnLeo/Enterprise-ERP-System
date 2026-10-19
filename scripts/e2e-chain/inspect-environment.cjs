'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const requireBackend = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const mysql = requireBackend('mysql2/promise');
const { getMysqlConnectionOptions } = require('../../backend/scripts/databaseScriptConfig');
async function main() {
  const config = getMysqlConnectionOptions();
  const db = await mysql.createConnection(config);
  try {
    const [schemas] = await db.query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE 'erp%test%'");
    const [migrations] = await db.query("SELECT name FROM knex_migrations ORDER BY id DESC LIMIT 6");
    const [sizes] = await db.query('SELECT COUNT(*) AS tables, ROUND(SUM(data_length+index_length)/1024/1024,2) AS mb FROM information_schema.TABLES WHERE TABLE_SCHEMA=?',[config.database]);
    const result = { source: config.database, schemas, migrations, sizes };
    fs.mkdirSync(path.resolve(__dirname, '../../output/playwright/full-chain'), {recursive:true});
    fs.writeFileSync(path.resolve(__dirname, '../../output/playwright/full-chain/environment.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  } finally { await db.end(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
