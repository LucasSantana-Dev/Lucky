---
name: music-queue-player
description: Work with Discord Player, queue, and music commands in Lucky. Use when changing play/queue/skip/volume, track handling, or player lifecycle.
---

# Lucky Music & Queue

## When to use

- Changing play, queue, skip, pause, volume, autoplay, repeat, shuffle
- Fixing track or queue display
- Player lifecycle, errors, or extractors

## Player access

- Use `useMainPlayer()` from `discord-player` where the player is available (e.g. after client ready).
- Play: `player.play(voiceChannel, searchResult, { nodeOptions: { metadata } })`. Search via `player.search(query, { requestedBy })`.

## Command locations

- **Play**: `packages/bot/src/functions/music/commands/play/` — processor, queryDetector, queueManager, spotify/youtube handlers
- **Queue**: `packages/bot/src/functions/music/commands/queue/` — formatter, embed, grouping, stats
- **Control**: `packages/bot/src/functions/music/commands/` — skip, pause, resume, remove, clear, volume, repeat, shuffle, leave, stop

## Handlers

- **Player**: `packages/bot/src/handlers/player/` — trackHandlers, errorHandlers, lifecycleHandlers, playerFactory
- **Events**: `packages/bot/src/handlers/player/trackHandlers.ts` and related — wire player events to replies and history

## Shared state

- Track history and recommendations: use services from `@lucky/shared` (e.g. TrackHistoryService, recommendation) when persisting; do not duplicate queue state in Redis/DB beyond what shared exposes.

## Validations

- Ensure user is in a voice channel; bot has join permissions. Use existing queue/voice validators before touching queue or player.

## Autoplay incident guardrails

- In `packages/bot/src/utils/music/search/engineManager.ts`, keep provider cooldown gating for fallback attempts, but do not skip an explicit non-`AUTO` `preferredEngine` request only because that provider is in cooldown.
- This protects direct-provider queries (for example direct YouTube URLs) from false negatives when provider health cooldown is stale.
- Keep regression coverage in `packages/bot/src/utils/music/search/engineManager.spec.ts`:
  - `still tries preferred engine for direct provider queries even during cooldown`
- In `packages/bot/src/utils/music/queueResolver.ts`, also resolve by `queue.metadata.channel.guildId` / `queue.metadata.channel.guild.id` to avoid false queue misses when cache keys are non-standard.
- Keep regression coverage in `packages/bot/src/utils/music/queueResolver.spec.ts`:
  - `falls back to cache scan by metadata.channel.guildId`

## Fast verification commands

- `node /home/luk-server/Lucky/node_modules/.bin/jest --config packages/bot/jest.config.cjs packages/bot/src/utils/music/search/engineManager.spec.ts --runInBand`
- `node /home/luk-server/Lucky/node_modules/.bin/jest --config packages/bot/jest.config.cjs packages/bot/src/utils/music/queueResolver.spec.ts --runInBand`
- `node /home/luk-server/Lucky/node_modules/.bin/jest --config packages/bot/jest.config.cjs --testPathPatterns="engineManager.spec|autoplay.spec|queueManipulation.spec|playerFactory.test|play/index.spec" --runInBand`
