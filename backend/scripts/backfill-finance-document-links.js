#!/usr/bin/env node

const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');

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

const TASKS = [
  {
    name: 'salesOrderToARInvoice',
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM ar_invoices ai
      JOIN sales_orders so ON so.id = ai.source_id
      LEFT JOIN document_links dl
        ON dl.source_type = ai.source_type
       AND dl.source_id = ai.source_id
       AND dl.target_type = 'ar_invoice'
       AND dl.target_id = ai.id
      WHERE ai.source_type = 'sales_order'
        AND ai.source_id IS NOT NULL
        AND dl.id IS NULL
    `,
    insertSql: `
      INSERT IGNORE INTO document_links
        (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
      SELECT
        'sales_order',
        ai.source_id,
        so.order_no,
        'ar_invoice',
        ai.id,
        ai.invoice_number,
        'generate',
        '历史回填: 应收发票自动生成链路',
        NULL
      FROM ar_invoices ai
      JOIN sales_orders so ON so.id = ai.source_id
      LEFT JOIN document_links dl
        ON dl.source_type = 'sales_order'
       AND dl.source_id = ai.source_id
       AND dl.target_type = 'ar_invoice'
       AND dl.target_id = ai.id
      WHERE ai.source_type = 'sales_order'
        AND ai.source_id IS NOT NULL
        AND dl.id IS NULL
    `,
  },
  {
    name: 'salesReturnToARInvoice',
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM ar_invoices ai
      JOIN sales_returns sr ON sr.id = ai.source_id
      LEFT JOIN document_links dl
        ON dl.source_type = ai.source_type
       AND dl.source_id = ai.source_id
       AND dl.target_type = 'ar_invoice'
       AND dl.target_id = ai.id
      WHERE ai.source_type = 'sales_return'
        AND ai.source_id IS NOT NULL
        AND dl.id IS NULL
    `,
    insertSql: `
      INSERT IGNORE INTO document_links
        (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
      SELECT
        'sales_return',
        ai.source_id,
        sr.return_no,
        'ar_invoice',
        ai.id,
        ai.invoice_number,
        'generate',
        '历史回填: 销售退货红字发票链路',
        NULL
      FROM ar_invoices ai
      JOIN sales_returns sr ON sr.id = ai.source_id
      LEFT JOIN document_links dl
        ON dl.source_type = 'sales_return'
       AND dl.source_id = ai.source_id
       AND dl.target_type = 'ar_invoice'
       AND dl.target_id = ai.id
      WHERE ai.source_type = 'sales_return'
        AND ai.source_id IS NOT NULL
        AND dl.id IS NULL
    `,
  },
  {
    name: 'purchaseReceiptToAPInvoice',
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM ap_invoices ai
      JOIN purchase_receipts pr ON pr.id = ai.source_id
      LEFT JOIN document_links dl
        ON dl.source_type = ai.source_type
       AND dl.source_id = ai.source_id
       AND dl.target_type = 'ap_invoice'
       AND dl.target_id = ai.id
      WHERE ai.source_type = 'purchase_receipt'
        AND ai.source_id IS NOT NULL
        AND dl.id IS NULL
    `,
    insertSql: `
      INSERT IGNORE INTO document_links
        (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
      SELECT
        'purchase_receipt',
        ai.source_id,
        pr.receipt_no,
        'ap_invoice',
        ai.id,
        ai.invoice_number,
        'generate',
        '历史回填: 应付发票自动生成链路',
        NULL
      FROM ap_invoices ai
      JOIN purchase_receipts pr ON pr.id = ai.source_id
      LEFT JOIN document_links dl
        ON dl.source_type = 'purchase_receipt'
       AND dl.source_id = ai.source_id
       AND dl.target_type = 'ap_invoice'
       AND dl.target_id = ai.id
      WHERE ai.source_type = 'purchase_receipt'
        AND ai.source_id IS NOT NULL
        AND dl.id IS NULL
    `,
  },
  {
    name: 'purchaseReturnToAPInvoice',
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM ap_invoices ai
      JOIN purchase_returns pr ON pr.id = ai.source_id
      LEFT JOIN document_links dl
        ON dl.source_type = ai.source_type
       AND dl.source_id = ai.source_id
       AND dl.target_type = 'ap_invoice'
       AND dl.target_id = ai.id
      WHERE ai.source_type = 'purchase_return'
        AND ai.source_id IS NOT NULL
        AND dl.id IS NULL
    `,
    insertSql: `
      INSERT IGNORE INTO document_links
        (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
      SELECT
        'purchase_return',
        ai.source_id,
        pr.return_no,
        'ap_invoice',
        ai.id,
        ai.invoice_number,
        'generate',
        '历史回填: 采购退货红字发票链路',
        NULL
      FROM ap_invoices ai
      JOIN purchase_returns pr ON pr.id = ai.source_id
      LEFT JOIN document_links dl
        ON dl.source_type = 'purchase_return'
       AND dl.source_id = ai.source_id
       AND dl.target_type = 'ap_invoice'
       AND dl.target_id = ai.id
      WHERE ai.source_type = 'purchase_return'
        AND ai.source_id IS NOT NULL
        AND dl.id IS NULL
    `,
  },
  {
    name: 'salesOutboundToTaxInvoice',
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM tax_invoices ti
      LEFT JOIN document_links dl
        ON dl.source_type = 'sales_outbound'
       AND dl.source_id = ti.related_document_id
       AND dl.target_type = 'tax_invoice'
       AND dl.target_id = ti.id
      WHERE ti.related_document_type = '销售出库单'
        AND ti.related_document_id IS NOT NULL
        AND dl.id IS NULL
    `,
    insertSql: `
      INSERT IGNORE INTO document_links
        (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
      SELECT
        'sales_outbound',
        ti.related_document_id,
        so.outbound_no,
        'tax_invoice',
        ti.id,
        ti.invoice_number,
        'generate',
        '历史回填: 销项税票自动生成链路',
        ti.created_by
      FROM tax_invoices ti
      JOIN sales_outbound so ON so.id = ti.related_document_id
      LEFT JOIN document_links dl
        ON dl.source_type = 'sales_outbound'
       AND dl.source_id = ti.related_document_id
       AND dl.target_type = 'tax_invoice'
       AND dl.target_id = ti.id
      WHERE ti.related_document_type = '销售出库单'
        AND ti.related_document_id IS NOT NULL
        AND dl.id IS NULL
    `,
  },
  {
    name: 'purchaseReceiptToTaxInvoice',
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM tax_invoices ti
      LEFT JOIN document_links dl
        ON dl.source_type = 'purchase_receipt'
       AND dl.source_id = ti.related_document_id
       AND dl.target_type = 'tax_invoice'
       AND dl.target_id = ti.id
      WHERE ti.related_document_type = '采购入库单'
        AND ti.related_document_id IS NOT NULL
        AND dl.id IS NULL
    `,
    insertSql: `
      INSERT IGNORE INTO document_links
        (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
      SELECT
        'purchase_receipt',
        ti.related_document_id,
        pr.receipt_no,
        'tax_invoice',
        ti.id,
        ti.invoice_number,
        'generate',
        '历史回填: 进项税票自动生成链路',
        ti.created_by
      FROM tax_invoices ti
      JOIN purchase_receipts pr ON pr.id = ti.related_document_id
      LEFT JOIN document_links dl
        ON dl.source_type = 'purchase_receipt'
       AND dl.source_id = ti.related_document_id
       AND dl.target_type = 'tax_invoice'
       AND dl.target_id = ti.id
      WHERE ti.related_document_type = '采购入库单'
        AND ti.related_document_id IS NOT NULL
        AND dl.id IS NULL
    `,
  },
  {
    name: 'salesOutboundToFinanceVoucher',
    countSql: `
      SELECT COUNT(*) AS cnt
      FROM gl_entries ge
      JOIN sales_outbound so
        ON so.outbound_no = ge.document_number
      LEFT JOIN document_links dl
        ON dl.source_type = 'sales_outbound'
       AND dl.source_id = so.id
       AND dl.target_type = 'finance_voucher'
       AND dl.target_id = ge.id
      WHERE ge.document_type = 'sales_outbound'
        AND COALESCE(ge.is_reversed, 0) = 0
        AND dl.id IS NULL
    `,
    insertSql: `
      INSERT IGNORE INTO document_links
        (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
      SELECT
        'sales_outbound',
        so.id,
        so.outbound_no,
        'finance_voucher',
        ge.id,
        ge.entry_number,
        'generate',
        '历史回填: 销售出库成本凭证链路',
        ge.created_by
      FROM gl_entries ge
      JOIN sales_outbound so
        ON so.outbound_no = ge.document_number
      LEFT JOIN document_links dl
        ON dl.source_type = 'sales_outbound'
       AND dl.source_id = so.id
       AND dl.target_type = 'finance_voucher'
       AND dl.target_id = ge.id
      WHERE ge.document_type = 'sales_outbound'
        AND COALESCE(ge.is_reversed, 0) = 0
        AND dl.id IS NULL
    `,
  },
];

const ORPHAN_CHECKS = [
  {
    name: 'apInvoiceMissingPurchaseReceipt',
    sql: `
      SELECT ai.id, ai.invoice_number, ai.source_id, ai.status
      FROM ap_invoices ai
      LEFT JOIN purchase_receipts pr ON pr.id = ai.source_id
      WHERE ai.source_type = 'purchase_receipt'
        AND ai.source_id IS NOT NULL
        AND pr.id IS NULL
      ORDER BY ai.id
      LIMIT 10
    `,
  },
  {
    name: 'arInvoiceMissingSalesOrder',
    sql: `
      SELECT ai.id, ai.invoice_number, ai.source_id, ai.status
      FROM ar_invoices ai
      LEFT JOIN sales_orders so ON so.id = ai.source_id
      WHERE ai.source_type = 'sales_order'
        AND ai.source_id IS NOT NULL
        AND so.id IS NULL
      ORDER BY ai.id
      LIMIT 10
    `,
  },
  {
    name: 'taxInvoiceMissingSourceDocument',
    sql: `
      SELECT ti.id, ti.invoice_number, ti.related_document_type, ti.related_document_id, ti.status
      FROM tax_invoices ti
      LEFT JOIN purchase_receipts pr
        ON ti.related_document_type = '采购入库单'
       AND pr.id = ti.related_document_id
      LEFT JOIN sales_outbound so
        ON ti.related_document_type = '销售出库单'
       AND so.id = ti.related_document_id
      WHERE ti.related_document_id IS NOT NULL
        AND (
          (ti.related_document_type = '采购入库单' AND pr.id IS NULL)
          OR (ti.related_document_type = '销售出库单' AND so.id IS NULL)
        )
      ORDER BY ti.id
      LIMIT 10
    `,
  },
  {
    name: 'salesCostVoucherMissingOutbound',
    sql: `
      SELECT ge.id, ge.entry_number, ge.document_number, ge.status
      FROM gl_entries ge
      LEFT JOIN sales_outbound so ON so.outbound_no = ge.document_number
      WHERE ge.document_type = 'sales_outbound'
        AND ge.document_number IS NOT NULL
        AND ge.document_number NOT LIKE 'R-%'
        AND so.id IS NULL
      ORDER BY ge.id
      LIMIT 10
    `,
  },
];

async function queryScalar(connection, sql) {
  const [rows] = await connection.query(sql);
  return Number(rows[0]?.cnt || 0);
}

async function main() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const summary = [];
    const orphanSummary = [];

    for (const task of TASKS) {
      const pending = await queryScalar(connection, task.countSql);
      let inserted = 0;

      if (APPLY && pending > 0) {
        const [result] = await connection.query(task.insertSql);
        inserted = Number(result.affectedRows || 0);
      }

      summary.push({ task: task.name, pending, inserted });
    }

    for (const check of ORPHAN_CHECKS) {
      const [rows] = await connection.query(check.sql);
      orphanSummary.push({ check: check.name, count: rows.length, samples: rows });
    }

    console.log(`\nFinance document-links backfill (${APPLY ? 'APPLY' : 'DRY RUN'})`);
    console.log('========================================');
    for (const row of summary) {
      console.log(
        `${row.task}: pending=${row.pending}${APPLY ? `, inserted=${row.inserted}` : ''}`
      );
    }

    console.log('\nSource reference integrity');
    console.log('========================================');
    for (const row of orphanSummary) {
      console.log(`${row.check}: samples=${row.count}`);
      for (const sample of row.samples) {
        console.log(`  - ${JSON.stringify(sample)}`);
      }
    }

    if (!APPLY) {
      console.log('\nNo data was changed. Run with --apply to backfill missing finance document links.');
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
