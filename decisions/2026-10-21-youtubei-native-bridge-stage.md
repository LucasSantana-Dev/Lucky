# youtubei.js native stream as a bridge stage between yt-dlp and SoundCloud

- Status: Accepted
- Date: 2026-10-21
- Deciders: Lucas Santana
- Method: prod logs over the last 60 days (Loki), a read of discord-player-youtubei 3.1.0 and
  simple-ytdl-core 1.1.1, and a local smoke run of the native path
- Amends: `2026-06-18-youtube-extraction-reliability.md` (decision 4, the escalation ladder:
  the po_token step runs in process through youtubei.js before any yt-dlp provider sidecar).
  The Lavalink revisit trigger of `2026-08-03-lavalink-reeval-stays-deferred.md` stands.

## Context

- Over the last 30 days, 10.4% of plays exhausted every bridge stage (2.7% the 30 days
  before). The causes in the logs: YouTube "Sign in to confirm you're not a bot" on almost
  every plain yt-dlp attempt since 2026-10-19, and yt-dlp stream-start timeouts on the
  cookies retry (#2911 gives that retry its own budget).
- Every YouTube play goes through the bridge: `playerFactory` registers discord-player-youtubei
  with `createStream: createResilientStream`, so the extractor's own stream (youtubei.js plus
  simple-ytdl-core's multi-client adaptive download, which mints a po_token through bgutils-js
  BotGuard) never runs. Lucky has carried a second YouTube client that it does not use.
- The Lavalink trigger is a rate above 5% across two consecutive 30-day windows. One window is
  above it, so the trigger has not fired.

## Decision

1. Add a `youtubei-native` stage to `resilientStreamBridge.ts`. It runs after the yt-dlp stages
   fail (or are skipped because the block breaker is open) and before SoundCloud.
    - A YouTube URL streams its video id directly.
    - Otherwise the stage searches through youtubei.js and plays only a hit that passes the same
      `pickYouTubeCandidate` validation as the yt-dlp search.
    - It is skipped when the yt-dlp search already reached YouTube and found no valid hit
      (`no_match` or `empty`), since a second client would not change that answer.
2. Budgets: 4 s for the search, 8 s for the stream start (the yt-dlp stream budget). A stream
   that resolves after the timeout is destroyed.
3. `HOSTED_YOUTUBE_ENABLED=false` turns the stage off with the rest of hosted YouTube.
4. Observability: `lucky_bot_play_stage_seconds{stage="youtubei_native"}`, the
   "Bridge: streamed via youtubei" info log, "youtubei-native" in the stages of
   "all stages exhausted", and `youtubei-native` as a value of `track_stream_source`.

## Alternatives considered

- **bgutil po_token provider for yt-dlp now.** A sidecar service and a yt-dlp plugin to keep in
  step. The in-process path costs no new service and uses packages already in the image. It
  is the next step if this stage does not hold.
- **Drop the `createStream` override and let the extractor stream.** That loses the bridge's
  validation, breaker, telemetry and SoundCloud fallback for every play.
- **Lavalink now.** Its trigger has not fired (one window above 5%, not two).

## Consequences

- Positive: a second YouTube client with its own po_token, no new service, no new dependency.
- Negative: when yt-dlp and youtubei both fail, SoundCloud starts up to 12 s later than before.
  The first native stream after a restart pays the BotGuard challenge (jsdom) inside its 8 s.
- Unproven: the native path was measured from a residential IP on a dev machine (Innertube
  create 2.8 s, search 0.6 s, stream start 0.2 s), not from the prod container.

## Measurement

Same `query_range` call shape as the 2026-08-03 ADR (RFC3339 bounds), from the deploy date:

- Share of plays served by the stage:
  `sum(count_over_time({container_name="lucky-bot"} |= "Bridge: streamed via youtubei" [14d]))`
  over `sum(count_over_time({container_name="lucky-bot"} |= "Started playing" [14d]))`
- Stage failures:
  `sum(count_over_time({container_name="lucky-bot"} |= "Bridge: youtubei failed" [14d]))`
- Exhaustion rate:
  `sum(count_over_time({container_name="lucky-bot"} |= "all stages exhausted" [30d]))`
  over plays `[30d]`

## Revisit when

- 14 days after deploy: if the stage serves almost no plays and its failures are bot checks,
  move to the bgutil provider for yt-dlp.
- 2026-11-20 (the second 30-day window): read the exhaustion rate against the Lavalink trigger.
