# Lucky v2.6.66 — command response polish wave

## Goal

After PR #501 ships v2.6.65 (play bridge fix + now-playing embed + music control buttons), apply the new embed/button standard across the rest of the slash command surface so every reply is consistent, rich, and visually complete.

## What I already audited (source of truth for this plan)

- 52 top-level commands, 95+ subcommands across music / moderation / management / engagement / general / automod.
- Gold standard: `buildPlayResponseEmbed` (new in v2.6.65) + `createMusicControlButtons` + `detectSource`.
- No P0 command crashes found by the audit. One near-P0: `/level leaderboard` crams rows into `description` → will silently truncate past ~1024 chars on busy servers.
- Error handling fragmented: only ~6 commands route through `createUserFriendlyError`; the rest use hard-coded strings.

## Phases

Each phase is independently shippable. Ship each as its own small PR so a bad change is cheap to revert.

### Phase 1 — Reusable embed builders (~2.5 h, foundation)

Create four shared helpers that every subsequent phase depends on. Put them in `packages/bot/src/utils/music/embeds/` (or a fresh `packages/bot/src/utils/general/responseEmbeds/` if they're used outside music).

1. **`buildTrackEmbed(track, kind, requestedBy?)`** — general-purpose track display.
    - Re-uses `detectSource` + source badge color pattern from `nowPlayingEmbed`.
    - Kinds: `'queued' | 'playing' | 'recommended' | 'history'`.
    - **Consumers**: `/queue show` (per track), `/songinfo`, `/history`, `/recommendation show`.

2. **`buildUserProfileEmbed(user, stats?)`** — user stat snapshot.
    - Avatar thumbnail, fields for XP / level / rank / progress bar.
    - **Consumers**: `/level rank`, `/lastfm status`.

3. **`buildListPageEmbed(items, page, config)`** — paginated list helper.
    - Fields-per-item (not one jumbo description).
    - Footer with `Page N/M`.
    - **Consumers**: `/level leaderboard`, `/cases`, `/starboard top`, `/twitch list`, `/history` list view.

4. **`buildPlatformAttribEmbed(platform, body)`** — external-service branding.
    - Platform color + icon + label injection for Last.fm / Spotify / YouTube.
    - **Consumers**: `/lastfm link|status`, `/songinfo` source field when URL is external.

**Verification**: unit tests for each helper (mirror `nowPlayingEmbed.spec.ts` structure — ~10–15 tests each). `npm run test:bot` passes. tsc + lint clean.

**Ship**: single PR `feat/bot-reusable-embeds`.

### Phase 2 — Fix the near-P0: `/level leaderboard` truncation (~1 h)

- Replace the "10 rows in one description" pattern with `buildListPageEmbed`.
- Add pagination buttons (reuse `createQueuePaginationButtons` from `buttonComponents.ts`).
- Cap each page at 5 users with avatar thumbnails rendered as field icons (via the header/author slot if inline avatars aren't possible).
- Test the truncation edge case explicitly: generate 50 fake users, assert no field body exceeds 1024 chars.

**Ship**: single PR `fix/level-leaderboard-pagination`.

### Phase 3 — Music command consistency (~2.5 h)

Apply `buildTrackEmbed` + source badges to the remaining music commands so every "here's a track" response looks uniform.

- `/queue show` — per-track rendering gains source badges, track duration, requester avatar (existing pagination stays).
- `/queue show` — also attach `createMusicControlButtons(queue)` to the rendered message so users can pause/skip from the queue view.
- `/songinfo` — migrate from `musicEmbed` to `buildTrackEmbed`; adds thumbnail + source badge.
- `/skip` / `/pause` / `/resume` — migrate from flat `successEmbed` to a 2-field "now" mini-embed ("Just skipped:" + track chip).
- `/history` case-list renderer — use `buildListPageEmbed`; unify pagination with `/cases` once Phase 1 lands.

**Ship**: single PR `feat/music-command-embed-consistency`.

### Phase 4 — Engagement + external service polish (~2 h)

- `/level rank` — `buildUserProfileEmbed` with XP progress bar.
- `/lastfm status` — `buildPlatformAttribEmbed` + last scrobbled track thumbnail.
- `/lastfm link` — Last.fm color + iconography.
- `/starboard top` — embed preview of starred messages (fetch original message embed/thumbnail when available; fall back to text snippet).

**Ship**: single PR `feat/engagement-command-polish`.

### Phase 5 — Cross-cutting quality pass (~1.5 h)

- Audit all embed builders and add `setTimestamp()` to every terminal reply (currently only 19 of ~52 commands call it).
- Migrate hard-coded catch-block error strings to `createUserFriendlyError`. Prioritize high-traffic commands (`/play`, `/queue`, `/ban`, `/warn`, `/level`).
- Unify `/autoplay` from `createEmbed({...})` to the new shared helpers.

**Ship**: single PR `chore/command-response-quality-pass`.

### Phase 6 — Release v2.6.66 (~30 m)

- `chore(release): v2.6.66` — bump × 5, CHANGELOG entry, tag, deploy, verify.
- Update `lucky-bot.md` memory.

## Out of scope (explicit)

- **`/digest` case-detail buttons** — UX improvement, but requires routing work that's bigger than polish. Park for a later PR.
- **`/playlist collaborative` contribution meter** — cosmetic; ship after v2.6.66.
- **`/help` usage examples** — lower-priority; the audit called it already well-structured.
- **`/cases` type-specific color coding** — nice-to-have, minor impact.
- **Full error-handler standardization across ALL commands** — too much scope for one polish wave. Phase 5 covers the high-traffic subset only.
- **Any rewrite of `/queue show`'s pagination logic** — the current `createQueuePaginationButtons` is fine; only the per-track rendering needs updating.

## Sequencing notes

- Phase 1 is a dependency for Phases 2-4. Do it first, ship it independently so the rest can build on a merged foundation.
- Phase 2 is standalone and ships next regardless (near-P0).
- Phases 3 and 4 can run in parallel worktrees if session bandwidth allows.
- Phase 5 must wait for Phases 2-4 to merge (it's a cleanup pass over the migrated code).
- Phase 6 runs only after all preceding phases are merged and CI green.

## State at the start of this plan (2026-04-08)

- PR #501 (fix/play-stream-bridge) in flight; CI re-running after 463c318 addressed 3 CodeRabbit comments + the Sonar quality gate blockers.
- v2.6.65 release PR will follow once #501 merges.
- This plan runs AFTER v2.6.65 ships to prod.
