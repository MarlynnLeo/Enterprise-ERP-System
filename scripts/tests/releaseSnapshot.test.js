const { afterEach, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSourceSnapshot, cleanupSnapshot, fingerprintSource, assertForwardRelease, verifySnapshotArchive } = require('../releaseSnapshot');
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

test('Unicode asset filenames and source fingerprints survive archive extraction', () => {
  const assetDirectory = path.join('backend', 'assets', 'quality-templates');
  const assetNames = ['抽样检验标准.docx', '首件检验记录表.xlsx'];
  const contents = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
  fs.mkdirSync(path.join(directory, assetDirectory), { recursive: true });
  for (const name of assetNames) {
    fs.writeFileSync(path.join(directory, assetDirectory, name), contents);
  }
  git('add', '.');
  git('commit', '-qm', 'Unicode quality templates');

  const roots = ['frontend', 'backend'];
  const expected = fingerprintSource(directory, roots);
  const release = snapshot({ roots });
  assert.deepEqual(fs.readdirSync(path.join(release.sourceDir, assetDirectory)).sort(), assetNames.sort());
  for (const name of assetNames) {
    assert.deepEqual(fs.readFileSync(path.join(release.sourceDir, assetDirectory, name)), contents);
  }
  assert.equal(release.descriptor.sourceHash, expected.sourceHash);
  assert.equal(release.descriptor.fileCount, expected.fileCount);
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
  assert.deepEqual(parseArguments(['--dry-run', '--ref=HEAD']), { ref: 'HEAD', explicitRef: true, dryRun: true, frontendOnly: false, maintenance: false });
  assert.equal(parseArguments(['--frontend-only', '--ref=HEAD']).frontendOnly, true);
  assert.equal(parseArguments(['--ref', 'main']).ref, 'main');
  assert.throws(() => parseArguments(['--ref']), /requires/);
  assert.throws(() => parseArguments(['--allow-dirty']), /dirty worktrees are never archived/);
});

test('maintenance mode is explicit and requires the backend in the release', () => {
  assert.equal(parseArguments([]).maintenance, false);
  assert.equal(parseArguments(['--maintenance', '--dry-run', '--ref=HEAD']).maintenance, true);
  assert.throws(() => parseArguments(['--maintenance', '--frontend-only']), /requires a full release/);
  assert.throws(() => parseArguments(['--frontend-only', '--maintenance']), /requires a full release/);
});
