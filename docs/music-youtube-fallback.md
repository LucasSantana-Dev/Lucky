# YouTube Music Extraction Fallback Strategy

## Context

The Lucky Discord bot uses `discord-player-youtubei` (currently pinned to `3.0.0-beta.4` — use exact version, not `^3.0.0-beta.4`) as the primary YouTube audio extractor for music playback. This is a **beta release** — it can break silently when YouTube changes its API or client detection mechanisms.

A stable release of `discord-player-youtubei` does not yet exist. Until one is available, the bot must:

1. **Monitor** YouTube extraction failure events via Sentry telemetry
2. **Detect** degradation through observable signal volume and trends
3. **Execute** a fallback strategy to restore service

## Monitoring: Sentry Signals

YouTube extraction failures are tracked in Sentry under the category **`music.youtube-extraction`** with the following stages:

| Stage           | Event                                                | Severity | When to Act                                                    |
| --------------- | ---------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `yt-dlp-url`    | Direct URL extraction fails                          | warning  | Track failure event volume and trend; single events are normal |
| `yt-dlp-search` | Spotify URL → YouTube search extraction fails        | warning  | Track failure event volume and trend; same as `yt-dlp-url`     |
| `all-exhausted` | All fallback stages (YouTube + SoundCloud) exhausted | error    | Any error indicates music service degraded                     |

**Query in Sentry to find all YouTube extraction failures:**

```text
tags.category:"music.youtube-extraction"
```

To check failure event volume and trend by stage over the last hour:

```text
tags.category:"music.youtube-extraction" tags.stage:"yt-dlp-url" timestamp:>-1h
```

**Note:** These queries show failure event volume and trends. Computing a true failure _rate_ (failures ÷ total attempts) requires a separate denominator counter, which is out of scope for this telemetry.

## Fallback Execution

If Sentry shows sustained YouTube extraction failures:

### Step 1: Verify the beta is the root cause

- Check [discord-player-youtubei releases](https://github.com/Androz2091/discord-player-youtubei/releases)
- Look for recent YouTube API changes (often announced in YouTubei issues)
- Confirm SoundCloud fallback is available: query Sentry for stage values in `all-exhausted` events to see if SoundCloud attempts succeeded or also failed

### Step 2: Pin to last-known-good version

In `packages/bot/package.json`, replace:

```json
"discord-player-youtubei": "3.0.0-beta.4"
```

with the last-known-good version pinned exactly (e.g., `3.0.0-beta.3`, not `^3.0.0-beta.3`). Rebuild and deploy.

Test recovery:

```bash
npm run test:bot  # Verify music commands pass
npm run lint --workspace=packages/bot
```

### Step 3: If SoundCloud fallback is also unavailable

If `all-exhausted` events show that SoundCloud stages failed, or if the downgrade in Step 2 does not restore service:

1. **IF SoundCloud is unavailable:** Disable YouTube extraction in `packages/bot/src/handlers/player/playerFactory.ts` by removing the `loadYoutubeExtractor` call
2. **Issue status message:** "YouTube and SoundCloud playback temporarily unavailable; music commands cannot proceed"
3. **File post-incident issue** to track timeline and upgrade path

### Step 4: If SoundCloud fallback is working

If `all-exhausted` events show SoundCloud succeeded (stages 2-4 completed), then YouTube extraction is the only issue:

- The fallback is **already active** — users see music playback via SoundCloud
- Issue optional status message: "YouTube extraction temporarily unavailable; using SoundCloud fallback"
- Monitor `yt-dlp-url` and `yt-dlp-search` failure volume for recovery

## Contacts

- **On-call:** File an issue on the bot's issue tracker for escalation
- **Timeline:** If this procedure is triggered, log the date in a follow-up issue so future operators see the history

## See Also

- [Player Factory Registration](../packages/bot/src/handlers/player/playerFactory.ts)
- [Stream Bridge & Fallback Logic](../packages/bot/src/handlers/player/streamBridge.ts)
- [SoundCloud Matcher](../packages/bot/src/handlers/player/soundcloudMatcher.ts)
- [Sentry Monitoring Setup](../packages/bot/src/utils/monitoring/sentry.ts)
