#!/bin/bash
set -euo pipefail

URL="${1:-}"

if [[ -z "$URL" ]]; then
    echo "usage: $0 <url>" >&2
    exit 1
fi

TMP_DIR="$(mktemp -d)"
BODY_FILE="$TMP_DIR/body"
HEADER_FILE="$TMP_DIR/headers"

cleanup() {
    rm -rf "$TMP_DIR"
}

output_probe() {
    local http_code="$1"
    printf '%s\n' "${http_code:-000}"
    cat "$BODY_FILE" 2>/dev/null || true
}

probe_with_curl() {
    local http_code
    http_code=$(curl -sS --max-time 10 -o "$BODY_FILE" -w '%{http_code}' "$URL" || true)
    output_probe "$http_code"
}

probe_with_wget() {
    local http_code
    wget -q -T 10 -O "$BODY_FILE" -S "$URL" 2>"$HEADER_FILE" || true
    http_code=$(awk '$1 ~ /^HTTP\// { code = $2 } END { print code }' "$HEADER_FILE")
    output_probe "$http_code"
}

trap cleanup EXIT

if command -v curl >/dev/null 2>&1; then
    probe_with_curl
    exit 0
fi

if command -v wget >/dev/null 2>&1; then
    probe_with_wget
    exit 0
fi

echo "ERROR: no supported HTTP client found (curl or wget)" >&2
exit 1
