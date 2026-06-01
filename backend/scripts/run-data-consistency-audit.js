#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');
const {
  consistencyRules,
  runDataConsistencyAudit,
} = require('../src/services/business/DataConsistencyRules');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'data-consistency-audit.json');
const mdPath = path.join(outDir, 'data-consistency-audit.md');

function renderMarkdown(report) {
  const lines = [
    '# ERP Data Consistency Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Rule | Severity | Closure | Result | Count |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const result of report.results) {
    const resultLabel = result.error ? 'ERROR' : result.passed ? 'PASS' : 'FAIL';
    lines.push(`| \`${result.id}\` | ${result.severity} | \`${result.closure}\` | ${resultLabel} | ${result.count ?? 'n/a'} |`);
  }

  const failed = report.results.filter((result) => !result.passed);
  if (failed.length > 0) {
    lines.push('', '## Failed Rule Samples');
    for (const result of failed) {
      lines.push('', `### ${result.id}`, '', result.description, '', '```json');
      lines.push(JSON.stringify(result.error ? { error: result.error } : result.rows.slice(0, 20), null, 2));
      lines.push('```');
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const config = getPoolConfig();
  const connection = await mysql.createConnection(config);
  try {
    const report = await runDataConsistencyAudit(connection, consistencyRules);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    fs.writeFileSync(mdPath, renderMarkdown(report));

    const failedCount = report.results.filter((result) => !result.passed).length;
    console.log(`Data consistency audit complete: ${report.results.length} rules, ${failedCount} failed.`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${mdPath}`);
    process.exit(report.passed ? 0 : 2);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('Data consistency audit failed to run:', error.message);
  process.exit(1);
});
