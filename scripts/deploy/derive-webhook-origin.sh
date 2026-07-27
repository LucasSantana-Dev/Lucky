#!/usr/bin/env bash
set -euo pipefail

# Print the origin (protocol//host) of the URL passed as $1.
# Shared by deploy.yml and deploy-staging.yml so every step derives the same
# homelab base URL from DEPLOY_WEBHOOK_URL.
url="${1:-}"
if [ -z "$url" ]; then
    echo "derive-webhook-origin.sh: missing URL argument" >&2
    exit 1
fi

ORIGIN_INPUT_URL="$url" node -e '
    const raw = (process.env.ORIGIN_INPUT_URL ?? "").trim();
    if (!raw) {
        console.error("derive-webhook-origin.sh: empty URL");
        process.exit(1);
    }
    const u = new URL(raw);
    console.log(`${u.protocol}//${u.host}`);
'
