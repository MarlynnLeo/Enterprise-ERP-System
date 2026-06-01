#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'invoice-generation-audit.json');
const mdPath = path.join(outDir, 'invoice-generation-audit.md');

const rules = [
  {
    id: 'ar.items_have_display_name',
    severity: 'high',
    description: 'AR invoice items must resolve to a product/material name, code, or non-empty description.',
    sql: `
      SELECT ai.id AS invoice_id, ai.invoice_number, aii.id AS item_id,
             aii.product_id, m.code, m.name, aii.description
      FROM ar_invoice_items aii
      JOIN ar_invoices ai ON ai.id = aii.invoice_id
      LEFT JOIN materials m ON m.id = aii.product_id
      WHERE COALESCE(aii.description, '') = ''
        AND COALESCE(m.name, '') = ''
        AND COALESCE(m.code, '') = ''
      LIMIT 100
    `,
  },
  {
    id: 'ap.items_have_display_name',
    severity: 'high',
    description: 'AP invoice items must resolve to a material name, code, or non-empty description.',
    sql: `
      SELECT api.invoice_id, ai.invoice_number, api.id AS item_id,
             api.material_id, m.code, m.name, api.description
      FROM ap_invoice_items api
      JOIN ap_invoices ai ON ai.id = api.invoice_id
      LEFT JOIN materials m ON m.id = api.material_id
      WHERE COALESCE(api.description, '') = ''
        AND COALESCE(m.name, '') = ''
        AND COALESCE(m.code, '') = ''
      LIMIT 100
    `,
  },
  {
    id: 'ar.item_amounts_match_quantity_price',
    severity: 'critical',
    description: 'AR invoice item amount must equal quantity * unit price to cents.',
    sql: `
      SELECT ai.id AS invoice_id, ai.invoice_number, aii.id AS item_id,
             aii.quantity, aii.unit_price, aii.amount,
             ROUND(COALESCE(aii.quantity, 0) * COALESCE(aii.unit_price, 0), 2) AS expected_amount
      FROM ar_invoice_items aii
      JOIN ar_invoices ai ON ai.id = aii.invoice_id
      WHERE ABS(ROUND(COALESCE(aii.amount, 0), 2)
        - ROUND(COALESCE(aii.quantity, 0) * COALESCE(aii.unit_price, 0), 2)) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'ap.item_amounts_match_quantity_price',
    severity: 'critical',
    description: 'AP invoice item amount must equal quantity * unit price to cents.',
    sql: `
      SELECT ai.id AS invoice_id, ai.invoice_number, api.id AS item_id,
             api.quantity, api.unit_price, api.amount,
             ROUND(COALESCE(api.quantity, 0) * COALESCE(api.unit_price, 0), 2) AS expected_amount
      FROM ap_invoice_items api
      JOIN ap_invoices ai ON ai.id = api.invoice_id
      WHERE ABS(ROUND(COALESCE(api.amount, 0), 2)
        - ROUND(COALESCE(api.quantity, 0) * COALESCE(api.unit_price, 0), 2)) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'ar.header_total_matches_items',
    severity: 'critical',
    description: 'AR invoice header total must match the sum of invoice items.',
    sql: `
      SELECT ai.id, ai.invoice_number, ai.total_amount,
             ROUND(COALESCE(SUM(aii.amount), 0), 2) AS item_total
      FROM ar_invoices ai
      LEFT JOIN ar_invoice_items aii ON aii.invoice_id = ai.id
      GROUP BY ai.id, ai.invoice_number, ai.total_amount
      HAVING ABS(ROUND(COALESCE(ai.total_amount, 0), 2) - item_total) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'ap.header_total_matches_items',
    severity: 'critical',
    description: 'AP invoice header total must match the sum of invoice items.',
    sql: `
      SELECT ai.id, ai.invoice_number, ai.total_amount,
             ROUND(COALESCE(SUM(api.amount), 0), 2) AS item_total
      FROM ap_invoices ai
      LEFT JOIN ap_invoice_items api ON api.invoice_id = ai.id
      GROUP BY ai.id, ai.invoice_number, ai.total_amount
      HAVING ABS(ROUND(COALESCE(ai.total_amount, 0), 2) - item_total) > 0.01
      LIMIT 100
    `,
  },
  {
    id: 'ar.sales_order_items_are_represented',
    severity: 'high',
    description: 'AR invoices generated from sales orders must contain invoice lines for every source order material. Adjustment lines are allowed.',
    sql: `
      SELECT ai.id, ai.invoice_number, ai.source_id AS sales_order_id,
             soi.id AS source_item_id, soi.material_id
      FROM ar_invoices ai
      JOIN sales_order_items soi ON soi.order_id = ai.source_id
      WHERE ai.source_type = 'sales_order'
        AND NOT EXISTS (
          SELECT 1
          FROM ar_invoice_items aii
          WHERE aii.invoice_id = ai.id
            AND aii.product_id = soi.material_id
        )
      LIMIT 100
    `,
  },
  {
    id: 'ap.purchase_receipt_item_count_matches_source',
    severity: 'high',
    description: 'AP invoices generated from purchase receipts must have the same item count as the source receipt.',
    sql: `
      SELECT ai.id, ai.invoice_number, ai.source_id AS receipt_id,
             COUNT(DISTINCT api.id) AS invoice_item_count,
             COUNT(DISTINCT pri.id) AS source_item_count
      FROM ap_invoices ai
      LEFT JOIN ap_invoice_items api ON api.invoice_id = ai.id
      LEFT JOIN purchase_receipt_items pri ON pri.receipt_id = ai.source_id
      WHERE ai.source_type = 'purchase_receipt'
      GROUP BY ai.id, ai.invoice_number, ai.source_id
      HAVING invoice_item_count <> source_item_count
      LIMIT 100
    `,
  },
  {
    id: 'ar.external_invoice_number_column_exists',
    severity: 'critical',
    description: 'AR must keep the real customer/tax invoice number separately from the internal ERP invoice number.',
    sql: `
      SELECT 'missing customer_invoice_number column' AS issue
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'ar_invoices'
          AND column_name = 'customer_invoice_number'
      )
    `,
  },
  {
    id: 'ap.external_invoice_number_column_exists',
    severity: 'critical',
    description: 'AP must keep the supplier invoice number separately from the internal ERP invoice number.',
    sql: `
      SELECT 'missing supplier_invoice_number column' AS issue
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'ap_invoices'
          AND column_name = 'supplier_invoice_number'
      )
    `,
  },
];

async function runRules(connection) {
  const results = [];
  for (const rule of rules) {
    try {
      const [rows] = await connection.query(rule.sql);
      results.push({ ...rule, passed: rows.length === 0, count: rows.length, rows });
    } catch (error) {
      results.push({ ...rule, passed: false, count: null, rows: [], error: error.message });
    }
  }
  return results;
}

function renderMarkdown(report) {
  const lines = [
    '# ERP Invoice Generation Audit',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    `Summary: ${report.summary.passed}/${report.summary.total} rules passed.`,
    '',
    '| Rule | Severity | Result | Count |',
    '| --- | --- | --- | ---: |',
  ];

  for (const result of report.results) {
    lines.push(
      `| ${result.id} | ${result.severity} | ${result.passed ? 'PASS' : 'FAIL'} | ${result.count ?? 'ERR'} |`
    );
  }

  const failed = report.results.filter((result) => !result.passed);
  if (failed.length > 0) {
    lines.push('', '## Failed Rules');
    for (const result of failed) {
      lines.push('', `### ${result.id}`, '', result.description);
      if (result.error) {
        lines.push('', `Error: ${result.error}`);
      } else {
        lines.push('', 'Sample rows:', '', '```json');
        lines.push(JSON.stringify(result.rows.slice(0, 10), null, 2));
        lines.push('```');
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    const results = await runRules(connection);
    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length,
      },
      results,
    };

    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(mdPath, renderMarkdown(report));

    for (const result of results) {
      const status = result.passed ? 'PASS' : 'FAIL';
      console.log(`${status} ${result.id} (${result.count ?? 'ERR'})`);
      if (result.error) console.log(`  ${result.error}`);
    }
    console.log(`\nReport: ${path.relative(rootDir, mdPath)}`);

    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
