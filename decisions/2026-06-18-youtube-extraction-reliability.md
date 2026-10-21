# YouTube extraction reliability: classify-and-measure first, weekly yt-dlp refresh, defer Lavalink behind a gate

- Status: accepted-with-revisions (measurement made real + bounded; big bets data-gated)
- Date: 2026-06-18
- Method: /research-and-decide (web research → decision-critic Opus artifact-only → plan → ADR)

## Context

Music playback is Lucky's advertised core, and YouTube extraction is its fragile dependency
(Sentry LUCKY-2T "Bridge: all stages exhausted"; prior outages #1468/#1472; the growth ADR
flagged reliability as the churn driver). Decision: how to harden it for a single-operator,
residential-IP, low-volume homelab bot (discord-player v7 + custom stream bridge + spawned
yt-dlp + SoundCloud fallback; no Lavalink).

Research (2026, web-verified) + repo + Lucky-specific data:

- yt-dlp releases every 1–3 weeks and is **pinned at Docker build time** → goes stale between
  deploys.
- The old "**residential IP is exempt from po_token / bot-detection**" assumption (relied on
  by the 2026-06-16 YouTube ADR) is **refuted for 2026** — detection is request-velocity-based,
  not IP-class.
- **Lavalink + youtube-source** is the most robust path (multi-client fallback) but is a
  separate JVM service + ~1–2 week migration + ongoing ops — heavy for a solo Node operator.
- po_token providers (bgutil) / cookies-from-browser are the current robustness tools.
- **Lucky's actual failure data** (LUCKY-2T): 36 exhaustions over ~2 months, sporadic, single
  track per event, 0 users impacted — no visible 403/velocity cluster.
- **Verified in code:** `ytdlpExtractor` _does_ `errorLog` the raw yt-dlp error (stderr incl.
  "403"/"Sign in to confirm") at error level → it reaches Loki/Sentry. But intermediate
  **retries log at `debug`** (suppressed at LOG_LEVEL=2) and there is **no error
  classification or counter**. So the failure signal is captured-but-unstructured, not absent.

## Decision

Classify-and-measure before committing to a big bet; refresh yt-dlp cheaply now; defer
Lavalink behind a firm gate. (Incorporates the decision-critic's three revisions.)

1. **Prerequisite — make the measurement real (do FIRST).** Add extraction **error
   classification** (genuinely-unavailable vs 403/429 rate-block vs timeout vs no-results) +
   a counter (e.g. `lucky_bot_extraction_failures_total{type}`), and **raise retry-failure
   logs from `debug` to `warn`** so velocity patterns surface. This unifies with #1500 (bridge
   log hygiene) and the growth ADR's extraction-failure signal. Without it, "no 403 pattern"
   is survivorship, not health (critic's strongest objection).
2. **yt-dlp weekly refresh — low-risk, do regardless.** A scheduled weekly image rebuild +
   redeploy of current `main` so yt-dlp tracks YouTube. **NOT** in-container auto-update
   (can break extraction mid-session).
3. **Bounded 2-week measurement with a day-10 early-escalation gate.** Read the classified
   rates. If a 403/429 cluster emerges OR fallback/exhaustion rate > 5% before day 10 →
   escalate immediately, don't wait out the window.
4. **Data-gated escalation:** 403/velocity dominant → **cookies-from-browser** first (free,
   low ops), then a **po_token provider (bgutil)** only if cookies prove insufficient.
   Timeout/version-lag dominant → tighten the rebuild cadence.
5. **Defer Lavalink — but with a firm revisit gate, not indefinitely.** Escalate to
   Lavalink + youtube-source if any of: sustained fallback/exhaustion rate > 5%, peak
   concurrency > 3 voice channels, or a rising week-over-week failure trend. Re-evaluate by
   **2026-08-01** regardless.
6. **Correct the record:** the 2026-06-16 ADR's "po_token not needed on residential IP" is
   **refuted for 2026** (velocity-based detection). Do not re-rely on it.

## Plan (pilot → rollout)

- **Sprint (week 1):** ship the classification + counter + warn-level retry logs (#1500
  overlaps). Schedule the weekly yt-dlp rebuild. Success = Loki shows per-type extraction
  failure counts; a synthetic 403 is classified, not masked.
- **Measure (weeks 1–2):** read classified rates; day-10 gate as above.
- **Decide (end of week 2):** apply the data-gated branch (cookies/po_token, cadence, or
  Lavalink escalation).
- **Rollback:** classification + warn-logs are additive (revertable); weekly rebuild is a
  scheduled workflow (disable to stop); no architecture change until the gate fires.

## Alternatives considered

- **Adopt Lavalink now** — rejected for now: most robust, but JVM service + network dependency
    - ~1–2wk migration + solo-operator ops burden isn't justified before data shows the cheaper
      paths are insufficient. Kept as the gated escalation target with a hard revisit date.
- **Add po_token/cookies now (preventative)** — rejected as first move: Lucky's data shows
  unavailable-track failures, not a 403/velocity cluster; adding po_token machinery for an
  unconfirmed problem is premature. Promoted to the first data-gated escalation if 403s appear.
- **In-container yt-dlp auto-update** — rejected: faster reaction but can break extraction
  mid-session (stale cache / per-release regressions); the weekly rebuild gets most of the
  benefit with zero runtime risk.
- **Source reordering (SoundCloud/Deezer first)** — rejected: YouTube holds the catalog;
  demoting it sacrifices coverage for ~30% of tracks. SoundCloud stays a fallback (it already
  has a circuit breaker).
- **Status quo** — rejected: yt-dlp drifts between deploys and the failure signal is
  unstructured; at minimum classification + weekly refresh are warranted.

## Consequences

- **Positive:** turns an unstructured failure signal into a queryable one cheaply; weekly
  refresh removes the pinned-stale gap with zero runtime risk; big bets (po_token, Lavalink)
  are spent only when data justifies them; the day-10 gate + revisit date prevent
  "measure-first" from becoming an indefinite stall; corrects a now-false prior assumption.
- **Negative:** accepts up to ~10 days of the current sporadic failures before a forced
  escalation decision; weekly rebuild adds a scheduled deploy outside the normal release
  cadence (a maintenance exception); if YouTube breaks faster than weekly, the gate must catch
  it.
- **Neutral:** SoundCloud remains the fallback; no architecture change unless the gate fires.

## Revisit when

- **Day-10 gate / end-of-2-week measure:** apply the data-gated branch.
- **By 2026-08-01:** re-evaluate Lavalink regardless of the gate.
- **Volume grows > 3 concurrent voice channels** (velocity headroom shrinks) → re-check
  po_token need.
- **A 403/"Sign in to confirm" cluster appears** → cookies → po_token provider.
- **yt-dlp proves to break faster than weekly** → daily rebuild or Lavalink.
