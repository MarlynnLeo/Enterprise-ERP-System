'use strict';

// Resume the saved order through its real UI. Each runner reads persisted state
// before acting; an unsuccessful phase stops the chain and preserves evidence.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { DATABASE, evidenceDir } = require('./config.cjs');

const phases = [
  ['purchase', 'purchase-run.cjs'],
  ['manufacturing', 'run-manufacturing.cjs'],
  ['delivery', 'run-delivery.cjs'],
  ['finance', 'run-finance.cjs'],
];

function main() {
  const start = process.argv[2] || 'purchase';
  const index = phases.findIndex(([name]) => name === start);
  assert.ok(index >= 0, `Unknown phase: ${start}. Use ${phases.map(([name]) => name).join(', ')}.`);
  assert.notEqual(process.env.CHAIN_MOBILE, '1', 'Business chain uses the desktop UI');
  const fixture = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'fixture.private.json'), 'utf8'));
  assert.equal(fixture.database, DATABASE);
  assert.ok(JSON.parse(fs.readFileSync(path.join(evidenceDir, 'chain.json'), 'utf8')).order?.id, 'Create and verify the source sales order first');
  for (const [name, script] of phases.slice(index)) {
    console.log(`Continuing ${name} in ${DATABASE}`);
    const result = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error(`Stopped at ${name}; inspect evidence before resuming. No subsequent phase ran.`);
      process.exitCode = result.status || 1;
      return;
    }
  }
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack); process.exitCode = 1; }
}
