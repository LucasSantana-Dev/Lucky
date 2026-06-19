# Growth channel sequencing: measure first, then directories, defer App Directory + SEO

- Status: accepted-with-revisions (sequencing gated behind a 2-week measurement sprint)
- Date: 2026-06-17
- Method: /research-and-decide (web research → decision-critic Opus artifact-only → plan → ADR)

## Context

"How do we get more users?" for Lucky (a single-operator, self-hosted homelab Discord
music bot; public GitHub repo; YouTube/SoundCloud playback; autoplay; web dashboard).
Lucky already ships a top.gg vote-rewards command (so it is already listed on top.gg)
and a landing page with build-time SEO prerender, and just gained `/invite` + an
"Add to Discord" CTA + guild join/leave telemetry (#1494/#1495).

Acquisition channels evaluated (Phase 1 research, current-2026, web-verified where
possible; precise figures treated as soft):

- **top.gg** — dominant bot directory, #1 SERP for "discord music bot"; Lucky already
  listed. Lever = ranking (votes) + breadth. Low–med effort.
- **BotBlock multi-directory sync** — one API pushes guild-count to ~16 directories
  (discordbotlist, discord.bots.gg, …). Low effort, parallel to top.gg. Secondary
  directories individually low-traffic.
- **Discord App Directory** — native in-client discovery, but **gated** behind a
  verification bar (~100+ servers / 10K users + privacy policy + identity verification)
  and opaque install volume.
- **SEO** — durable post-Groovy/Rythm demand, but new-domain sandbox + aggregator SERP
  moat make generic terms unrealistic year 1; low-difficulty technical keywords viable
  over months 2–9. Long-term brand asset, not a near-term lever.
- **Reliability / retention** — a prerequisite, not a channel: music-bot acquisition
  leaks if playback is unreliable.

## Decision

Adopt the sequencing **reliability → directories → App Directory → SEO**, but **gate it
behind a cheap measurement sprint first** (the decision-critic's revision — avoids
"reliability first" becoming an indefinite stall or missing the real bottleneck).

1. **Phase 0 — measure (≈2 weeks, near-zero cost).** Before committing effort:
    - Watch the **guild leave-rate** (telemetry shipped #1494) once the new build is
      deployed.
    - Instrument a **playback/extraction failure signal** (Loki query or a counter) to
      get an actual failure rate — there is none today.
    - Add a lightweight **removal reason capture** if feasible (Discord gives no reason on
      `guildDelete`; a "bot removed" log + any available context is the most we get —
      per-user exit surveys are out of reach for a bot).
    - Get the **operator-capacity input** (hours/week) — the real constraint.
2. **Phase 1 — act on the data.** If leave-rate/failure-rate confirm reliability as the
   leak → harden + keep the failure alert. If the data says otherwise (e.g. low churn) →
   go straight to directories.
3. **Phase 2 — directories (primary acquisition).** Climb top.gg (votes) + add **BotBlock**
   sync, but **dry-run on 2–3 directories before the full 16** (sync-desync /
   stale-guild-count is a reputation risk for a single operator). Parallelizable.
4. **Phase 3 — Discord App Directory.** Pursue the verification work only once Lucky
   clears the server/user threshold; sequence after directory-driven growth.
5. **Phase 4 — SEO.** Slow niche play (low-difficulty technical keywords) on the existing
   landing/prerender over months; not a near-term lever.

Measurement honesty (recorded so future agents don't chase it): **per-source attribution
is not available** — Discord does not expose install source, and invite-link `?from=`
params do not survive into `guildCreate`. ROI per channel is only **coarse**:
total join-rate + before/after correlation when a listing changes.

## Alternatives considered

- **SEO-first** — rejected: 6–18 month time-to-rank, new-domain sandbox, aggregator SERP
  moat. Not a near-term lever.
- **App-Directory-first** — rejected: gated behind a verification threshold Lucky must
  reach via other channels first.
- **Acquisition-first (skip the measurement gate), reliability later** — rejected: if
  playback is the leak, acquisition pours into a leaky bucket. But see the gate — we do
  not assume reliability is the leak either; we measure.
- **"Spotify-first playback to dodge YouTube risk"** (surfaced in research) — **rejected
  as infeasible**: Spotify's API is metadata-only for third-party bots (no audio stream);
  bots resolve Spotify → YouTube/other sources for audio. Source-switching does not escape
  the YouTube dependency. The licensing/enforcement risk (Groovy ~4M, Rythm ~8M shut down)
  is **structural to all free music bots**, not solvable here — it is a scale gate, not a
  design fix.
- **Per-source invite attribution** — rejected: not technically possible (above).

## Consequences

- **Positive:** cheap measurement de-risks the biggest assumption before any large effort;
  sequencing front-loads the lowest-effort/highest-reach lever (directories, mostly
  already in place) and defers the gated/slow ones; honest about what cannot be measured
  or escaped.
- **Negative:** measurement adds a ~2-week delay before acquisition push; directory ROI
  stays coarse (no clean attribution); App Directory + SEO payoffs are deferred; YouTube
  enforcement remains an unmitigated tail risk at scale.
- **Neutral:** most directory presence (top.gg) already exists; this is optimization +
  breadth, not net-new.

## Revisit when

- **Churn data lands:** if leave-rate is low / playback-failure rate is negligible →
  drop "reliability first", go directly to directories. If "missing feature" (not
  playback) dominates removals → re-open with feature work as the prerequisite.
- **App Directory threshold reached** (server/user bar) → start the verification work.
- **Operator capacity changes** (second maintainer, or <10 h/week) → re-scope the
  parallel work; a solo operator at capacity should hold stability over new channels.
- **YouTube enforcement escalates** or Lucky approaches large scale (≫ thousands of
  servers) → licensing becomes a hard gate; revisit before scaling.
- **top.gg referral traffic proves marginal** (data shows ranking ≠ install lift) →
  shift weight to App Directory / SEO.
