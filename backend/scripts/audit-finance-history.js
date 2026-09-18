'use strict';
// All queries execute inside a read-only transaction; this script never repairs data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const mysql=require('mysql2/promise');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const args=process.argv.slice(2);
const database=args.includes('--database')?args[args.indexOf('--database')+1]:'';
assert.match(database,/^[a-zA-Z0-9_]+$/,'Specify a database explicitly');
const {consistencyRules}=require('../src/services/business/DataConsistencyRules');
const checks=consistencyRules.filter(rule=>/^(gl|finance)\./.test(rule.id));
checks.push({id:'finance.expense_category_accounts',description:'费用类别科目及父科目启用状态',sql:`
 SELECT ec.id,ec.code,ec.gl_account_code,ga.is_active,parent.account_code parent_code,parent.is_active parent_active
 FROM expense_categories ec LEFT JOIN gl_accounts ga ON BINARY ga.account_code=BINARY ec.gl_account_code
 LEFT JOIN gl_accounts parent ON parent.id=ga.parent_id
 WHERE ec.status=1 AND ec.deleted_at IS NULL AND ec.gl_account_code IS NOT NULL
 AND (ga.id IS NULL OR ga.is_active<>1 OR parent.is_active<>1)`});
async function main(){
 const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database,dateStrings:true,decimalNumbers:true,multipleStatements:false});
 const report={database,readOnly:true,at:new Date().toISOString(),checks:[]};
 try{
  assert.equal((await c.query('SELECT DATABASE() db'))[0][0].db,database);
  await c.query('SET TRANSACTION READ ONLY');await c.beginTransaction();
  for(const check of checks){try{const [rows]=await c.query({sql:check.sql,timeout:30000});report.checks.push({id:check.id,description:check.description,count:rows.length,rows});}catch(error){report.checks.push({id:check.id,error:error.message});}}
  report.counts={};for(const table of ['gl_entries','ar_invoices','ap_invoices','bank_accounts','bank_transactions','cash_transactions','expenses','fixed_assets','tax_invoices','tax_returns','budgets'])report.counts[table]=(await c.query(`SELECT COUNT(*) n FROM ${table}`))[0][0].n;
  report.pendingPostings=(await c.query("SELECT source_type,finance_status,COUNT(*) n FROM inventory_posting_documents GROUP BY source_type,finance_status"))[0];
  report.financeJobs=(await c.query("SELECT task_name,status,COUNT(*) n FROM sys_failed_jobs WHERE LOWER(task_name) REGEXP 'finance|voucher|tax|cost' GROUP BY task_name,status"))[0];
  report.creditNotes=(await c.query("SELECT 'ar' kind,id,invoice_number,total_amount,balance_amount,source_type FROM ar_invoices WHERE total_amount<0 UNION ALL SELECT 'ap',id,invoice_number,total_amount,balance_amount,source_type FROM ap_invoices WHERE total_amount<0"))[0];
  await c.rollback();
 }finally{await c.end();}
 const out=path.resolve(__dirname,'../logs/finance-audit-20260916_final',`history-${database}.json`);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
 console.log(JSON.stringify({database,readOnly:true,checks:report.checks.map(({rows,...r})=>({...r,examples:rows?.slice(0,3)})),counts:report.counts,pendingPostings:report.pendingPostings,financeJobs:report.financeJobs,creditNotes:report.creditNotes,output:out}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
