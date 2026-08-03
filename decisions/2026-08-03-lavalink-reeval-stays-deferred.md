# ADR 2026-08-03 — Lavalink re-evaluation: gate not fired, Lavalink stays deferred

**Status:** Accepted
**Deciders:** Lucas Santana
**Closes the loop on:** `decisions/2026-06-18-youtube-extraction-reliability.md` ("Re-evaluate by 2026-08-01 regardless")

## Measurement (prod, run 2026-08-03; Loki `lucky-bot` logs, 60 days)

| Gate condition (2026-06-18) | Threshold | Measured | Fired? |
|---|---|---|---|
| Sustained fallback/exhaustion rate | >5% | **3.4%** (35 exhaustions / 1,021 plays, 60d); last 30d: 5 exhaustions (~1%) | NO |
| Peak concurrency | >3 voice channels | ~17 plays/day avg across 29 guilds; volume makes >3 concurrent VCs implausible; no evidence in logs | NO |
| Rising week-over-week trend | rising | **Falling**: 30 exhaustions (06-04→07-03) → 5 (07-04→08-03) | NO |
| 403/velocity cluster | — | "Sign in to confirm you're not a bot": **7 in 60d, 0 in the last 30d**; age-gate: 2. The 2,501 other "403" log lines are Last.fm invalid-session-key noise, not YouTube | NO |

Caveat: the ADR's prerequisite Prometheus counter (`lucky_bot_extraction_failures_total{type}`) was never shipped — this read used reproducible Loki queries instead (below). Retry logs at `warn` did ship, which is what makes the Loki read possible.

## Decision

**Lavalink + youtube-source stays deferred.** All three escalation gates read negative, and the trend is improving. The current stack (discord-player v7 + stream bridge + spawned yt-dlp + SoundCloud fallback) is holding at Lucky's actual volume.

1. **No migration.** A JVM service + ~1–2 week migration + ongoing ops is not justified by 5 exhaustions/month.
2. **No cookies/po_token yet.** The velocity-block signal (7 events, none recent) is below the "cluster" bar that would trigger the cookies-first escalation.
3. **Keep the weekly yt-dlp rebuild** — the improving trend coincides with it; it stays the primary freshness mechanism.
4. **Ship the missing counter when the bot is next touched for observability** — the 2026-06-18 prerequisite (`lucky_bot_extraction_failures_total{type}`) is still unshipped; without it every re-evaluation pays the Loki-query cost again. Not urgent.

## Reproduction

```sh
ssh homelab 'docker exec grafana wget -qO- "http://loki:3100/loki/api/v1/query?query=<LogQL>"'
```

```logql
-- exhaustions, 60d
sum(count_over_time({service_name="lucky-bot"} |= "exhausted" [60d]))
-- exhaustions, prior 30d window (trend)
sum(count_over_time({service_name="lucky-bot"} |= "exhausted" [30d] offset 30d))
-- plays, 60d
sum(count_over_time({service_name="lucky-bot"} |= "Started playing" [60d]))
-- YouTube velocity blocks
sum(count_over_time({service_name="lucky-bot"} |= "not a bot" [60d]))
-- age-gated videos
sum(count_over_time({service_name="lucky-bot"} |= "Sign in to confirm your age" [60d]))
```

(Use RFC3339 `start`/`end` on `query_range`; ns-epoch timestamps 400 on this Loki build.)

## Consequences

**Positive:** the deferred-by-gate strategy is validated with data; no ops burden added; the cookies → po_token → Lavalink escalation ladder stays mapped for when a gate actually fires.
**Negative:** the classification counter debt persists; the Last.fm 403 spam (2,501 lines/60d — invalid session keys needing user re-auth) is logged here as a separate, unaddressed signal worth its own look.
**Neutral:** re-evaluation repeats on trigger, not on a calendar date.

## Revisit when

- Exhaustion rate >5% over any rolling 30 days (queries above).
- A "not a bot" cluster appears (>10/week) → cookies-from-browser first, then bgutil po_token.
- Play volume grows to where >3 concurrent VCs is plausible (roughly: sustained >50 plays/day) → re-check velocity headroom.
- yt-dlp breaks faster than the weekly rebuild cadence → daily rebuild or Lavalink.
