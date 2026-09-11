const { Client } = require('ssh2');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const {
  createSourceSnapshot, cleanupSnapshot, assertForwardRelease, verifySnapshotArchive
} = require('./releaseSnapshot');

const PROJECT_DIR = path.resolve(__dirname, '..');
const REMOTE_PROJECT_DIR = '/opt/1panel/docker/compose/KACON-ERP';

function parseArguments(args) {
  const options = { ref: 'HEAD', explicitRef: false, dryRun: false, frontendOnly: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--frontend-only') options.frontendOnly = true;
    else if (argument === '--ref' || argument.startsWith('--ref=')) {
      options.ref = argument === '--ref' ? args[++index] : argument.slice(6);
      if (!options.ref) throw new Error('--ref requires a Git commit or ref.');
      options.explicitRef = true;
    } else {
      throw new Error('Unsupported deployment option: ' + argument + '. Publish a reviewed Git commit with --ref=<commit>; dirty worktrees are never archived.');
    }
  }
  return options;
}

async function validateReleaseSource(sourceDir) {
  const menu = await import(pathToFileURL(path.join(PROJECT_DIR, 'frontend/scripts/validate-menu-implementation.mjs')).href);
  const columns = await import(pathToFileURL(path.join(PROJECT_DIR, 'frontend/scripts/validate-operation-column-system.mjs')).href);
  const results = [
    menu.validateMenuFiles(path.join(sourceDir, 'frontend')),
    columns.validateOperationColumnFiles(path.join(sourceDir, 'frontend'))
  ];
  const errors = results.flatMap((result) => result.errors);
  if (errors.length) throw new Error('Release source validation failed:\n' + errors.join('\n'));
}

function connectionOptions() {
  const options = {
    host: process.env.DEPLOY_SERVER_HOST,
    port: Number(process.env.DEPLOY_SERVER_PORT || 22),
    username: process.env.DEPLOY_SERVER_USER,
    readyTimeout: 30_000,
    keepaliveInterval: 10_000
  };
  const keyPath = process.env.DEPLOY_SSH_KEY_PATH;
  const privateKey = process.env.DEPLOY_SSH_PRIVATE_KEY || (keyPath && fs.readFileSync(keyPath, 'utf8'));
  if (privateKey) options.privateKey = privateKey;
  else options.password = process.env.DEPLOY_SERVER_PASSWORD;
  if (!options.host || !options.username || (!options.privateKey && !options.password)) {
    throw new Error('Set DEPLOY_SERVER_HOST, DEPLOY_SERVER_USER and DEPLOY_SSH_KEY_PATH, DEPLOY_SSH_PRIVATE_KEY or DEPLOY_SERVER_PASSWORD.');
  }
  return options;
}

function connect(options) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', reject);
    conn.connect(options);
  });
}

function uploadFile(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((error, sftp) => {
      if (error) return reject(error);
      sftp.fastPut(localPath, remotePath, (uploadError) => {
        sftp.end();
        if (uploadError) reject(uploadError);
        else resolve();
      });
    });
  });
}

function executeRemote(conn, command, { capture = false, input } = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (error, stream) => {
      if (error) return reject(error);
      let output = '';
      let errorOutput = '';
      stream.on('data', (data) => {
        if (capture) output += data.toString();
        else process.stdout.write(data);
      });
      stream.stderr.on('data', (data) => {
        if (capture) errorOutput += data.toString();
        else process.stderr.write(data);
      });
      stream.on('error', reject);
      stream.on('close', (code) => {
        if (code === 0) resolve(output);
        else reject(new Error('Remote release failed with exit code ' + code + (errorOutput ? ': ' + errorOutput.trim() : '')));
      });
      if (input !== undefined) stream.end(input);
    });
  });
}

const shellQuote = (value) => "'" + String(value).replace(/'/g, "'\"'\"'") + "'";

function createRemoteScript(descriptor, deployed, runId, remoteArchive) {
  const manifest = {
    ...descriptor,
    services: descriptor.services || ['backend', 'frontend', 'mobile'],
    previousBuildId: deployed?.buildId || null,
    deployedAt: new Date().toISOString()
  };
  const environment = {
    TARGET: REMOTE_PROJECT_DIR,
    ARCHIVE: remoteArchive,
    RELEASE_ID: descriptor.buildId,
    RELEASE_SCOPE: descriptor.services?.join(',') === 'frontend' ? 'frontend' : 'all',
    SOURCE_HASH: descriptor.sourceHash,
    GIT_COMMIT: descriptor.commit,
    ARCHIVE_SHA256: descriptor.archiveSha256,
    EXPECTED_BUILD_ID: deployed?.buildId || '',
    RUN_ID: runId,
    MANIFEST_BASE64: Buffer.from(JSON.stringify(manifest, null, 2)).toString('base64')
  };
  return Object.entries(environment).map(([key, value]) => 'export ' + key + '=' + shellQuote(value)).join('\n') +
    '\n' + fs.readFileSync(path.join(__dirname, 'deploy_release.sh'), 'utf8');
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  // Dry-run works without production credentials and never connects remotely.
  const sshOptions = options.dryRun ? null : connectionOptions();
  let snapshot;
  let conn;
  try {
    snapshot = createSourceSnapshot({ projectDir: PROJECT_DIR, ...options });
    await validateReleaseSource(snapshot.sourceDir);
    const descriptor = snapshot.descriptor;
    descriptor.services = options.frontendOnly ? ['frontend'] : ['backend', 'frontend', 'mobile'];
    console.log('Release: ' + descriptor.buildId);
    console.log('Services: ' + descriptor.services.join(', '));
    console.log('Git commit: ' + descriptor.commit);
    console.log('Verified source files: ' + descriptor.fileCount);
    if (descriptor.excludedWorkingTreeChanges) {
      console.log('Publishing the selected commit only; excluding ' + descriptor.excludedWorkingTreeChanges + ' uncommitted working-tree changes.');
    }
    if (options.dryRun) {
      console.log('Archive SHA-256: ' + descriptor.archiveSha256);
      return descriptor;
    }

    conn = await connect(sshOptions);
    const manifestPath = shellQuote(REMOTE_PROJECT_DIR + '/.deployed-release.json');
    const existing = await executeRemote(conn, 'if [ -f ' + manifestPath + ' ]; then cat ' + manifestPath + '; else printf null; fi', { capture: true });
    const deployed = JSON.parse(existing);
    assertForwardRelease(PROJECT_DIR, deployed, descriptor);
    const runId = crypto.randomUUID();
    const remoteArchive = '/tmp/kacon-erp-' + descriptor.buildId + '-' + runId + '.tar.gz';
    verifySnapshotArchive(snapshot);
    console.log('Current server release: ' + (deployed?.buildId || 'none'));
    console.log('Remote target: ' + REMOTE_PROJECT_DIR);
    await uploadFile(conn, snapshot.archivePath, remoteArchive);
    // Input is supplied over stdin, so script text and metadata never need a
    // command-string re-interpretation by the local PowerShell session.
    await executeRemote(conn, 'bash -se', { input: createRemoteScript(descriptor, deployed, runId, remoteArchive) });
    return descriptor;
  } finally {
    conn?.end();
    cleanupSnapshot(snapshot);
  }
}

module.exports = { parseArguments, createRemoteScript, shellQuote, main };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  });
}
