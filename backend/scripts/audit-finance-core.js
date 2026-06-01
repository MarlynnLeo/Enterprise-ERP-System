#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

const rootDir = path.resolve(__dirname, '..', '..');
const backendDir = path.join(rootDir, 'backend', 'src');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'finance-core-audit.json');
const mdPath = path.join(outDir, 'finance-core-audit.md');

const financeRouteFiles = [
  'backend/src/routes/financeRoutes.js',
  'backend/src/routes/financeEnhancement.js',
  'backend/src/routes/business/finance/activityCostRoutes.js',
  'backend/src/routes/business/finance/budgetRoutes.js',
  'backend/src/routes/business/finance/costCenterRoutes.js',
  'backend/src/routes/business/finance/costLedgerRoutes.js',
  'backend/src/routes/business/finance/financeAutomationRoutes.js',
  'backend/src/routes/business/finance/taxRoutes.js',
].map((file) => path.join(rootDir, file)).filter((file) => fs.existsSync(file));

const financeIntegrityRules = [
  {
    id: 'gl.entries_have_items',
    severity: 'critical',
    description: 'Every GL entry must have at least two journal lines.',
    sql: `
      SELECT e.id, e.entry_number, COUNT(i.id) AS item_count
      FROM gl_entries e
      LEFT JOIN gl_entry_items i ON i.entry_id = e.id
      GROUP BY e.id, e.entry_number
      HAVING item_count < 2
    `,
  },
  {
    id: 'gl.posted_entries_balanced',
    severity: 'critical',
    description: 'Posted and reversed GL entries must balance debit and credit.',
    sql: `
      SELECT e.id, e.entry_number,
             ROUND(SUM(COALESCE(i.debit_amount, 0)), 2) AS debit_total,
             ROUND(SUM(COALESCE(i.credit_amount, 0)), 2) AS credit_total
      FROM gl_entries e
      JOIN gl_entry_items i ON i.entry_id = e.id
      WHERE e.status IN ('posted', 'reversed')
      GROUP BY e.id, e.entry_number
      HAVING ABS(debit_total - credit_total) > 0.01
    `,
  },
  {
    id: 'gl.entry_items_have_accounts',
    severity: 'critical',
    description: 'GL entry lines must reference existing accounts.',
    sql: `
      SELECT i.id, i.entry_id, i.account_id
      FROM gl_entry_items i
      LEFT JOIN gl_accounts a ON a.id = i.account_id
      WHERE a.id IS NULL
    `,
  },
  {
    id: 'gl.posted_flag_matches_status',
    severity: 'high',
    description: 'Posted/reversed entries must have is_posted = 1; draft entries must not be posted.',
    sql: `
      SELECT id, entry_number, status, is_posted
      FROM gl_entries
      WHERE (status IN ('posted', 'reversed') AND COALESCE(is_posted, 0) <> 1)
         OR (status = 'draft' AND COALESCE(is_posted, 0) <> 0)
    `,
  },
  {
    id: 'gl.reversal_links_valid',
    severity: 'high',
    description: 'Reversed GL entries must link to an existing reversal entry.',
    sql: `
      SELECT e.id, e.entry_number, e.reversal_entry_id
      FROM gl_entries e
      LEFT JOIN gl_entries r ON r.id = e.reversal_entry_id
      WHERE e.status = 'reversed'
        AND (e.reversal_entry_id IS NULL OR r.id IS NULL)
    `,
  },
  {
    id: 'gl.closed_period_no_drafts',
    severity: 'critical',
    description: 'Closed accounting periods must not contain draft GL entries.',
    sql: `
      SELECT e.id, e.entry_number, e.period_id, p.period_name, e.status
      FROM gl_entries e
      JOIN gl_periods p ON p.id = e.period_id
      WHERE COALESCE(p.is_closed, 0) = 1
        AND e.status = 'draft'
    `,
  },
  {
    id: 'ar.invoice_total_matches_items',
    severity: 'critical',
    description: 'AR invoice header total must match item totals.',
    sql: `
      SELECT i.id, i.invoice_number, i.total_amount,
             ROUND(COALESCE(SUM(item.amount), 0), 2) AS item_total
      FROM ar_invoices i
      LEFT JOIN ar_invoice_items item ON item.invoice_id = i.id
      WHERE i.status NOT IN ('已取消', 'cancelled', 'void')
      GROUP BY i.id, i.invoice_number, i.total_amount
      HAVING ABS(COALESCE(i.total_amount, 0) - item_total) > 0.01
    `,
  },
  {
    id: 'ap.invoice_total_matches_items',
    severity: 'critical',
    description: 'AP invoice header total must match item totals.',
    sql: `
      SELECT i.id, i.invoice_number, i.total_amount,
             ROUND(COALESCE(SUM(item.amount), 0), 2) AS item_total
      FROM ap_invoices i
      LEFT JOIN ap_invoice_items item ON item.invoice_id = i.id
      WHERE i.status NOT IN ('已取消', 'cancelled', 'void')
      GROUP BY i.id, i.invoice_number, i.total_amount
      HAVING ABS(COALESCE(i.total_amount, 0) - item_total) > 0.01
    `,
  },
  {
    id: 'ar.receipt_total_matches_items',
    severity: 'critical',
    description: 'AR receipt total must match non-void receipt item totals.',
    sql: `
      SELECT r.id, r.receipt_number, r.total_amount,
             ROUND(COALESCE(SUM(ri.amount), 0), 2) AS item_total
      FROM ar_receipts r
      LEFT JOIN ar_receipt_items ri ON ri.receipt_id = r.id
      WHERE r.status <> 'void'
      GROUP BY r.id, r.receipt_number, r.total_amount
      HAVING ABS(COALESCE(r.total_amount, 0) - item_total) > 0.01
    `,
  },
  {
    id: 'ap.payment_total_matches_items',
    severity: 'critical',
    description: 'AP payment total must match non-void payment item totals.',
    sql: `
      SELECT p.id, p.payment_number, p.total_amount,
             ROUND(COALESCE(SUM(pi.amount), 0), 2) AS item_total
      FROM ap_payments p
      LEFT JOIN ap_payment_items pi ON pi.payment_id = p.id
      WHERE p.status <> 'void'
      GROUP BY p.id, p.payment_number, p.total_amount
      HAVING ABS(COALESCE(p.total_amount, 0) - item_total) > 0.01
    `,
  },
  {
    id: 'ar.invoice_balance_matches_receipts',
    severity: 'critical',
    description: 'AR invoice paid/balance amounts must match non-void receipts.',
    sql: `
      SELECT i.id, i.invoice_number, i.total_amount, i.paid_amount, i.balance_amount,
             ROUND(COALESCE(SUM(CASE WHEN r.id IS NOT NULL THEN ri.amount ELSE 0 END), 0), 2) AS received_amount
      FROM ar_invoices i
      LEFT JOIN ar_receipt_items ri ON ri.invoice_id = i.id
      LEFT JOIN ar_receipts r ON r.id = ri.receipt_id AND r.status <> 'void'
      WHERE i.status NOT IN ('已取消', 'cancelled', 'void')
      GROUP BY i.id, i.invoice_number, i.total_amount, i.paid_amount, i.balance_amount
      HAVING ABS(COALESCE(i.paid_amount, 0) - received_amount) > 0.01
          OR ABS(COALESCE(i.balance_amount, 0) - (COALESCE(i.total_amount, 0) - received_amount)) > 0.01
    `,
  },
  {
    id: 'ap.invoice_balance_matches_payments',
    severity: 'critical',
    description: 'AP invoice paid/balance amounts must match non-void payments.',
    sql: `
      SELECT i.id, i.invoice_number, i.total_amount, i.paid_amount, i.balance_amount,
             ROUND(COALESCE(SUM(CASE WHEN p.id IS NOT NULL THEN pi.amount ELSE 0 END), 0), 2) AS paid_by_items
      FROM ap_invoices i
      LEFT JOIN ap_payment_items pi ON pi.invoice_id = i.id
      LEFT JOIN ap_payments p ON p.id = pi.payment_id AND p.status <> 'void'
      WHERE i.status NOT IN ('已取消', 'cancelled', 'void')
      GROUP BY i.id, i.invoice_number, i.total_amount, i.paid_amount, i.balance_amount
      HAVING ABS(COALESCE(i.paid_amount, 0) - paid_by_items) > 0.01
          OR ABS(COALESCE(i.balance_amount, 0) - (COALESCE(i.total_amount, 0) - paid_by_items)) > 0.01
    `,
  },
  {
    id: 'cash.gl_links_exist',
    severity: 'critical',
    description: 'Bank transactions with GL links must reference existing GL entries.',
    sql: `
      SELECT bt.id, bt.transaction_number, bt.gl_entry_id
      FROM bank_transactions bt
      LEFT JOIN gl_entries ge ON ge.id = bt.gl_entry_id
      WHERE bt.gl_entry_id IS NOT NULL
        AND ge.id IS NULL
    `,
  },
  {
    id: 'document_links.finance_vouchers_exist',
    severity: 'critical',
    description: 'Document links to finance vouchers must point to existing GL entries.',
    sql: `
      SELECT dl.id, dl.source_type, dl.source_id, dl.target_type, dl.target_id
      FROM document_links dl
      LEFT JOIN gl_entries ge ON ge.id = dl.target_id
      WHERE dl.target_type = 'finance_voucher'
        AND ge.id IS NULL
    `,
  },
  {
    id: 'tax.gl_links_exist',
    severity: 'critical',
    description: 'Tax invoices and tax returns with GL links must reference existing GL entries.',
    sql: `
      SELECT 'tax_invoice' AS source_type, id, invoice_number AS source_no, gl_entry_id
      FROM tax_invoices
      WHERE gl_entry_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM gl_entries ge WHERE ge.id = tax_invoices.gl_entry_id)
      UNION ALL
      SELECT 'tax_return' AS source_type, id, return_period AS source_no, gl_entry_id
      FROM tax_returns
      WHERE gl_entry_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM gl_entries ge WHERE ge.id = tax_returns.gl_entry_id)
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
    let index = match.index;
    let depth = 0;
    let end = index;
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
    const statement = content.slice(index, end);
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

function auditFinanceRoutes() {
  const routes = [];
  for (const file of financeRouteFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const route of routeStatements(content)) {
      const permissions = extractPermissionCodes(route.statement);
      routes.push({
        source: toPosix(path.relative(rootDir, file)),
        method: route.method,
        path: route.path,
        permissions,
        protected: permissions.length > 0,
      });
    }
  }
  return routes;
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
  for (const rule of financeIntegrityRules) {
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
    '# ERP Finance Core Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Area | Result | Count |',
    '| --- | --- | --- |',
    `| Finance route permissions | ${report.unprotectedRoutes.length === 0 ? 'PASS' : 'FAIL'} | ${report.unprotectedRoutes.length} unprotected |`,
    `| Registered permission codes | ${report.unregisteredPermissions.length === 0 ? 'PASS' : 'FAIL'} | ${report.unregisteredPermissions.length} missing |`,
    `| Finance data integrity | ${report.failedIntegrityRules.length === 0 ? 'PASS' : 'FAIL'} | ${report.failedIntegrityRules.length} failed |`,
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
    ['Unprotected Finance Routes', report.unprotectedRoutes],
    ['Unregistered Finance Permissions', report.unregisteredPermissions],
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
    const routes = auditFinanceRoutes();
    const registeredPermissions = await registeredPermissionSet(connection);
    const integrityResults = await runIntegrityRules(connection);

    const routePermissionCodes = Array.from(new Set(routes.flatMap((route) => route.permissions)));
    const unprotectedRoutes = routes.filter((route) => !route.protected);
    const unregisteredPermissions = routePermissionCodes
      .filter((permission) => !registeredPermissions.has(permission))
      .sort();
    const failedIntegrityRules = integrityResults.filter((result) => !result.passed);

    const report = {
      passed: unprotectedRoutes.length === 0
        && unregisteredPermissions.length === 0
        && failedIntegrityRules.length === 0,
      summary: {
        routeCount: routes.length,
        routePermissionCount: routePermissionCodes.length,
        integrityRuleCount: integrityResults.length,
      },
      routes,
      unprotectedRoutes,
      unregisteredPermissions,
      integrityResults,
      failedIntegrityRules,
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));

    console.log(`Finance core audit complete: ${report.passed ? 'PASS' : 'FAIL'}`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
    process.exit(report.passed ? 0 : 2);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Finance core audit failed to run:', error.message);
  process.exit(1);
});
