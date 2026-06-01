#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { BUSINESS_CLOSURES } = require('../src/constants/businessClosureRegistry');
const {
  STATUS_REGISTRY,
  getStatusValues,
  getAllowedTransitions,
} = require('../src/constants/statusRegistry');
const { consistencyRules } = require('../src/services/business/DataConsistencyRules');

const rootDir = path.resolve(__dirname, '..', '..');
const outputPath = path.join(rootDir, 'docs', 'business-closure-proof.md');

function renderStatusDomain(domain, definition) {
  const values = getStatusValues(domain);
  const lines = [
    `### ${domain}`,
    '',
    `- Table: \`${definition.table}\``,
    `- Status column: \`${definition.statusColumn}\``,
    `- Terminal: ${definition.terminal.map((status) => `\`${status}\``).join(', ') || 'none'}`,
    `- Values: ${values.map((status) => `\`${status}\``).join(', ')}`,
    '',
    '| From | To |',
    '| --- | --- |',
  ];

  for (const status of Object.keys(definition.transitions)) {
    const next = getAllowedTransitions(domain, status);
    lines.push(`| \`${status}\` | ${next.map((item) => `\`${item}\``).join(', ') || 'terminal'} |`);
  }
  return lines.join('\n');
}

function renderClosure(id, closure) {
  const lines = [
    `### ${closure.name}`,
    '',
    `- Id: \`${id}\``,
    `- Purpose: ${closure.purpose}`,
    `- Start: \`${closure.start}\``,
    `- End: \`${closure.end}\``,
    '',
    '| Step | Object | Status Domain | Required Fields |',
    '| --- | --- | --- | --- |',
  ];

  closure.steps.forEach((step, index) => {
    lines.push(`| ${index + 1} | \`${step.object}\` | ${step.statusDomain ? `\`${step.statusDomain}\`` : '-'} | ${step.requiredFields.map((field) => `\`${field}\``).join(', ')} |`);
  });

  lines.push('', 'Invariants:');
  closure.invariants.forEach((item) => lines.push(`- ${item}`));
  return lines.join('\n');
}

function renderRules() {
  const lines = [
    '## Data Consistency Rules',
    '',
    '| Rule | Severity | Closure | Description |',
    '| --- | --- | --- | --- |',
  ];
  consistencyRules.forEach((rule) => {
    lines.push(`| \`${rule.id}\` | ${rule.severity} | \`${rule.closure}\` | ${rule.description} |`);
  });
  return lines.join('\n');
}

const content = [
  '# ERP Business Closure Proof',
  '',
  'This file is generated from executable registries in `backend/src/constants` and `backend/src/services/business`.',
  'It proves which business loops exist, which status machines govern them, and which data consistency rules must stay green.',
  '',
  '## Closure Loops',
  '',
  ...Object.entries(BUSINESS_CLOSURES).map(([id, closure]) => renderClosure(id, closure)),
  '',
  '## Unified Status Registry',
  '',
  ...Object.entries(STATUS_REGISTRY).map(([domain, definition]) => renderStatusDomain(domain, definition)),
  '',
  renderRules(),
  '',
].join('\n');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, content);
console.log(`Business closure proof written to ${outputPath}`);
process.exit(0);
