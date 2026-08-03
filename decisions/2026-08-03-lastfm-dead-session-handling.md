# ADR 2026-08-03 — Last.fm dead sessions: unlink + one DM on error 9, no env fallback in player path

**Status:** Accepted
**Deciders:** Lucas Santana
**Via:** `/research-and-decide` (critic adjudicated silent-unlink vs unlink+DM; landed unlink+DM with 4 required modifications)
**Surfaced by:** `decisions/2026-08-03-lavalink-reeval-stays-deferred.md` (2,501 Last.fm 403 lines/60d found during the extraction-reliability read)

## Context

Prod logs carried ~42 Last.fm "403 Invalid session key (error 9)" error lines/day. Root cause:

- `externalScrobbler.ts` handled error 9 correctly (unlink the dead `lastfm_links` row).
- `trackNowPlaying.ts` (the main player path, `updateLastFmNowPlaying` + `scrobbleCurrentTrackIfLastFm`) only `warnLog`ged the full error — no unlink, no notification. Dead rows persisted → 2 failing API calls per track per dead-linked requester, forever.
- Prod has 4 `lastfm_links` rows; the spam was essentially one dead key from a daily listener.
- Detection used `err.message.includes('403')` — too broad once unlink is attached (a WAF HTML 403 would nuke valid links).

The critic found three holes in the naive "mirror externalScrobbler" plan:

1. **Env-fallback misattribution (critical).** `getSessionKeyForUser` defaults `allowEnvFallback: true`; if the dead key is the env `LASTFM_SESSION_KEY` (no DB row), `unlink()` returns true via P2025 and a "relink" DM would go to a user who never linked — every track, forever.
2. **Post-unlink scrobble misattribution.** After unlinking, the same requester's next track falls back to the env key → their listens scrobble to the env account owner.
3. **Double-DM race.** `unlink()` returning true is not an idempotency signal (P2025 branch), so updateNowPlaying + scrobble for one track could DM twice.

## Decision

**A shared dead-session handler (`packages/bot/src/lastfm/deadSessionHandler.ts`) used by both scrobble paths:**

1. On `isLastFmInvalidSessionError(err)` (proper error-9 detection, not substring `403`): check `lastFmLinkService.getByDiscordId(discordId)` FIRST, passing the **failed session key** through from the caller.
2. **Lookup throws → warn and bail** — a database error must not read as "no link" (which would false-report the env-key config problem).
3. **No row → the failed key is the env key** (only when the caller actually used the env fallback): log a distinct config warning once per process; never unlink, never DM. On paths that never use the fallback, a missing row means a concurrent path already cleaned up.
4. **Row key ≠ failed key → stale error 9** (user relinked between the failed call and cleanup): never unlink — the fresh key must survive.
5. **Row key matches → unlink; only on `removed === true`** log the removal and DM. An unlink failure logs an error and does NOT consume the notification guard.
6. **DM guarded per session key** (in-memory `Set<string>`), not per user and not by the unlink result: updateNowPlaying/scrobble races can't double-DM, and a relinked-then-expired session (new key) still notifies.
7. **Env fallback in the player path is requester-scoped**: `allowEnvFallback: requesterId === undefined`. Requester-less autoplay/radio tracks keep scrobbling to the env account (original intent of the fallback); identified-but-unlinked requesters no longer do (that misattribution was latent and would have been activated by unlinking). `externalScrobbler` keeps `allowEnvFallback: false` throughout.
8. `externalScrobbler.handleInvalidLastFmSession` routes through the same handler (consistent UX; external path now also notifies).

## Alternatives considered

- **A — silent unlink (no DM).** Rejected: strands the user in a "why did my scrobbles stop?" state; at 4 linked users the DM cost is a handful of messages/year, and it converts silent failure into a recovery action.
- **C — circuit breaker without unlink (skip scrobbling N days, keep row).** Rejected: error 9 is auth-class, not transient (transient = 11/16/29) — a revoked key never revives; retaining it is pointless.
- **D — downgrade log to debug, keep failing.** Rejected: hides a broken state while paying 2 dead API calls per track forever.
- **E — nightly sweeper validating all session keys.** Rejected as overkill for 4 rows; the first-failure signal already exists inline.

## Consequences

**Positive:** spam stops at the first failure (~42 lines/day → 1 info line per dead link); users learn their scrobbling stopped and how to fix it; the env-key case gets a distinct config warning instead of DM-spamming an innocent user; scrobbles can no longer be silently attributed to the env account.
**Negative:** identified-but-unlinked requesters lose env-fallback scrobbling (intentional — see Decision §7); in-memory DM guard resets on restart (harmless: after unlink there are no more 403s).
**Neutral:** `lastFmLinkService.unlink` semantics (P2025 = success) unchanged; the DM guard does not rely on them.

## Revisit when

- `lastfm_links` grows well beyond single digits → real cooldown table instead of the in-memory set.
- 403s recur **after** a user relinks → session-key storage or Last.fm semantics changed; re-examine unlink-on-first-403.
- Env `LASTFM_SESSION_KEY` is rotated/revoked → wire the env-key warning into alerting, not just logs.
- Any user complaint about scrobbles landing on the wrong account → the §4 fallback decision is the first thing to re-check.
