'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');
const requireBackend = createRequire(path.resolve(__dirname, '../../backend/package.json'));
const { getMysqlConnectionOptions } = require('../../backend/scripts/databaseScriptConfig');
const DATABASE = process.env.CHAIN_DATABASE || 'erp_purchase_audit_test_20261017_chain';
if (!/^erp_purchase_audit_test_20261017_chain(?:_\w+)?$/.test(DATABASE)) throw new Error('Refusing non-isolated chain database');
const source = getMysqlConnectionOptions();
if (source.database === DATABASE) throw new Error('Test target must differ from configured source');
module.exports = {
  DATABASE, requireBackend,
  dbConfig: { ...source, database: DATABASE, dateStrings:true, decimalNumbers:true },
  baseUrl: 'http://127.0.0.1:3511', apiUrl:'http://127.0.0.1:3510',
  evidenceDir: path.resolve(__dirname,'../../output/playwright/full-chain'),
};
