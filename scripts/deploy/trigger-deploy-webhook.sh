#!/usr/bin/env bash
set -euo pipefail

# Trigger the homelab deploy webhook for the resolved deploy SHA.
# Extracted from deploy.yml "Trigger deploy webhook" step.
# Required env: WEBHOOK_URL, WEBHOOK_SECRET, DEPLOY_SHA.

echo "==> Triggering deploy webhook..."

# Deploy the exact :<sha> image tag resolved above. Read from
# env (never inlined) to keep the curl headers injection-safe.
echo "==> Deploying SHA $DEPLOY_SHA"

call_webhook() {
  local url="$1"
  curl -s -w "\n%{http_code}" \
    -X POST \
    -H "X-Webhook-Secret: $WEBHOOK_SECRET" \
    -H "X-Deploy-SHA: $DEPLOY_SHA" \
    --connect-timeout 10 \
    --max-time 30 \
    "$url"
}

call_webhook_with_retry() {
  local url="$1"
  local attempt http body response max_attempts
  max_attempts=3

  for attempt in $(seq 1 "$max_attempts"); do
    response=$(call_webhook "$url" || true)
    http=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    echo "Response from $url (attempt $attempt/$max_attempts): $body (HTTP $http)" >&2

    if [ "$http" -ge 200 ] && [ "$http" -lt 300 ]; then
      echo "$response"
      return 0
    fi

    if [ "$attempt" -lt "$max_attempts" ] && { [ "$http" -ge 500 ] || [ "$http" = "000" ]; }; then
      sleep $((attempt * 5))
      continue
    fi

    echo "$response"
    return 0
  done
}

try_webhook_url() {
  local url="$1"
  local response http_code body
  response=$(call_webhook_with_retry "$url")
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  echo "$http_code"$'\n'"$body"
}

normalize_webhook_candidates() {
  node -e 'const raw = (process.env.WEBHOOK_URL ?? "").trim(); if (!raw) { process.exit(1); } let parsed; try { parsed = new URL(raw); } catch (error) { console.error(`Invalid DEPLOY_WEBHOOK_URL: ${error.message}`); process.exit(1); } const origin = `${parsed.protocol}//${parsed.host}`; const trimmedPath = parsed.pathname.replace(/\/+$/, ""); const originalPath = trimmedPath.length > 0 ? trimmedPath : "/"; const originalUrl = `${origin}${originalPath}${parsed.search}`; let canonicalPath = trimmedPath; if (!canonicalPath || canonicalPath === "/") { canonicalPath = "/webhook/deploy"; } else if (!canonicalPath.endsWith("/webhook/deploy")) { canonicalPath = `${canonicalPath}/webhook/deploy`; } const canonicalUrl = `${origin}${canonicalPath}`; const candidates = [originalUrl, canonicalUrl].filter((value, index, all) => all.indexOf(value) === index); for (const candidate of candidates) { console.log(candidate); }'
}

mapfile -t webhook_candidates < <(normalize_webhook_candidates)
if [ "${#webhook_candidates[@]}" -eq 0 ]; then
  echo "::error::Unable to derive webhook retry candidates from DEPLOY_WEBHOOK_URL"
  exit 1
fi

selected_code=""
selected_body=""

for index in "${!webhook_candidates[@]}"; do
  candidate="${webhook_candidates[$index]}"
  if [ "$index" -gt 0 ]; then
    echo "==> Retrying against canonical webhook path: $candidate" >&2
  fi

  result=$(try_webhook_url "$candidate")
  selected_code=$(echo "$result" | head -1)
  selected_body=$(echo "$result" | sed '1d')

  if [ "$selected_code" -ge 200 ] && [ "$selected_code" -lt 300 ]; then
    echo "==> Deploy triggered successfully!"
    exit 0
  fi
done

failure_body_compact="$(echo "$selected_body" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//')"
if echo "$failure_body_compact" | grep -qi "another deploy is already running"; then
  echo "::error title=LOCK_CONTENTION::Deploy webhook lock contention: $failure_body_compact"
elif echo "$failure_body_compact" \
  | grep -Eqi "would be overwritten by merge|unmerged files|fatal: Exiting because of an unresolved conflict|Aborting"; then
  echo "::error title=CHECKOUT_RECOVERY_FAILED::Deploy checkout recovery failed: $failure_body_compact"
elif echo "$failure_body_compact" \
  | grep -Eqi "compose preflight|migration|health|required services|cloudflared|relation"; then
  echo "::error title=RUNTIME_PRECHECK_FAILED::Deploy runtime precheck failed: $failure_body_compact"
fi

echo "::error::Deploy webhook failed with HTTP $selected_code"
echo "::error::Response body: $failure_body_compact"
exit 1
