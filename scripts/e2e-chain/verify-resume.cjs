'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DATABASE, dbConfig, requireBackend, evidenceDir } = require('./config.cjs');

async function main() {
  const fixture = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'fixture.private.json'), 'utf8'));
  const chain = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'chain.json'), 'utf8'));
  const finance = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'finance-fixture.json'), 'utf8'));
  assert.equal(fixture.database, DATABASE);
  assert.equal(chain.financeComplete, true, 'First finish the chain before testing a completed-chain resume');
  const db = await requireBackend('mysql2/promise').createConnection(dbConfig);
  const dir = path.join(evidenceDir, `resume-verification-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  const query = async (sql, args = []) => (await db.query(sql, args))[0];
  const snapshot = async () => {
    const counts = {};
    for (const table of ['sales_orders', 'sales_outbound', 'purchase_orders', 'purchase_receipts', 'production_tasks',
      'production_reports', 'inventory_posting_documents', 'inventory_ledger', 'inventory_reservations',
      'ar_invoices', 'ap_invoices', 'ar_receipts', 'ap_payments', 'bank_transactions', 'gl_entries', 'gl_entry_items', 'tax_invoices']) {
      counts[table] = Number((await query(`SELECT COUNT(*) AS count FROM ${table}`))[0].count);
    }
    return {
      counts,
      order: await query('SELECT id,status FROM sales_orders WHERE id=?', [chain.order.id]),
      task: await query('SELECT id,status,completed_quantity,actual_cost FROM production_tasks WHERE id=?', [chain.task.id]),
      stock: await query('SELECT material_id,SUM(quantity) AS quantity,SUM(total_value) AS value FROM inventory_ledger WHERE material_id IN (?,?,?) GROUP BY material_id ORDER BY material_id',
        [fixture.materials.internal.id, fixture.materials.external.id, fixture.materials.raw.id]),
      bank: await query('SELECT id,current_balance FROM bank_accounts WHERE id=?', [finance.bank.id]),
    };
  };
  let before;
  try {
    before = await snapshot();
    const run = spawnSync(process.execPath, [path.join(__dirname, 'continue.cjs')], { env: process.env, stdio: 'inherit' });
    if (run.error) throw run.error;
    assert.equal(run.status, 0, 'Every resumed phase must pass');
    const after = await snapshot();
    assert.deepEqual(after, before, 'A completed-chain resume must not create documents or change stock, bank balance or fulfillment');
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ status: 'PASS', database: DATABASE, before, after }, null, 2));
    console.log(`PASS completed-chain resume is idempotent. Evidence: ${dir}`);
  } catch (error) {
    fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ status: 'FAIL', error: error.stack, before, after: await snapshot().catch(() => null) }, null, 2));
    throw error;
  } finally { await db.end(); }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
