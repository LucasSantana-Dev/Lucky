# YouTube extraction reliability: classify-and-measure first, weekly yt-dlp refresh, defer Lavalink behind a gate

- Status: accepted-with-revisions (measurement made real + bounded; big bets data-gated)
- Amended: 2026-10-21 (step 2 of the escalation ladder, bgutil po_token provider; see the end)
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

## Amendment (2026-10-21): step 2 of the ladder, a bgutil po_token provider

Status: accepted. Implements point 4's second rung ("a po_token provider (bgutil) only if
cookies prove insufficient"). Lavalink stays behind its own gate (two consecutive 30d windows
above 5% exhaustion); this amendment does not touch it.

### Why now: cookies were applied and still insufficient

- Trigger: 10 "Sign in to confirm you're not a bot" lines in 7 days (at the cookie trigger of
  about 10 a week), and last-30d exhaustion at 10.4% (2.7% the window before), above point 3's
  5% escalation bar.
- Loki (`{container_name="lucky-bot"}`): all 10 bot-check failures fell on 2026-10-19, 10:03 to
  18:07 UTC, across 3 guilds. "Bridge: yt-dlp cookies file applied" was logged in that process
  at 10:03:00, right before the first failure, and "YTDLP_COOKIES_FILE is set but not a readable
  file" never appears. Since #2653 cookies only apply on a sign-in retry, and the error the
  bridge logs is the retry's own error, so each of the 10 failures is a cookie retry that got
  the bot check again. Cookies were present and applied; they were insufficient.
- On 2026-10-20 the cookie retry recovered both sign-in challenges (no failure after either
  "cookies file applied" line). Cookies work some days and not others, so they are not a
  dependable last rung.
- Since 2026-10-06 a logged-in session makes yt-dlp pick web clients that need a GVS PO token
  (comment in `ytdlpProcess.ts`): without a provider, the cookie path is the one that lacks it.

### Decision

1. **Sidecar:** the `brainicism/bgutil-ytdlp-pot-provider` HTTP server (Node flavor) as the
   `bgutil-pot` service in `docker-compose.yml`, pinned to `2.0.2` by digest, behind a `pot`
   profile. The deploy script neither starts nor requires profiled services (the tunnel
   precedent), so a stopped sidecar never fails or rolls back a deploy. No host port; it only
   joins `lucky-network` (the server is unauthenticated).
2. **Plugin:** the `bgutil-ytdlp-pot-provider` PyPI package at `2.0.2`, installed with pip
   `--target` into its own folder under `/opt/ytdlp-plugins`, outside the yt-dlp venv's
   site-packages. yt-dlp loads it only when the bot passes `--plugin-dirs /opt/ytdlp-plugins`.
   Plugin and image versions move together (`BGUTIL_POT_PROVIDER_VERSION` in the Dockerfile,
   the image tag in compose).
3. **Opt-in by env:** the bot adds `--plugin-dirs` and
   `--extractor-args youtubepot-bgutilhttp:base_url=<url>` to every YouTube stream spawn (first
   attempt, 403 retry and cookie retry) only when `YTDLP_POT_PROVIDER_URL` is an http(s) URL.
   Unset means the exact pre-amendment command line. SoundCloud spawns and the flat candidate
   search never get it.
4. **Fallback:** if the sidecar is down, the plugin's `/ping` fails (connection refused or
   unresolvable host) and yt-dlp extracts without a PO token, the same as with the provider
   unset. Measured locally with yt-dlp 2026.08.19: no measurable overhead when no PO token is
   requested, about 1 s when one is.
5. **Rebuild safety:** yt-dlp still floats on image rebuilds while the plugin is pinned, and the
   plugin imports yt-dlp's PO token framework. `ci.yml` and `docker-publish.yml` import the
   plugin inside the built image, so a yt-dlp release that breaks it fails the build instead of
   production.

### Success and rollback

- Success: over the 14 days after the sidecar is on, "Sign in to confirm you're not a bot" stays
  under about 10 a week and the 30d exhaustion rate trends back toward the 2.7% baseline. Same
  Loki queries as the 2026-08-03 re-evaluation.
- Rollback: unset `YTDLP_POT_PROVIDER_URL` and recreate the bot (back to the exact previous
  command line), then `docker compose --profile pot stop bgutil-pot`. No data migrates.
- Recreate the bot with `IMAGE_TAG` set to the tag it already runs. Without it the compose
  image falls back to `:latest`, a stale local image. On 2026-10-22 a manual
  `docker compose up -d --no-deps bot` started that image, which has no plugin directory, so
  every YouTube spawn failed with `Invalid plugin directory` for about 5 minutes.
- Escalate: if the bot check persists while yt-dlp `-v` shows
  `Generating a gvs PO Token ... via bgutil HTTP server`, the cheaper rungs are spent and the
  Lavalink gate is the next read.
