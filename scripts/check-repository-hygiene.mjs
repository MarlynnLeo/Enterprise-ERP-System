import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const findings = [];
let checked = 0;

// Validate the documented Node entry points without executing maintenance scripts.
for (const directory of ['.', 'backend', 'frontend', 'mobile']) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, directory, 'package.json'), 'utf8'));
  for (const [name, command] of Object.entries(manifest.scripts || {})) {
    const entries = command.matchAll(/\bnode\s+(?:--[\w=-]+\s+)*([\w./-]+\.(?:js|mjs|cjs))\b/g);
    for (const [, entry] of entries) {
      if (entry.startsWith('node_modules/')) continue;
      checked += 1;
      if (!fs.existsSync(path.resolve(root, directory, entry))) {
        findings.push(`${directory}/package.json ${name}: missing ${entry}`);
      }
    }
  }
}

// Generated audit results belong in ignored reports/ directories, not beside source.
for (const directory of ['.', 'scripts', 'frontend/scripts', 'mobile/scripts']) {
  for (const entry of fs.readdirSync(path.join(root, directory))) {
    if (
      /(?:audit.*(?:report|completeness)|completeness.*audit).*\.json$/.test(entry) ||
      /^_dual.*\.json$/.test(entry)
    ) {
      findings.push(`${directory}/${entry}: generated audit artifact`);
    }
  }
}

for (const finding of findings) console.error(finding);
console.log(
  `Repository hygiene: ${checked} Node script entries checked, ${findings.length} findings.`
);
if (findings.length) process.exitCode = 1;
