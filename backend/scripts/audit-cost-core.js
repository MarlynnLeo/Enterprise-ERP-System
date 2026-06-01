#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');
const {
  PRICE_VIEW_PERMISSIONS,
  PRICE_UPDATE_PERMISSIONS,
  PRICE_EXPORT_PERMISSIONS,
} = require('../src/utils/desensitizer');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'cost-core-audit.json');
const mdPath = path.join(outDir, 'cost-core-audit.md');

const protectedRouteFiles = [
  'backend/src/routes/financeRoutes.js',
  'backend/src/routes/financeEnhancement.js',
  'backend/src/routes/business/finance/activityCostRoutes.js',
  'backend/src/routes/business/finance/costCenterRoutes.js',
  'backend/src/routes/business/finance/costLedgerRoutes.js',
  'backend/src/routes/baseData.js',
  'backend/src/routes/purchaseRoutes.js',
  'backend/src/routes/inventory.js',
].map((file) => path.join(rootDir, file)).filter((file) => fs.existsSync(file));

const costRouteFiles = [
  'backend/src/routes/financeEnhancement.js',
  'backend/src/routes/business/finance/activityCostRoutes.js',
  'backend/src/routes/business/finance/costCenterRoutes.js',
  'backend/src/routes/business/finance/costLedgerRoutes.js',
].map((file) => path.join(rootDir, file)).filter((file) => fs.existsSync(file));

const amountRouteFiles = [
  'backend/src/routes/baseData.js',
  'backend/src/routes/purchaseRoutes.js',
  'backend/src/routes/inventory.js',
  'backend/src/routes/financeRoutes.js',
  'backend/src/routes/financeEnhancement.js',
].map((file) => path.join(rootDir, file)).filter((file) => fs.existsSync(file));

const integrityRules = [
  {
    id: 'purchase.order_item_amounts_match_quantity_price',
    severity: 'critical',
    description: 'Purchase order item subtotal, tax and total must match quantity, price and tax rate.',
    sql: `
      SELECT id, order_id, material_id, quantity, price, total, amount_excluding_tax, tax_amount
      FROM purchase_order_items
      WHERE ABS(COALESCE(total, 0) - ROUND(COALESCE(quantity, 0) * COALESCE(price, 0), 2)) > 0.05
         OR ABS(COALESCE(amount_excluding_tax, 0) - ROUND(COALESCE(quantity, 0) * COALESCE(price, 0), 2)) > 0.05
         OR ABS(COALESCE(tax_amount, 0) - ROUND(
              COALESCE(quantity, 0)
              * COALESCE(price, 0)
              * CASE WHEN COALESCE(tax_rate, 0) > 1 THEN COALESCE(tax_rate, 0) / 100 ELSE COALESCE(tax_rate, 0) END,
              2
            )) > 0.05
    `,
  },
  {
    id: 'purchase.order_header_matches_items',
    severity: 'critical',
    description: 'Purchase order header subtotal, tax and total must match item sums.',
    sql: `
      SELECT *
      FROM (
        SELECT po.id, po.order_no, po.subtotal, po.tax_amount, po.total_amount,
               ROUND(COALESCE(SUM(poi.total), 0), 2) AS item_subtotal,
               ROUND(COALESCE(SUM(poi.tax_amount), 0), 2) AS item_tax
        FROM purchase_orders po
        LEFT JOIN purchase_order_items poi ON poi.order_id = po.id
        WHERE po.deleted_at IS NULL
        GROUP BY po.id, po.order_no, po.subtotal, po.tax_amount, po.total_amount
      ) x
      WHERE ABS(COALESCE(subtotal, 0) - item_subtotal) > 0.05
         OR ABS(COALESCE(tax_amount, 0) - item_tax) > 0.05
         OR ABS(COALESCE(total_amount, 0) - ROUND(item_subtotal + item_tax, 2)) > 0.05
    `,
  },
  {
    id: 'purchase.receipt_item_amounts_match_quantity_price',
    severity: 'critical',
    description: 'Purchase receipt item amounts must match received quantity, price and tax.',
    sql: `
      SELECT id, receipt_id, order_item_id, material_id, quantity, price, amount_excluding_tax, tax_amount, total_amount
      FROM purchase_receipt_items
      WHERE ABS(COALESCE(amount_excluding_tax, 0) - ROUND(COALESCE(quantity, 0) * COALESCE(price, 0), 2)) > 0.05
         OR ABS(COALESCE(tax_amount, 0) - ROUND(
              COALESCE(quantity, 0)
              * COALESCE(price, 0)
              * CASE WHEN COALESCE(tax_rate, 0) > 1 THEN COALESCE(tax_rate, 0) / 100 ELSE COALESCE(tax_rate, 0) END,
              2
            )) > 0.05
         OR ABS(COALESCE(total_amount, 0) - ROUND(COALESCE(amount_excluding_tax, 0) + COALESCE(tax_amount, 0), 2)) > 0.05
    `,
  },
  {
    id: 'purchase.receipt_item_price_matches_order',
    severity: 'critical',
    description: 'Receipt items linked to purchase orders must inherit the purchase order item price.',
    sql: `
      SELECT pri.id, pri.receipt_id, pri.order_item_id, pri.material_id, pri.price, poi.price AS order_price
      FROM purchase_receipt_items pri
      JOIN purchase_order_items poi ON poi.id = pri.order_item_id
      JOIN purchase_receipts pr ON pr.id = pri.receipt_id
      WHERE pr.status IN ('confirmed', 'completed')
        AND pr.deleted_at IS NULL
        AND ABS(COALESCE(pri.price, 0) - COALESCE(poi.price, 0)) > 0.05
    `,
  },
  {
    id: 'purchase.receipt_header_matches_items',
    severity: 'critical',
    description: 'Purchase receipt header amount must match item totals.',
    sql: `
      SELECT *
      FROM (
        SELECT pr.id, pr.receipt_no, pr.total_amount, pr.total_tax_amount,
               ROUND(COALESCE(SUM(pri.total_amount), 0), 2) AS item_total,
               ROUND(COALESCE(SUM(pri.tax_amount), 0), 2) AS item_tax
        FROM purchase_receipts pr
        LEFT JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
        WHERE pr.deleted_at IS NULL
        GROUP BY pr.id, pr.receipt_no, pr.total_amount, pr.total_tax_amount
      ) x
      WHERE ABS(COALESCE(total_amount, 0) - item_total) > 0.05
         OR ABS(COALESCE(total_tax_amount, 0) - item_tax) > 0.05
    `,
  },
  {
    id: 'purchase.receipts_have_inventory_value',
    severity: 'critical',
    description: 'Confirmed purchase receipt items must have linked inventory ledger cost rows.',
    sql: `
      SELECT pri.id, pr.receipt_no, pri.material_id
      FROM purchase_receipt_items pri
      JOIN purchase_receipts pr ON pr.id = pri.receipt_id
      LEFT JOIN inventory_ledger il ON il.receipt_id = pri.receipt_id AND il.material_id = pri.material_id
      WHERE pr.status IN ('confirmed', 'completed')
        AND pr.deleted_at IS NULL
        AND il.id IS NULL
    `,
  },
  {
    id: 'inventory.ledger_value_matches_quantity_cost',
    severity: 'critical',
    description: 'Inventory ledger total value must equal absolute quantity times unit cost.',
    sql: `
      SELECT id, transaction_type, transaction_no, quantity, unit_cost, total_value
      FROM inventory_ledger
      WHERE unit_cost IS NOT NULL
        AND total_value IS NOT NULL
        AND ABS(ROUND(COALESCE(total_value, 0) - ABS(COALESCE(quantity, 0)) * COALESCE(unit_cost, 0), 2)) > 0.05
    `,
  },
  {
    id: 'inventory.purchase_receipt_ledger_matches_receipt_price',
    severity: 'critical',
    description: 'Inventory ledger cost for purchase receipts must match receipt item price.',
    sql: `
      SELECT il.id, il.receipt_id, il.material_id, il.unit_cost, pri.price
      FROM inventory_ledger il
      JOIN purchase_receipt_items pri ON pri.receipt_id = il.receipt_id AND pri.material_id = il.material_id
      JOIN purchase_receipts pr ON pr.id = pri.receipt_id
      WHERE pr.status IN ('confirmed', 'completed')
        AND pr.deleted_at IS NULL
        AND ABS(COALESCE(il.unit_cost, 0) - COALESCE(pri.price, 0)) > 0.05
    `,
  },
  {
    id: 'production.actual_cost_formula',
    severity: 'critical',
    description: 'Production task actual cost must equal material, labor and overhead cost.',
    sql: `
      SELECT id, code, actual_cost, material_cost, labor_cost, overhead_cost
      FROM production_tasks
      WHERE deleted_at IS NULL
        AND actual_cost IS NOT NULL
        AND ABS(COALESCE(actual_cost, 0) - ROUND(COALESCE(material_cost, 0) + COALESCE(labor_cost, 0) + COALESCE(overhead_cost, 0), 2)) > 0.05
    `,
  },
  {
    id: 'production.costs_nonnegative',
    severity: 'critical',
    description: 'Production task cost fields must not be negative.',
    sql: `
      SELECT id, code, material_cost, labor_cost, overhead_cost, actual_cost
      FROM production_tasks
      WHERE deleted_at IS NULL
        AND (
          COALESCE(material_cost, 0) < 0
          OR COALESCE(labor_cost, 0) < 0
          OR COALESCE(overhead_cost, 0) < 0
          OR COALESCE(actual_cost, 0) < 0
        )
    `,
  },
  {
    id: 'standard_cost.active_rows_are_positive',
    severity: 'critical',
    description: 'Active standard cost rows must have positive prices.',
    sql: `
      SELECT id, material_id, product_id, cost_element, standard_price, status, is_active
      FROM standard_costs
      WHERE is_active = 1
        AND status = 'active'
        AND COALESCE(standard_price, 0) <= 0
    `,
  },
  {
    id: 'standard_cost.active_flag_matches_status',
    severity: 'high',
    description: 'Standard cost active flag must agree with active status.',
    sql: `
      SELECT id, material_id, product_id, cost_element, standard_price, status, is_active
      FROM standard_costs
      WHERE (is_active = 1 AND status <> 'active')
         OR (status = 'active' AND COALESCE(is_active, 0) <> 1)
    `,
  },
  {
    id: 'standard_cost.no_duplicate_active_element',
    severity: 'high',
    description: 'A material/product may only have one active row per cost element.',
    sql: `
      SELECT COALESCE(product_id, 0) AS product_id,
             COALESCE(material_id, 0) AS material_id,
             cost_element,
             COUNT(*) AS active_count
      FROM standard_costs
      WHERE is_active = 1
        AND status = 'active'
      GROUP BY COALESCE(product_id, 0), COALESCE(material_id, 0), cost_element
      HAVING active_count > 1
    `,
  },
  {
    id: 'variance.amounts_match_components',
    severity: 'critical',
    description: 'Cost variance records must equal standard cost minus actual cost.',
    sql: `
      SELECT id, task_id, product_id
      FROM cost_variance_records
      WHERE ABS(COALESCE(standard_total_cost, 0) - ROUND(COALESCE(standard_material_cost, 0) + COALESCE(standard_labor_cost, 0) + COALESCE(standard_overhead_cost, 0), 2)) > 0.05
         OR ABS(COALESCE(actual_total_cost, 0) - ROUND(COALESCE(actual_material_cost, 0) + COALESCE(actual_labor_cost, 0) + COALESCE(actual_overhead_cost, 0), 2)) > 0.05
         OR ABS(COALESCE(material_variance, 0) - ROUND(COALESCE(standard_material_cost, 0) - COALESCE(actual_material_cost, 0), 2)) > 0.05
         OR ABS(COALESCE(labor_variance, 0) - ROUND(COALESCE(standard_labor_cost, 0) - COALESCE(actual_labor_cost, 0), 2)) > 0.05
         OR ABS(COALESCE(overhead_variance, 0) - ROUND(COALESCE(standard_overhead_cost, 0) - COALESCE(actual_overhead_cost, 0), 2)) > 0.05
         OR ABS(COALESCE(total_variance, 0) - ROUND(COALESCE(standard_total_cost, 0) - COALESCE(actual_total_cost, 0), 2)) > 0.05
    `,
  },
  {
    id: 'cost_activity.amounts_nonnegative',
    severity: 'high',
    description: 'Activity cost pools and driver rates must not be negative.',
    sql: `
      SELECT id, code, cost_pool, driver_rate
      FROM cost_activities
      WHERE deleted_at IS NULL
        AND (COALESCE(cost_pool, 0) < 0 OR COALESCE(driver_rate, 0) < 0)
    `,
  },
  {
    id: 'cost_center.parent_exists',
    severity: 'high',
    description: 'Cost center parent references must point to existing cost centers.',
    sql: `
      SELECT c.id, c.code, c.parent_id
      FROM cost_centers c
      LEFT JOIN cost_centers p ON p.id = c.parent_id AND p.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
        AND c.parent_id IS NOT NULL
        AND p.id IS NULL
    `,
  },
];

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

function routeStatements(content) {
  const statements = [];
  const pattern = /router\.(get|post|put|patch|delete)\s*\(/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    let depth = 0;
    let end = match.index;
    let started = false;
    for (; end < content.length; end += 1) {
      const char = content[end];
      if (char === '(') {
        depth += 1;
        started = true;
      } else if (char === ')') {
        depth -= 1;
        if (started && depth === 0) {
          end += 1;
          break;
        }
      }
    }
    const statement = content.slice(match.index, end);
    const pathMatch = statement.match(/router\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/);
    statements.push({
      method: match[1].toUpperCase(),
      path: pathMatch?.[1] || '',
      statement,
    });
    pattern.lastIndex = end;
  }
  return statements;
}

function extractPermissionCodes(statement) {
  const codes = new Set();
  const literalPattern = /requirePermission\(\s*['"`]([^'"`]+)['"`]/g;
  const arrayPattern = /requirePermission\(\s*\[([\s\S]*?)\]/g;
  let match;
  while ((match = literalPattern.exec(statement)) !== null) {
    codes.add(match[1]);
  }
  while ((match = arrayPattern.exec(statement)) !== null) {
    const literalInArray = /['"`]([^'"`]+)['"`]/g;
    let item;
    while ((item = literalInArray.exec(match[1])) !== null) {
      codes.add(item[1]);
    }
  }
  return Array.from(codes);
}

function auditRouteProtection() {
  const fileProtections = protectedRouteFiles.map((file) => {
    const content = fs.readFileSync(file, 'utf8');
    return {
      source: toPosix(path.relative(rootDir, file)),
      hasAuth: /authenticateToken/.test(content),
      hasDesensitize: /desensitizeSensitiveResponse\(\s*['"`]view['"`]\s*\)/.test(content),
      hasMutationGuard: /requirePriceMutationPermission\(\s*['"`]update['"`]\s*\)/.test(content),
    };
  });

  const costRoutes = [];
  for (const file of costRouteFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const route of routeStatements(content)) {
      costRoutes.push({
        source: toPosix(path.relative(rootDir, file)),
        method: route.method,
        path: route.path,
        permissions: extractPermissionCodes(route.statement),
        protected: /requirePermission\(/.test(route.statement),
      });
    }
  }

  const unprotectedCostRoutes = costRoutes.filter((route) => !route.protected);
  const missingAmountMiddleware = fileProtections
    .filter((file) => amountRouteFiles.some((routeFile) => toPosix(path.relative(rootDir, routeFile)) === file.source))
    .filter((file) => !file.hasDesensitize || !file.hasMutationGuard);

  return {
    fileProtections,
    costRoutes,
    unprotectedCostRoutes,
    missingAmountMiddleware,
  };
}

async function registeredPermissionSet(connection) {
  const [rows] = await connection.query(
    `SELECT DISTINCT permission
       FROM menus
      WHERE permission IS NOT NULL
        AND permission <> ''
        AND COALESCE(status, 1) = 1`
  );
  return new Set(rows.map((row) => row.permission));
}

async function runIntegrityRules(connection) {
  const results = [];
  for (const rule of integrityRules) {
    try {
      const [rows] = await connection.query(rule.sql);
      results.push({
        ...rule,
        count: rows.length,
        rows,
        passed: rows.length === 0,
      });
    } catch (error) {
      results.push({
        ...rule,
        count: null,
        rows: [],
        error: error.message,
        passed: false,
      });
    }
  }
  return results;
}

function renderMarkdown(report) {
  const lines = [
    '# ERP Cost Core Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Area | Result | Count |',
    '| --- | --- | --- |',
    `| Cost route permissions | ${report.unprotectedCostRoutes.length === 0 ? 'PASS' : 'FAIL'} | ${report.unprotectedCostRoutes.length} unprotected |`,
    `| Amount middleware | ${report.missingAmountMiddleware.length === 0 ? 'PASS' : 'FAIL'} | ${report.missingAmountMiddleware.length} missing |`,
    `| Sensitive permission registry | ${report.unregisteredSensitivePermissions.length === 0 ? 'PASS' : 'FAIL'} | ${report.unregisteredSensitivePermissions.length} missing |`,
    `| Cost data integrity | ${report.failedIntegrityRules.length === 0 ? 'PASS' : 'FAIL'} | ${report.failedIntegrityRules.length} failed |`,
    '',
    '## Integrity Rules',
    '',
    '| Rule | Severity | Result | Count |',
    '| --- | --- | --- | --- |',
  ];

  for (const result of report.integrityResults) {
    const status = result.error ? 'ERROR' : result.passed ? 'PASS' : 'FAIL';
    lines.push(`| \`${result.id}\` | ${result.severity} | ${status} | ${result.count ?? 'n/a'} |`);
  }

  const sections = [
    ['Unprotected Cost Routes', report.unprotectedCostRoutes],
    ['Amount Middleware Gaps', report.missingAmountMiddleware],
    ['Unregistered Sensitive Permissions', report.unregisteredSensitivePermissions],
    ['Failed Integrity Rule Samples', report.failedIntegrityRules.map((rule) => ({
      id: rule.id,
      description: rule.description,
      error: rule.error,
      rows: rule.rows.slice(0, 20),
    }))],
  ];

  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    lines.push('', `## ${title}`, '', '```json');
    lines.push(JSON.stringify(items, null, 2));
    lines.push('```');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    const routeReport = auditRouteProtection();
    const registeredPermissions = await registeredPermissionSet(connection);
    const sensitivePermissions = Array.from(new Set([
      ...PRICE_VIEW_PERMISSIONS,
      ...PRICE_UPDATE_PERMISSIONS,
      ...PRICE_EXPORT_PERMISSIONS,
    ])).sort();
    const unregisteredSensitivePermissions = sensitivePermissions
      .filter((permission) => !registeredPermissions.has(permission));
    const integrityResults = await runIntegrityRules(connection);
    const failedIntegrityRules = integrityResults.filter((result) => !result.passed);

    const report = {
      passed: routeReport.unprotectedCostRoutes.length === 0
        && routeReport.missingAmountMiddleware.length === 0
        && unregisteredSensitivePermissions.length === 0
        && failedIntegrityRules.length === 0,
      summary: {
        costRouteCount: routeReport.costRoutes.length,
        protectedRouteFileCount: routeReport.fileProtections.length,
        sensitivePermissionCount: sensitivePermissions.length,
        integrityRuleCount: integrityResults.length,
      },
      ...routeReport,
      sensitivePermissions,
      unregisteredSensitivePermissions,
      integrityResults,
      failedIntegrityRules,
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));

    console.log(`Cost core audit complete: ${report.passed ? 'PASS' : 'FAIL'}`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
    process.exit(report.passed ? 0 : 2);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Cost core audit failed to run:', error.message);
  process.exit(1);
});
