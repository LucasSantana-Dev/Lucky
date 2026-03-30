# Last.fm Improvements Plan (2026-03-30)

## Context

Lucky has per-user Last.fm linking via `lastFmLinkService` (DB) with env fallback. Multi-user support is architecturally present but the scrobbling is broken and recommendations are untapped.

Three problems to fix:

1. **Scrobbling sends wrong duration** — `track.duration` in discord-player 7 is a string like "3:45"; dividing by 1000 produces `NaN`, so all scrobbles go out without duration
2. **Artist/title identification issues** — YouTube metadata often produces channel names ("Artist - Topic") or embed strings ("feat.") that don't match Last.fm's catalog
3. **Recommendations don't use Last.fm data** — user's top tracks (1-3 month window) are unused as recommendation seeds

Work root: `/Volumes/External HD/Desenvolvimento/Lucky`

---

## Pre-Conditions

- [ ] On `main` branch, synced: `git fetch origin && git reset --hard origin/main`
- [ ] Tests passing: `npm run test --workspace=packages/bot`
- [ ] `LASTFM_API_KEY` and `LASTFM_API_SECRET` set in `.env`

---

## Phase 1: Fix Scrobble Duration Bug (~30 min)

**Goal:** Stop sending `NaN` duration to Last.fm by switching to `durationMS`.

### Root Cause

`Track.duration` in discord-player 7 is a formatted string (`"3:45"`). Code in `trackNowPlaying.ts` does:

```typescript
const durationSec =
    typeof track.duration === 'number'
        ? Math.round(track.duration / 1000)
        : undefined
```

`typeof "3:45" === 'number'` is `false`, so `durationSec` becomes `undefined`. Last.fm receives no duration.

### Steps

1. Create branch: `fix/lastfm-scrobble-duration`
2. In `packages/bot/src/handlers/player/trackNowPlaying.ts`, replace both `track.duration` duration calculations with `track.durationMS`:

```typescript
// Before (broken)
const durationSec =
    typeof track.duration === 'number'
        ? Math.round(track.duration / 1000)
        : undefined

// After (correct)
const durationSec =
    track.durationMS > 0 ? Math.round(track.durationMS / 1000) : undefined
```

3. Update both occurrences in `scrobbleCurrentTrackIfLastFm` and `updateNowPlayingIfLastFm`
4. Add unit test: mock a track with `duration: "3:45"` and `durationMS: 225000`, verify scrobble is called with `durationSec: 225`

### Verification

- [ ] `npm run test --workspace=packages/bot` passes
- [ ] Scrobble is called with correct seconds (225 for a 3:45 track)

---

## Phase 2: Artist/Title Cleanup (~45 min)

**Goal:** Normalize artist and title strings before sending to Last.fm to improve match rate.

### Known Issues

1. YouTube "- Topic" suffix: `"Artist - Topic"` → should be `"Artist"`
2. Multiple artists: `"Artist A, Artist B"` → Last.fm prefers first artist for scrobble
3. Embed strings in title: `"Song Title (Official Video)"`, `"Song Title [HD]"`, `"Song Title (Live)"` → should strip
4. Feat. in title: `"Song Title (feat. Artist B)"` → keep title clean, strip feat. part

### Steps

1. Add `normalizeLastFmArtist(raw: string): string` to `packages/bot/src/lastfm/lastFmApi.ts`:
    - Strip "- Topic" suffix (YouTube auto-generated channels)
    - Take first artist if comma/slash separated
    - Trim

2. Add `normalizeLastFmTitle(raw: string): string`:
    - Strip common suffixes in parens/brackets: `(Official Video)`, `(Official Music Video)`, `[HD]`, `(Live)`, `(Lyric Video)`, `(Audio)`, `(Official Audio)`
    - Strip feat. clause: `(feat. ...)` and `ft. ...`
    - Trim

3. Apply both normalizers in `updateNowPlaying` and `scrobble` before passing to Last.fm

4. Add unit tests for normalizer edge cases:
    - `"Arctic Monkeys - Topic"` → `"Arctic Monkeys"`
    - `"Bohemian Rhapsody (Official Video)"` → `"Bohemian Rhapsody"`
    - `"Blinding Lights (feat. The Weeknd)"` → `"Blinding Lights"`
    - `"Artist A, Artist B"` → `"Artist A"`

### Key Files

- `packages/bot/src/lastfm/lastFmApi.ts`

### Verification

- [ ] All normalizer unit tests pass
- [ ] `npm run test --workspace=packages/bot` passes

---

## Phase 3: Top Tracks as Recommendation Seeds (~1 hour)

**Goal:** Fetch user's most-listened tracks from Last.fm (1-3 month window) and surface them as autoplay seeds.

### Architecture

```
getLastFmTopTracks(sessionKey, { period: '3month', limit: 20 })
  → [{artist, title}]
  → search each in discord-player
  → use as additional seeds in replenishQueue
```

The autoplay system already accepts multiple seed tracks. We just need to surface Last.fm tracks as additional seeds.

### Steps

1. Add to `packages/bot/src/lastfm/lastFmApi.ts`:

```typescript
export type LastFmTopTrack = {
    artist: string
    title: string
    playCount: number
}
export type LastFmPeriod = '1month' | '3month' | '6month' | '12month' | '7day'

export async function getTopTracks(
    sessionKey: string,
    period: LastFmPeriod = '3month',
    limit = 20,
): Promise<LastFmTopTrack[]>
```

Use `user.getTopTracks` endpoint (authenticated GET, no signature needed — just `api_key`, `sk`, `user` from auth, `period`, `limit`).

**Note**: `user.getTopTracks` requires `user` param = Last.fm username. We need to store the username in `lastFmLinkService` alongside the session key OR call `user.getInfo` first to get the username from the session key.

2. Update `lastFmLinkService` schema if needed to store `lastfmUsername` alongside `sessionKey`

3. Add `packages/bot/src/utils/music/autoplay/lastFmSeeds.ts`:

```typescript
export async function getLastFmSeedTracks(
    discordUserId: string,
    limit = 10,
): Promise<{ artist: string; title: string }[]>
```

- Gets session key for user
- Calls `getTopTracks` with `period: '3month'`
- Returns top N tracks as `{artist, title}` pairs
- Cached in memory with 1-hour TTL to avoid over-calling the API

4. In `replenishQueue` (or `collectRecommendationCandidates`), after building `seedTracks` from current queue history, also include tracks from `getLastFmSeedTracks` for the requester user

5. Add unit tests:
    - `getLastFmSeedTracks` returns empty array when user has no Last.fm link
    - `getLastFmSeedTracks` returns parsed tracks from mocked API response
    - Cache hit avoids second API call within TTL

### Key Files

- `packages/bot/src/lastfm/lastFmApi.ts`
- `packages/bot/src/utils/music/autoplay/lastFmSeeds.ts` (new)
- `packages/bot/src/utils/music/queueManipulation.ts`

### Verification

- [ ] `npm run test --workspace=packages/bot` passes
- [ ] Last.fm seed tracks appear as recommendation candidates in replenishQueue
- [ ] Cache prevents repeated API calls within 1 hour

---

## Phase 4: Multi-User Verification (~30 min)

**Goal:** Confirm the `/lastfm connect` command flow works for multiple users and surfaces useful feedback.

### Audit Checklist

1. Check `/lastfm connect` command in `packages/bot/src/functions/general/commands/lastfm.ts`:
    - Does it store session key per Discord user ID in `lastFmLinkService`?
    - Does it store the Last.fm username alongside the session key?
    - Does it confirm the connection with a test scrobble or `user.getInfo` call?

2. Check `/lastfm` (status command):
    - Does it show which Last.fm account is linked for the calling user?
    - Does it show scrobble count or linked username?

3. Verify `scrobbleCurrentTrackIfLastFm` uses the **track requester's** Discord ID (not the bot's):
    - `getLastFmRequesterId` should return the user who added the track

4. Fix any gaps found

### Verification

- [ ] User A links their Last.fm — scrobbles go to User A's account
- [ ] User B links their Last.fm — scrobbles go to User B's account
- [ ] Track requested by User A scrobbles to User A even when User B is in the VC

---

## Phase 5: Ship

For each phase that produced code:

```bash
npm run lint --workspace=packages/bot && npm run type:check && npm run test --workspace=packages/bot
```

Conventional commits per phase, PR per phase via `/pr-flow`.

Update CHANGELOG.md under `[Unreleased]`.

---

## Key Gotchas

- `Track.duration` is a formatted string in discord-player 7 — use `Track.durationMS` (number, milliseconds) for math
- Last.fm `user.getTopTracks` requires the Last.fm username (`user` param), not the session key — need to store username at link time or call `user.getInfo` lazily
- `getTopTracks` period options: `overall`, `7day`, `1month`, `3month`, `6month`, `12month` — default to `3month`
- Scrobble requires track to have played ≥30 seconds AND ≥50% of duration — this is already handled by the `elapsed < 30` check
- Last.fm API is rate-limited — cache top tracks with 1-hour TTL
- HUSKY=0 for docs/config commits

## Out of Scope

- Loved tracks as recommendation seeds (user doesn't use loved tracks)
- Last.fm friends network integration
- Scrobbling from external bots (externalScrobbler.ts is already separate)
- Dashboard Last.fm page (backend `/lastfm` route already exists)
