# Dependabot Batch Handling Policy

**Date:** 2026-05-16  
**Status:** Accepted  
**Stakeholders:** Lucas Santana  

## Problem

Dependabot's auto-generated PRs for npm packages span **patch + minor + major version bumps**. Grouping them into a single PR risks shipping breaking changes without integration testing.

Example: PR #896 bundled `youtubei.js 16→17` (major) with 12 patches in a single auto-merge group. The major bump broke Discord.js extractor compatibility, surfaced only after merge → #900 (stale recreate).

## Decision

Split Dependabot groups by **update-type**:

1. **`*-patches` group** (patches + minors)
   - Auto-merge when:
     - GitHub CI passes (syntax, unit tests, builds)
     - No integration-test coverage gap for the affected package family
   - Rationale: patch/minor versions rarely ship breaking changes

2. **`*-majors` group** (major version bumps)
   - Manual triage; do NOT auto-merge until:
     - Integration tests cover the affected library (e.g. YouTubei.js, discord-player-youtubei, yt-dlp require YouTube smoke tests)
     - Changes are reviewed for known breaking changes
   - Rationale: major versions are high-risk without smoke coverage

## Changes Implemented

- `.github/dependabot.yml`: split into `production-patches` (patch+minor auto-merge) and `production-majors` (manual).
- `dependabot-auto-merge.yml`: auto-merge only PRs in `production-patches` group.

## Revisit Triggers

- ✅ **YouTube integration coverage:** Add smoke test for YouTube resolution path (search → resolve → audio URL) so `production-majors` for `youtubei.js`, `discord-player-youtubei`, `ytdl-core`, `yt-dlp` can move to auto-merge. Landed in PR #910.
- **Spotify integration coverage:** Add smoke test for Spotify playback path.
- **Auto-merge promotion:** Once YouTube + Spotify smoke tests are stable in CI, promote `production-majors` groups for those packages to auto-merge.

## Next Steps

1. ✅ PR #910 adds YouTube smoke test (`npm run test:youtube:smoke` in CI/CD pipeline).
2. After YouTube smoke stabilizes (1 week of clean CI):
   - Promote `youtubei.js`, `discord-player-youtubei`, `ytdl-core`, `yt-dlp` from manual to auto-merge in `.github/dependabot.yml`.
3. Repeat for Spotify once its coverage is in place.

## Related

- PR #896: Major + patch grouping revealed the gap.
- PR #897: Split policy implementation.
- PR #900: Stale recreate pattern after merge.
- PR #910: YouTube smoke test (issue #910).
