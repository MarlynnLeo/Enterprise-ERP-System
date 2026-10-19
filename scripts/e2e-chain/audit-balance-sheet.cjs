'use strict';

// Executes the real report calculations against the isolated fixture through a
// SELECT-only adapter. Never rewrites the opening trial balance or vouchers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { dbConfig, requireBackend, DATABASE, evidenceDir } = require('./config.cjs');

(async () => {
  const connection = await requireBackend('mysql2/promise').createConnection(dbConfig);
  const directory = path.join(evidenceDir, `balance-sheet-audit-${Date.now()}`);
  fs.mkdirSync(directory, { recursive: true });
  const read = async (sql, params = []) => {
    assert.match(sql, /^\s*SELECT\b/i, 'Report audit refuses any SQL write');
    return connection.execute(sql, params);
  };
  const adapter = { execute: read, query: read, release() {} };
  // The report service receives the same read-only connection for every query.
  const dbPath = require.resolve('../../backend/src/config/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
    exports: { pool: { ...adapter, getConnection: async () => adapter } } };
  try {
    const reports = require('../../backend/src/services/business/FinancialReportsService');
    const date = '2026-10-17';
    const [[target]] = await read('SELECT DATABASE() AS name');
    assert.equal(target.name, DATABASE);
    const [opening] = await read('SELECT account_type,opening_balance_date,SUM(opening_debit) AS debit,SUM(opening_credit) AS credit FROM gl_accounts GROUP BY account_type,opening_balance_date');
    const [posted] = await read('SELECT e.entry_date,SUM(i.debit_amount) AS debit,SUM(i.credit_amount) AS credit FROM gl_entry_items i JOIN gl_entries e ON e.id=i.entry_id WHERE e.is_posted=1 AND e.entry_date<=? GROUP BY e.entry_date',[date]);
    const [assets, liabilities, equity, income, cost, expense, adjustments] = await Promise.all([
      reports.calculateAccountBalance('资产',date), reports.calculateAccountBalance('负债',date),
      reports.calculateAccountBalance('所有者权益',date),
      ...['收入','成本','费用'].map(type=>reports.calculatePeriodAmount(type,'2026-01-01',date,null,null,{includeClosingEntries:true})),
      reports.calculateBalanceSheetAdjustments(date),
    ]);
    const periodProfit=reports.roundAmount(income.totalAmount-cost.totalAmount-expense.totalAmount);
    const oldFormula={assets:assets.totalBalance,liabilities:liabilities.totalBalance,equity:equity.totalBalance+periodProfit,periodProfit};
    oldFormula.difference=reports.roundAmount(oldFormula.assets-oldFormula.liabilities-oldFormula.equity);
    const production=adjustments.production.filter(a=>a.currentBalance!==0);
    const omittedProfit=reports.roundAmount(adjustments.profit-periodProfit);
    const omittedProduction=reports.roundAmount(production.reduce((sum,a)=>sum+a.currentBalance,0));
    const corrected=await reports.generateBalanceSheet(date,'2026-07-31');
    assert.equal(reports.roundAmount(oldFormula.difference-omittedProfit+omittedProduction),0,'Both omissions must explain the exact original difference');
    assert.equal(corrected.summary.isBalanced,true);
    assert.equal(corrected.summary.balanceDifference,0);
    assert.equal(corrected.assets.totalCompareAmount,0,'Pre-opening date must exclude future opening balances');
    assert.equal(corrected.equity.totalCompareAmount,0);
    const result={database:DATABASE,date,opening,posted,oldFormula,omittedProfit,omittedProduction,production,correctedSummary:corrected.summary};
    fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(result,null,2));
    fs.writeFileSync(path.join(directory,'corrected-report.json'),JSON.stringify(corrected,null,2));
    console.log(JSON.stringify(result,null,2));
    console.log('Evidence: '+directory);
  } finally { await connection.end(); }
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
