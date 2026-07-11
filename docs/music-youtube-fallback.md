# YouTube Music Extraction Fallback Strategy

## Context

The Lucky Discord bot uses `discord-player-youtubei` (currently pinned to `^3.0.0-beta.4`) as the primary YouTube audio extractor for music playback. This is a **beta release** — it can break silently when YouTube changes its API or client detection mechanisms.

A stable release of `discord-player-youtubei` does not yet exist. Until one is available, the bot must:

1. **Monitor** YouTube extraction failure rates via Sentry telemetry
2. **Detect** degradation through observable signals
3. **Execute** a fallback strategy to restore service

## Monitoring: Sentry Signals

YouTube extraction failures are tracked in Sentry under the category **`music.youtube-extraction`** with the following stages:

| Stage           | Event                                                | Severity | When to Act                                                       |
| --------------- | ---------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `yt-dlp-url`    | Direct URL extraction fails                          | warning  | Single failures are normal; sustained >5% error rate in 1h window |
| `yt-dlp-search` | Spotify URL → YouTube search extraction fails        | warning  | Same threshold as `yt-dlp-url`                                    |
| `all-exhausted` | All fallback stages (YouTube + SoundCloud) exhausted | error    | Any error indicates music service degraded                        |

**Query in Sentry:**

```
message:"YouTube extraction" tags.category:"music.youtube-extraction"
```

To check failure rate over the last hour:

```
message:"YouTube extraction" tags.category:"music.youtube-extraction" timestamp:>-1h
```

## Fallback Execution

If Sentry shows sustained YouTube extraction failures:

### Step 1: Verify the beta is the root cause

- Check [discord-player-youtubei releases](https://github.com/Androz2091/discord-player-youtubei/releases)
- Look for recent YouTube API changes (often announced in YouTubei issues)
- Confirm SoundCloud fallback is working (check `music.youtube-extraction` logs with stage `soundcloud-*`)

### Step 2: Pin to last-known-good version

In `packages/bot/package.json`, replace:

```json
"discord-player-youtubei": "^3.0.0-beta.4"
```

with the last-known-good version (e.g., `3.0.0-beta.3` or earlier). Rebuild and deploy.

Test recovery:

```bash
npm run test:bot  # Verify music commands pass
npm run lint --workspace=packages/bot
```

### Step 3: If downgrade does not restore service

The fallback is the **SoundCloud matcher** in `packages/bot/src/handlers/player/soundcloudMatcher.ts`. If SoundCloud is also unavailable:

- Disable YouTube search in `packages/bot/src/handlers/player/playerFactory.ts` by removing the `loadYoutubeExtractor` call
- Issue a status message: "YouTube playback temporarily unavailable; music commands will search SoundCloud only"
- File a post-incident issue to track the timeline and upgrade path

## Contacts

- **On-call:** Check `.github/CODEOWNERS` for `packages/bot/src/handlers/player/`
- **Timeline:** If this procedure is triggered, log the date in a follow-up issue so future operators see the history

## See Also

- [Player Factory Registration](../packages/bot/src/handlers/player/playerFactory.ts)
- [Stream Bridge & Fallback Logic](../packages/bot/src/handlers/player/streamBridge.ts)
- [SoundCloud Matcher](../packages/bot/src/handlers/player/soundcloudMatcher.ts)
- [Sentry Monitoring Setup](../packages/bot/src/utils/monitoring/sentry.ts)
