const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RELEASE_ROOTS = [
  'docker-compose.yml', 'package.json', 'package-lock.json', '.gitattributes',
  '.gitignore', '.prettierignore', '.prettierrc', 'eslint.config.mjs', 'README.md',
  'backend', 'frontend', 'mobile', 'scripts'
];
const RUNTIME_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage', 'logs', 'backups', 'uploads']);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`.trim());
  }
  return String(result.stdout || '').trim();
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function fingerprintSource(directory, roots = RELEASE_ROOTS) {
  const files = [];
  const visit = (relative) => {
    const absolute = path.join(directory, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Release source cannot contain a symlink: ${relative}`);
    if (stat.isDirectory()) {
      if (RUNTIME_DIRECTORIES.has(path.basename(relative))) {
        throw new Error(`Runtime directory is tracked in the release: ${relative}`);
      }
      for (const name of fs.readdirSync(absolute)) visit(path.join(relative, name));
    } else if (stat.isFile()) {
      const name = path.basename(relative);
      if ((name === '.env' || name.startsWith('.env.')) && !name.endsWith('.example')) {
        throw new Error(`Environment credentials must not be committed: ${relative}`);
      }
      files.push(relative.split(path.sep).join('/'));
    }
  };
  roots.forEach(visit);
  files.sort();
  const fingerprint = crypto.createHash('sha256');
  for (const relative of files) {
    fingerprint.update(relative + '\0' + hashFile(path.join(directory, relative)) + '\n');
  }
  return { sourceHash: fingerprint.digest('hex'), fileCount: files.length };
}

function cleanupSnapshot(snapshot) {
  if (!snapshot?.temporaryDir) return;
  const target = path.resolve(snapshot.temporaryDir);
  const parent = path.resolve(snapshot.tempRoot || os.tmpdir());
  if (path.dirname(target) !== parent || !path.basename(target).startsWith('kacon-erp-release-')) {
    throw new Error(`Refusing to remove an unexpected snapshot directory: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function createSourceSnapshot({ projectDir, ref = 'HEAD', explicitRef = false, roots = RELEASE_ROOTS, tempRoot = os.tmpdir() }) {
  const dirtyFiles = run('git', ['status', '--porcelain=v1', '--untracked-files=all', '--', ...roots], projectDir)
    .split('\n').filter(Boolean);
  if (dirtyFiles.length && !explicitRef) {
    throw new Error('Release source has uncommitted changes. Commit the intended release first, or use --ref=<commit> to publish only that reviewed Git commit.');
  }
  const commit = run('git', ['rev-parse', '--verify', ref + '^{commit}'], projectDir);
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('A release must resolve to a Git commit.');
  const snapshot = { tempRoot, temporaryDir: fs.mkdtempSync(path.join(tempRoot, 'kacon-erp-release-')) };
  try {
    snapshot.archivePath = path.join(snapshot.temporaryDir, 'source.tar.gz');
    snapshot.sourceDir = path.join(snapshot.temporaryDir, 'source');
    fs.mkdirSync(snapshot.sourceDir);
    run('git', ['archive', '--format=tar.gz', '--output=' + snapshot.archivePath, commit, '--', ...roots], projectDir);
    run('tar', ['-xzf', snapshot.archivePath, '-C', snapshot.sourceDir], projectDir);
    const { sourceHash, fileCount } = fingerprintSource(snapshot.sourceDir, roots);
    snapshot.descriptor = {
      buildId: commit.slice(0, 12) + '-' + sourceHash.slice(0, 12),
      commit,
      gitTree: run('git', ['rev-parse', commit + '^{tree}'], projectDir),
      sourceHash,
      archiveSha256: hashFile(snapshot.archivePath),
      fileCount,
      dirtyFiles: [],
      excludedWorkingTreeChanges: dirtyFiles.length,
      performanceContract: 2
    };
    return snapshot;
  } catch (error) {
    cleanupSnapshot(snapshot);
    throw error;
  }
}

function assertForwardRelease(projectDir, deployed, candidate) {
  if (!deployed?.commit) return;
  if (!/^[a-f0-9]{7,40}$/.test(deployed.commit)) {
    throw new Error('The running release has no verifiable Git commit; reconcile its manifest before publishing.');
  }
  const result = spawnSync('git', ['merge-base', '--is-ancestor', deployed.commit, candidate.commit], {
    cwd: projectDir, encoding: 'utf8', windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`Refusing an older or divergent release: running ${deployed.commit}, candidate ${candidate.commit}. Fetch and integrate the running commit first.`);
  }
}

function verifySnapshotArchive(snapshot) {
  if (hashFile(snapshot.archivePath) !== snapshot.descriptor.archiveSha256) {
    throw new Error('Release archive changed after its source fingerprint was calculated.');
  }
}

module.exports = {
  RELEASE_ROOTS, createSourceSnapshot, cleanupSnapshot, fingerprintSource,
  assertForwardRelease, verifySnapshotArchive
};
