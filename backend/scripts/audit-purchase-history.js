'use strict';

// Read-only audit. No business updates, finance approvals or event replays.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const args = process.argv.slice(2);
const database = args.includes('--database') ? args[args.indexOf('--database') + 1] : '';
assert.ok(database, 'Specify --database explicitly');
const { consistencyRules } = require('../src/services/business/DataConsistencyRules');
const checks = consistencyRules.filter(rule => rule.id.startsWith('purchase.')).map(rule => ({
  id: rule.id, description: rule.description, sql: rule.sql,
}));
checks.push(
  { id: 'purchase.ambiguous_inspection_source', sql: `
    SELECT qi.id AS inspection_id, qi.inspection_no, po.order_no, qi.material_id, COUNT(poi.id) AS candidate_lines
    FROM quality_inspections qi
    JOIN purchase_orders po ON po.id=qi.reference_id AND po.deleted_at IS NULL
    JOIN purchase_order_items poi ON poi.order_id=po.id AND poi.material_id=qi.material_id
    WHERE qi.inspection_type='incoming' AND qi.deleted_at IS NULL
      AND COALESCE(qi.source_type,'purchase_order') IN ('','purchase_order')
      AND qi.purchase_order_item_id IS NULL
    GROUP BY qi.id, qi.inspection_no, po.order_no, qi.material_id HAVING COUNT(poi.id)>1` },
  { id: 'purchase.receipt_quantity_bounds', sql: `
    SELECT r.id AS receipt_id, r.receipt_no, r.receipt_date, r.created_at, ri.id AS item_id, ri.received_quantity, ri.qualified_quantity
    FROM purchase_receipts r JOIN purchase_receipt_items ri ON ri.receipt_id=r.id
    WHERE r.deleted_at IS NULL AND r.status <> 'cancelled'
      AND (ri.qualified_quantity>ri.received_quantity+0.000001 OR ri.qualified_quantity<0 OR ri.received_quantity<=0)` },
  { id: 'purchase.return_source_links', sql: `
    SELECT rt.id AS return_id, rt.return_no, rti.id AS item_id, rti.receipt_item_id
    FROM purchase_returns rt JOIN purchase_return_items rti ON rti.return_id=rt.id
    LEFT JOIN purchase_receipt_items ri ON ri.id=rti.receipt_item_id
    WHERE rt.deleted_at IS NULL AND rt.status <> 'cancelled'
      AND (ri.id IS NULL OR ri.receipt_id<>rt.receipt_id OR ri.material_id<>rti.material_id)` },
  { id: 'purchase.return_quantity_bounds', sql: `
    SELECT ri.id AS receipt_item_id, ri.receipt_id, ri.qualified_quantity, SUM(rti.return_quantity) AS returned_quantity
    FROM purchase_receipt_items ri JOIN purchase_return_items rti ON rti.receipt_item_id=ri.id
    JOIN purchase_returns rt ON rt.id=rti.return_id
    WHERE rt.deleted_at IS NULL AND rt.status <> 'cancelled'
    GROUP BY ri.id, ri.receipt_id, ri.qualified_quantity
    HAVING SUM(rti.return_quantity)>COALESCE(ri.qualified_quantity,0)+0.000001` },
  { id: 'purchase.duplicate_inspection_receipts', sql: `
    SELECT inspection_id, COUNT(*) AS receipt_count, GROUP_CONCAT(receipt_no) AS receipt_nos
    FROM purchase_receipts WHERE deleted_at IS NULL AND status <> 'cancelled' AND inspection_id IS NOT NULL
    GROUP BY inspection_id HAVING COUNT(*)>1` },
);

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database,
    dateStrings: true, decimalNumbers: true, multipleStatements: false,
  });
  const report = { database, readOnly: true, at: new Date().toISOString(), checks: [] };
  try {
    const [[selected]] = await connection.query('SELECT DATABASE() AS name');
    assert.equal(selected.name, database);
    await connection.query('SET TRANSACTION READ ONLY');
    await connection.beginTransaction();
    for (const check of checks) {
      const [rows] = await connection.query({ sql: check.sql, timeout: 30000 });
      report.checks.push({ id: check.id, description: check.description, count: rows.length, rows });
    }
    const [postings] = await connection.query(`SELECT source_type, finance_status, COUNT(*) AS count
      FROM inventory_posting_documents WHERE source_type IN
        ('purchase_receipt','purchase_return','outsourced_processing_material','outsourced_processing_receipt')
      GROUP BY source_type, finance_status ORDER BY source_type, finance_status`);
    report.postings = postings;
    const [failedJobs] = await connection.query(`SELECT task_name, status, COUNT(*) AS count
      FROM sys_failed_jobs WHERE task_name LIKE '%purchase%' OR task_name LIKE '%outsourced%'
      GROUP BY task_name, status ORDER BY task_name, status`);
    report.failedJobs = failedJobs;
    const [migrations] = await connection.query('SELECT name, migration_time FROM knex_migrations WHERE name=?', ['20260915000001_repair_purchase_flow_contracts.js']);
    report.migrations = migrations;
    await connection.rollback();
  } finally {
    await connection.end();
  }
  const output = path.resolve(__dirname, '../logs/purchase-audit-20260915', `history-${database}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, checks: report.checks.map(({ rows, ...check }) => ({ ...check, examples: rows.slice(0, 3) })) }));
  console.log(`Evidence: ${output}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
