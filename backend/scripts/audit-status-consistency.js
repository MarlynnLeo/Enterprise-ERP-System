#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');
const {
  STATUS_REGISTRY,
  getStatusValues,
  normalizeStatus,
  isKnownStatus,
} = require('../src/constants/statusRegistry');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'status-consistency-audit.json');
const mdPath = path.join(outDir, 'status-consistency-audit.md');

const domainSources = {
  financeInvoice: [
    { table: 'ar_invoices', statusColumn: 'status' },
    { table: 'ap_invoices', statusColumn: 'status' },
  ],
  financePeriod: [
    {
      table: 'gl_periods',
      expression: "CASE WHEN COALESCE(is_closed, 0) = 1 THEN 'closed' ELSE 'open' END",
    },
  ],
};

async function tableExists(connection, table) {
  const [rows] = await connection.query('SHOW TABLES LIKE ?', [table]);
  return rows.length > 0;
}

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
  return rows.length > 0;
}

function sourcesForDomain(domain, definition) {
  if (domainSources[domain]) return domainSources[domain];
  return [{ table: definition.table, statusColumn: definition.statusColumn }];
}

async function auditSource(connection, domain, source) {
  const exists = await tableExists(connection, source.table);
  if (!exists) {
    return { ...source, skipped: true, reason: 'table_missing', values: [], unknown: [] };
  }

  let statusSql = source.expression;
  if (!statusSql) {
    const hasColumn = await columnExists(connection, source.table, source.statusColumn);
    if (!hasColumn) {
      return { ...source, skipped: true, reason: 'status_column_missing', values: [], unknown: [] };
    }
    statusSql = `\`${source.statusColumn}\``;
  }

  const [rows] = await connection.query(
    `SELECT ${statusSql} AS status, COUNT(*) AS count FROM \`${source.table}\` GROUP BY ${statusSql} ORDER BY count DESC`
  );
  const values = rows.map((row) => ({
    status: row.status,
    normalized: normalizeStatus(domain, row.status),
    count: Number(row.count),
    known: isKnownStatus(domain, row.status),
  }));

  return {
    ...source,
    skipped: false,
    values,
    unknown: values.filter((value) => !value.known),
  };
}

function renderMarkdown(report) {
  const lines = [
    '# ERP Status Consistency Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Domain | Table | Result | Unknown Values | Canonical Values |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const result of report.results) {
    const status = result.skipped ? `SKIP:${result.reason}` : result.unknown.length === 0 ? 'PASS' : 'FAIL';
    lines.push(`| \`${result.domain}\` | \`${result.table}\` | ${status} | ${result.unknown.length} | \`${result.canonicalValues.join(', ')}\` |`);
  }

  const failed = report.results.filter((result) => result.unknown.length > 0);
  if (failed.length > 0) {
    lines.push('', '## Unknown Status Values');
    for (const result of failed) {
      lines.push('', `### ${result.domain} / ${result.table}`, '', '```json');
      lines.push(JSON.stringify(result.unknown, null, 2));
      lines.push('```');
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    const results = [];
    for (const [domain, definition] of Object.entries(STATUS_REGISTRY)) {
      const canonicalValues = getStatusValues(domain);
      for (const source of sourcesForDomain(domain, definition)) {
        const result = await auditSource(connection, domain, source);
        results.push({ domain, canonicalValues, ...result });
      }
    }

    const report = {
      passed: results.every((result) => result.unknown.length === 0),
      results,
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));

    const failedCount = results.filter((result) => result.unknown.length > 0).length;
    console.log(`Status consistency audit complete: ${results.length} sources, ${failedCount} failed.`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
    process.exit(report.passed ? 0 : 2);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Status consistency audit failed to run:', error.message);
  process.exit(1);
});
