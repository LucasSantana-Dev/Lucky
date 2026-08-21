# ADR 2026-06-05 — CSRF posture for the backend API

**Status:** Accepted, amended 2026-08-21 (see Amendment at the end — the deployed cookie is `SameSite=None`, not `lax`)
**Issue:** #1244 (CodeQL `js/missing-token-validation`)
**Via:** `/research-and-decide` (critic flipped to "add token", but on a factual SameSite error — see Reconciliation)

## Context

CodeQL flagged `js/missing-token-validation` (high) on the Express backend: cookie/session
middleware serves authenticated state-changing routes with no CSRF _token_. The check is a
heuristic for token absence; it does not model the cookie's `SameSite` attribute. The
backend is a Discord-OAuth-session API consumed by a first-party React SPA.

Verified current state:

- Session cookie: `httpOnly: true`, `secure: <prod>`, **`sameSite: 'lax'`**, 7-day maxAge.
  <br>⚠️ **No longer true in production since 2026-06-28** — see [Amendment 2026-08-21](#amendment-2026-08-21--production-runs-samesitenone).
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
- the cookie is `SameSite=None` **and** a non-first-party origin is allowlisted for credentialed
  CORS (superseded wording — see [Amendment 2026-08-21](#amendment-2026-08-21--production-runs-samesitenone);
  the original trigger was "the cookie must become `SameSite=none`", which fired on 2026-06-28
  without an accompanying cross-site consumer), OR
- a **non-browser/native or third-party client** consumes the authenticated API (SameSite
  doesn't apply to non-browser callers), OR
- the SPA and API stop being same-site.

---

## Amendment 2026-08-21 — production runs `SameSite=None`

**Trigger:** #1714, while auditing whether `'none'` was actually required.

### What changed, and when

`572e320e` (2026-06-28) shipped `sameSite: isProduction ? 'none' : 'lax'` as a production
hotfix, 23 days after this ADR was accepted. From its message:

> Session cookie uses `SameSite=Lax`, which browsers don't send on credentialed JS `fetch()`
> between subdomains (`lucky.lucassantana.tech` → `lucky-api.lucassantana.tech`) in certain
> conditions (ITP, Lax enforcement edge cases). After OAuth redirects back to the frontend,
> the SPA's `checkAuth()` fetch doesn't carry the session cookie, so the user appears
> unauthenticated and ends up back on the landing page.

So `lax` was tried in production and caused an auth loop. The spec reasoning in this ADR —
that same-registrable-domain subdomains are same-site and therefore fine under `lax` — is
correct in theory and did not survive real browser behaviour. **Do not "restore" `lax`
without a staging soak against Safari/ITP; doing so reintroduces a known outage.**

This ADR was not updated at the time, so its "Verified current state" described a
configuration that had stopped being deployed.

### The revisit trigger fired, and is now tightened

The original list named "the cookie must become `SameSite=none`" as a
→ _then add a CSRF token_ trigger. It fired on 2026-06-28 and went unnoticed for ~2 months.

Reviewed on 2026-08-21 and **deliberately not honoured**, because the trigger was written
assuming `SameSite=None` implies a genuine cross-site consumer. That implication does not
hold here: the cookie is `None` to work around a _same-site_ browser quirk, and every
allowlisted origin is still first-party. The trigger is rewritten to test the condition it
was actually aiming at — `None` **and** a non-first-party credentialed origin.

This is an override of a prior decision, recorded as such rather than quietly dropped.

### Control stack as actually deployed (verified 2026-08-21)

`SameSite` is no longer a CSRF control in production. What carries it instead:

- **CORS allowlist with `credentials: true`**, first-party only —
  `lucassantana.tech`/`*.lucassantana.tech`, `luk-homeserver.com.br`/`*.luk-homeserver.com.br`
  (`packages/backend/src/middleware/index.ts:100-108`). Decision #2 of this ADR **was**
  implemented: the `*.replit.dev` / `*.repl.co` / `*.replit.app` entries are gone, and
  `localhost`/`127.0.0.1` is gated to non-production (`:92-99`).
- **All mutations are POST/PUT/PATCH/DELETE with `application/json`**, which forces a CORS
  preflight. A cross-site page cannot get a preflight approved for a non-allowlisted origin.
- **No state-changing GET routes.** Re-verified across the 85 GET handlers in
  `packages/backend/src/routes/`.
- **The OAuth callback is a GET that establishes a session**, which is state-changing in the
  broad sense. It carries its own nonce: `req.session.oauthState` is a 32-byte random value
  checked on return (`routes/auth.ts:26-27`). Noting it explicitly because the blanket "no
  state-changing GETs" claim above would otherwise read as covering it.

### Residual risk, stated plainly

CORS preflight is now the load-bearing control, and it only binds **browsers**. A non-browser
client (curl, a native app, a server-side consumer) is unaffected by CORS and would need the
session cookie, which it cannot obtain without going through the browser OAuth flow — so the
practical surface stays narrow. But the defence is single-layered where it used to be double.

If any of the tightened triggers below become true, revisit the token decision rather than
re-deriving this from scratch.
