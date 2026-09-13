#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

# Values are supplied by the local release orchestrator, never by the archive.
test "$TARGET" = '/opt/1panel/docker/compose/KACON-ERP'
test "$(readlink -f "$TARGET")" = "$TARGET"
[[ "$RELEASE_ID" =~ ^[a-f0-9]{12}-[a-f0-9]{12}$ ]]
[[ "$RUN_ID" =~ ^[a-f0-9-]{36}$ ]]
[[ "$ARCHIVE_SHA256" =~ ^[a-f0-9]{64}$ ]]
test -f "$TARGET/.env"
test -f "$TARGET/docker-compose.yml"
command -v flock >/dev/null
command -v rsync >/dev/null
command -v python3 >/dev/null
export COMPOSE_FILE="$TARGET/docker-compose.yml"
unset COMPOSE_PATH_SEPARATOR

RELEASE_TAG="release-$RELEASE_ID"
case "$RELEASE_SCOPE" in
  all) SELECTED_SERVICES=(backend frontend mobile); SOURCE_DIRECTORIES=(backend frontend mobile scripts) ;;
  frontend) SELECTED_SERVICES=(frontend); SOURCE_DIRECTORIES=(frontend scripts) ;;
  *) echo 'Unknown release scope.' >&2; exit 2 ;;
esac
INCOMING="$TARGET/.incoming-release-$RUN_ID"
BACKUP_DIR="$TARGET/.deploy-backups/$RUN_ID"
ROLLBACK_DIR="$TARGET/.rollback-release-$RUN_ID"
case "$ARCHIVE" in /tmp/kacon-erp-"$RELEASE_ID"-"$RUN_ID".tar.gz) ;; *) exit 2 ;; esac

# Acquire ownership before installing a cleanup trap. Failed concurrent runs
# cannot delete another run's archive, extraction directory or candidate tag.
exec 9>"$TARGET/.deploy.lock"
if ! flock -n 9; then
  rm -f -- "$ARCHIVE"
  echo 'Another ERP deployment is running; no live files were changed.' >&2
  exit 23
fi

SWITCH_STARTED=0
export PHASE=validation
ROLLBACK_STATUS=not-needed

compose() {
  docker compose --project-directory "$TARGET" --env-file "$TARGET/.env" -f "$TARGET/docker-compose.yml" "$@"
}

switch_containers() {
  if [ "$RELEASE_SCOPE" = frontend ]; then
    compose up -d --no-deps --force-recreate frontend
  else
    compose up -d --force-recreate --remove-orphans
  fi
}

record_state() {
  python3 - "$TARGET/.last-deployment.json" "$RELEASE_ID" "$1" "$PHASE" "$ROLLBACK_STATUS" "$EXPECTED_BUILD_ID" "$RUN_ID" "$RELEASE_SCOPE" <<'PY'
import datetime, json, os, sys
target, build, status, phase, rollback, previous, run, scope = sys.argv[1:]
temporary = target + '.tmp-' + run
with open(temporary, 'w') as output:
    json.dump(dict(buildId=build, previousBuildId=previous, status=status,
                   phase=phase, rollback=rollback, scope=scope,
                   updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat()), output, indent=2)
os.replace(temporary, target)
PY
}

sync_directory() {
  local source="$1" directory="$2"
  rsync -a --delete \
    --exclude='.env' --exclude='.env.*' --exclude='node_modules' \
    --exclude='dist' --exclude='coverage' --exclude='logs' \
    --exclude='backups' --exclude='uploads' \
    "$source/$directory/" "$TARGET/$directory/"
}

copy_root_files() {
  local source="$1" file
  for file in docker-compose.yml package.json package-lock.json .gitattributes .gitignore .prettierignore .prettierrc eslint.config.mjs README.md; do
    install -m 0644 "$source/$file" "$TARGET/$file" || return 1
  done
}

health_check() {
  local service="$1" cid health
  cid=$(compose ps -q "$service")
  test -n "$cid" || return 1
  for _ in $(seq 1 45); do
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid")
    [ "$health" = healthy ] && return 0
    [ "$health" = unhealthy ] && break
    sleep 2
  done
  echo "$service health check failed: $health" >&2
  return 1
}

rollback_release() {
  echo "Restoring the previous ERP release after failure in $PHASE." >&2
  mkdir -p "$ROLLBACK_DIR" || return 1
  tar -xzf "$BACKUP_DIR/source.tar.gz" -C "$ROLLBACK_DIR" || return 1
  for directory in "${SOURCE_DIRECTORIES[@]}"; do
    sync_directory "$ROLLBACK_DIR" "$directory" || return 1
  done
  copy_root_files "$ROLLBACK_DIR" || return 1
  install -m 0600 "$BACKUP_DIR/env" "$TARGET/.env" || return 1
  if [ -f "$BACKUP_DIR/manifest.json" ]; then
    install -m 0644 "$BACKUP_DIR/manifest.json" "$TARGET/.deployed-release.json" || return 1
  else
    rm -f -- "$TARGET/.deployed-release.json" || return 1
  fi
  docker tag "$OLD_FRONTEND_IMAGE" "$OLD_FRONTEND_REF" || return 1
  if [ "$RELEASE_SCOPE" = all ]; then
    docker tag "$OLD_BACKEND_IMAGE" "$OLD_BACKEND_REF" || return 1
    docker tag "$OLD_MOBILE_IMAGE" "$OLD_MOBILE_REF" || return 1
  fi
  switch_containers || return 1
  for service in backend frontend mobile redis; do health_check "$service" || return 1; done
}

finish() {
  local code=$?
  trap - EXIT
  set +e
  if [ "$code" -ne 0 ] && [ "$SWITCH_STARTED" -eq 1 ]; then
    if rollback_release; then
      ROLLBACK_STATUS=completed
      echo "Previous release restored. Failure details: $TARGET/.last-deployment.json" >&2
    else
      ROLLBACK_STATUS=failed
      echo "Rollback needs attention. Recovery files retained at $BACKUP_DIR" >&2
    fi
  fi
  if [ "$code" -ne 0 ]; then record_state failed; fi
  # These paths were built only from a checked canonical target and UUID.
  rm -rf -- "$INCOMING" "$ROLLBACK_DIR"
  rm -f -- "$ARCHIVE"
  for service in backend frontend mobile; do
    docker image rm "kacon-erp-$service:candidate-$RUN_ID" >/dev/null 2>&1 || true
  done
  if [ "$code" -eq 0 ]; then rm -rf -- "$BACKUP_DIR"; fi
  exit "$code"
}
trap finish EXIT

# Compare under the same lock used by every source/image switch. A deployment
# prepared against a previous server state must never overwrite a newer one.
CURRENT_BUILD_ID=$(python3 - "$TARGET/.deployed-release.json" <<'PY'
import json, os, sys
print(json.load(open(sys.argv[1])).get('buildId', '') if os.path.isfile(sys.argv[1]) else '')
PY
)
if [ "$CURRENT_BUILD_ID" != "$EXPECTED_BUILD_ID" ]; then
  echo "Server release changed since preflight ($EXPECTED_BUILD_ID -> $CURRENT_BUILD_ID); refusing stale deployment." >&2
  exit 25
fi

for cid in $(docker ps -aq --filter name=kacon-erp); do
  working_dir=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$cid")
  config_file=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$cid")
  test "$working_dir" = "$TARGET"
  test "$config_file" = "$TARGET/docker-compose.yml"
done
printf '%s  %s\n' "$ARCHIVE_SHA256" "$ARCHIVE" | sha256sum --check --status -
mkdir -p "$INCOMING" "$BACKUP_DIR"
tar -xzf "$ARCHIVE" -C "$INCOMING"

test -f "$INCOMING/backend/Dockerfile"
test -f "$INCOMING/frontend/Dockerfile"
test -f "$INCOMING/mobile/Dockerfile"
grep -q 'data-sidebar-performance="2"' "$INCOMING/frontend/src/components/layout/SidebarMenu.vue"
if grep -Eq '^[[:space:]]+build:' "$INCOMING/docker-compose.yml"; then
  echo 'Production Compose must reference immutable release images.' >&2
  exit 22
fi
if grep -Eq '<el-(menu|sub-menu|menu-item)([[:space:]>]|-)|default-openeds|collapse-transition' \
  "$INCOMING/frontend/src/components/layout/SidebarMenu.vue" "$INCOMING/frontend/src/views/Layout.vue"; then
  echo 'The archive contains the old sidebar implementation.' >&2
  exit 20
fi

OLD_BACKEND_IMAGE=$(docker inspect --format '{{.Image}}' kacon-erp-backend-1)
OLD_FRONTEND_IMAGE=$(docker inspect --format '{{.Image}}' kacon-erp-frontend-1)
OLD_MOBILE_IMAGE=$(docker inspect --format '{{.Image}}' kacon-erp-mobile-1)
OLD_BACKEND_REF=$(docker inspect --format '{{.Config.Image}}' kacon-erp-backend-1)
OLD_FRONTEND_REF=$(docker inspect --format '{{.Config.Image}}' kacon-erp-frontend-1)
OLD_MOBILE_REF=$(docker inspect --format '{{.Config.Image}}' kacon-erp-mobile-1)
COMPOSE_IMAGES=$(compose config --images)
for running_image in "$OLD_BACKEND_REF" "$OLD_FRONTEND_REF" "$OLD_MOBILE_REF"; do
  printf '%s\n' "$COMPOSE_IMAGES" | grep -Fx -- "$running_image" >/dev/null
done

build_image() {
  local service="$1" image="kacon-erp-$1:$RELEASE_TAG" candidate="kacon-erp-$1:candidate-$RUN_ID"
  PHASE="build-$service"
  record_state running
  if docker image inspect "$image" >/dev/null 2>&1; then
    # Reuse immutable images on retry. --pull must never retag the same release
    # with different base-image bytes.
    test "$(docker image inspect --format '{{index .Config.Labels "ai.kacon.erp.source-sha256"}}' "$image")" = "$SOURCE_HASH"
    test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image")" = "$GIT_COMMIT"
    docker tag "$image" "$candidate"
  elif [ "$service" = frontend ] || [ "$service" = mobile ]; then
    docker build --pull --build-arg APP_BUILD_ID="$RELEASE_ID" \
      --label "org.opencontainers.image.revision=$GIT_COMMIT" \
      --label "ai.kacon.erp.source-sha256=$SOURCE_HASH" \
      --label "ai.kacon.erp.build-id=$RELEASE_ID" \
      -t "$candidate" "$INCOMING/$service"
  else
    docker build --pull \
      --label "org.opencontainers.image.revision=$GIT_COMMIT" \
      --label "ai.kacon.erp.source-sha256=$SOURCE_HASH" \
      --label "ai.kacon.erp.build-id=$RELEASE_ID" \
      -t "$candidate" "$INCOMING/$service"
  fi
}
for service in "${SELECTED_SERVICES[@]}"; do build_image "$service"; done

PHASE=candidate-validation
record_state running
docker run --rm --entrypoint /bin/sh "kacon-erp-frontend:candidate-$RUN_ID" -c '
  set -eu
  test -f /usr/share/nginx/html/version.json
  grep -R -l -a "data-sidebar-performance" /usr/share/nginx/html/assets >/dev/null
  ! grep -R -l -a "default-openeds" /usr/share/nginx/html/assets >/dev/null
'
docker run --rm --entrypoint cat "kacon-erp-frontend:candidate-$RUN_ID" /usr/share/nginx/html/version.json |
  python3 -c 'import json,sys; v=json.load(sys.stdin); assert v["buildId"]==sys.argv[1] and v["performanceContract"]==2' "$RELEASE_ID"
if [ "$RELEASE_SCOPE" != frontend ]; then
  docker run --rm --entrypoint cat "kacon-erp-mobile:candidate-$RUN_ID" /usr/share/nginx/html/version.json |
    python3 -c 'import json,sys; assert json.load(sys.stdin)["buildId"]==sys.argv[1]' "$RELEASE_ID"
fi
if [ "$RELEASE_SCOPE" = all ]; then
  docker run --rm --entrypoint node "kacon-erp-backend:candidate-$RUN_ID" -e "require('fs').accessSync('/app/src/index.js')"
  docker run --rm --entrypoint /bin/sh "kacon-erp-mobile:candidate-$RUN_ID" -c 'test -f /usr/share/nginx/html/index.html'
fi

for service in "${SELECTED_SERVICES[@]}"; do
  image="kacon-erp-$service:$RELEASE_TAG"
  candidate="kacon-erp-$service:candidate-$RUN_ID"
  if docker image inspect "$image" >/dev/null 2>&1; then
    test "$(docker image inspect --format '{{.Id}}' "$image")" = "$(docker image inspect --format '{{.Id}}' "$candidate")"
  else
    docker tag "$candidate" "$image"
  fi
done

# Validate the candidate against the current database before any live write.
# A database migrated by other ongoing work must not trigger a container
# restart or be silently downgraded by this release.
if [ "$RELEASE_SCOPE" = all ]; then
  PHASE=migration-preflight
  record_state running
  ERP_RELEASE_TAG="$RELEASE_TAG" compose run -T --interactive=false --rm --no-deps backend node -e '
    const knex = require("knex")(require("./knexfile")["production"]);
    knex.migrate.list().then(() => knex.destroy()).catch(async error => {
      console.error(error.message); await knex.destroy(); process.exitCode = 1;
    });
  ' </dev/null
fi

PHASE=backup
record_state running
tar \
  --exclude='*/node_modules' --exclude='*/dist' --exclude='*/coverage' \
  --exclude='*/logs' --exclude='*/backups' --exclude='*/uploads' \
  --exclude='*/.env' --exclude='*/.env.*' \
  -czf "$BACKUP_DIR/source.tar.gz" -C "$TARGET" \
  docker-compose.yml package.json package-lock.json .gitattributes .gitignore .prettierignore .prettierrc eslint.config.mjs README.md "${SOURCE_DIRECTORIES[@]}"
install -m 0600 "$TARGET/.env" "$BACKUP_DIR/env"
if [ -f "$TARGET/.deployed-release.json" ]; then
  install -m 0644 "$TARGET/.deployed-release.json" "$BACKUP_DIR/manifest.json"
fi

# All failures from the first live write through health/version verification
# restore source, .env, manifest and the exact previously running image IDs.
PHASE=source-switch
SWITCH_STARTED=1
record_state running
for directory in "${SOURCE_DIRECTORIES[@]}"; do sync_directory "$INCOMING" "$directory"; done
copy_root_files "$INCOMING"
python3 - "$TARGET/.env" "$RELEASE_TAG" "$RUN_ID" "$RELEASE_SCOPE" <<'PY'
import os, sys
target, tag, run, scope = sys.argv[1:]
keys = ['ERP_FRONTEND_RELEASE_TAG='] + (['ERP_RELEASE_TAG='] if scope == 'all' else [])
lines = [line for line in open(target).read().splitlines() if not any(line.startswith(key) for key in keys)]
temporary = target + '.release-' + run
with open(temporary, 'w') as output:
    output.write('\n'.join(lines + [key + tag for key in keys]) + '\n')
os.chmod(temporary, 0o600)
os.replace(temporary, target)
PY

cd "$TARGET"
compose config --quiet
if [ "$RELEASE_SCOPE" = all ]; then
  PHASE=migration
  record_state running
  # The orchestrator streams this script over SSH stdin. Never let the one-off
  # container consume the remaining deployment commands or request a TTY.
  compose run -T --interactive=false --rm --no-deps backend npm run migrate </dev/null
fi
PHASE=container-switch
record_state running
switch_containers
PHASE=health-verification
record_state running
for service in backend frontend mobile redis; do health_check "$service"; done

PHASE=version-verification
record_state running
curl -fsS --max-time 10 http://127.0.0.1:18081/version.json |
  python3 -c 'import json,sys; v=json.load(sys.stdin); assert v["buildId"]==sys.argv[1] and v["performanceContract"]==2' "$RELEASE_ID"
if [ "$RELEASE_SCOPE" != frontend ]; then
  curl -fsS --max-time 10 http://127.0.0.1:18082/version.json |
    python3 -c 'import json,sys; assert json.load(sys.stdin)["buildId"]==sys.argv[1]' "$RELEASE_ID"
fi
for service in backend frontend mobile; do
  cid=$(compose ps -q "$service")
  expected_ref="kacon-erp-$service:$RELEASE_TAG"
  if [ "$RELEASE_SCOPE" = frontend ]; then
    case "$service" in
      backend) expected_ref="$OLD_BACKEND_REF" ;;
      mobile) expected_ref="$OLD_MOBILE_REF" ;;
    esac
  fi
  actual_ref=$(docker inspect --format '{{.Config.Image}}' "$cid")
  actual_id=$(docker inspect --format '{{.Image}}' "$cid")
  test "$actual_ref" = "$expected_ref"
  test "$actual_id" = "$(docker image inspect --format '{{.Id}}' "$expected_ref")"
  if [ "$RELEASE_SCOPE" = frontend ]; then
    case "$service" in
      backend) test "$actual_id" = "$OLD_BACKEND_IMAGE" ;;
      mobile) test "$actual_id" = "$OLD_MOBILE_IMAGE" ;;
    esac
  fi
  printf '%s\t%s\t%s\n' "$service" "$actual_ref" "$actual_id" >> "$BACKUP_DIR/service-images.tsv"
done

python3 - "$TARGET/.deployed-release.json.tmp-$RUN_ID" "$BACKUP_DIR/service-images.tsv" "$MANIFEST_BASE64" <<'PY'
import base64, json, sys
target, images, encoded = sys.argv[1:]
manifest = json.loads(base64.b64decode(encoded))
manifest['serviceImages'] = {}
for line in open(images):
    service, image, image_id = line.strip().split('\t')
    manifest['serviceImages'][service] = dict(image=image, imageId=image_id)
with open(target, 'w') as output:
    json.dump(manifest, output, indent=2)
PY
chmod 644 "$TARGET/.deployed-release.json.tmp-$RUN_ID"
mv -- "$TARGET/.deployed-release.json.tmp-$RUN_ID" "$TARGET/.deployed-release.json"
PHASE=complete
record_state succeeded
SWITCH_STARTED=0
compose ps
echo "Deployed and verified ERP release: $RELEASE_ID"
