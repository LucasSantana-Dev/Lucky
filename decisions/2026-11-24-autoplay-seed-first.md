# Autoplay: seed-grounded picks rank first, the listener's Last.fm library only fills

- **Date:** 2026-11-24
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Scope:** autoplay candidate ranking in
  `packages/bot/src/services/musicRecommendation/autoplay/`
- **Relates to:** [2026-06-07-autoplay-seed-similarity-spine](2026-06-07-autoplay-seed-similarity-spine.md)
  (the seed-similar spine this decision ranks first)
- **Issues and PRs:** #3335 (report), #3336 (tiering), #3339 (Last.fm skip), #3337 and #3338
  (duplicate song found while verifying)

## Context

Reported: autoplay picks songs with no cohesion with the first track added. Production
evidence (`Autoplay audit` lines in Loki, #3335):

- A session seeded with Danny Bond "Say so" selected two miseryswin tracks from the requester's
  Last.fm loved list in its first cycle. The seed artist's own catalog lost 0.75 to 1.5.
- Over 7 days, 30 of 502 cycles were led by a Last.fm profile pick, always from the same library
  whatever the seed (Michael Jackson, Bridgit Mendler, ANAVITORIA and a Brazilian funk track all
  led to miseryswin, Polyphia or their Last.fm similars), even when the seed-similar pool was not
  empty.

Cause:

1. **Profile picks outrank seed-grounded picks.** The requester's Last.fm library (loved, top,
   recent and their similars) keeps its full score, while seed-artist `spotify-rec` hits are
   halved (`SPOTIFY_REC_WEIGHT` 0.5, #2934). Same raw score, half the weight.
2. **The genre guard cannot separate them.** The cross-genre veto only runs once 3 anchors share a
   family, so it is off on a fresh session. The families are also too coarse here: "Rapper" and
   "cloud rap" both map to `rap_hiphop`.
3. **Lock-in.** A played-through autoplay pick becomes an anchor, so one off-topic pick steers
   every later cycle.

## Decision

Option A, "seed first":

1. **Two tiers.** `seedFirstTier` (`autoplay/scoringUtils.ts`) puts a candidate in tier 0 only
   when its source is on an allowlist of seed-derived sources and its score is above 0:
   `spotify-rec`, `seed-similar`, `artist-fallback`, `lastfm-genre-fallback`. Everything else
   (`lastfm-loved`, `lastfm-profile`, `lastfm-similar`, guild `genre-tag`, broad fallback) is
   tier 1 and only fills the slots tier 0 cannot.
2. **Tier order holds through every stage.** The diversity selector sorts by tier, then score;
   the artist interleave and the popularity rerank keep tier order (the anchor slot still comes
   first). A penalised seed pick (score 0 or below) drops to tier 1.
3. **Skip the Last.fm library when the seed covers the buffer.** Before collecting the
   requester's Last.fm candidates, a selector dry run counts tier-0 picks. When they reach
   `missingTracks + 1` (one spare for the dedupe and filters that run after selection), Last.fm
   collection is skipped and the audit records `lastfm: {skipped: true, reason: 'seed-covered'}`.
   This also saves its Spotify searches; those cycles took 8 to 24 s.

A new candidate source lands in tier 1 unless it is added to the allowlist.

## Alternatives considered

| Option                                                      | Why rejected                                                                                                                                 |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| B. Weight profile hits like `spotify-rec` (x0.5)            | Smallest change, keeps the blend, but in the reported session it only ties (0.75 vs 0.75). Drift gets rarer, it does not stop.               |
| C. Profile blending opt-in per guild                        | Clear for users, but needs a setting, i18n and a migration of the default, and the default experience would still drift for opted-in guilds. |
| Tighten the genre veto (finer families, earlier activation) | Does not fix the weighting, and both artists in the evidence map to the same family today.                                                   |
| Stop anchoring on autoplay picks                            | Treats the lock-in symptom; the first off-topic pick still plays.                                                                            |

## Consequences

- Cohesion with the seed is the priority. The listener's Last.fm taste shows only when the seed
  runs dry (no similars, few related artists), and then a seed with no similars stays on the seed
  artist's catalog.
- Earlier plans that raised Last.fm profile weights or blended taste into the ranking predate this
  decision. Raising profile picks above seed picks again needs a new decision.
- Guild `genre-tag` picks are tier 1 too, so sessions without a linked Last.fm profile also rank
  seed picks ahead of guild genres.
- Debugging: the `Autoplay audit` Loki lines show each selected pick's source, and
  `sourceCounts.lastfm` shows the skip.

## Revisit when

- Users report autoplay as repetitive or stuck on one artist, or the audits show tier 1 filling
  most slots (the seed pool running dry often).
- A new candidate source is added: decide whether it is seed-derived before adding it to the
  allowlist.
