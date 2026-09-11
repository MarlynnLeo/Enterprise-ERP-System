#!/usr/bin/env bash
set -euo pipefail

# Server-side source trees are not an authoritative release input. Rebuilding
# them bypasses commit ancestry, archive integrity and the recovery transaction.
echo 'Server-source builds are disabled. Publish a reviewed Git commit from the canonical workspace:' >&2
echo '  node scripts/deploy_to_server.js --ref=<commit>' >&2
echo 'For service recovery, keep the current ERP_RELEASE_TAG and use docker compose up -d.' >&2
exit 24
