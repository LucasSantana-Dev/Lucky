# ADR: Deploy OAuth Redirect Smoke Check — Hard Fail on Sustained 429

**Date:** 2026-05-24  
**Status:** Accepted

## Context

`deploy.yml` includes an "OAuth redirect contract smoke check" step that hits `/api/auth/discord` and validates the redirect to Discord's OAuth2 authorize URL carries the correct `client_id` and `redirect_uri`. It retries 18 times (10s intervals, ~3 min total).

The prior implementation had a silent-pass escape hatch: if every attempt returned HTTP 429 (Discord rate-limiting), the step exited 0 with only a `::warning::` message. The OAuth contract was never actually verified, but the deploy was marked as passing.

A preceding "Auth config smoke check" step validates server-side OAuth fields (`clientId`, `redirectUri`, `sessionSecretConfigured`, `redisHealthy`, etc.) but does not exercise the live Discord redirect — it only checks that the values are present and correctly shaped.

## Decision

Remove the silent-pass escape hatch. If all attempts are rate-limited (429) and the OAuth redirect contract was never verified, the step now **exits 1 (failure)**.

A documented `ALLOW_DEPLOY_UNVERIFIED_OAUTH` flag (available as a `workflow_dispatch` input) allows an operator to explicitly bypass the check when Discord's rate-limiting is confirmed to be a transient infrastructure issue and the auth-config check has passed. The bypass is intentional, visible, and auditable — unlike the previous silent escape.

## Alternatives Considered

**Keep status quo (silent pass on 429):** Preserves deploy continuity when Discord's API is rate-limiting. Rejected because the step title claims "contract verified" while exit 0 fires without any verification — a semantic mismatch that erodes operator trust and can mask real config problems (e.g., malformed redirect_uri) when a 429 storm coincides with a misconfiguration.

**Delete the OAuth redirect check entirely:** Relies solely on auth-config smoke check. Rejected because auth-config validates that fields are _present and shaped correctly_ — it does not test the live redirect URL. A malformed `client_id` encoding or wrong `redirect_uri` domain would pass auth-config but fail at the actual OAuth handshake.

## Consequences

**Positive:**

- "Deploy passed" unambiguously means "OAuth contract was verified."
- Config problems (malformed redirect URL, wrong client_id) are caught at deploy time, not after users hit sign-in failures.
- Operator is forced to make a conscious decision if the check fails, rather than silently proceeding.

**Negative:**

- A deploy can now fail due to Discord's rate-limiting rather than a Lucky-side issue. This requires operator intervention (wait ~5 min, redeploy).
- If Discord's rate-limit window grows beyond ~3 min, the check will fail routinely and operator friction increases.

**Neutral:**

- The escape hatch has fired zero times across 44 production deploy runs (2026-03-14 to 2026-05-24), so the operational impact of removing it is expected to be negligible.

## Revisit When

- The `ALLOW_DEPLOY_UNVERIFIED_OAUTH` bypass is used more than twice per month (suggests Discord's rate-limit window exceeds the retry budget, warranting a longer retry loop or a rescheduled check).
- Discord changes its OAuth rate-limit semantics (new headers, different window, per-token vs per-IP).
- A monitoring gap is detected: if users report sign-in failures post-deploy that were not caught at deploy time, re-evaluate whether the auth-config check covers the missed scenario.
