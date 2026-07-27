#!/usr/bin/env bash
set -euo pipefail

# OAuth smoke checks for the production deploy.
# Extracted from deploy.yml, keeping the two checks as separate modes so each
# step keeps its own pass/fail outcome and error classification.
#
# Modes:
#   auth-config  Poll /api/health/auth-config until the OAuth contract is ready.
#   redirect     Poll /api/auth/discord until it 302s to Discord with the
#                expected client_id and redirect_uri.
#
# auth-config requires env: WEBHOOK_URL
# redirect requires env:    WEBHOOK_URL, EXPECTED_CLIENT_ID
# redirect optional env:    ALLOW_DEPLOY_UNVERIFIED_OAUTH (default false)

mode="${1:-}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$mode" in
    auth-config)
        base_url=$(bash "$script_dir/derive-webhook-origin.sh" "${WEBHOOK_URL:?WEBHOOK_URL is required}")
        health_url="${base_url}/api/health/auth-config"
        upstream_unavailable_count=0
        contract_invalid_count=0
        other_http_count=0

        echo "==> Running deploy smoke check: $health_url"

        for attempt in $(seq 1 18); do
            echo "Attempt ${attempt}/18..."
            response=$(curl -sS --max-time 20 -w "\n%{http_code}" "$health_url" || true)
            http_code=$(echo "$response" | tail -1)
            body=$(echo "$response" | sed '$d')

            if [ "$http_code" = "200" ]; then
                if HEALTH_BODY="$body" node -e '
                  const body = process.env.HEALTH_BODY ?? "";
                  let parsed;
                  try {
                    parsed = JSON.parse(body);
                  } catch {
                    console.log("auth-config returned invalid JSON");
                    process.exit(1);
                  }

                  const auth = parsed?.auth ?? {};
                  const clientId = typeof auth?.clientId === "string" ? auth.clientId : "";
                  const clientIdConfigured = auth?.clientIdConfigured === true;
                  // Production redacts everything except auth.{clientId, redirectUri,
                  // frontendOrigins, clientIdConfigured, authorizeUrlPreview} per #1710
                  // (security: redact operational diagnostics), so top-level status/warnings
                  // and sessionSecretConfigured/redisHealthy are ABSENT in prod. This gate
                  // only asserts on fields production actually exposes. See #1824.
                  const redirectUri = typeof auth?.redirectUri === "string" ? auth.redirectUri : "";
                  const authorizeUrlPreview = typeof auth?.authorizeUrlPreview === "string"
                    ? auth.authorizeUrlPreview
                    : "";
                  const callbackPathOk = redirectUri.includes("/api/auth/callback");
                  const authorizePreviewOk = authorizeUrlPreview.includes(
                    "discord.com/api/oauth2/authorize",
                  );

                  if (
                    clientId.length === 0 ||
                    !clientIdConfigured ||
                    !callbackPathOk ||
                    !authorizePreviewOk
                  ) {
                    console.log(
                      `auth-config contract not ready (clientId=${clientId}, clientIdConfigured=${clientIdConfigured}, callbackPathOk=${callbackPathOk}, authorizePreviewOk=${authorizePreviewOk})`,
                    );
                    process.exit(1);
                  }

                  console.log("OAuth auth-config contract ready");
                '; then
                    echo "==> OAuth auth-config smoke check passed"
                    exit 0
                fi
                contract_invalid_count=$((contract_invalid_count + 1))
                echo "Auth-config contract invalid/unready (HTTP 200). Waiting 10s..."
            elif [[ "$http_code" =~ ^5[0-9][0-9]$ ]]; then
                upstream_unavailable_count=$((upstream_unavailable_count + 1))
                echo "Upstream unavailable at $health_url (HTTP $http_code). Waiting 10s..."
            else
                other_http_count=$((other_http_count + 1))
                echo "Service not ready yet at $health_url (HTTP $http_code). Waiting 10s..."
            fi

            sleep 10
        done

        echo "::error::Timed out waiting for OAuth auth-config contract"
        echo "::error::Auth-config smoke summary: upstream_unavailable=${upstream_unavailable_count}, contract_invalid=${contract_invalid_count}, other_http=${other_http_count}"
        exit 1
        ;;
    redirect)
        configured_expected_client_id="${EXPECTED_CLIENT_ID:-}"
        if [ -z "$configured_expected_client_id" ]; then
            echo "::error::Missing required secret WEBAPP_EXPECTED_CLIENT_ID"
            exit 1
        fi
        base_url=$(bash "$script_dir/derive-webhook-origin.sh" "${WEBHOOK_URL:?WEBHOOK_URL is required}")
        auth_url="${base_url}/api/auth/discord"
        auth_config_url="${base_url}/api/health/auth-config"

        config_response="$(curl -sS --max-time 20 -w "\n%{http_code}" "$auth_config_url" || true)"
        config_http_code="$(echo "$config_response" | tail -1)"
        config_body="$(echo "$config_response" | sed '$d')"

        if [ "$config_http_code" != "200" ]; then
            echo "::error::Unable to derive OAuth expectations from auth-config (HTTP $config_http_code)"
            exit 1
        fi

        expected_values="$(
            AUTH_CONFIG_BODY="$config_body" node -e '
              const body = process.env.AUTH_CONFIG_BODY ?? "";
              let parsed;
              try {
                parsed = JSON.parse(body);
              } catch {
                console.log("invalid-auth-config-json");
                process.exit(1);
              }
              const auth = parsed?.auth ?? {};
              const clientId = typeof auth.clientId === "string" ? auth.clientId : "";
              const redirectUri =
                typeof auth.redirectUri === "string" ? auth.redirectUri : "";
              if (!clientId || !redirectUri) {
                console.log("missing-auth-config-fields");
                process.exit(1);
              }
              process.stdout.write(`${clientId}\n${redirectUri}`);
            '
        )"

        auth_config_client_id="$(echo "$expected_values" | sed -n '1p')"
        expected_redirect_uri="$(echo "$expected_values" | sed -n '2p')"

        if [ -z "$auth_config_client_id" ] || [ -z "$expected_redirect_uri" ]; then
            echo "::error::Unable to derive OAuth expectations from auth-config payload"
            exit 1
        fi

        if [ "$auth_config_client_id" != "$configured_expected_client_id" ]; then
            echo "::error::Auth-config client_id (${auth_config_client_id}) does not match WEBAPP_EXPECTED_CLIENT_ID secret"
            exit 1
        fi

        expected_client_id="$configured_expected_client_id"

        echo "==> Running OAuth redirect contract smoke check: $auth_url"
        rate_limited_count=0
        non_rate_limited_attempts=0

        for attempt in $(seq 1 18); do
            echo "Attempt ${attempt}/18..."
            headers_file="$(mktemp)"
            http_code="$(curl -sS -o /dev/null -D "$headers_file" --max-time 20 "$auth_url" -w "%{http_code}" || true)"

            if [ "$http_code" = "429" ]; then
                rate_limited_count=$((rate_limited_count + 1))
                rm -f "$headers_file"
                echo "OAuth redirect contract check is rate-limited (429). Waiting 10s..."
                sleep 10
                continue
            fi

            non_rate_limited_attempts=$((non_rate_limited_attempts + 1))

            if [ "$http_code" = "302" ]; then
                location_header="$(awk 'BEGIN{IGNORECASE=1} /^location: /{print $2}' "$headers_file" | tr -d '\r')"
                if [ -n "$location_header" ] && OAUTH_LOCATION="$location_header" \
                EXPECTED_CLIENT_ID="$expected_client_id" \
                EXPECTED_REDIRECT_URI="$expected_redirect_uri" \
                node -e '
                  const location = process.env.OAUTH_LOCATION ?? "";
                  const expectedClientId = process.env.EXPECTED_CLIENT_ID ?? "";
                  const expectedRedirectUri = process.env.EXPECTED_REDIRECT_URI ?? "";

                  const parsed = new URL(location);
                  const actualClientId = parsed.searchParams.get("client_id") ?? "";
                  const actualRedirectUri = parsed.searchParams.get("redirect_uri") ?? "";
                  const isDiscordHost = parsed.hostname === "discord.com";
                  const isAuthorizePath = parsed.pathname.endsWith("/oauth2/authorize");

                  if (!isDiscordHost || !isAuthorizePath) {
                    console.log(
                      `OAuth location host/path not ready: ${parsed.hostname}${parsed.pathname}`,
                    );
                    process.exit(1);
                  }

                  if (actualClientId !== expectedClientId) {
                    console.log(
                      `OAuth client_id not ready (expected=${expectedClientId}, actual=${actualClientId})`,
                    );
                    process.exit(1);
                  }

                  if (actualRedirectUri !== expectedRedirectUri) {
                    console.log(
                      `OAuth redirect_uri not ready (expected=${expectedRedirectUri}, actual=${actualRedirectUri})`,
                    );
                    process.exit(1);
                  }
                '; then
                    rm -f "$headers_file"
                    echo "==> OAuth redirect contract smoke check passed"
                    exit 0
                fi
            fi

            rm -f "$headers_file"
            echo "OAuth redirect contract not ready yet (HTTP $http_code). Waiting 10s..."
            sleep 10
        done

        if [ "$non_rate_limited_attempts" -eq 0 ] && [ "$rate_limited_count" -gt 0 ]; then
            if [ "${ALLOW_DEPLOY_UNVERIFIED_OAUTH:-false}" = "true" ]; then
                echo "::warning::OAuth redirect contract check was rate-limited on all attempts; bypassing because ALLOW_DEPLOY_UNVERIFIED_OAUTH=true - verify OAuth flow manually."
                exit 0
            fi
            echo "::error::OAuth redirect contract check was rate-limited (429) on all $rate_limited_count attempts - contract not verified."
            echo "::error::Options: (1) redeploy after Discord rate-limit clears (~5 min); (2) trigger workflow_dispatch with allow_deploy_unverified_oauth=true to bypass"
            exit 1
        fi

        echo "::error::Timed out waiting for OAuth redirect contract"
        echo "::error::OAuth redirect smoke summary: non_rate_limited_attempts=$non_rate_limited_attempts, rate_limited_count=$rate_limited_count"
        exit 1
        ;;
    *)
        echo "oauth-smoke.sh: unknown mode '${mode}' (expected: auth-config|redirect)" >&2
        exit 1
        ;;
esac
