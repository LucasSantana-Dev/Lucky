# In-Progress Task — 2026-03-16

## Task

Fix Lucky bot autoplay system + add button-driven music controls (Rythm-style)

## Current Step

Phase 4: Architecture Design — architect agent completed, ready to implement

## Completed So Far

- Phase 1 (Discovery): User confirmed requirements
- Phase 2 (Exploration): 3 code-explorer agents mapped autoplay, queue, recommendation systems
- Phase 3 (Clarifying Questions): User confirmed all 4 decisions
- Voice channel status + music presence already shipped: PR #310 merged, v2.6.25 released
- Opus encoder fix deployed (opusscript → @discordjs/opus)
- Context7 docs fetched for discord.js buttons/components and discord-player events
- Architect agent completed (architecture blueprint ready)

## User Decisions (confirmed)

1. **Buffer size**: Increase AUTOPLAY_BUFFER_SIZE from 4 to 8
2. **User track priority**: Insert at position 0 (immediately next)
3. **Taste adaptation**: Blend approach — keep ~50% existing recs, replace rest with new seeds from user addition
4. **Visual separation**: 👤 user tracks, 🤖 autoplay tracks, improved embeds overall
5. **Button controls**: Rythm-style buttons on Now Playing + Queue embeds

## Root Causes Identified

1. Queue shows empty: AUTOPLAY_BUFFER_SIZE=4 too small, discord-player consumes tracks before /queue runs
2. No user priority: /play appends to end, no insertTrack(track, 0) during autoplay
3. No taste adaptation: replenishQueue() seeds from currentTrack+history only, ignores user-queued tracks

## Key Files

- `packages/bot/src/utils/music/queueManipulation.ts` — core autoplay engine (632 lines)
- `packages/bot/src/handlers/player/trackHandlers.ts` — player events, replenishment triggers
- `packages/bot/src/handlers/player/trackNowPlaying.ts` — now playing embed
- `packages/bot/src/functions/music/commands/queue/queueEmbed.ts` — queue display
- `packages/bot/src/functions/music/commands/queue/queueDisplay.ts` — track formatting
- `packages/bot/src/handlers/interactionHandler.ts` — has button handler at line 99 (currently only reactionRoles)
- `packages/bot/src/functions/music/commands/play/index.ts` — track addition flow

## Next Steps

1. Create branch `feature/autoplay-fix-button-controls`
2. Increase AUTOPLAY_BUFFER_SIZE to 8 in queueManipulation.ts
3. Create `packages/bot/src/utils/music/queue/priorityInsert.ts` — insert user tracks at position 0 during autoplay
4. Modify play command to use priority insert when autoplay active
5. Add taste adaptation: when user adds track, replace ~50% autoplay tracks with new recs seeded from user's track
6. Create `packages/bot/src/utils/general/musicButtons.ts` — ButtonBuilder helpers for music controls
7. Add buttons to Now Playing embed (⏮️⏯️⏭️🔀🔁)
8. Add buttons to Queue embed (◀️▶️ pagination)
9. Add music button handler in interactionHandler.ts
10. Improve embed visual design (👤/🤖 separation, better formatting)
11. Write tests, run full suite
12. Commit, push, create PR

## Architecture Notes (from architect agent)

- Button interactions: use persistent handler in interactionHandler.ts (not collectors — they expire)
- customId prefix: `music:` namespace (e.g., `music:pause`, `music:skip`, `music:queue:next`)
- Queue pagination: store page state in customId (e.g., `music:queue:page:2`)
- Priority insert: `queue.insertTrack(track, 0)` for user tracks when autoplay active
- Taste blend: on user track add, remove autoplay tracks after position 4, re-seed with user track included

## Open Issues

- discord-player's native AUTOPLAY mode may interfere — need to verify our replenishment doesn't conflict
- Button handler needs to check if user is in same voice channel before executing
- Rate limiting on button clicks (Discord has component interaction rate limits)

## Branch

main (clean, v2.6.25)
