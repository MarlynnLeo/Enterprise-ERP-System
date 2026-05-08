#!/usr/bin/env node

const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');
const SAMPLE_LIMIT = Number(
  (process.argv.find((arg) => arg.startsWith('--sample=')) || '').split('=')[1] || 10
);

const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  decimalNumbers: true,
  dateStrings: true,
  multipleStatements: false,
};

class FinanceClosureRunner {
  constructor(connection) {
    this.connection = connection;
    this.summary = {
      salesOutbound: {
        candidates: 0,
        repaired: 0,
        samples: [],
        failures: [],
      },
      purchaseReceipt: {
        candidates: 0,
        repaired: 0,
        samples: [],
        failures: [],
      },
      paidExpenses: {
        count: 0,
        samples: [],
      },
      depreciationDuplicates: {
        count: 0,
        samples: [],
      },
      pendingFailedJobs: {
        count: 0,
        samples: [],
      },
    };
  }

  async queryRows(sql, params = []) {
    const [rows] = await this.connection.execute(sql, params);
    return rows;
  }

  async loadSalesOutboundCandidates() {
    const rows = await this.queryRows(
      `SELECT
         so.id,
         so.outbound_no,
         so.order_id,
         so.delivery_date,
         so.created_by,
         EXISTS (
           SELECT 1
           FROM gl_entries ge
           WHERE ge.document_type = 'sales_outbound'
             AND ge.document_number = so.outbound_no
             AND COALESCE(ge.is_reversed, 0) = 0
         ) AS has_cost_entry,
         EXISTS (
           SELECT 1
           FROM tax_invoices ti
           WHERE ti.related_document_type = '销售出库单'
             AND ti.related_document_id = so.id
             AND ti.status <> '已作废'
         ) AS has_output_tax_invoice,
         CASE
           WHEN so.order_id IS NULL THEN 1
           ELSE EXISTS (
             SELECT 1
             FROM ar_invoices ai
             WHERE ai.source_type = 'sales_order'
               AND ai.source_id = so.order_id
               AND ai.status <> '已取消'
           )
         END AS has_ar_invoice
       FROM sales_outbound so
       WHERE so.status = 'completed'
       HAVING has_cost_entry = 0
           OR has_output_tax_invoice = 0
           OR has_ar_invoice = 0
       ORDER BY so.id`
    );

    this.summary.salesOutbound.candidates = rows.length;
    this.summary.salesOutbound.samples = rows.slice(0, SAMPLE_LIMIT);
    return rows;
  }

  async loadPurchaseReceiptCandidates() {
    const rows = await this.queryRows(
      `SELECT
         pr.id,
         pr.receipt_no,
         pr.receipt_date,
         pr.supplier_id,
         pr.created_at,
         EXISTS (
           SELECT 1
           FROM ap_invoices ai
           WHERE ai.source_type = 'purchase_receipt'
             AND ai.source_id = pr.id
             AND ai.status <> '已取消'
         ) AS has_ap_invoice,
         EXISTS (
           SELECT 1
           FROM tax_invoices ti
           WHERE ti.related_document_type = '采购入库单'
             AND ti.related_document_id = pr.id
             AND ti.status <> '已作废'
         ) AS has_input_tax_invoice
       FROM purchase_receipts pr
       WHERE pr.status = 'completed'
       HAVING has_ap_invoice = 0
           OR has_input_tax_invoice = 0
       ORDER BY pr.id`
    );

    this.summary.purchaseReceipt.candidates = rows.length;
    this.summary.purchaseReceipt.samples = rows.slice(0, SAMPLE_LIMIT);
    return rows;
  }

  async loadPaidExpenseManualReview() {
    const rows = await this.queryRows(
      `SELECT
         e.id,
         e.expense_number,
         e.paid_at,
         e.payment_transaction_id
       FROM expenses e
       WHERE e.status = 'paid'
         AND (
           e.payment_transaction_id IS NULL
           OR NOT EXISTS (
             SELECT 1
             FROM bank_transactions bt
             WHERE bt.id = e.payment_transaction_id
           )
           OR NOT EXISTS (
             SELECT 1
             FROM gl_entries ge
             WHERE ge.document_type = '费用单'
               AND ge.document_number = e.expense_number
               AND COALESCE(ge.is_reversed, 0) = 0
           )
         )
       ORDER BY e.id`
    );

    this.summary.paidExpenses.count = rows.length;
    this.summary.paidExpenses.samples = rows.slice(0, SAMPLE_LIMIT);
  }

  async loadDepreciationManualReview() {
    const rows = await this.queryRows(
      `SELECT asset_id, depreciation_date, COUNT(*) AS duplicate_count
       FROM fixed_asset_depreciation_details
       GROUP BY asset_id, depreciation_date
       HAVING COUNT(*) > 1
       ORDER BY asset_id, depreciation_date`
    );

    this.summary.depreciationDuplicates.count = rows.length;
    this.summary.depreciationDuplicates.samples = rows.slice(0, SAMPLE_LIMIT);
  }

  async loadPendingFailedJobs() {
    const rows = await this.queryRows(
      `SELECT id, task_name, status, created_at
       FROM sys_failed_jobs
       WHERE status IN ('pending', 'retrying')
         AND (
           task_name LIKE '%Finance%'
           OR task_name LIKE '%Cost%'
           OR task_name LIKE '%AP%'
           OR task_name LIKE '%AR%'
           OR task_name LIKE '%Tax%'
         )
       ORDER BY created_at DESC`
    );

    this.summary.pendingFailedJobs.count = rows.length;
    this.summary.pendingFailedJobs.samples = rows.slice(0, SAMPLE_LIMIT);
  }

  async fetchSalesOrder(orderId) {
    const rows = await this.queryRows(
      `SELECT so.*, c.name AS customer_name
       FROM sales_orders so
       LEFT JOIN customers c ON c.id = so.customer_id
       WHERE so.id = ?`,
      [orderId]
    );
    return rows[0] || null;
  }

  async fetchPurchaseReceipt(receiptId) {
    const rows = await this.queryRows(
      `SELECT pr.*, s.name AS supplier_name
       FROM purchase_receipts pr
       LEFT JOIN suppliers s ON s.id = pr.supplier_id
       WHERE pr.id = ?`,
      [receiptId]
    );
    return rows[0] || null;
  }

  async repairSalesOutboundCandidates(rows) {
    if (!APPLY || rows.length === 0) return;

    const FinanceIntegrationService = require('../src/services/external/FinanceIntegrationService');

    for (const row of rows) {
      try {
        if (!row.has_ar_invoice && row.order_id) {
          const salesOrder = await this.fetchSalesOrder(row.order_id);
          if (salesOrder) {
            await FinanceIntegrationService.generateARInvoiceFromSalesOrder(salesOrder);
          }
        }

        if (!row.has_cost_entry) {
          await FinanceIntegrationService.generateCostEntryFromSalesOutbound({
            id: row.id,
            outbound_no: row.outbound_no,
            delivery_date: row.delivery_date,
            created_by: row.created_by,
          });
        }

        if (!row.has_output_tax_invoice) {
          const salesOrder = row.order_id ? await this.fetchSalesOrder(row.order_id) : null;
          await FinanceIntegrationService.generateOutputTaxInvoiceFromSalesOutbound({
            id: row.id,
            outbound_no: row.outbound_no,
            outbound_date: row.delivery_date,
            delivery_date: row.delivery_date,
            customer_id: salesOrder?.customer_id || null,
            customer_name: salesOrder?.customer_name || null,
            created_by: row.created_by,
          });
        }

        this.summary.salesOutbound.repaired += 1;
      } catch (error) {
        this.summary.salesOutbound.failures.push({
          outbound_no: row.outbound_no,
          reason: error.message,
        });
      }
    }
  }

  async repairPurchaseReceiptCandidates(rows) {
    if (!APPLY || rows.length === 0) return;

    const FinanceIntegrationService = require('../src/services/external/FinanceIntegrationService');

    for (const row of rows) {
      try {
        const receipt = await this.fetchPurchaseReceipt(row.id);
        if (!receipt) {
          throw new Error('purchase receipt missing');
        }

        if (!row.has_ap_invoice) {
          await FinanceIntegrationService.generateAPInvoiceFromPurchaseReceipt(receipt);
        }

        if (!row.has_input_tax_invoice) {
          await FinanceIntegrationService.generateInputTaxInvoiceFromPurchaseReceipt(receipt);
        }

        this.summary.purchaseReceipt.repaired += 1;
      } catch (error) {
        this.summary.purchaseReceipt.failures.push({
          receipt_no: row.receipt_no,
          reason: error.message,
        });
      }
    }
  }

  printRows(title, rows) {
    if (!rows || rows.length === 0) return;
    console.log(title);
    for (const row of rows.slice(0, SAMPLE_LIMIT)) {
      console.log(`  - ${JSON.stringify(row)}`);
    }
    if (rows.length > SAMPLE_LIMIT) {
      console.log(`  ... ${rows.length - SAMPLE_LIMIT} more`);
    }
  }

  printSummary() {
    console.log(`\nFinance automation closure (${APPLY ? 'APPLY' : 'DRY RUN'})`);
    console.log('========================================');
    console.log(`Sales outbound candidates: ${this.summary.salesOutbound.candidates}`);
    if (APPLY) console.log(`  repaired: ${this.summary.salesOutbound.repaired}`);
    this.printRows('  sales outbound samples:', this.summary.salesOutbound.samples);
    this.printRows('  sales outbound failures:', this.summary.salesOutbound.failures);

    console.log(`Purchase receipt candidates: ${this.summary.purchaseReceipt.candidates}`);
    if (APPLY) console.log(`  repaired: ${this.summary.purchaseReceipt.repaired}`);
    this.printRows('  purchase receipt samples:', this.summary.purchaseReceipt.samples);
    this.printRows('  purchase receipt failures:', this.summary.purchaseReceipt.failures);

    console.log(`Paid expenses needing manual review: ${this.summary.paidExpenses.count}`);
    this.printRows('  expense samples:', this.summary.paidExpenses.samples);

    console.log(
      `Depreciation duplicate groups needing manual review: ${this.summary.depreciationDuplicates.count}`
    );
    this.printRows('  depreciation samples:', this.summary.depreciationDuplicates.samples);

    console.log(`Pending finance DLQ jobs: ${this.summary.pendingFailedJobs.count}`);
    this.printRows('  failed job samples:', this.summary.pendingFailedJobs.samples);

    if (!APPLY) {
      console.log('\nNo data was changed. Run with --apply to backfill missing finance automation outputs.');
    }
  }

  async run() {
    const salesOutboundRows = await this.loadSalesOutboundCandidates();
    const purchaseReceiptRows = await this.loadPurchaseReceiptCandidates();
    await this.loadPaidExpenseManualReview();
    await this.loadDepreciationManualReview();
    await this.loadPendingFailedJobs();

    await this.repairSalesOutboundCandidates(salesOutboundRows);
    await this.repairPurchaseReceiptCandidates(purchaseReceiptRows);

    this.printSummary();
  }
}

async function main() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }

  const connection = await mysql.createConnection(dbConfig);
  try {
    const runner = new FinanceClosureRunner(connection);
    await runner.run();
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
