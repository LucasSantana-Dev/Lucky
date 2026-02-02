---
name: music-queue-player
description: Work with Discord Player, queue, and music commands in LukBot. Use when changing play/queue/skip/volume, track handling, or player lifecycle.
---

# LukBot Music & Queue

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

- Track history and recommendations: use services from `@lukbot/shared` (e.g. TrackHistoryService, recommendation) when persisting; do not duplicate queue state in Redis/DB beyond what shared exposes.

## Validations

- Ensure user is in a voice channel; bot has join permissions. Use existing queue/voice validators before touching queue or player.
