# Bot redeploy strategy: no blue/green, accept a minimized single-container gap

- **Date:** 2026-07-11
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Related:** `decisions/2026-07-11-bluegreen-web-tier.md` (web tier blue/green, shipped);
  PRs #1785/#1786 (web blue/green); the bot is `packages/bot` (discord.js v14, unsharded, ~11 guilds)

## Context

Blue/green zero-downtime deploys were just shipped for the **web tier** (backend +
frontend behind an nginx upstream flip). The natural follow-up was "do the same for the
bot." It does not transfer: Discord permits exactly **one live gateway IDENTIFY per bot
token**, so two bot containers cannot run concurrently on one token — Discord kicks one.
Any bot deploy therefore restarts the single process and creates a gap.

This ADR decides how to handle that gap.

### What a bot restart actually costs (measured against the code)

1. **Music/voice dies.** `@discordjs/voice` connections are severed on process exit and
   `discord-player` v7 queues are in-memory → active playback stops and the queue is
   lost. This is the largest user-facing impact.
2. **In-gap gateway events are lost.** A container restart = new process = **fresh
   IDENTIFY, not RESUME** (Discord only replays missed events on RESUME). Events arriving
   during the gap are dropped.
3. **In-gap interactions fail** ("application did not respond").
4. **Boot cost** includes per-guild slash-command re-registration on every `ready`
   (`clientHandler/service.ts` — ~11 REST calls) plus READY/cache warm.

### What is already contained (so event-loss is bounded)

- Channel **purge/TTL** cleanup was made durable via a DB-backed startup + interval sweep
  (PR #1687) — a gap loses no cleanup state.
- **Twitch** notifications are EventSub → backend webhook (independent of the bot gateway).
- **Live-notif** (YouTube) is polling — reconciles on the next poll.
- Residual loss: in-gap **starboard reactions** and interactions (no reconciliation).

### Cross-process RESUME — verified, not assumed

Initial research claimed discord.js v14 "does not expose session_id/seq." Verified
directly in source instead:

- `@discordjs/ws` **does** expose `retrieveSessionInfo` / `updateSessionInfo` /
  `SessionInfo` — the hook to persist session_id+seq externally.
- **But** discord.js v14.26.4 `WebSocketManager.js:156-158` **hardcodes** those callbacks
  to an in-memory `shard.sessionInfo` and offers **no `Client` option to inject an
  external session store** (only `ws.buildStrategy` is passed through).

So cross-process RESUME is possible only by (a) manipulating discord.js private fields
(read `sessionInfo` at shutdown, monkey-patch it back before connect — unsupported,
breaks on minor bumps), or (b) rewriting the bot onto raw `@discordjs/ws` (large).
**And even a working RESUME does not save voice/music** (fact #1 above holds regardless).
So RESUME buys only in-gap gateway-event continuity — which is already bounded — at high
cost, and does not address the main pain (music). It is not worth pursuing.

### IDENTIFY budget

Cap is ~1000 IDENTIFY/token/24h. A deploy costs 1. At 5–20 deploys/day this is a
non-constraint; only crash-loops threaten the cap.

## Decision

**Do not build blue/green or a gateway-RESUME architecture for the bot.** Keep it a single
container and adopt **"prepared fast restart"**, minimizing and mitigating the unavoidable
gap:

1. **Pre-pull the new image before stopping the old container** so the gap ≈ boot time,
   not pull + boot. (Small, reversible deploy-pipeline change.)
2. **Keep gateway-critical features durable/poll-based** (already true: purge/TTL sweep,
   Twitch webhook, live-notif polling). No new work; this is the containment that makes
   accepting the gap safe.
3. **Accept the ~<10–15 s gap and music loss on deploy for now.** In-gap interactions
   and reactions are lost; this is tolerated at current scale/deploy frequency.

**Deferred (gated on evidence), not adopted:** a music **queue persist + restore** on
graceful SIGTERM so playback survives deploys. Deferred because it is the heaviest option
with the most failure modes, and its value depends on how often music is actually playing
during a deploy — which is currently unmeasured. See _Pilot gate_ below.

**Optional, drift-safe:** register guild slash commands only when the command set changed
(hash/diff), rather than re-registering identically on every `ready`. Trims boot time
without risking command drift. Nice-to-have, not required by this decision.

## Alternatives considered

| Alternative                                           | Rejected because                                                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two-container blue/green (web pattern)                | Physically impossible on one Discord token (one IDENTIFY).                                                                                                                   |
| Cross-process gateway RESUME (persist session_id+seq) | Only via unsupported discord.js private-field hacking or a full rewrite onto `@discordjs/ws`; **and does not save voice/music**; buys only already-bounded event continuity. |
| gateway-proxy in front (e.g. Gelbpunkt)               | No voice support (the bot's flagship feature), adds a Rust single-point-of-failure, self-described "very hacky"; disproportionate for ~11 guilds.                            |
| Shard + rolling restart                               | Bot is far under the ~2500-guild single-session cap; sharding adds complexity and still does not preserve voice.                                                             |
| Do nothing (current silent restart)                   | Same gap, but no pre-pull minimization and no path to the music-persist pilot; strictly worse than the chosen minimal option.                                                |

## Consequences

- **Positive:** no new infra or SPOF; reuses existing DB + schedulers; shorter gap via
  pre-pull; keeps deploy story simple; correctly bounded by already-durable features.
- **Negative:** a brief (<10–15 s) window where new interactions fail, in-gap reactions
  are lost, and **music stops** (until the deferred pilot lands).
- **Neutral:** the bot stays single-container; blue/green remains web-tier-only.

## Pilot gate (for the deferred music queue-persist)

Do **not** build queue-persist blind. First **instrument**: log, on each deploy/SIGTERM,
whether any guild had active playback. Only pursue the pilot if a material fraction of
deploys interrupt live playback. If pursued, the pilot **must** design the failure paths
the decision critic flagged, or it does not ship:

- SIGTERM drain must complete within the docker stop grace period (raise
  `stop_grace_period`; time-box the DB write; async-safe).
- Voice **rejoin** error paths: channel deleted, bot removed, permissions changed during
  the gap → fallback + user notice, no crash.
- DB-down at boot → **fail-open** (skip restore), never crash-loop (protects IDENTIFY cap).
- **Idempotent** restore: mark queue consumed so a crash-after-restore does not replay.
- Rollback: feature-flag the persist/restore; off = today's behavior.

## Revisit when

- Bot approaches sharding (guild count nears ~2000 / the single-session cap), **or**
- discord.js exposes a supported external session store for cross-process RESUME, **or**
- a maintained, voice-capable gateway-proxy becomes available, **or**
- instrumentation shows music is playing across a material fraction of deploys (→ run the
  queue-persist pilot), **or**
- deploy frequency rises enough that the <10–15 s gap becomes a measured user complaint.
