# ADR — Logging/observability hardening: enforce the existing infra, ship hang/429 hotfixes first

- **Date:** 2026-06-01
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Related:** 4-lens logging audit (2026-06-01) + critic (verdict REVISE → restructured);
  plan `.claude/plans/2026-06-01-logging-hardening.md`. Builds on
  `2026-05-30-observability-remediation-strategy` (alert-first; OTel/metrics deferred) +
  the Redis-removal ADRs. Subsumes the Discord-429 finding + converges with the
  Musical-Taste perf ADR's `withTimeout` work.

## Context

Three of this session's bugs (Discord-429 degrading mod-cases/logs, the Musical-Taste
Discover hang, swallowed Spotify failures) shared one trait: **they were hard to see.**
A read-only 4-lens audit confirmed the logging _infrastructure already exists and works_
(`errorLog`/`warnLog`→Sentry, `captureFrontendException`, `getSanitizedExtra` PII scrubber,
`monitorCommandExecution`, breadcrumbs, an unused `correlationId` field) but is
**systematically bypassed**:

- ~40–70 silent catches (`.catch(() => null/false/[]/{})`, empty `catch {}`) returning
  fallbacks with zero logging (spotifyApi, replenisher, messageHandler feature-toggles,
  candidateFallback, artistApi Last.fm).
- No timeouts on external calls (Spotify/Last.fm/Discord/Prisma) → hangs produce no
  exception → invisible in Sentry (the Musical-Taste hang).
- Frontend uses `console.error` (~28×) + ErrorBoundary console-only → never reaches Sentry,
  though `captureFrontendException` exists.
- Discord-429 guild-context: Redis-only cache, no `Retry-After` backoff, logged at INFO.
- Weak structured context (~17% of `errorLog` calls carry `data`; `correlationId` 0×; no
  request-id) → can't correlate a causal chain.
- Potential PII/secret leakage: raw error objects → Sentry/console; `getSanitizedExtra` not
  applied to `data`/error (sensitive given recent credential-handling incidents).

So "improve logging overall" = **enforce + harden existing infra**, not build new.

## Decision

Adopt a logging-observability hardening standard, **restructured into three tracks by
urgency (the critic's main correction — emergency fixes ship before conventions)**, keeping
the existing custom utils (do NOT adopt a new logger now):

### Track A — Urgent hotfixes (ship FIRST, standalone PRs, before the standard)

These fix live user-facing breakage and are isolated/testable:

1. **`withTimeout(promise, ms, label)`** util in `@lucky/shared/utils`; apply to all external
   calls (Spotify ~10s, Last.fm ~15s, Discord REST ~10s, Prisma ~10–20s). Timeouts become
   logged `warn`/`504` errors, not silent hangs. (This IS the Musical-Taste hang fix — shared.)
2. **Discord-429 guild-context:** parse `Retry-After` + bounded backoff in
   `DiscordOAuthService.getUserGuilds`; move the guild cache **off Redis** (in-memory LRU,
   bounded; Postgres only if durability needed) per the Redis-removal ADRs; log the
   429-fallback at **WARN** not INFO. Fixes mod-cases + logs at the root.

### Track B — P1 standard (incremental, after Track A)

3. **Silent-catch sweep, phased by criticality** (external APIs → auth/guild-context/feature-
   toggles → best-effort), NOT big-bang. Every catch logs (`errorLog` for unexpected,
   `warnLog` for expected fallback) with context; tests per phase (a catch change can alter
   control flow). Add an **ESLint rule** banning bare/empty catches — **soft-launch as a
   warning for ~2 weeks, then promote to error**, with `// eslint-disable` escape hatches for
   genuine best-effort.
4. **Frontend → Sentry:** replace `console.error` with `captureFrontendException`; wire
   `ErrorBoundary.componentDidCatch`.
5. **PII scrubbing (PROMOTED to P1 — security):** apply `getSanitizedExtra` to error + `data`
   before every Sentry/console emit; verify coverage first.
6. Document the `errorLog`-without-`error`-arg footgun (captures as info, not exception).

### Track C — P2, gated

7. **request-id**: Express middleware generating a per-request id, threaded into critical-path
   log `data:{guildId,userId,requestId,operation}` (convention, lint-encouraged, NOT hard-
   blocked on 348 sites). **Escalate to `pino` + AsyncLocalStorage (automatic correlation)
   ONLY if manual request-id adoption stalls (<~60% of critical-path callsites within ~1 month).**

### Deferred (unchanged)

Failure-mode **metrics** (429/timeout/slow-query/feature-toggle-health) and OTel stay
**deferred** per ADR 2026-05-30 (alert-first; revisit 2026-06-15) — do NOT add them now.

## Alternatives considered

1. **Adopt `pino` + AsyncLocalStorage now** — _rejected/gated._ Automatic correlation is nicer,
   but it's premature for a hobby single-instance bot and the infra already forwards to Sentry.
   Made a **gated escalation** (Track C) keyed on real adoption data, not speculation.
2. **Convention-only (no ESLint enforcement)** — _rejected._ Conventions without a lint tripwire
   are exactly how the current 71-catch bypass accumulated.
3. **Big-bang sweep of all silent catches in one PR** — _rejected._ Changing catch behavior en
   masse risks turning silent failures into crashes; incremental + tested is mandatory.
4. **Add failure-mode metrics now** — _rejected._ Violates the deferred-observability ADR; no
   current latency/queue mystery justifies it.

## Consequences

**Positive:** the failure modes that hid today's bugs (hangs, swallowed catches, frontend
errors, 429s) become visible + alertable; no new logging infra/dependency; urgent breakage
ships first; security improved (PII scrubbing).
**Negative / accepted:** manual request-id threading is tedious (mitigated by the gated pino
escalation); the ESLint rule needs a tuning period; incremental sweep spans several PRs.
**Neutral:** a `withTimeout` util + an ESLint rule + a request-id middleware enter the codebase.

## Revisit when

- request-id adoption < ~60% of critical-path callsites after ~1 month → adopt **pino +
  AsyncLocalStorage**.
- A latency/queue/rate-limit mystery takes > ~2h to diagnose after 2026-06-05 → promote
  **failure-mode metrics** to P1 (per ADR 2026-05-30; otherwise revisit 2026-06-15).
- The ESLint silent-catch rule produces excessive false positives → refine scope (error-level
  required, warn allowed for whitelisted best-effort).
- Lucky scales to multiple instances → in-memory caches (guild-context, suggestions) move to
  Postgres.
