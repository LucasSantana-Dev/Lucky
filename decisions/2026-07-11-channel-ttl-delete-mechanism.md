# Channel TTL-delete mechanism: setTimeout precision + durable periodic sweep

- **Date:** 2026-07-11
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Scope:** `packages/bot` channel-cleanup TTL mode (PR #1687)
- **Method:** `/research-and-decide` — research → decision-critic (verdict NEEDS_REVISION) → reconcile → this ADR

## Context

Channel-cleanup TTL mode auto-deletes messages N seconds after posting, N ∈ [5, 86400]
(5 s – 24 h). The first implementation scheduled each deletion with a per-message
`setTimeout(ttl*1000)`. That state lives only in process memory, so a **bot restart between
post and fire loses the pending deletion** — the message is never deleted. Restarts are
frequent: ~**1.2 releases/day** (25 releases in the last 21 days) plus any crash-restarts.
This ADR picks the durability mechanism.

### Stack facts

- discord.js v14, unsharded, ~11 guilds.
- `channelPurgeScheduler` already runs a `tick()` **on startup** (`void this.tick()` in
  `start()`) **and every ~5 min** for purge configs, backed by the Postgres
  `channel_cleanup_configs` table.
- Message IDs are snowflakes → age is derivable from `createdTimestamp`.
- `bulkDelete(msgs, filterOld=true)` deletes ≤100 msgs, silently skipping any > 14 days old.
- Node `setTimeout` ceiling is ~24.8 days (2,147,483,647 ms); 24 h TTL is well under it.
- Deletion is idempotent (deleting an already-gone message = 404, ignored).

## Decision

**Dual mechanism (shipped in #1687):** keep the per-message `setTimeout` for precision, and
add a **DB-backed sweep folded into the existing `channelPurgeScheduler.tick()`**. Each tick
(on startup and every ~5 min) queries enabled ttl-mode configs, fetches recent messages per
channel, and bulk-deletes those whose snowflake age exceeds the TTL.

Role of each path:

- **`setTimeout` = the primary path while the bot is up** — precise (fires at exactly the
  TTL, sub-tick-interval) and unbounded in volume (one timer per message, no 100-msg cap).
- **Sweep = the bounded durability backstop** — reclaims deletions orphaned by a restart
  (it runs on boot) and messages posted while the bot was down (which never got a timer).

### Why not the alternatives

- **setTimeout only (original):** loses all pending deletes on restart — the bug.
- **Sweep only:** simplest, but latency = up to the ~5 min tick interval even for a 5 s TTL
  → bad UX for short TTLs. The precision requirement rules it out.
- **setTimeout + startup-only reconcile (the critic's counter-proposal):** rejected here on
  a codebase-specific fact the critic (artifact-only) could not see — the scheduler _already_
  ticks every 5 min for purge, so folding the sweep into that tick is the **minimal-code**
  option; "startup-only" would need an _extra_ first-run gate (more code, not less). The
  periodic sweep is also a near-no-op during normal operation (setTimeout already deleted the
  messages) and adds only one `getTtlConfigs()` query per tick when no ttl configs exist.
- **Durable queue (BullMQ, already in repo):** one Redis job per message for a
  delete-after-N-seconds is heavy and couples a simple feature to Redis availability; the DB
  sweep reuses a table + scheduler the repo already models. Revisit if BullMQ becomes the
  house scheduling pattern.

## Consequences

- **Positive:** durable (survives ~daily restarts) _and_ precise; reuses the existing tick +
  Postgres table; no new infra/dependency; high message volume is handled by `setTimeout`
  (per-message, uncapped), so the sweep's 100-msg/tick bound is only ever a post-restart
  catch-up, not the hot path.
- **Negative / accepted limitations** (surfaced by the critic; accepted, not mitigated, at
  11-guild scale — each is a revisit trigger, not a present cost):
    - _Clock skew:_ age uses the bot's clock vs Discord's; inherent to any age-based scheme
      (`setTimeout` too). Negligible on NTP-synced hosts; not worth monitoring here.
    - _> 14-day downtime orphan:_ if the bot is down long enough that an expired message ages
      past 14 days, `bulkDelete` skips it and it is never cleaned. Extreme edge; accepted.
    - _Firehose channel:_ a very high-volume channel with a short TTL could accumulate many
      pending `setTimeout` timers (memory) and out-run the 100-msg/tick post-restart catch-up.
      Not a concern at current scale.
    - _Two code paths_ for one behavior (minor extra surface); double-deletes are idempotent.

## Revisit when

- A TTL channel is high-volume enough that pending-timer memory or the 100-msg/tick
  post-restart catch-up can't keep up → add pagination or move to per-message durable jobs.
- Restart frequency drops far below daily → the periodic sweep's marginal value shrinks;
  could collapse to startup-only reconcile.
- BullMQ/Redis becomes the house scheduling pattern → reconsider unifying TTL onto durable
  delayed jobs (precise _and_ durable in one path).
- The > 14-day-orphan or clock-skew edge is observed in practice → add per-message fallback
  delete / a startup clock-skew check.
