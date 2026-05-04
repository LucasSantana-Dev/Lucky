# Autoplay genre/locale guardrails

## Why

Reported 2026-04-24 by `luksobrio`: played "Só Rock 3" by Major RD/Borges/MC
Cabelinho/Young Ganni/Rock Danger/meLLo (Brazilian Portuguese rap-rock) and the
autoplay queued "Derrama Tu Gloria" by ALISON (Spanish-language Christian/gospel)
with the displayed reasons `completed before • similar energy • spotify preferred
• last.fm taste`.

Root cause is a stack of overlapping miss-detections in the live scoring path
(`packages/bot/src/utils/music/autoplay/`):

1. `candidateScorer.calculateRecommendationScore` checks for Spanish via a narrow
   regex over genre keywords (`reggaeton|cumbia|bachata|...`). A title like
   "Derrama Tu Gloria" carries no genre tokens, so no penalty fires.
2. The richer `detectSpanishMarkers` / `detectSessionLanguageMarkers` heuristic
   in `packages/bot/src/utils/music/languageHeuristics.ts` is wired only to
   `services/musicRecommendation/recommendationEngine.ts`, whose only autoplay
   caller (`utils/music/autoplay/recommendations.ts`) is dead — it fetches
   candidates from a placeholder `getAvailableTracks` that always returns `[]`.
3. The cross-genre family penalty in `enrichWithAudioFeatures` runs **after**
   `selectDiverseCandidates` has already locked in the top-N. It also depends
   on (a) the requester having a linked Spotify token, (b) the candidate URL
   pointing at `open.spotify.com/track/`, and (c) Spotify's `audio-features`
   endpoint, which is deprecated for new apps as of late 2024.
4. The session-locale veto in `sessionMood.detectSessionMood` only fires when
   the **history already contains** a Spanish genre keyword — so a Portuguese
   session is left wide open to Spanish drift, since `dominantLocale === null`
   is the *only* state where the (already-narrow) penalty applies.
5. The existing `languageHeuristics.detectSpanishMarkers` is not safe for
   Brazilian-Portuguese sessions: the diacritic class `[áéíóúñüÁÉÍÓÚÑÜ¿¡]`
   matches Portuguese accents, and stopwords like `que`/`para` are shared,
   so a Portuguese-only session can falsely register as Spanish — which would
   again disable the cross-locale check.

## Goals

- Stop cross-locale autoplay drift: Brazilian-Portuguese / English / mixed
  sessions should hard-reject Spanish-language candidates unless the user has
  shown Spanish content recently.
- Do not regress on actual Spanish sessions or on Brazilian-Portuguese
  detection.
- Keep the scoring path resilient to the Spotify audio-features deprecation;
  reach for Last.fm artist tags as the durable genre source.
- Surface the decision in the displayed reason so the user can see why a
  candidate was rejected or demoted.

## Non-goals (this spec)

- Re-implementing the `services/musicRecommendation` engine. Its dead-code
  path is left in place for now; deletion is a follow-up.
- Generalising to every locale. Spanish/Portuguese is the only current
  conflict pair with concrete user impact.
- Replacing the `selectDiverseCandidates` post-pass. Genre-family enrichment
  via Spotify is left as-is; the new Last.fm path supplements it.

## Plan

### Phase 1 — Wire-up + Portuguese-aware detector (this PR)

1. **`languageHeuristics.ts`**: split detection into Spanish-distinct
   markers (diacritics `ñ ¿ ¡ ü`; stopwords `el la los las del una uno yo
   mi mis muy soy aquí tú mí más`; gospel/Christian keywords `dios señor
   iglesia cristo espíritu aleluya adoración`) and Portuguese-distinct
   markers (diacritics `ã õ ç`; stopwords `não você voce sou meu minha nós
   estão são também obrigado coração paixão família muito agora`). Detection
   requires `spanishScore > 0 AND spanishScore > portugueseScore`. Genre
   tags continue to count via the existing `SPANISH_GENRE_MARKERS` list.
2. **`sessionMood.ts`**: replace the local `SPANISH_LOCALE_RE` scan with
   `detectSessionLanguageMarkers(historyTracks)` so `dominantLocale` reflects
   actual content, not just genre keywords.
3. **`candidateScorer.ts`**: replace the local `SPANISH_LOCALE_RE` test with
   `detectSpanishMarkers(title + ' ' + author, candidateTags)`. When the
   session has no Spanish (`dominantLocale === null`) and the candidate is
   Spanish, return `{ score: -Infinity, reason: 'cross-locale: spanish in
   non-spanish session' }`. Keep the soft path for Spanish-active sessions.
4. **Last.fm artist tags**: add `getArtistTopTags(artist)` to `lastFmApi.ts`
   backed by an in-memory LRU (24h TTL). Pre-fetch tags in
   `lastFmSeeder.collectLastFmCandidates` for the seeded candidates and
   pass them through `calculateRecommendationScore` so the language check
   has artist-level signal. This is what catches "Derrama Tu Gloria" /
   ALISON specifically — title alone is ambiguous, but the tags
   `latin christian` / `christian and gospel` / `spanish` are decisive.
5. **Tests**: cover the regression case end-to-end (Brazilian rap session +
   Spanish gospel candidate → reject) plus unit tests for the new
   detector behaviour and Portuguese veto.

### Phase 2 — Tag-driven scoring (follow-up)

- Generalise `getArtistTopTags` usage to `candidateCollector` and
  `spotifyRecommender` so all candidate paths benefit, not only Last.fm.
- Move genre-family penalty from the post-selection
  `enrichWithAudioFeatures` pass into the in-pass scoring step using
  Last.fm tags, so Spotify's deprecation doesn't leave us blind.
- Add a "session genre family" detection (rap/rock/electronic/etc.) and
  apply the same `> session > candidate` veto for genre family the way
  Phase 1 does for locale.

### Phase 3 — Cleanup

- Delete `services/musicRecommendation/recommendationEngine.applySpanishLanguagePenalty`
  and its dead callers once Phase 1+2 are stable.
- Rename the misleading `similar energy` reason — it is purely duration
  ratio, with no audio-feature signal. Either swap to `similar duration`
  or actually read tempo/energy when audio features are available.

## Risks

- False positives on Brazilian Portuguese: mitigated by the Portuguese
  veto (`spanishScore > portugueseScore`). Still validated by tests
  covering common Brazilian titles.
- Last.fm rate limits: mitigated by 24h LRU. `artist.gettoptags` is a
  read-only public endpoint; failures fall through to title-only
  detection.
- Hard reject is more aggressive than the previous `-0.45`. The previous
  behaviour was effectively a no-op for this bug, so the upside outweighs
  the risk; if it over-rejects we soften to `-0.8` (still below the
  default exclusion threshold) without a code revert.

## Out of scope

- Multi-language detection beyond Spanish/Portuguese.
- Replacing Last.fm-seeded autoplay altogether. The pipeline is fine —
  only the per-candidate guardrail is missing.
