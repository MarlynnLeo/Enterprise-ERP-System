const { afterEach, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSourceSnapshot, cleanupSnapshot, assertForwardRelease, verifySnapshotArchive } = require('../releaseSnapshot');
const { parseArguments } = require('../deploy_to_server');

let directory;
let snapshots;
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const commitFile = (text) => {
  fs.writeFileSync(path.join(directory, 'frontend/source.js'), text);
  git('add', '.');
  git('commit', '-qm', text);
  return git('rev-parse', 'HEAD');
};
const snapshot = (options = {}) => {
  const result = createSourceSnapshot({ projectDir: directory, roots: ['frontend'], ...options });
  snapshots.push(result);
  return result;
};

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-release-test-'));
  snapshots = [];
  git('init', '-q');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release-test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  fs.mkdirSync(path.join(directory, 'frontend'));
  commitFile('first');
});
afterEach(() => {
  snapshots.forEach(cleanupSnapshot);
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  assert.ok(path.basename(directory).startsWith('erp-release-test-'));
  fs.rmSync(directory, { recursive: true, force: true });
});

test('a committed snapshot stays identical while the working tree changes', () => {
  const first = snapshot();
  fs.writeFileSync(path.join(directory, 'frontend/source.js'), 'unfinished change');
  fs.writeFileSync(path.join(directory, 'frontend/untracked.js'), 'not released');
  assert.throws(() => snapshot(), /uncommitted/);
  const second = snapshot({ explicitRef: true });
  assert.equal(second.descriptor.buildId, first.descriptor.buildId);
  assert.equal(second.descriptor.sourceHash, first.descriptor.sourceHash);
  assert.equal(second.descriptor.excludedWorkingTreeChanges, 2);
  assert.equal(fs.readFileSync(path.join(second.sourceDir, 'frontend/source.js'), 'utf8'), 'first');
  assert.equal(fs.existsSync(path.join(second.sourceDir, 'frontend/untracked.js')), false);
  verifySnapshotArchive(second);
});

test('archive changes are detected before upload', () => {
  const release = snapshot();
  fs.appendFileSync(release.archivePath, 'tampered');
  assert.throws(() => verifySnapshotArchive(release), /archive changed/);
});

test('older and divergent commits cannot replace the running release', () => {
  const old = git('rev-parse', 'HEAD');
  const current = commitFile('second');
  assertForwardRelease(directory, { commit: old.slice(0, 12) }, { commit: current });
  assertForwardRelease(directory, { commit: current }, { commit: current });
  assert.throws(() => assertForwardRelease(directory, { commit: current }, { commit: old }), /older or divergent/);
  git('checkout', '-qb', 'different', old);
  const divergent = commitFile('different change');
  assert.throws(() => assertForwardRelease(directory, { commit: current }, { commit: divergent }), /older or divergent/);
});

test('credentials accidentally committed to Git stop snapshot creation', () => {
  fs.writeFileSync(path.join(directory, 'frontend/.env'), 'SECRET=test-only');
  git('add', '.');
  git('commit', '-qm', 'bad env');
  assert.throws(() => snapshot(), /credentials must not be committed/);
});

test('cleanup refuses a directory that is not an owned release snapshot', () => {
  assert.throws(() => cleanupSnapshot({ temporaryDir: directory }), /unexpected snapshot directory/);
  assert.ok(fs.existsSync(directory));
});

test('release options require an explicit commit to exclude working changes', () => {
  assert.deepEqual(parseArguments(['--dry-run', '--ref=HEAD']), { ref: 'HEAD', explicitRef: true, dryRun: true });
  assert.equal(parseArguments(['--ref', 'main']).ref, 'main');
  assert.throws(() => parseArguments(['--ref']), /requires/);
  assert.throws(() => parseArguments(['--allow-dirty']), /dirty worktrees are never archived/);
});
