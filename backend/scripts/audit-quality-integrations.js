#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'quality-integration-audit.json');
const mdPath = path.join(outDir, 'quality-integration-audit.md');

const rules = [
  {
    id: 'quality.inspection_numbers_unique',
    severity: 'critical',
    description: 'Active inspection numbers must be unique.',
    sql: `
      SELECT inspection_no, COUNT(*) AS duplicate_count
      FROM quality_inspections
      WHERE deleted_at IS NULL
      GROUP BY inspection_no
      HAVING COUNT(*) > 1
    `,
  },
  {
    id: 'quality.inspections_reference_existing_materials',
    severity: 'critical',
    description: 'Inspections with material or product ids must reference existing materials.',
    sql: `
      SELECT 'missing_material' AS issue, qi.id, qi.inspection_no, qi.material_id AS reference_id
      FROM quality_inspections qi
      LEFT JOIN materials m ON m.id = qi.material_id AND m.deleted_at IS NULL
      WHERE qi.deleted_at IS NULL
        AND qi.material_id IS NOT NULL
        AND m.id IS NULL
      UNION ALL
      SELECT 'missing_product' AS issue, qi.id, qi.inspection_no, qi.product_id AS reference_id
      FROM quality_inspections qi
      LEFT JOIN materials m ON m.id = qi.product_id AND m.deleted_at IS NULL
      WHERE qi.deleted_at IS NULL
        AND qi.product_id IS NOT NULL
        AND m.id IS NULL
    `,
  },
  {
    id: 'quality.incoming_purchase_references_valid',
    severity: 'high',
    description: 'Incoming inspections with purchase references must link to purchase orders or receipts.',
    sql: `
      SELECT qi.id, qi.inspection_no, qi.reference_id, qi.reference_no
      FROM quality_inspections qi
      WHERE qi.deleted_at IS NULL
        AND qi.inspection_type = 'incoming'
        AND (qi.reference_id IS NOT NULL OR qi.reference_no IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM purchase_orders po
          WHERE (qi.reference_id IS NOT NULL AND po.id = qi.reference_id)
             OR (qi.reference_no IS NOT NULL AND po.order_no = qi.reference_no)
        )
        AND NOT EXISTS (
          SELECT 1 FROM purchase_receipts pr
          WHERE (qi.reference_id IS NOT NULL AND pr.id = qi.reference_id)
             OR (qi.reference_no IS NOT NULL AND pr.receipt_no = qi.reference_no)
        )
    `,
  },
  {
    id: 'quality.production_references_valid',
    severity: 'critical',
    description: 'Process, first-article, and final inspections must link to valid production tasks when task references exist.',
    sql: `
      SELECT qi.id, qi.inspection_no, qi.inspection_type, qi.task_id, qi.reference_id, qi.reference_no
      FROM quality_inspections qi
      WHERE qi.deleted_at IS NULL
        AND qi.inspection_type IN ('process', 'first_article', 'final')
        AND (qi.task_id IS NOT NULL OR qi.reference_id IS NOT NULL OR qi.reference_no IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM production_tasks pt
          WHERE pt.deleted_at IS NULL
            AND (
              (qi.task_id IS NOT NULL AND pt.id = qi.task_id)
              OR (qi.reference_id IS NOT NULL AND pt.id = qi.reference_id)
              OR (qi.reference_no IS NOT NULL AND pt.code = qi.reference_no)
            )
        )
    `,
  },
  {
    id: 'quality.terminal_quantities_reconcile',
    severity: 'critical',
    description: 'Terminal inspections must reconcile total, qualified, and unqualified quantities.',
    sql: `
      SELECT id, inspection_no, inspection_type, status, quantity, qualified_quantity, unqualified_quantity
      FROM quality_inspections
      WHERE deleted_at IS NULL
        AND status IN ('passed', 'failed', 'partial', 'completed', 'conditional')
        AND (
          COALESCE(quantity, 0) <= 0
          OR ABS(COALESCE(quantity, 0) - COALESCE(qualified_quantity, 0) - COALESCE(unqualified_quantity, 0)) > 0.01
          OR COALESCE(qualified_quantity, 0) < 0
          OR COALESCE(unqualified_quantity, 0) < 0
          OR (status IN ('passed', 'completed', 'conditional') AND COALESCE(unqualified_quantity, 0) > 0.01)
          OR (status = 'failed' AND COALESCE(qualified_quantity, 0) > 0.01)
          OR (status = 'partial' AND (COALESCE(qualified_quantity, 0) <= 0 OR COALESCE(unqualified_quantity, 0) <= 0))
        )
    `,
  },
  {
    id: 'quality.failed_or_partial_have_ncp',
    severity: 'critical',
    description: 'Terminal inspections with unqualified quantity must have NCP records.',
    sql: `
      SELECT qi.id, qi.inspection_no, qi.inspection_type, qi.status, qi.unqualified_quantity
      FROM quality_inspections qi
      WHERE qi.deleted_at IS NULL
        AND qi.status IN ('failed', 'partial')
        AND COALESCE(qi.unqualified_quantity, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM nonconforming_products ncp
          WHERE ncp.deleted_at IS NULL
            AND ncp.inspection_id = qi.id
        )
    `,
  },
  {
    id: 'quality.ncp_inspection_links_valid',
    severity: 'critical',
    description: 'NCP records must link to valid inspections and not exceed unqualified quantities.',
    sql: `
      SELECT 'missing_inspection' AS issue, ncp.id, ncp.ncp_no, ncp.inspection_id, ncp.quantity, NULL AS inspection_unqualified_quantity
      FROM nonconforming_products ncp
      LEFT JOIN quality_inspections qi ON qi.id = ncp.inspection_id AND qi.deleted_at IS NULL
      WHERE ncp.deleted_at IS NULL
        AND ncp.inspection_id IS NOT NULL
        AND qi.id IS NULL
      UNION ALL
      SELECT 'quantity_over_unqualified' AS issue, ncp.id, ncp.ncp_no, ncp.inspection_id, ncp.quantity, qi.unqualified_quantity AS inspection_unqualified_quantity
      FROM nonconforming_products ncp
      JOIN quality_inspections qi ON qi.id = ncp.inspection_id AND qi.deleted_at IS NULL
      WHERE ncp.deleted_at IS NULL
        AND COALESCE(ncp.quantity, 0) - COALESCE(qi.unqualified_quantity, 0) > 0.01
    `,
  },
  {
    id: 'quality.incoming_passed_have_purchase_receipts',
    severity: 'critical',
    description: 'Incoming inspections with accepted quantity must have purchase receipt evidence.',
    sql: `
      SELECT qi.id, qi.inspection_no, qi.reference_id, qi.reference_no, qi.qualified_quantity
      FROM quality_inspections qi
      WHERE qi.deleted_at IS NULL
        AND qi.inspection_type = 'incoming'
        AND qi.status IN ('passed', 'partial', 'completed', 'conditional')
        AND COALESCE(qi.qualified_quantity, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM purchase_receipts pr
          WHERE pr.deleted_at IS NULL
            AND pr.status <> 'cancelled'
            AND (
              pr.inspection_id = qi.id
              OR pr.receipt_no = qi.reference_no
              OR pr.order_id = qi.reference_id
              OR pr.order_no = qi.reference_no
            )
        )
    `,
  },
  {
    id: 'quality.purchase_receipts_from_inspection_valid',
    severity: 'critical',
    description: 'Purchase receipts generated from inspections must have valid inspection and item evidence.',
    sql: `
      SELECT 'missing_inspection' AS issue, pr.id, pr.receipt_no, pr.inspection_id
      FROM purchase_receipts pr
      LEFT JOIN quality_inspections qi ON qi.id = pr.inspection_id AND qi.deleted_at IS NULL
      WHERE pr.deleted_at IS NULL
        AND pr.status <> 'cancelled'
        AND pr.from_inspection = 1
        AND (pr.inspection_id IS NULL OR qi.id IS NULL)
      UNION ALL
      SELECT 'missing_items' AS issue, pr.id, pr.receipt_no, pr.inspection_id
      FROM purchase_receipts pr
      WHERE pr.deleted_at IS NULL
        AND pr.status <> 'cancelled'
        AND pr.from_inspection = 1
        AND NOT EXISTS (
          SELECT 1 FROM purchase_receipt_items pri
          WHERE pri.receipt_id = pr.id
        )
    `,
  },
  {
    id: 'quality.final_passed_have_inbound_when_task_completed',
    severity: 'critical',
    description: 'Accepted final inspections for completed production tasks must have finished-goods inbound evidence.',
    sql: `
      SELECT qi.id, qi.inspection_no, qi.task_id, qi.reference_id, qi.reference_no, qi.qualified_quantity
      FROM quality_inspections qi
      JOIN production_tasks pt
        ON pt.deleted_at IS NULL
       AND pt.status = 'completed'
       AND (
          pt.id = qi.task_id
          OR pt.id = qi.reference_id
          OR pt.code = qi.reference_no
       )
      WHERE qi.deleted_at IS NULL
        AND qi.inspection_type = 'final'
        AND qi.status IN ('passed', 'partial', 'completed', 'conditional')
        AND COALESCE(qi.qualified_quantity, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM inventory_ledger il
          WHERE il.reference_type = 'production_task'
            AND il.reference_no = pt.code
            AND il.transaction_type IN ('production_inbound', 'inbound')
            AND il.quantity > 0
        )
    `,
  },
  {
    id: 'quality.completed_ncp_dispositions_have_side_effects',
    severity: 'critical',
    description: 'Completed NCPs must have side-effect documents matching their disposition.',
    sql: `
      SELECT ncp.id, ncp.ncp_no, ncp.disposition, ncp.status
      FROM nonconforming_products ncp
      WHERE ncp.deleted_at IS NULL
        AND ncp.status IN ('completed', 'closed')
        AND ncp.disposition IN ('return', 'replacement', 'rework', 'scrap', 'use_as_is')
        AND (
          (ncp.disposition = 'return' AND NOT EXISTS (
            SELECT 1 FROM document_links dl
            WHERE dl.source_type = 'nonconforming_product'
              AND dl.source_id = ncp.id
              AND dl.target_type = 'purchase_return'
          ) AND NOT EXISTS (
            SELECT 1 FROM purchase_returns pr
            WHERE pr.source_type IN ('ncp_return', 'ncp_replacement')
              AND pr.reason LIKE CONCAT('%', ncp.ncp_no, '%')
          ))
          OR (ncp.disposition = 'replacement' AND NOT EXISTS (
            SELECT 1 FROM replacement_orders ro
            WHERE ro.ncp_id = ncp.id
          ))
          OR (ncp.disposition = 'rework' AND NOT EXISTS (
            SELECT 1 FROM rework_tasks rt
            WHERE rt.ncp_id = ncp.id
          ))
          OR (ncp.disposition = 'scrap' AND NOT EXISTS (
            SELECT 1 FROM scrap_records sr
            WHERE sr.ncp_id = ncp.id
          ))
          OR (ncp.disposition = 'use_as_is' AND NOT EXISTS (
            SELECT 1 FROM document_links dl
            WHERE dl.source_type = 'nonconforming_product'
              AND dl.source_id = ncp.id
              AND dl.target_type IN ('inventory_inbound', 'purchase_receipt')
          ) AND NOT EXISTS (
            SELECT 1 FROM inventory_inbound ii
            WHERE ii.is_deleted = 0
              AND ii.reference_type = 'ncp'
              AND ii.reference_id = ncp.id
          ))
        )
    `,
  },
  {
    id: 'quality.disposition_documents_link_valid_ncp',
    severity: 'critical',
    description: 'Rework, replacement, and scrap documents must link to valid NCP records.',
    sql: `
      SELECT 'rework_task' AS document_type, rt.id, rt.rework_no AS document_no, rt.ncp_id
      FROM rework_tasks rt
      LEFT JOIN nonconforming_products ncp ON ncp.id = rt.ncp_id AND ncp.deleted_at IS NULL
      WHERE rt.ncp_id IS NOT NULL AND ncp.id IS NULL
      UNION ALL
      SELECT 'replacement_order' AS document_type, ro.id, ro.replacement_no AS document_no, ro.ncp_id
      FROM replacement_orders ro
      LEFT JOIN nonconforming_products ncp ON ncp.id = ro.ncp_id AND ncp.deleted_at IS NULL
      WHERE ro.ncp_id IS NOT NULL AND ncp.id IS NULL
      UNION ALL
      SELECT 'scrap_record' AS document_type, sr.id, sr.scrap_no AS document_no, sr.ncp_id
      FROM scrap_records sr
      LEFT JOIN nonconforming_products ncp ON ncp.id = sr.ncp_id AND ncp.deleted_at IS NULL
      WHERE sr.ncp_id IS NOT NULL AND ncp.id IS NULL
    `,
  },
  {
    id: 'quality.document_links_resolve_for_quality_documents',
    severity: 'high',
    description: 'Quality document links must resolve to existing source and target documents.',
    sql: `
      SELECT dl.id, dl.source_type, dl.source_id, dl.source_code, dl.target_type, dl.target_id, dl.target_code
      FROM document_links dl
      WHERE dl.source_type IN ('quality_inspection', 'nonconforming_product', 'rework_task', 'replacement_order', 'scrap_record')
        AND (
          (dl.source_type = 'quality_inspection' AND NOT EXISTS (SELECT 1 FROM quality_inspections qi WHERE qi.id = dl.source_id AND qi.deleted_at IS NULL))
          OR (dl.source_type = 'nonconforming_product' AND NOT EXISTS (SELECT 1 FROM nonconforming_products ncp WHERE ncp.id = dl.source_id AND ncp.deleted_at IS NULL))
          OR (dl.source_type = 'rework_task' AND NOT EXISTS (SELECT 1 FROM rework_tasks rt WHERE rt.id = dl.source_id))
          OR (dl.source_type = 'replacement_order' AND NOT EXISTS (SELECT 1 FROM replacement_orders ro WHERE ro.id = dl.source_id))
          OR (dl.source_type = 'scrap_record' AND NOT EXISTS (SELECT 1 FROM scrap_records sr WHERE sr.id = dl.source_id))
          OR (dl.target_type = 'quality_inspection' AND NOT EXISTS (SELECT 1 FROM quality_inspections qi WHERE qi.id = dl.target_id AND qi.deleted_at IS NULL))
          OR (dl.target_type = 'nonconforming_product' AND NOT EXISTS (SELECT 1 FROM nonconforming_products ncp WHERE ncp.id = dl.target_id AND ncp.deleted_at IS NULL))
          OR (dl.target_type = 'rework_task' AND NOT EXISTS (SELECT 1 FROM rework_tasks rt WHERE rt.id = dl.target_id))
          OR (dl.target_type = 'replacement_order' AND NOT EXISTS (SELECT 1 FROM replacement_orders ro WHERE ro.id = dl.target_id))
          OR (dl.target_type = 'scrap_record' AND NOT EXISTS (SELECT 1 FROM scrap_records sr WHERE sr.id = dl.target_id))
          OR (dl.target_type = 'purchase_return' AND NOT EXISTS (SELECT 1 FROM purchase_returns pr WHERE pr.id = dl.target_id))
          OR (dl.target_type = 'purchase_receipt' AND NOT EXISTS (SELECT 1 FROM purchase_receipts pr WHERE pr.id = dl.target_id AND pr.deleted_at IS NULL))
          OR (dl.target_type = 'inventory_inbound' AND NOT EXISTS (SELECT 1 FROM inventory_inbound ii WHERE ii.id = dl.target_id AND ii.is_deleted = 0))
        )
    `,
  },
  {
    id: 'quality.active_templates_have_items',
    severity: 'high',
    description: 'Active inspection templates must have inspection items.',
    sql: `
      SELECT it.id, it.template_name, it.inspection_type
      FROM inspection_templates it
      WHERE COALESCE(it.status, 'active') IN ('active', '1', 1)
        AND NOT EXISTS (
          SELECT 1 FROM template_item_mappings tim
          WHERE tim.template_id = it.id
        )
    `,
  },
  {
    id: 'quality.required_general_templates_exist',
    severity: 'high',
    description: 'Core inspection types must have active general/default templates.',
    sql: `
      SELECT required.inspection_type
      FROM (
        SELECT 'incoming' AS inspection_type
        UNION ALL SELECT 'process'
        UNION ALL SELECT 'final'
        UNION ALL SELECT 'first_article'
      ) required
      WHERE NOT EXISTS (
        SELECT 1 FROM inspection_templates it
        WHERE COALESCE(it.status, 'active') IN ('active', '1', 1)
          AND it.inspection_type = required.inspection_type
          AND (COALESCE(it.is_general, 0) = 1 OR COALESCE(it.is_default, 0) = 1)
      )
    `,
  },
];

async function runRules(connection) {
  const results = [];
  for (const rule of rules) {
    try {
      const [rows] = await connection.query(rule.sql);
      results.push({ ...rule, count: rows.length, rows, passed: rows.length === 0 });
    } catch (error) {
      results.push({ ...rule, count: null, rows: [], error: error.message, passed: false });
    }
  }
  return results;
}

function renderMarkdown(report) {
  const lines = [
    '# ERP Quality Integration Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Area | Result | Count |',
    '| --- | --- | --- |',
    `| Quality integration rules | ${report.failedRules.length === 0 ? 'PASS' : 'FAIL'} | ${report.failedRules.length} failed |`,
    '',
    '## Rules',
    '',
    '| Rule | Severity | Result | Count |',
    '| --- | --- | --- | --- |',
  ];

  for (const result of report.results) {
    const status = result.error ? 'ERROR' : result.passed ? 'PASS' : 'FAIL';
    lines.push(`| \`${result.id}\` | ${result.severity} | ${status} | ${result.count ?? 'n/a'} |`);
  }

  if (report.failedRules.length > 0) {
    lines.push('', '## Failed Rule Samples', '', '```json');
    lines.push(JSON.stringify(
      report.failedRules.map((rule) => ({
        id: rule.id,
        severity: rule.severity,
        description: rule.description,
        error: rule.error,
        rows: rule.rows.slice(0, 30),
      })),
      null,
      2
    ));
    lines.push('```');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    const results = await runRules(connection);
    const failedRules = results.filter((result) => !result.passed);
    const report = {
      passed: failedRules.length === 0,
      summary: {
        ruleCount: results.length,
        failedRuleCount: failedRules.length,
      },
      results,
      failedRules,
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));

    console.log(`Quality integration audit complete: ${report.passed ? 'PASS' : 'FAIL'}`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
    process.exit(report.passed ? 0 : 2);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Quality integration audit failed to run:', error.message);
  process.exit(1);
});
