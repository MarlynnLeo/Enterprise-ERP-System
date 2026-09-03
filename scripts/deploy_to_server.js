const { Client } = require('ssh2');
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_HOST = process.env.DEPLOY_SERVER_HOST || '';
const SERVER_PORT = Number(process.env.DEPLOY_SERVER_PORT || 22);
const SERVER_USER = process.env.DEPLOY_SERVER_USER || '';
const SERVER_PASS = process.env.DEPLOY_SERVER_PASSWORD || '';
const SERVER_PRIVATE_KEY = process.env.DEPLOY_SSH_PRIVATE_KEY || '';
const PROJECT_DIR = path.resolve(__dirname, '..');
const REMOTE_PROJECT_DIR = '/opt/1panel/docker/compose/KACON-ERP';
const DEPLOY_SERVICES = ['backend', 'frontend', 'mobile'];
const RELEASE_ROOTS = [
  'docker-compose.yml',
  'package.json',
  'package-lock.json',
  '.gitattributes',
  '.gitignore',
  '.prettierignore',
  '.prettierrc',
  'eslint.config.mjs',
  'README.md',
  'backend',
  'frontend',
  'mobile',
  'scripts'
];

const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  '.playwright-cli',
  'logs',
  'backups',
  'uploads'
]);

const toPosixPath = (value) => value.split(path.sep).join('/');

function runLocal(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_DIR,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit'
  });

  if (result.status !== 0) {
    const detail = [result.error?.message, result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .trim();
    throw new Error(`${command} failed${detail ? `:\n${detail}` : ''}`);
  }

  return options.capture ? String(result.stdout || '').trim() : '';
}

function validateLocalRelease() {
  runLocal(process.execPath, ['frontend/scripts/validate-menu-implementation.mjs']);
}

function validateDeploymentConfig() {
  if (!SERVER_HOST || !SERVER_USER || (!SERVER_PASS && !SERVER_PRIVATE_KEY)) {
    throw new Error(
      'Deployment credentials are required via DEPLOY_SERVER_HOST, DEPLOY_SERVER_USER, and DEPLOY_SERVER_PASSWORD or DEPLOY_SSH_PRIVATE_KEY.'
    );
  }
}

function collectReleaseFiles(rootDir) {
  const files = [];

  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
      if (entry.name === '.env' || entry.name.startsWith('.env.')) continue;

      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
    }
  };

  visit(rootDir);
  return files;
}

function createReleaseDescriptor() {
  if (!RELEASE_ROOTS.every((entry) => fs.existsSync(path.join(PROJECT_DIR, entry)))) {
    throw new Error(`Invalid ERP workspace: ${PROJECT_DIR}`);
  }

  const files = RELEASE_ROOTS.flatMap((entry) => {
    const absolutePath = path.join(PROJECT_DIR, entry);
    return fs.statSync(absolutePath).isDirectory()
      ? collectReleaseFiles(absolutePath)
      : [absolutePath];
  })
    .sort((left, right) => left.localeCompare(right));
  const fingerprint = crypto.createHash('sha256');

  for (const file of files) {
    const relativePath = toPosixPath(path.relative(PROJECT_DIR, file));
    const contentHash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    fingerprint.update(relativePath);
    fingerprint.update('\0');
    fingerprint.update(contentHash);
    fingerprint.update('\n');
  }

  let commit = 'no-git';
  let dirtyFiles = [];
  try {
    commit = runLocal('git', ['rev-parse', '--short=12', 'HEAD'], { capture: true });
    dirtyFiles = runLocal('git', [
      'status',
      '--short',
      '--untracked-files=all',
      '--',
      ...RELEASE_ROOTS
    ], { capture: true }).split('\n').filter(Boolean);
  } catch {
    // The content fingerprint remains the authoritative release identity.
  }

  const sourceHash = fingerprint.digest('hex');
  return {
    buildId: `${commit}-${sourceHash.slice(0, 12)}`,
    commit,
    dirtyFiles,
    fileCount: files.length,
    sourceHash
  };
}

function createReleaseArchive(descriptor) {
  const archivePath = path.join(
    os.tmpdir(),
    `kacon-erp-${descriptor.buildId}-${process.pid}.tar.gz`
  );

  runLocal('tar', [
    '-czf', archivePath,
    '-C', PROJECT_DIR,
    '--exclude=frontend/node_modules',
    '--exclude=frontend/dist',
    '--exclude=frontend/coverage',
    '--exclude=frontend/.env',
    '--exclude=frontend/.env.*',
    '--exclude=backend/node_modules',
    '--exclude=backend/dist',
    '--exclude=backend/coverage',
    '--exclude=backend/logs',
    '--exclude=backend/backups',
    '--exclude=backend/uploads',
    '--exclude=frontend/logs',
    '--exclude=mobile/node_modules',
    '--exclude=mobile/dist',
    '--exclude=mobile/logs',
    ...RELEASE_ROOTS
  ]);

  return archivePath;
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => resolve(conn));
    conn.on('error', reject);
    const options = {
      host: SERVER_HOST,
      port: SERVER_PORT,
      username: SERVER_USER,
    };
    if (SERVER_PRIVATE_KEY) options.privateKey = SERVER_PRIVATE_KEY;
    else options.password = SERVER_PASS;
    conn.connect(options);
  });
}

function uploadFile(conn, localPath, remotePath) {
  return new Promise((resolve, reject) => {
    conn.sftp((error, sftp) => {
      if (error) return reject(error);
      sftp.fastPut(localPath, remotePath, (uploadError) => {
        sftp.end();
        if (uploadError) return reject(uploadError);
        resolve();
      });
    });
  });
}

function runRemoteCommand(conn, command) {
  return new Promise((resolve, reject) => {
    console.log(`Remote target: ${REMOTE_PROJECT_DIR}`);
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      stream.on('close', (code) => {
        if (code === 0) return resolve();
        reject(new Error(`Remote deployment failed with exit code ${code}`));
      }).on('data', data => {
        process.stdout.write(data);
      }).stderr.on('data', data => {
        process.stderr.write(data);
      });
    });
  });
}

function createRemoteScript(descriptor, remoteArchive) {
  const manifest = Buffer.from(JSON.stringify({
    ...descriptor,
    services: DEPLOY_SERVICES,
    deployedAt: new Date().toISOString()
  }, null, 2)).toString('base64');

  return `
set -eu
TARGET='${REMOTE_PROJECT_DIR}'
ARCHIVE='${remoteArchive}'
RELEASE_ID='${descriptor.buildId}'
export COMPOSE_FILE="$TARGET/docker-compose.yml"
unset COMPOSE_PATH_SEPARATOR
INCOMING="$TARGET/.incoming-release-$RELEASE_ID"
BACKUP_DIR="$TARGET/.deploy-backups/$(date +%Y%m%d-%H%M%S)-$RELEASE_ID"
CANDIDATE_BACKEND="kacon-erp-backend:candidate-$RELEASE_ID"
CANDIDATE_FRONTEND="kacon-erp-frontend:candidate-$RELEASE_ID"
CANDIDATE_MOBILE="kacon-erp-mobile:candidate-$RELEASE_ID"
ROLLBACK_DIR="$TARGET/.rollback-release-$RELEASE_ID"

case "$INCOMING" in
  "$TARGET"/.incoming-release-*) ;;
  *) echo 'Unsafe incoming release path' >&2; exit 2 ;;
esac
case "$BACKUP_DIR" in
  "$TARGET"/.deploy-backups/*) ;;
  *) echo 'Unsafe deployment backup path' >&2; exit 2 ;;
esac

cleanup() {
  rm -rf -- "$INCOMING"
  rm -rf -- "$ROLLBACK_DIR"
  rm -rf -- "$BACKUP_DIR"
  rm -f -- "$ARCHIVE"
  docker image rm "$CANDIDATE_BACKEND" "$CANDIDATE_FRONTEND" "$CANDIDATE_MOBILE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

test -d "$TARGET"
test -f "$TARGET/docker-compose.yml"
command -v rsync >/dev/null

validate_compose_ownership() {
  local cid working_dir config_file
  for cid in $(docker ps -aq --filter name=kacon-erp); do
    working_dir=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$cid")
    config_file=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$cid")
    if [ "$working_dir" != "$TARGET" ] || [ "$config_file" != "$TARGET/docker-compose.yml" ]; then
      echo "Refusing mixed ERP deployment state: $cid uses $working_dir / $config_file" >&2
      exit 21
    fi
  done
}

validate_compose_ownership
mkdir -p "$INCOMING" "$BACKUP_DIR"
tar -xzf "$ARCHIVE" -C "$INCOMING"
test -f "$INCOMING/docker-compose.yml"
test -f "$INCOMING/backend/Dockerfile"
test -f "$INCOMING/frontend/Dockerfile"
test -f "$INCOMING/mobile/Dockerfile"

validate_menu_source() {
  local root="$1"
  local sidebar="$root/frontend/src/components/layout/SidebarMenu.vue"
  local layout="$root/frontend/src/views/Layout.vue"
  test -f "$sidebar"
  test -f "$layout"
  grep -q 'app-menu-list' "$sidebar"
  if grep -Eq '<el-(menu|sub-menu|menu-item)([[:space:]>]|-)|default-openeds|collapse-transition' "$sidebar" "$layout"; then
    echo 'Refusing release: legacy Element Plus menu implementation detected' >&2
    exit 20
  fi
}

validate_menu_source "$INCOMING"

OLD_BACKEND_IMAGE=$(docker compose -f "$TARGET/docker-compose.yml" ps -q backend | xargs -r docker inspect --format '{{.Image}}')
OLD_FRONTEND_IMAGE=$(docker compose -f "$TARGET/docker-compose.yml" ps -q frontend | xargs -r docker inspect --format '{{.Image}}')
OLD_MOBILE_IMAGE=$(docker compose -f "$TARGET/docker-compose.yml" ps -q mobile | xargs -r docker inspect --format '{{.Image}}')

tar \
  --exclude='frontend/node_modules' \
  --exclude='frontend/dist' \
  --exclude='frontend/.env' \
  --exclude='frontend/coverage' \
  --exclude='frontend/logs' \
  --exclude='backend/node_modules' \
  --exclude='backend/coverage' \
  --exclude='backend/logs' \
  --exclude='backend/backups' \
  --exclude='backend/uploads' \
  --exclude='mobile/node_modules' \
  --exclude='mobile/dist' \
  --exclude='mobile/logs' \
  -czf "$BACKUP_DIR/source-before-$RELEASE_ID.tar.gz" \
  -C "$TARGET" docker-compose.yml package.json package-lock.json .gitattributes .gitignore .prettierignore .prettierrc eslint.config.mjs README.md backend frontend mobile scripts
[ ! -f "$TARGET/.deployed-release.json" ] || \
  install -m 0644 "$TARGET/.deployed-release.json" "$BACKUP_DIR/deployed-release.json"

docker build \
  --pull \
  -t "$CANDIDATE_BACKEND" \
  "$INCOMING/backend"

docker build \
  --pull \
  --build-arg APP_BUILD_ID="$RELEASE_ID" \
  -t "$CANDIDATE_FRONTEND" \
  "$INCOMING/frontend"

docker build \
  --pull \
  -t "$CANDIDATE_MOBILE" \
  "$INCOMING/mobile"

docker run --rm --entrypoint /bin/sh "$CANDIDATE_FRONTEND" -c '
set -eu
root=/usr/share/nginx/html
menu_files=$(grep -R -l -a "app-menu-list" "$root/assets" 2>/dev/null || true)
test -n "$menu_files"
legacy_files=$(grep -R -l -a "default-openeds" "$root/assets" 2>/dev/null || true)
test -z "$legacy_files"
test -f "$root/version.json"
'

docker run --rm --entrypoint node "$CANDIDATE_BACKEND" -e \
  "require('fs').accessSync('/app/src/index.js')"
docker run --rm --entrypoint /bin/sh "$CANDIDATE_MOBILE" -c 'test -f /usr/share/nginx/html/index.html'

sync_source_tree() {
  local directory="$1"
  rsync -a --delete \
    --exclude='.env' \
    --exclude='.env.*' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='coverage' \
    --exclude='logs' \
    --exclude='backups' \
    --exclude='uploads' \
    "$INCOMING/$directory/" "$TARGET/$directory/"
}

sync_source_tree backend
sync_source_tree frontend
sync_source_tree mobile
sync_source_tree scripts
for root_file in docker-compose.yml package.json package-lock.json .gitattributes .gitignore .prettierignore .prettierrc eslint.config.mjs README.md; do
  install -m 0644 "$INCOMING/$root_file" "$TARGET/$root_file"
done
printf '%s' '${manifest}' | base64 -d > "$TARGET/.deployed-release.json"

docker tag "$CANDIDATE_BACKEND" kacon-erp-backend:latest
docker tag "$CANDIDATE_FRONTEND" kacon-erp-frontend:latest
docker tag "$CANDIDATE_MOBILE" kacon-erp-mobile:latest
cd "$TARGET"
docker compose -f "$TARGET/docker-compose.yml" config --quiet
docker compose -f "$TARGET/docker-compose.yml" run --rm --no-deps --no-build backend npm run migrate
docker compose -f "$TARGET/docker-compose.yml" up -d --no-build --force-recreate --remove-orphans

health_check() {
  local service="$1" cid health
  cid=$(docker compose -f "$TARGET/docker-compose.yml" ps -q "$service")
  test -n "$cid"
  health=''
  for _ in $(seq 1 45); do
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")
    [ "$health" = 'healthy' ] && return 0
    [ "$health" = 'unhealthy' ] && break
    sleep 2
  done
  echo "$service health check failed: $health" >&2
  return 1
}

if ! health_check backend || ! health_check frontend || ! health_check mobile; then
  mkdir -p "$ROLLBACK_DIR"
  tar -xzf "$BACKUP_DIR/source-before-$RELEASE_ID.tar.gz" -C "$ROLLBACK_DIR"
  for directory in backend frontend mobile scripts; do
    rsync -a --delete \
      --exclude='.env' \
      --exclude='.env.*' \
      --exclude='node_modules' \
      --exclude='dist' \
      --exclude='coverage' \
      --exclude='logs' \
      --exclude='backups' \
      --exclude='uploads' \
      "$ROLLBACK_DIR/$directory/" "$TARGET/$directory/"
  done
  for root_file in docker-compose.yml package.json package-lock.json .gitattributes .gitignore .prettierignore .prettierrc eslint.config.mjs README.md; do
    install -m 0644 "$ROLLBACK_DIR/$root_file" "$TARGET/$root_file"
  done
  if [ -f "$BACKUP_DIR/deployed-release.json" ]; then
    install -m 0644 "$BACKUP_DIR/deployed-release.json" "$TARGET/.deployed-release.json"
  else
    rm -f "$TARGET/.deployed-release.json"
  fi
  [ -z "$OLD_BACKEND_IMAGE" ] || docker tag "$OLD_BACKEND_IMAGE" kacon-erp-backend:latest
  [ -z "$OLD_FRONTEND_IMAGE" ] || docker tag "$OLD_FRONTEND_IMAGE" kacon-erp-frontend:latest
  [ -z "$OLD_MOBILE_IMAGE" ] || docker tag "$OLD_MOBILE_IMAGE" kacon-erp-mobile:latest
  docker compose -f "$TARGET/docker-compose.yml" up -d --no-build --force-recreate --remove-orphans
  exit 3
fi

CID=$(docker compose -f "$TARGET/docker-compose.yml" ps -q frontend)
DEPLOYED_BUILD=$(docker exec "$CID" cat /usr/share/nginx/html/version.json | cut -d '"' -f4)
test "$DEPLOYED_BUILD" = "$RELEASE_ID"
docker compose -f "$TARGET/docker-compose.yml" ps
echo "Deployed ERP release: $RELEASE_ID"
`;
}

async function main() {
  validateDeploymentConfig();
  validateLocalRelease();
  const descriptor = createReleaseDescriptor();
  console.log(`Release: ${descriptor.buildId}`);
  console.log(`Files: ${descriptor.fileCount}`);
  if (descriptor.dirtyFiles.length > 0) {
    console.log('Uncommitted release changes:');
    descriptor.dirtyFiles.forEach((file) => console.log(`  ${file}`));
  }

  if (process.argv.includes('--dry-run')) return;
  if (descriptor.dirtyFiles.length > 0 && !process.argv.includes('--allow-dirty')) {
    throw new Error(
      'Deployment stopped because frontend has uncommitted changes. ' +
      'Review the list above and rerun with --allow-dirty to deploy that exact snapshot.'
    );
  }

  const archivePath = createReleaseArchive(descriptor);
  const remoteArchive = `/tmp/${path.basename(archivePath)}`;
  let conn;

  try {
    conn = await connect();
    await uploadFile(conn, archivePath, remoteArchive);
    await runRemoteCommand(conn, createRemoteScript(descriptor, remoteArchive));
  } finally {
    conn?.end();
    fs.rmSync(archivePath, { force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
