# Lucky — Current State

**Updated**: 2026-03-16
**Latest release**: v2.6.25
**Main branch**: `de8ab6f` (origin/main and local root checkout)

## What's in v2.6.25
- fix(policy): check cwd instead of repoRoot for worktree detection (#306)
- feat(bot): /automod preset command (#307)
- feat(bot): voice channel status and music activity presence (#310)
- fix(bot): smartShuffle test fix (#311)
- chore(release): v2.6.25 (#312)

## What's on main post-v2.6.25 (unreleased — will be v2.6.26)
- feat(bot): music button controls, queue pagination, and autoplay blending (PR #315 open, CI running)
  - 5 music control buttons on now-playing embeds (⏮️⏯️⏭️🔀🔁)
  - Queue pagination with page buttons
  - AUTOPLAY_BUFFER_SIZE 4→8
  - insertUserTrackWithPriority + blendAutoplayTracks functions
  - queueDisplay splits user/autoplay sections with separator

## CI / Quality
- npm audit: 0 vulnerabilities
- All tests: 602/602 bot passing (41 suites; 1 pre-existing redisCaching integration test fails in worktree due to no generated prisma client)
- SonarCloud: passing on main
- PR #315: CI in progress (Quality Gates + SonarCloud still running)

## Active Worktrees
- `.worktrees/autoplay-buttons` — active (PR #315 open, wt-autoplay-buttons branch, commit ea0f34d)
- `.worktrees/feat-voice-status` — stale (PR #310 merged, feature/voice-status-music-presence at 48e8487)

## Open Issues
- #308: /starboard feature (reaction-based message pinning) — next to implement
- #309: /level XP tracking + role rewards + leaderboard — after starboard

## Open PRs
- #315: feat(bot): music button controls, queue pagination, and autoplay blending — CI running, auto-merge enabled

## Known Issues / Pending Work
- Stale worktree `.worktrees/feat-voice-status` needs cleanup after PR #315 merges
- v2.6.26 release not yet cut (waiting for PR #315 to merge)
- README.md and CHANGELOG.md have not been updated this session
