# ADR 2026-06-05 — CSRF posture for the backend API

**Status:** Accepted
**Issue:** #1244 (CodeQL `js/missing-token-validation`)
**Via:** `/research-and-decide` (critic flipped to "add token", but on a factual SameSite error — see Reconciliation)

## Context

CodeQL flagged `js/missing-token-validation` (high) on the Express backend: cookie/session
middleware serves authenticated state-changing routes with no CSRF _token_. The check is a
heuristic for token absence; it does not model the cookie's `SameSite` attribute. The
backend is a Discord-OAuth-session API consumed by a first-party React SPA.

Verified current state:

- Session cookie: `httpOnly: true`, `secure: <prod>`, **`sameSite: 'lax'`**, 7-day maxAge.
- CORS: origin allowlist with `credentials: true`. Allowlist includes `lucassantana.tech`/`*.lucassantana.tech`, `luk-homeserver.com.br`/`*.luk-homeserver.com.br`, `localhost`/`127.0.0.1`, **and `*.replit.dev` / `*.repl.co` / `*.replit.app`**.
- Mutations are POST/PUT/PATCH/DELETE with `application/json` (CORS-preflighted). **No state-changing GET routes.**
- SPA↔API are same registrable domain (same-origin `/api` on the main host; `app.` ↔ `api.` subdomains on the homeserver = same-site).
- `POST /api/support` is public + unauthenticated → CSRF N/A.

## Decision

1. **Primary CSRF control = explicit `SameSite=lax` — keep it. Do NOT add a CSRF token.**
   An explicitly-set `SameSite=lax` cookie is **not sent on cross-site requests using unsafe
   methods** (POST/PUT/PATCH/DELETE), including top-level form-POST navigations. So a
   cross-site attacker page cannot attach the victim's session cookie to a forged mutation —
   the CSRF vector is closed. With no state-changing GET routes, the only Lax exception
   (cross-site _safe-method_ top-level navigation) carries no privileged side effect.
   `SameSite=strict` is **rejected**: it would drop the cookie on Discord's cross-site OAuth
   callback redirect and break login — `lax` is the correct setting for OAuth.
2. **Tighten the CORS allowlist** (the critic's valid finding): drop `*.replit.dev` /
   `*.repl.co` / `*.replit.app`, and gate `localhost`/`127.0.0.1` to non-production. These
   untrusted multi-tenant origins being allowed with `credentials:true` is not a CSRF hole
   (SameSite already blocks the cookie cross-site), but it is poor hygiene and a
   defense-in-depth weakness for credentialed cross-origin reads. Low cost, real gain.
3. **Resolve the CodeQL alert** as "won't fix — mitigated by explicit `SameSite=lax`
   (blocks cross-site unsafe-method cookies) + same-site SPA/API + no state-changing GETs;
   CORS allowlist tightened," with this ADR as the evidence. Not a bare dismiss.

## Reconciliation (why the critic's flip was not fully adopted)

The critic recommended adding a token, citing a "2-minute SameSite-lax window" and "lax
allows cross-site POST." Verified incorrect for this config: the 2-minute Lax+POST grace
applied only to cookies with **no explicit** `SameSite` (a Chrome rollout heuristic, since
removed); an **explicit** `SameSite=lax` has no such window and blocks cross-site POST. The
critic's CORS finding, however, is valid and is adopted (decision #2). The critic was also
wrong that `strict` is OAuth-safe.

## Alternatives considered

- **Add a double-submit CSRF token (`csrf-csrf`/`csurf`) on authed mutations** — rejected:
  defense-in-depth against an **already-closed** vector; token plumbing on every mutation +
  frontend header wiring + public-route exemptions is recurring maintenance with ~zero
  marginal security gain for a first-party SPA already protected by explicit `SameSite=lax`.
  Reconsider only under the revisit triggers below.
- **`SameSite=strict`** — rejected: breaks the Discord OAuth cross-site callback.
- **Origin/Referer-check middleware on mutations** — rejected: redundant with `SameSite=lax`
  for the browser threat model; Referer is spoofable/strippable, adding complexity for no net gain.

## Consequences

- **Positive:** no new token layer to maintain; OAuth login keeps working; CORS surface
  reduced; the high CodeQL alert is resolved with a documented, evidenced rationale.
- **Negative / watch:** relies on browser `SameSite` enforcement (fine for a browser-only
  SPA; would NOT protect a non-browser/native API client, which doesn't apply here).

## Revisit when (→ then add a CSRF token)

- A **state-changing GET** route is introduced (would reopen the Lax safe-method exception), OR
- the cookie must become `SameSite=none` (e.g. a cross-site embed / third-party-domain consumer), OR
- a **non-browser/native or third-party client** consumes the authenticated API (SameSite
  doesn't apply to non-browser callers), OR
- the SPA and API stop being same-site.
