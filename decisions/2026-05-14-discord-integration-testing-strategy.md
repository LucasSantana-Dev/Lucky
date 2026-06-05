# ADR: Discord Bot Integration Testing Strategy

- **Date**: 2026-05-14
- **Status**: Accepted
- **Deciders**: Lucas Santana
- **Tags**: testing, discord, voice, integration, ci

---

## Context

The Lucky Discord bot's test suite is entirely unit-tested with Jest mocks. All Discord.js, discord-player, and yt-dlp interactions are mocked at the boundary. This means voice channel joins, playback lifecycle, autoplay, and yt-dlp extraction are never exercised against real Discord infrastructure in CI.

The question posed: **what is the right approach to test voice channel features, autoplay, and music features in a real Discord environment?**

### Stack

- discord.js v14
- discord-player v7 + `@discordjs/opus`
- yt-dlp binary via a custom extractor service
- Node 22 / Alpine in production

### Reliability gaps discovered during research

1. **yt-dlp no-retry**: `service.ts` fires a single 30 s timeout then hard-kills with no retry. Network blips or CDN hiccups cause permanent playback failures.
2. **Lifecycle snapshot no-timeout**: `lifecycleHandlers.ts` calls `restoreSnapshot()` with no `Promise.race()` guard — a slow/hung DB call blocks the entire queue restore path.
3. **Backend test desert**: `packages/backend` has 9.3 k LOC but only 2 test files (bootstrap + one integration). Route and service logic is entirely uncovered.
4. **No Docker binary validation**: yt-dlp is bundled in the image but is never smoke-tested in CI after build — a broken binary reaches production silently.

---

## Decision

**DEFER** in-CI voice integration testing against real Discord infrastructure.

Instead, invest in the four higher-ROI reliability improvements immediately, and treat a **post-deploy staging voice smoke test** (non-blocking) as the correct long-term integration gate if production incident volume justifies the cost.

---

## Alternatives Considered

### 1. Staging Bot in CI (Discord API calls against a real test guild)

A dedicated bot token + test guild are provisioned. CI spins up the bot, joins a voice channel, plays a short clip, asserts events.

**Rejected because:**

- Fundamentally flaky: voice UDP, yt-dlp downloads, Discord API rate limits, and CI runner network variance combine into a test that passes 90 % of the time at best.
- Discord.js maintainers themselves do not run real voice integration tests in CI ([confirmed by research](https://github.com/discordjs/discord.js/discussions)).
- Cost: a secret-bearing bot token in CI is a supply-chain risk; the test guild requires ongoing maintenance.
- The scenario most likely to catch real bugs (connection drop, stream stall) cannot be reliably triggered on demand.
- **Revisit if**: 3+ distinct production voice-join incidents in a quarter that would have been caught by this test.

### 2. Protocol Replay / Captured Fixture Tests

Record Discord WebSocket frames + UDP audio packets in a real session; replay them in unit tests against a fake Discord server.

**Rejected because:**

- Engineering effort estimated at 2–3 sprints, largely infrastructure work with low direct feature value.
- Discord's gateway protocol is not public and changes without notice; fixtures would rot quarterly.
- The discord.js v14 ecosystem has no maintained capture/replay tooling. Building it from scratch is scope creep.
- **Revisit if**: a community library reaches stable release (check `discord-mock`, `discordeno` mock mode quarterly).

### 3. Alternative Mock Libraries

`discord.js-mock`, `@skyra/discord-components`, `discordeno` mock adapters.

**Rejected because:** none maintains discord.js v14 compatibility as of 2026-05-14 (confirmed by npm + GitHub research). The bot's mock boundaries in Jest already achieve the same effect for unit tests.

### 4. In-Process Audio Pipeline Tests (chosen subset)

Test the audio processing chain (yt-dlp → FFmpeg → Opus encoder) without Discord connectivity, using local audio files.

**Partially accepted**: already achievable within the current unit test framework by injecting a `file://` URL into the extractor. This is captured in PR #2 scope (yt-dlp retry logic).

### 5. Post-Deploy Staging Voice Smoke Test (non-blocking)

After a successful production deploy, a GitHub Actions `workflow_dispatch` (or post-deploy hook) runs `node scripts/smoke-voice.ts` against a staging guild. The step is marked `continue-on-error: true`.

**Deferred, not rejected**: this is the correct integration approach if/when incident volume justifies the cost. It is explicitly listed in the plan (PR #3, optional).

---

## The Plan (in priority order)

| #   | Change                                                                              | Effort | PR target       |
| --- | ----------------------------------------------------------------------------------- | ------ | --------------- |
| 1   | Docker CI step: `yt-dlp --version` smoke inside built image                         | 0.25 h | after #848      |
| 2   | yt-dlp retry logic (3× exponential backoff: 30 s → 45 s → 60 s)                     | 2 h    | release/v2.12.0 |
| 2   | `restoreSnapshot()` wrapped in `Promise.race(2 s)` with warn + empty-queue fallback | 1 h    | same PR         |
| 2   | Backend route test scaffolding (≥ 1 test per route group)                           | 3 h    | same PR         |
| 3   | Post-deploy staging voice smoke test (optional, non-blocking)                       | 3 h    | separate PR     |

---

## Consequences

### Positive

- Eliminates the two most likely production reliability gaps (yt-dlp blips, stuck restores) without adding CI flakiness.
- Backend test coverage gap begins to close.
- yt-dlp binary breakage is caught in CI before reaching production.
- No new secrets, bots, or Discord guilds to maintain in CI.

### Negative

- Voice channel join/leave, playback, autoplay, and volume commands remain integration-untested in CI.
- A regression in discord-player or @discordjs/opus would not be caught until post-deploy or user report.

### Neutral

- The decision is reversible: adding a staging bot integration test later is additive work, not a rewrite.
- Discord-player's own test suite covers the playback engine; we rely on that upstream coverage.

---

## Revisit When

- **3+ distinct production voice-join incidents** in a rolling 90-day window that a CI integration test would have caught → evaluate Staging Bot option.
- **CI voice flakiness falls below 0.5 %** (unlikely without a major ecosystem shift, but monitor quarterly).
- **A maintained discord.js v14 mock library reaches stable release** → evaluate Protocol Replay option.
- **Discord publishes a stable test guild / bot sandbox API** → re-evaluate entirely.
- **yt-dlp retry + lifecycle timeout changes reduce production incidents to zero for 2 releases** → the ROI argument for voice integration testing weakens further; record and defer indefinitely.
