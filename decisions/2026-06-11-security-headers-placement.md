# Security headers: hybrid placement (helmet + vercel.json + nginx), HSTS at the Cloudflare edge only

- Status: accepted
- Date: 2026-06-11
- Issue: #1283

## Context

The 2026-06-09 security audit flagged an OWASP A05 gap: no HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or CSP anywhere in the stack (only one route sets nosniff manually). Issue #1283 proposed fixing it "at nginx". Investigating the serving topology showed that framing is incomplete:

- The SPA users actually hit is served by **Vercel** (`vercel.json`, Vite build), with `/api/:path*` rewritten to `https://lucky-api.lucassantana.tech`. nginx-only headers would miss the primary user-facing origin entirely.
- The homelab nginx fronts the API, the webhook service, and a second copy of the SPA — but it listens on **plain HTTP :8080 behind a Cloudflare Tunnel** (`cloudflared` service in docker-compose). TLS terminates at Cloudflare, not nginx. Per RFC 6797, browsers ignore `Strict-Transport-Security` received over http, so HSTS set at nginx is a no-op.
- The frontend ships Sentry (browser SDK), Google Fonts, and Discord CDN avatars — all of which constrain the CSP.

## Decision

Hybrid placement, one source of headers per origin/layer:

1. **Backend (Express): helmet middleware** for `/api` responses (nosniff, XFO, Referrer-Policy; `hsts: false` since it is proxied). Protects the API even if reached without nginx.
2. **Vercel SPA origin: `vercel.json` `headers`** — XFO DENY, nosniff, Referrer-Policy `strict-origin-when-cross-origin`, CSP.
3. **Homelab nginx: `add_header` block** for the homelab-served SPA copy and webhook pass-through — same set as Vercel **minus HSTS**, with a comment documenting the TLS boundary.
4. **HSTS: Cloudflare layer only** (verify it is already emitted on both domains; enable in the dashboard if not). Never at nginx.
5. **CSP rollout: `Content-Security-Policy-Report-Only` first**, reports to the Sentry frontend project's security endpoint, with a measurement window of at least one deploy cycle (target ≤2 weeks), then flip to enforce in a second PR. `style-src` starts with `'unsafe-inline'` (covers runtime `<style>` injection by UI libraries); note React `style={{}}` props are CSSOM-set and not blocked by CSP, so this is a measured concession, not a blanket one — drop it at enforce time if Report-Only shows it is unneeded.

Policy template and per-PR sequencing live in the implementation plan (local `.claude/plans/2026-06-11-security-headers-1283.md`); acceptance criteria stay on #1283.

## Alternatives considered

- **A — nginx `add_header` only (the issue's original framing):** rejected — misses the Vercel-served SPA (the primary user origin) and sets an ineffective HSTS over plain HTTP.
- **B — `vercel.json` headers only:** rejected — leaves the API and homelab origin bare.
- **C — both edges (vercel.json + nginx), no app middleware:** viable, but the backend would depend on nginx for all header coverage; direct access bypasses everything. Helmet is cheap and follows the prefer-maintained-packages rule.
- **D — helmet + vercel.json, nginx untouched:** rejected — the homelab-served SPA copy and webhook pass-through would carry no headers.
- **E — CSP via `<meta http-equiv>` in index.html:** rejected — meta CSP cannot express `frame-ancestors`, `report-uri`, or Report-Only mode, which the rollout depends on.

## Consequences

- Positive: every origin covered; CSP cannot break prod on first deploy (Report-Only is non-breaking by construction); HSTS lives where TLS actually terminates.
- Negative: three header sources to keep in sync (helmet, vercel.json, nginx). Mitigation: post-deploy `curl -i` check against both origins is part of #1283 acceptance; consider a CI header-diff check if drift actually occurs.
- Neutral: nginx `add_header` location-block inheritance (location-level add_header replaces inherited ones) must be handled per-location; documented in the plan.

## Revisit when

- TLS termination moves off the Cloudflare Tunnel (nginx terminates TLS directly, or the tunnel is replaced) → HSTS placement reopens.
- CSP Report-Only window (check by 2026-06-25) shows violations requiring more than two new directives → re-run /research-and-decide on CSP scope.
- At enforce time: decide whether `style-src 'unsafe-inline'` can be dropped based on Report-Only data; if kept, it is accepted debt — re-check 2026-07-15.
- CORS tightening (#1244 follow-up) lands → re-align `connect-src`.
