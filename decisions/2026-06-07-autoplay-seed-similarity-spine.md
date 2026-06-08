# ADR 2026-06-07 — Autoplay: Last.fm seed-similarity spine + fail-closed genre guard

**Status:** Accepted
**Via:** `/research-and-decide` (critic verdict REVISE: A alone insufficient → A+B; no flip on the lead)
**Relates to:** [2026-05-21-autoplay-recommendation-roadmap](2026-05-21-autoplay-recommendation-roadmap.md) (Phase D scoring, deferred)

## Context

Autoplay drifts to mainstream/unrelated music — reported symptom: two Prince tracks in a row
then a jump to Drake. Root cause (verified in code):

1. **Genre guard fails OPEN.** The scorer's cross-genre-family veto (`candidateScorer.ts:251`)
   and soft genre penalty (`:423`) both require Last.fm/Spotify _tags_ for seed AND candidate.
   With no Last.fm link and no/quota-exhausted Spotify token, `sessionGenreFamilies` and
   `currentTrackTags` are empty → both defenses are skipped entirely.
2. **`spotify preferred +0.4`** (`:411`) is the single largest, genre-blind score term — any
   Spotify track (incl. mainstream Drake) gets it and outranks more-related candidates.
3. **Spotify `/recommendations` is deprecated** for this app (the team's own `artistApi.ts:117`
   comment; Discover already migrated to Last.fm) → the "primary" recommender returns little.
4. **The broad fallback pulls genre TOP-tracks** (`getTagTopTracks`) — mainstream by construction.
5. **The Last.fm collector is entirely user-link-gated** (`lastFmSeeder.ts:75` returns early with
   no candidates for unlinked users). The tag-independent, no-link endpoint
   `artist.getSimilar` (`getSimilarArtists`, shared `artistApi.ts:89`) exists but has **zero
   callers in autoplay**.

So for the common case (user hasn't linked Last.fm, Spotify recs dead), the candidate pool is
just Spotify-search-on-seed + genre-top-tracks fallback, with genre guards disabled → drift.

## Decision

**Adopt A + B now (A first), C as a fast-follow if drift persists.** A is the missing
foundation; B stops the fail-open + genre-blind boost; the critic confirmed A alone is
insufficient because B is what blocks drift when A's pool is thin.

**A — Seed-similarity spine (foundation).** Wire Last.fm `track.getSimilar` (via
`getSimilarTracks`, `lastFmApi.ts:486`; no user link, `LASTFM_API_KEY` is set) on the
**currently-playing seed track** into the candidate collector as a backbone source, boosted as
"seed-similar". (Implementation refined the original `artist.getSimilar` plan to
`track.getSimilar` — it returns playable track candidates directly and reuses existing bot
infra, avoiding a shared-package ESM-exports change.) Demote the deprecated Spotify-recs source
to a best-effort extra (leave as a no-op-tolerant call; do not remove yet).

- Guardrails: wrap in a 2s timeout + per-artist cache (reuse/extend `artistTagCache`, ~1h TTL)
    - 429 backoff. Cap to ~10 similar artists, one search each, to bound Last.fm calls (~5 req/s
      limit) and replenish latency.

**B — Fail genre guard CLOSED for strong-genre seeds + condition the Spotify boost.**

- Infer the seed's family from `sessionGenreFamilies` (session history), **not just the current
  track's tags**, so an untagged current track still carries the session's genre.
- When the session has a **strong** family (rap_hiphop / rock_metal / latin — extend to the
  Prince case via the soul/funk/pop families as data shows) and a candidate is **untagged**,
  penalize/reject as assumed cross-genre — but only outside skip-storms.
- Make `spotify preferred` **genre-conditional**: full boost only when the candidate's family
  overlaps the session; **half** boost when tags are unknown (not zero — avoids starving the
  pool); no boost on a known cross-family candidate.

**C — Fast-follow (only if A+B leave residual drift).** Replace the fallback's
`getTagTopTracks` with seed-similar tracks (same `track.getSimilar` as A) so even the last
resort stays on-genre.

**Non-negotiable guardrail across all:** autoplay must never stall. Keep the skip-storm
relaxation; enforce a minimum-pool floor — if A+B reject everything, fall through to the
(now seed-similar, post-C) fallback rather than returning an empty queue.

## Alternatives considered

- **A alone** — rejected (critic): fixes the thin-pool case but leaves the genre guard failing
  open, so a mainstream Spotify track still outranks seed-similar ones. B is required.
- **Fail genre guard closed everywhere / unconditionally** — rejected: empty-queue/stall risk
  (worse than occasional drift). Hence "strong family + untagged + not-skip-storm" scoping and
  the half-boost-on-unknown compromise.
- **Just fix Spotify seed resolution** (make all seeds Spotify-native so recs get good input) —
  rejected: the recs endpoint is deprecated for this app; better input can't fix a dead endpoint.
- **Jump straight to a Phase-D session-coherence scorer** — deferred: heavier, and A+B should
  resolve the reported symptom; measure first (telemetry already ships) before that investment.

## Consequences

- **Positive:** autoplay grounds on seed-artist similarity regardless of user linking or Spotify
  health → "continuous radio" near the seed; the largest drift vector (genre-blind Spotify boost
  on a tagless session) is closed.
- **Negative:** +1–2 Last.fm calls per replenish (mitigated by cache/timeout/cap); a tuning risk
  on B (over-filter → thin pool), bounded by skip-storm relaxation + the pool floor + half-boost.
- **Neutral:** the deprecated Spotify-recs source stays as tolerated dead weight until a separate
  cleanup; Phase D remains deferred.

## Revisit when

- **~2 weeks post-deploy, read the recommendation telemetry** (per-source acceptance / skip
  rate): >10% acceptance improvement → done, keep Phase D deferred; 5–10% → ship C, reassess;
  **<5% or drift still reported** → escalate to the Phase-D session-coherence scorer.
- **Last.fm error rate >5% or p99 replenish latency regresses** → tighten cache/timeout or make
  the seed-similar fetch fully async (pre-warm next seed's similars).
- **Over-filtering surfaces** (empty-queue warnings rise) → relax B's strong-family list / raise
  the half-boost / widen skip-storm relaxation.

---

## Addendum 2026-06-08 — over-narrowing fix (provenance-aware genre guards)

**Context.** After A+B shipped (v2.17.0), the reported symptom flipped: autoplay now loops the
**same seed artist** instead of drifting. Root cause (verified in code): the candidate pool DOES
contain related-but-different artists (Last.fm `track.getSimilar` is track-to-track, returns mixed
artists), but approach-B's genre guards score them out — untagged related artists hit the
fail-closed `−0.6` (`GENRE_PENALTY_STRONG`), and tagged adjacent-family related artists hit the
hard cross-family **veto** (`−Infinity`). The seed artist survives (same family, known), so it
wins every pass despite the `MAX_TRACKS_PER_ARTIST=2` cap. It is a **scoring** over-correction,
not a sourcing gap.

**Decision (via `/research-and-decide`; critic flipped the lead from "new source" to "tune
guards").** Make the genre guards **provenance-aware**: candidates from Last.fm-similarity-vetted
sources (`seed-similar`, `lastfm-similar`, `lastfm-loved`) define the *safe radius* and get a
**relaxed** guard — the untagged fail-closed becomes a mild penalty (`GENRE_PENALTY_UNKNOWN`
−0.1), and the cross-family veto becomes a **demotion** (`GENRE_PENALTY_WEAK` −0.3) rather than a
hard `−Infinity` reject, so adjacent families are allowed-but-ranked-lower. **Un-vetted** sources
(broad fallback, genre-tag, generic Spotify search) keep the **strict** guard (veto + −0.6), so
the original mainstream drift — which came from those un-vetted sources + the genre-blind boost —
stays blocked. The cross-locale (Spanish) veto stays unconditional for all sources. The existing
same-artist penalty (−0.35) + per-artist cap then diversify naturally once alternatives survive.
Mechanism: a `seedDerived` flag on the scorer context, set true by the vetted collectors.

**Why not the alternatives.**
- *New `artist.getSimilar` neighborhood source* — **deferred** (not rejected): adds 7-9 Last.fm
  calls to an already ~10-call fan-out (hits the ~5 req/s limit; 2s timeout becomes a cliff), and
  a blanket exemption for "similar artists of a mainstream seed" is a genuine drift hole (critic).
  Revisit only if the provenance-aware tuning proves the pool truly lacks related artists.
- *Blanket-soften the fail-closed `−0.6` for everyone* — rejected: re-admits the un-vetted
  mainstream drift the guard was built to stop.
- *Same-artist saturation penalty across cycles* — unnecessary once vetted alternatives survive;
  the existing −0.35 + per-artist cap suffice. Hold in reserve.

**Revisit when.** Post-deploy, if autoplay STILL loops the seed artist → `track.getSimilar` is too
same-artist and the pool genuinely lacks related artists → implement the deferred
`artist.getSimilar` neighborhood source (with a high match-threshold + tight radius, NOT a blanket
guard exemption). If mainstream drift RE-APPEARS → the provenance trust is too loose; tighten the
relaxed veto back toward reject for `seed-similar` or add a match-score floor.
