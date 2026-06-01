#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'production-integration-audit.json');
const mdPath = path.join(outDir, 'production-integration-audit.md');

const rules = [
  {
    id: 'production.plan_product_exists',
    severity: 'critical',
    description: 'Production plans must reference existing active products.',
    sql: `
      SELECT pp.id, pp.code, pp.product_id
      FROM production_plans pp
      LEFT JOIN materials m ON m.id = pp.product_id AND m.deleted_at IS NULL
      WHERE pp.deleted_at IS NULL
        AND m.id IS NULL
    `,
  },
  {
    id: 'production.task_plan_and_product_exist',
    severity: 'critical',
    description: 'Production tasks must reference existing plans and products.',
    sql: `
      SELECT 'missing_plan' AS issue, pt.id, pt.code, pt.plan_id AS reference_id
      FROM production_tasks pt
      LEFT JOIN production_plans pp ON pp.id = pt.plan_id AND pp.deleted_at IS NULL
      WHERE pt.deleted_at IS NULL
        AND pt.plan_id IS NOT NULL
        AND pp.id IS NULL
      UNION ALL
      SELECT 'missing_product' AS issue, pt.id, pt.code, pt.product_id AS reference_id
      FROM production_tasks pt
      LEFT JOIN materials m ON m.id = pt.product_id AND m.deleted_at IS NULL
      WHERE pt.deleted_at IS NULL
        AND m.id IS NULL
    `,
  },
  {
    id: 'production.plan_quantity_not_over_pushed',
    severity: 'critical',
    description: 'Pushed task quantity must not exceed plan quantity.',
    sql: `
      SELECT id, code, quantity, pushed_quantity
      FROM production_plans
      WHERE deleted_at IS NULL
        AND COALESCE(pushed_quantity, 0) - COALESCE(quantity, 0) > 0.01
    `,
  },
  {
    id: 'production.plan_task_quantity_not_over_plan',
    severity: 'critical',
    description: 'Non-cancelled task quantity must not exceed plan quantity.',
    sql: `
      SELECT pp.id, pp.code, pp.quantity, COALESCE(SUM(pt.quantity), 0) AS task_quantity
      FROM production_plans pp
      LEFT JOIN production_tasks pt
        ON pt.plan_id = pp.id
       AND pt.deleted_at IS NULL
       AND pt.status <> 'cancelled'
      WHERE pp.deleted_at IS NULL
      GROUP BY pp.id, pp.code, pp.quantity
      HAVING task_quantity - COALESCE(pp.quantity, 0) > 0.01
    `,
  },
  {
    id: 'production.task_completed_quantity_not_over_task',
    severity: 'critical',
    description: 'Task completed quantity must not exceed task quantity.',
    sql: `
      SELECT id, code, quantity, completed_quantity, status
      FROM production_tasks
      WHERE deleted_at IS NULL
        AND COALESCE(completed_quantity, 0) - COALESCE(quantity, 0) > 0.01
    `,
  },
  {
    id: 'production.completed_tasks_have_reports',
    severity: 'critical',
    description: 'Completed production tasks must have production report evidence.',
    sql: `
      SELECT pt.id, pt.code
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM production_reports pr
          WHERE pr.task_id = pt.id
        )
    `,
  },
  {
    id: 'production.completed_tasks_have_quality_release',
    severity: 'critical',
    description: 'Completed production tasks must have passed or conditional quality evidence.',
    sql: `
      SELECT pt.id, pt.code
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM quality_inspections qi
          WHERE qi.deleted_at IS NULL
            AND qi.inspection_type IN ('final', 'process', 'first_article')
            AND (qi.task_id = pt.id OR qi.reference_id = pt.id OR qi.reference_no = pt.code)
            AND qi.status IN ('passed', 'conditional')
        )
    `,
  },
  {
    id: 'production.completed_tasks_have_finished_goods_inbound',
    severity: 'critical',
    description: 'Completed production tasks must have finished goods inbound ledger evidence.',
    sql: `
      SELECT pt.id, pt.code, pt.quantity, pt.completed_quantity
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_ledger il
          WHERE il.reference_type = 'production_task'
            AND il.reference_no = pt.code
            AND il.transaction_type = 'production_inbound'
            AND il.quantity > 0
        )
    `,
  },
  {
    id: 'production.completed_tasks_have_cost_vouchers',
    severity: 'critical',
    description: 'Completed production tasks with costs must have production GL vouchers.',
    sql: `
      SELECT 'material' AS cost_type, pt.id, pt.code, pt.material_cost AS amount
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND COALESCE(pt.material_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.transaction_id = pt.id
            AND ge.transaction_type IN ('PRODUCTION_MATERIAL', 'PRODUCTION_MATERIAL_ZERO_REPAIR')
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
      UNION ALL
      SELECT 'labor' AS cost_type, pt.id, pt.code, pt.labor_cost AS amount
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND COALESCE(pt.labor_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.transaction_id = pt.id
            AND ge.transaction_type = 'PRODUCTION_LABOR'
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
      UNION ALL
      SELECT 'overhead' AS cost_type, pt.id, pt.code, pt.overhead_cost AS amount
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND COALESCE(pt.overhead_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.transaction_id = pt.id
            AND ge.transaction_type = 'PRODUCTION_OVERHEAD'
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
      UNION ALL
      SELECT 'complete' AS cost_type, pt.id, pt.code, pt.actual_cost AS amount
      FROM production_tasks pt
      WHERE pt.status = 'completed'
        AND pt.deleted_at IS NULL
        AND COALESCE(pt.actual_cost, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM gl_entries ge
          WHERE ge.transaction_id = pt.id
            AND ge.transaction_type = 'PRODUCTION_COMPLETE'
            AND ge.status = 'posted'
            AND COALESCE(ge.is_reversed, 0) = 0
        )
    `,
  },
  {
    id: 'production.processes_are_valid',
    severity: 'high',
    description: 'Production processes must have valid task links and progress values.',
    sql: `
      SELECT 'orphan_process' AS issue, pp.id, pp.task_id, pp.process_name, pp.progress, pp.status
      FROM production_processes pp
      LEFT JOIN production_tasks pt ON pt.id = pp.task_id AND pt.deleted_at IS NULL
      WHERE pt.id IS NULL
      UNION ALL
      SELECT 'invalid_progress' AS issue, pp.id, pp.task_id, pp.process_name, pp.progress, pp.status
      FROM production_processes pp
      WHERE pp.progress < 0
         OR pp.progress > 100
         OR (pp.status = 'completed' AND pp.progress < 100)
    `,
  },
  {
    id: 'production.reports_quantities_match',
    severity: 'critical',
    description: 'Production report quantities must reconcile qualified and defective quantities.',
    sql: `
      SELECT id, report_no, task_id, report_quantity, qualified_quantity, defective_quantity,
             completed_quantity, unqualified_quantity
      FROM production_reports
      WHERE ABS(COALESCE(report_quantity, 0) - COALESCE(qualified_quantity, 0) - COALESCE(defective_quantity, 0)) > 0.01
         OR ABS(COALESCE(completed_quantity, 0) - COALESCE(qualified_quantity, 0)) > 0.01
    `,
  },
  {
    id: 'production.quality_quantities_match',
    severity: 'critical',
    description: 'Completed quality inspections must reconcile qualified and unqualified quantities.',
    sql: `
      SELECT id, inspection_no, quantity, qualified_quantity, unqualified_quantity, status
      FROM quality_inspections
      WHERE deleted_at IS NULL
        AND status IN ('passed', 'failed', 'conditional')
        AND ABS(COALESCE(quantity, 0) - COALESCE(qualified_quantity, 0) - COALESCE(unqualified_quantity, 0)) > 0.01
    `,
  },
  {
    id: 'production.bom_is_usable',
    severity: 'critical',
    description: 'Active BOMs must have valid positive material details.',
    sql: `
      SELECT 'active_without_details' AS issue, bm.id, bm.product_id, bm.version, NULL AS detail_id
      FROM bom_masters bm
      WHERE bm.deleted_at IS NULL
        AND bm.status = 1
        AND NOT EXISTS (SELECT 1 FROM bom_details bd WHERE bd.bom_id = bm.id)
      UNION ALL
      SELECT 'missing_material' AS issue, bd.bom_id AS id, bm.product_id, bm.version, bd.id AS detail_id
      FROM bom_details bd
      JOIN bom_masters bm ON bm.id = bd.bom_id
      LEFT JOIN materials m ON m.id = bd.material_id AND m.deleted_at IS NULL
      WHERE m.id IS NULL
      UNION ALL
      SELECT 'nonpositive_quantity' AS issue, bd.bom_id AS id, bm.product_id, bm.version, bd.id AS detail_id
      FROM bom_details bd
      JOIN bom_masters bm ON bm.id = bd.bom_id
      WHERE COALESCE(bd.quantity, 0) <= 0
    `,
  },
  {
    id: 'production.inventory_documents_have_ledger',
    severity: 'critical',
    description: 'Completed production inventory inbound and outbound documents must have ledger evidence.',
    sql: `
      SELECT 'production_inbound' AS document_type, ii.id, ii.inbound_no AS document_no
      FROM inventory_inbound ii
      WHERE ii.is_deleted = 0
        AND ii.status = 'completed'
        AND ii.inbound_type = 'production'
        AND NOT EXISTS (
          SELECT 1 FROM inventory_ledger il
          WHERE il.reference_no = ii.inbound_no
            AND il.transaction_type IN ('production_inbound', 'inbound', 'in')
        )
      UNION ALL
      SELECT 'production_outbound' AS document_type, io.id, io.outbound_no AS document_no
      FROM inventory_outbound io
      WHERE io.deleted_at IS NULL
        AND io.status IN ('completed', 'partial_completed')
        AND (io.outbound_type IN ('production', 'production_outbound', 'bom_issue', 'supplement')
          OR io.reference_type = 'production_task'
          OR io.production_task_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM inventory_ledger il
          WHERE il.reference_no = io.outbound_no
            AND il.transaction_type IN ('production_outbound', 'outbound', 'out')
        )
    `,
  },
  {
    id: 'production.outsourced_links_are_valid',
    severity: 'critical',
    description: 'Outsourced production receipts must link to existing outsourced processing orders.',
    sql: `
      SELECT r.id, r.receipt_no, r.processing_id
      FROM outsourced_processing_receipts r
      LEFT JOIN outsourced_processings op ON op.id = r.processing_id
      WHERE r.status IN ('confirmed', 'completed')
        AND op.id IS NULL
    `,
  },
  {
    id: 'production.equipment_maintenance_dates_valid',
    severity: 'high',
    description: 'Completed equipment maintenance records must have valid completed dates.',
    sql: `
      SELECT id, equipment_id, maintenance_date, completed_date, status
      FROM equipment_maintenance
      WHERE status = 'completed'
        AND (completed_date IS NULL OR completed_date < maintenance_date)
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
    '# ERP Production Integration Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Area | Result | Count |',
    '| --- | --- | --- |',
    `| Production integration rules | ${report.failedRules.length === 0 ? 'PASS' : 'FAIL'} | ${report.failedRules.length} failed |`,
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

    console.log(`Production integration audit complete: ${report.passed ? 'PASS' : 'FAIL'}`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
    process.exit(report.passed ? 0 : 2);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Production integration audit failed to run:', error.message);
  process.exit(1);
});
