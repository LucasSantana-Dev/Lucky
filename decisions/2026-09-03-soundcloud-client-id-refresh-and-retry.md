# ADR 2026-09-03: SoundCloud client_id refresh-and-retry, not a timer

**Status:** Accepted
**Deciders:** Lucas Santana
**Ref:** issue #2139, PR #2144, `packages/bot/src/handlers/player/soundcloudMatcher.ts`

## Context

play-dl authenticates SoundCloud with an anonymous `client_id` scraped from soundcloud.com at boot (`getFreeClientID`). That id rotates and eventually expires. The id was fetched once at process start and never refreshed, so once it expired every SoundCloud fallback stage failed for the rest of the process lifetime, while the bot kept reporting healthy and logged nothing above debug level (#2139).

## Decision

On a failed SoundCloud search or stream, refresh the client id once and retry the operation once, instead of scraping on a timer:

- `refreshSoundCloudClientId()` is single-flight (`refreshInFlight` promise), so a queue that fails several tracks in the same window scrapes one id, not one per failure.
- The refresh has a 10s timeout (`CLIENT_ID_TIMEOUT_MS`) and a 60s cooldown (`REFRESH_COOLDOWN_MS`) before the next one is allowed.
- The cooldown is stamped in `finally`, on the attempt, not on success. A refresh that fails (timeout, soundcloud.com unreachable) still throttles the next one, or every following track pays the same 10s stall.
- The retry does not classify the triggering error by message (deleted track, socket blip, and rate limit all land in the same catch as an expired token); the cooldown bounds the wasted scrapes instead, without coupling recovery to play-dl's error wording.
- If the refresh itself fails, the retry path rethrows the ORIGINAL error, not the refresh failure. The log has to say why the SoundCloud call actually failed, not why the recovery attempt also failed.

## Alternatives considered

- **Refresh on a timer.** Rejected: wastes scrapes when the bot is idle or SoundCloud isn't being used, and still races expiry. A timer firing every N minutes gives no guarantee the id is valid exactly when the next request needs it.
- **Unbounded retries on failure.** Rejected: if SoundCloud is down or the scrape endpoint is broken, retrying every failed call would stampede a fresh 10s scrape per track in a queue.

## Consequences

**Positive:** a stale client_id self-heals on the first failure after expiry instead of wedging the SoundCloud fallback for the rest of the process. The single-flight guard keeps a bad queue from turning into a scrape storm.
**Negative:** the first track after expiry still pays one extra 10s-bounded round trip before it can play.
**Neutral:** genuine misses (deleted track, no match) are unaffected. The retry wrapper only wraps the play-dl network calls, not the "no results" / "no validated match" rejections raised after a successful search.

## Revisit when

- play-dl exposes token expiry directly, so the refresh can be scheduled ahead of the actual failure instead of reacting to it.
- The project moves to a keyed SoundCloud client (official API credentials) and the anonymous-scrape client_id path goes away entirely.
