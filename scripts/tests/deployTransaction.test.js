const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RELEASE_ROOTS } = require('../releaseSnapshot');
const { createRemoteScript, shellQuote } = require('../deploy_to_server');

const bash = process.env.ERP_TEST_BASH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const python = process.env.ERP_TEST_PYTHON || 'python3';
const toPosix = (value) => {
  if (process.platform !== 'win32') return value;
  const result = spawnSync(bash, ['-c', 'cygpath -u "$1"', 'test', value], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

function exercise(scenario) {
  const frontendOnly = scenario.startsWith('frontend');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-transaction-test-'));
  try {
    const target = path.join(directory, 'target');
    const source = path.join(directory, 'source');
    const oldBuild = '111111111111-aaaaaaaaaaaa';
    const release = '222222222222-bbbbbbbbbbbb';
    const runId = crypto.randomUUID();
    const oldTag = 'release-' + oldBuild;
    const sourceHash = 'b'.repeat(64);
    const commit = '2'.repeat(40);
    const state = { oldBuild, containers: {}, images: {}, commands: [] };
    for (const service of ['backend', 'frontend', 'mobile']) {
      state.containers[service] = oldTag;
      state.images['kacon-erp-' + service + ':' + oldTag] = { id: 'sha256:old-' + service, labels: {} };
      if (scenario === 'retry') {
        state.images['kacon-erp-' + service + ':release-' + release] = {
          id: 'sha256:existing-' + service,
          labels: { 'ai.kacon.erp.source-sha256': sourceHash, 'org.opencontainers.image.revision': commit }
        };
      }
    }
    if (scenario === 'mixed-full') {
      const previousFrontendTag = 'release-333333333333-cccccccccccc';
      state.containers.frontend = previousFrontendTag;
      state.images['kacon-erp-frontend:' + previousFrontendTag] = { id: 'sha256:previous-frontend', labels: {} };
    }
    fs.writeFileSync(path.join(directory, 'state.json'), JSON.stringify(state));
    for (const root of [target, source]) {
      fs.mkdirSync(root);
      for (const name of RELEASE_ROOTS) {
        const file = path.join(root, name);
        if (['backend', 'frontend', 'mobile', 'scripts'].includes(name)) {
          fs.mkdirSync(file);
          fs.writeFileSync(path.join(file, 'marker'), root === target ? 'old' : 'new');
        } else fs.writeFileSync(file, root === target ? 'old' : 'new');
      }
    }
    for (const service of ['backend', 'frontend', 'mobile']) fs.writeFileSync(path.join(source, service, 'Dockerfile'), 'FROM test');
    fs.mkdirSync(path.join(source, 'frontend/src/components/layout'), { recursive: true });
    fs.mkdirSync(path.join(source, 'frontend/src/views'), { recursive: true });
    fs.writeFileSync(path.join(source, 'frontend/src/components/layout/SidebarMenu.vue'), '<ul data-sidebar-performance="2" />');
    fs.writeFileSync(path.join(source, 'frontend/src/views/Layout.vue'), '<sidebar-menu />');
    fs.writeFileSync(path.join(target, '.env'), 'ERP_RELEASE_TAG=' + oldTag + '\nKEEP=test\n');
    if (scenario === 'mixed-full') {
      fs.appendFileSync(path.join(target, '.env'), 'ERP_FRONTEND_RELEASE_TAG=' + state.containers.frontend + '\n');
    }
    fs.writeFileSync(path.join(target, '.deployed-release.json'), JSON.stringify({ buildId: scenario === 'stale' ? 'changed-release' : oldBuild }));

    const archive = path.join(directory, 'kacon-erp-' + release + '-' + runId + '.tar.gz');
    const tar = spawnSync('tar', ['-czf', archive, '-C', source, ...RELEASE_ROOTS], { encoding: 'utf8', windowsHide: true });
    assert.equal(tar.status, 0, tar.stderr);
    const archiveSha256 = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (scenario === 'tampered') fs.appendFileSync(archive, 'changed');
    const posixTarget = toPosix(target);
    const posixDirectory = toPosix(directory);
    const fixture = toPosix(path.join(__dirname, 'fixtures/deploy-command.py'));
    const prefix = [
      'python3() { command ' + shellQuote(python) + ' "$@" | tr -d "\\r"; }',
      ...['docker', 'rsync', 'curl', 'flock'].map((command) => command + '() { python3 ' + shellQuote(fixture) + ' ' + command + ' "$@"; }')
    ].join('\n') + '\n';
    const script = prefix + createRemoteScript({ buildId: release, sourceHash, commit, archiveSha256, performanceContract: 2,
      services: frontendOnly ? ['frontend'] : ['backend', 'frontend', 'mobile'] },
      { buildId: oldBuild }, runId, '/tmp/kacon-erp-' + release + '-' + runId + '.tar.gz')
      .replaceAll('/opt/1panel/docker/compose/KACON-ERP', posixTarget)
      .replaceAll('/tmp/kacon-erp-', posixDirectory + '/kacon-erp-');
    const result = spawnSync(bash, [process.env.ERP_TEST_TRACE ? '-sex' : '-se'], {
      input: script, encoding: 'utf8', windowsHide: true, timeout: 60_000,
      env: { ...process.env, ERP_TEST_DIRECTORY: directory, ERP_TEST_POSIX_TARGET: posixTarget,
        MSYS2_ENV_CONV_EXCL: 'ERP_TEST_POSIX_TARGET',
        ERP_TEST_SCENARIO: scenario, ERP_TEST_RELEASE: release }
    });
    assert.ifError(result.error);
    const finalState = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'));
    const successful = ['success', 'retry', 'frontend', 'mixed-full'].includes(scenario);
    assert.equal(result.status === 0, successful, result.stderr + '\n' + result.stdout);
    assert.equal(fs.readFileSync(path.join(target, 'frontend/marker'), 'utf8'), successful ? 'new' : 'old', result.stderr);
    for (const service of ['backend', 'frontend', 'mobile']) {
      const changed = successful && (!frontendOnly || service === 'frontend');
      assert.equal(finalState.containers[service], changed ? 'release-' + release : oldTag, result.stderr);
    }
    assert.match(fs.readFileSync(path.join(target, '.env'), 'utf8'), /KEEP=test/);
    if (frontendOnly) {
      for (const service of ['backend', 'mobile']) {
        assert.equal(fs.readFileSync(path.join(target, service, 'marker'), 'utf8'), 'old');
      }
      assert.equal(finalState.commands.some((args) => args[0] === 'compose' && args.includes('run')), false);
      assert.ok(finalState.commands.filter((args) => args[0] === 'compose' && args.includes('up'))
        .every((args) => args.includes('--no-deps') && args.at(-1) === 'frontend'));
    }
    if (['migration', 'container', 'health', 'version', 'frontend-health'].includes(scenario)) {
      const status = JSON.parse(fs.readFileSync(path.join(target, '.last-deployment.json'), 'utf8'));
      assert.equal(status.status, 'failed', result.stderr);
      assert.equal(status.rollback, 'completed', result.stderr);
      assert.equal(JSON.parse(fs.readFileSync(path.join(target, '.deployed-release.json'))).buildId, oldBuild);
      assert.ok(fs.existsSync(path.join(target, '.deploy-backups', runId, 'env')));
      assert.equal(fs.existsSync(path.join(target, 'frontend/src')), false);
    }
    if (scenario === 'retry') assert.equal(finalState.commands.some((args) => args[0] === 'build'), false);
    if (scenario === 'build') {
      assert.equal(JSON.parse(fs.readFileSync(path.join(target, '.last-deployment.json'))).phase, 'build-frontend', result.stderr);
    }
    if (scenario === 'missing-migrations') {
      const status = JSON.parse(fs.readFileSync(path.join(target, '.last-deployment.json')));
      assert.equal(status.phase, 'migration-preflight');
      assert.equal(status.rollback, 'not-needed');
      assert.equal(finalState.commands.some((args) => args[0] === 'compose' && args.includes('up')), false);
    }
    if (scenario === 'stale') assert.equal(result.status, 25, result.stderr);
    if (scenario === 'locked') assert.equal(result.status, 23, result.stderr);
    if (['stale', 'tampered', 'locked'].includes(scenario)) assert.equal(finalState.commands.some((args) => args[0] === 'build'), false);
    if (successful) {
      const manifest = JSON.parse(fs.readFileSync(path.join(target, '.deployed-release.json')));
      assert.equal(manifest.buildId, release);
      assert.equal(manifest.sourceHash, sourceHash);
      for (const service of ['backend', 'frontend', 'mobile']) {
        assert.equal(manifest.serviceImages[service].image, 'kacon-erp-' + service + ':' + finalState.containers[service]);
        assert.equal(manifest.serviceImages[service].imageId, imageId(finalState, service));
      }
    }
  } finally {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('erp-transaction-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function imageId(state, service) {
  return state.images['kacon-erp-' + service + ':' + state.containers[service]].id;
}

for (const scenario of ['success', 'retry', 'build', 'migration', 'container', 'health', 'version', 'stale', 'tampered', 'locked', 'missing-migrations', 'frontend', 'frontend-health', 'mixed-full']) {
  test('release transaction: ' + scenario, { timeout: 70_000 }, () => exercise(scenario));
}
