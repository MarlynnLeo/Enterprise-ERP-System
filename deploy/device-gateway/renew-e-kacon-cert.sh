#!/usr/bin/env bash
# Run as the deployment account (guiyi), which owns TLS_STATE and uses Docker.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

APP_ROOT=/opt/1panel/docker/compose/KACON-ERP
TLS_STATE="$APP_ROOT/.tls-e-kacon"
DOMAIN=e.kacon.ai
SERVER_IP=192.168.1.251
OPENRESTY=1Panel-openresty-8q3a
DEST=/www/sites/erp/ssl/e.kacon.ai
CERTBOT_IMAGE=${CERTBOT_IMAGE:-certbot/dns-cloudflare@sha256:c45edb002b883da1a1235abb205dff474a7a1a459d878e8d5fdc7f9d83073aea}
MODE=${1:-renew}
case "$MODE" in renew|--deploy-only|--dry-run) ;; *) echo 'Usage: renew-e-kacon-cert.sh [--deploy-only|--dry-run]' >&2; exit 2 ;; esac
[ "$#" -le 1 ] || exit 2
for tool in docker flock openssl curl timeout mktemp sha256sum; do command -v "$tool" >/dev/null; done
[ -d "$TLS_STATE/config/live/$DOMAIN" ]

# Use the same lock as the full ERP release, before touching Certbot or Nginx.
exec 9>"$APP_ROOT/.deploy.lock"
if ! flock -w 1800 9; then
    echo 'Certificate renewal could not acquire the ERP deployment lock.' >&2
    exit 23
fi

log() { printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"; }
TMP=$(mktemp -d "$TLS_STATE/.deploy-cert.XXXXXX")
SWITCH_STARTED=0
PREVIOUS_SERIAL=
CERTBOT_CONTAINER=

served_matches() {
    local expected=$1 actual
    timeout 20s openssl s_client -connect "$SERVER_IP:443" -servername "$DOMAIN" \
        -verify_hostname "$DOMAIN" -verify_return_error -showcerts </dev/null \
        >"$TMP/served.pem" 2>"$TMP/tls-check.log" || return 1
    actual=$(openssl x509 -in "$TMP/served.pem" -noout -serial) || return 1
    [ "$actual" = "$expected" ] || return 1
    curl --noproxy '*' --fail --silent --show-error --connect-timeout 10 --max-time 30 \
        --resolve "$DOMAIN:443:$SERVER_IP" "https://$DOMAIN/" -o /dev/null
}

on_exit() {
    local status=$?
    trap - EXIT INT TERM
    if [ -n "$CERTBOT_CONTAINER" ]; then
        # Killing the Docker CLI alone can leave Certbot running and holding files.
        docker rm -f "$CERTBOT_CONTAINER" >/dev/null 2>&1 || true
    fi
    if [ "$SWITCH_STARTED" = 1 ]; then
        log 'Certificate deployment failed; restoring the previous certificate pair.' >&2
        if docker exec "$OPENRESTY" sh -ec '
            d=$1
            cp "$d/fullchain.pem.previous" "$d/.renew-fullchain.pem"
            cp "$d/privkey.pem.previous" "$d/.renew-privkey.pem"
            chmod 644 "$d/.renew-fullchain.pem"
            chmod 600 "$d/.renew-privkey.pem"
            mv -f "$d/.renew-fullchain.pem" "$d/fullchain.pem"
            mv -f "$d/.renew-privkey.pem" "$d/privkey.pem"
            nginx -t
            nginx -s reload
        ' sh "$DEST" && served_matches "$PREVIOUS_SERIAL"; then
            log 'Previous certificate restored and HTTPS verified.' >&2
        else
            log 'ERROR: Certificate rollback or HTTPS verification failed; manual attention required.' >&2
        fi
        # Keep the newly issued Certbot lineage intact so the next run retries it.
        status=1
    fi
    docker exec "$OPENRESTY" sh -c 'rm -f "$1/.renew-fullchain.pem" "$1/.renew-privkey.pem"' sh "$DEST" >/dev/null 2>&1 || true
    rm -rf -- "$TMP"
    if [ "$status" != 0 ]; then log "ERROR: Renewal exited with status $status." >&2; fi
    exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "$MODE" != --deploy-only ]; then
    [ "$(stat -c '%a' "$TLS_STATE/cloudflare.ini")" = 600 ]
    [ "$(stat -c '%u' "$TLS_STATE/cloudflare.ini")" = "$(id -u)" ]
    grep -Eq '^authenticator *= *dns-cloudflare *$' "$TLS_STATE/config/renewal/$DOMAIN.conf" || {
        log 'ERROR: Configure this lineage with the Cloudflare DNS plugin before scheduling renewal.' >&2
        exit 1
    }
    args=(renew --cert-name "$DOMAIN" --non-interactive --config-dir /data/config --work-dir /data/work --logs-dir /data/logs)
    if [ "$MODE" = --dry-run ]; then args+=(--dry-run); fi
    log 'Checking certificate renewal through Cloudflare DNS validation.'
    CERTBOT_CONTAINER="e-kacon-cert-renew-$$"
    timeout --signal=TERM --kill-after=30s 20m docker run --rm \
        --name "$CERTBOT_CONTAINER" \
        --user "$(id -u):$(id -g)" --mount "type=bind,src=$TLS_STATE,dst=/data" \
        "$CERTBOT_IMAGE" "${args[@]}"
    CERTBOT_CONTAINER=
    if [ "$MODE" = --dry-run ]; then
        log 'Staging renewal test succeeded; the production certificate was not deployed or reloaded.'
        exit 0
    fi
fi

# Snapshot and validate the complete candidate pair before altering live files.
cp -L "$TLS_STATE/config/live/$DOMAIN/fullchain.pem" "$TMP/fullchain.pem"
cp -L "$TLS_STATE/config/live/$DOMAIN/privkey.pem" "$TMP/privkey.pem"
openssl x509 -in "$TMP/fullchain.pem" -out "$TMP/leaf.pem"
openssl x509 -in "$TMP/leaf.pem" -noout -checkend 86400 >/dev/null
openssl verify -purpose sslserver -verify_hostname "$DOMAIN" -untrusted "$TMP/fullchain.pem" "$TMP/leaf.pem" >/dev/null
CERT_KEY=$(openssl x509 -in "$TMP/leaf.pem" -pubkey -noout | openssl pkey -pubin -outform DER | sha256sum | cut -d ' ' -f 1)
PRIVATE_KEY=$(openssl pkey -in "$TMP/privkey.pem" -pubout -outform DER | sha256sum | cut -d ' ' -f 1)
[ "$CERT_KEY" = "$PRIVATE_KEY" ] || { log 'ERROR: Certificate and private key do not match.' >&2; exit 1; }
SERIAL=$(openssl x509 -in "$TMP/leaf.pem" -noout -serial)
CANDIDATE_CERT_HASH=$(sha256sum "$TMP/fullchain.pem" | cut -d ' ' -f 1)
CANDIDATE_KEY_HASH=$(sha256sum "$TMP/privkey.pem" | cut -d ' ' -f 1)
ACTIVE_CERT_HASH=$(docker exec "$OPENRESTY" sha256sum "$DEST/fullchain.pem" | cut -d ' ' -f 1)
ACTIVE_KEY_HASH=$(docker exec "$OPENRESTY" sha256sum "$DEST/privkey.pem" | cut -d ' ' -f 1)
if [ "$CANDIDATE_CERT_HASH" = "$ACTIVE_CERT_HASH" ] && [ "$CANDIDATE_KEY_HASH" = "$ACTIVE_KEY_HASH" ]; then
    if served_matches "$SERIAL"; then
        log 'Certificate files already match; current HTTPS certificate verified.'
        exit 0
    fi
    # A previous run may have stopped after moving the files but before reload.
    # No files change here, so no rollback flag or backup rotation is needed.
    log 'Certificate files match but HTTPS verification failed; testing and reloading OpenResty.'
    docker exec "$OPENRESTY" nginx -t
    docker exec "$OPENRESTY" nginx -s reload
    for attempt in 1 2 3 4 5; do
        if served_matches "$SERIAL"; then
            log 'Matching certificate activated by reload; trusted HTTPS and served serial verified.'
            exit 0
        fi
        sleep 2
    done
    log 'ERROR: HTTPS verification failed after reloading the matching certificate; live files were preserved.' >&2
    exit 1
fi

docker exec "$OPENRESTY" cat "$DEST/fullchain.pem" >"$TMP/previous.pem"
PREVIOUS_SERIAL=$(openssl x509 -in "$TMP/previous.pem" -noout -serial)
docker exec "$OPENRESTY" nginx -t
docker cp "$TMP/fullchain.pem" "$OPENRESTY:$DEST/.renew-fullchain.pem" >/dev/null
docker cp "$TMP/privkey.pem" "$OPENRESTY:$DEST/.renew-privkey.pem" >/dev/null
# Retain exactly one previous pair; do not set the rollback flag until complete.
docker exec "$OPENRESTY" sh -ec '
    d=$1
    cp "$d/fullchain.pem" "$d/fullchain.pem.previous"
    cp "$d/privkey.pem" "$d/privkey.pem.previous"
    chmod 644 "$d/fullchain.pem.previous" "$d/.renew-fullchain.pem"
    chmod 600 "$d/privkey.pem.previous" "$d/.renew-privkey.pem"
' sh "$DEST"
SWITCH_STARTED=1
docker exec "$OPENRESTY" sh -ec '
    d=$1
    mv -f "$d/.renew-fullchain.pem" "$d/fullchain.pem"
    mv -f "$d/.renew-privkey.pem" "$d/privkey.pem"
    nginx -t
    nginx -s reload
' sh "$DEST"
for attempt in 1 2 3 4 5; do
    if served_matches "$SERIAL"; then
        SWITCH_STARTED=0
        log 'Renewed certificate installed; trusted HTTPS and served serial verified.'
        exit 0
    fi
    sleep 2
done
log 'ERROR: HTTPS did not serve the expected trusted certificate.' >&2
exit 1
