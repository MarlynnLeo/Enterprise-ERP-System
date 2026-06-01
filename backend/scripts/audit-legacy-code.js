#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { legacyCleanupCandidates } = require('../src/services/business/LegacyCodeCleanupRules');

const rootDir = path.resolve(__dirname, '..', '..');
const outPath = path.join(rootDir, 'docs', 'legacy-code-cleanup-audit.md');
const scanRoots = ['backend/src', 'frontend/src', 'mobile/src']
  .map((dir) => path.join(rootDir, dir))
  .filter((dir) => fs.existsSync(dir));
const scanExtensions = new Set(['.js', '.mjs', '.cjs', '.vue', '.ts', '.json']);
const excludedFiles = new Set([
  'backend/scripts/audit-legacy-code.js',
  'backend/src/services/business/LegacyCodeCleanupRules.js',
]);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'coverage') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
    } else if (scanExtensions.has(path.extname(entry.name))) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

function withoutExtension(filePath) {
  const parsed = path.posix.parse(toPosix(filePath));
  return path.posix.join(parsed.dir, parsed.name);
}

function normalizeModulePath(value) {
  return withoutExtension(toPosix(value).replace(/\/index$/, ''));
}

function extractStringLiterals(content) {
  const literals = [];
  const pattern = /(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    literals.push(match[1] || match[2] || match[3] || '');
  }
  return literals;
}

function resolveAliasImport(importPath, sourceRel) {
  if (importPath.startsWith('@/')) {
    if (sourceRel.startsWith('frontend/')) {
      return `frontend/src/${importPath.slice(2)}`;
    }
    if (sourceRel.startsWith('mobile/')) {
      return `mobile/src/${importPath.slice(2)}`;
    }
  }
  if (importPath.startsWith('src/')) {
    if (sourceRel.startsWith('backend/')) {
      return `backend/${importPath}`;
    }
    if (sourceRel.startsWith('frontend/')) {
      return `frontend/${importPath}`;
    }
    if (sourceRel.startsWith('mobile/')) {
      return `mobile/${importPath}`;
    }
  }
  return null;
}

function literalReferencesCandidate(literal, sourceFile, candidatePath) {
  const candidateNoExt = normalizeModulePath(candidatePath);
  const normalizedLiteral = normalizeModulePath(literal);

  if (normalizedLiteral === candidateNoExt || normalizedLiteral.endsWith(`/${candidateNoExt}`)) {
    return true;
  }

  const sourceRel = toPosix(path.relative(rootDir, sourceFile));
  const aliased = resolveAliasImport(literal, sourceRel);
  if (aliased && normalizeModulePath(aliased) === candidateNoExt) {
    return true;
  }

  if (literal.startsWith('.')) {
    const sourceDir = path.posix.dirname(sourceRel);
    const resolved = normalizeModulePath(path.posix.normalize(path.posix.join(sourceDir, literal)));
    return resolved === candidateNoExt;
  }

  return false;
}

const files = scanRoots.flatMap((dir) => walk(dir));
const fileContents = files.map((file) => ({
  file,
  rel: toPosix(path.relative(rootDir, file)),
  content: fs.readFileSync(file, 'utf8'),
})).filter((file) => !excludedFiles.has(file.rel));

const results = legacyCleanupCandidates.map((candidate) => {
  const absolutePath = path.join(rootDir, candidate.path);
  const exists = fs.existsSync(absolutePath);
  const references = [];

  for (const file of fileContents) {
    if (file.rel === toPosix(candidate.path)) continue;
    const literals = extractStringLiterals(file.content);
    if (literals.some((literal) => literalReferencesCandidate(literal, file.file, candidate.path))) {
      references.push(file.rel);
    }
  }

  return {
    ...candidate,
    exists,
    references,
    status: references.length > 0 ? 'blocked' : exists ? 'candidate' : 'already_removed',
  };
});

const lines = [
  '# Legacy Code Cleanup Audit',
  '',
  `Generated at: ${new Date().toISOString()}`,
  '',
  '| Path | Status | References | Replacement |',
  '| --- | --- | --- | --- |',
];

for (const result of results) {
  lines.push(`| \`${result.path}\` | ${result.status} | ${result.references.length} | \`${result.replacement}\` |`);
}

const blocked = results.filter((result) => result.references.length > 0);
if (blocked.length > 0) {
  lines.push('', '## Blocked Candidates');
  for (const result of blocked) {
    lines.push('', `### ${result.path}`, '', `Reason: ${result.reason}`, '', 'References:');
    result.references.forEach((ref) => lines.push(`- \`${ref}\``));
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${lines.join('\n')}\n`);

const summary = results.reduce((acc, result) => {
  acc[result.status] = (acc[result.status] || 0) + 1;
  return acc;
}, {});

console.log(`Legacy cleanup audit written to ${outPath}`);
console.log(JSON.stringify(summary));
process.exit(blocked.length > 0 ? 2 : 0);
