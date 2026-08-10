# ADR 2026-08-09 — Remove the `/download` feature for Top.gg compliance

**Status:** Accepted
**Deciders:** Lucas Santana

## Context

Lucky's Top.gg listing (bot id `962198089161134131`) has been in the verification queue since 2026-07-11 (see `docs/TOP_GG_SUBMISSION.md`, handoff `~/.claude/handoffs/lucky/latest.md`). Before resubmitting, reviewed Top.gg's published bot guidelines (support.top.gg "Bot Guidelines" article, via search — the article itself 403s to automated fetches):

> Bots must not provide or distribute downloads of copyrighted material without proper licensing. Bots must abide by top.gg's Terms of Service, Discord's Terms of Service, API rate limits and Developer terms.

Lucky's `/download` command (`packages/bot/src/functions/download/`) shelled out to `yt-dlp` to rip audio/video from YouTube, Spotify, and SoundCloud URLs and hand the file back to the user — no licensing, no rights check, exactly the pattern the guideline names. Discord's own Developer ToS separately prohibits facilitating unauthorized access to copyrighted media. This is a known risk class: Top.gg lists rejections/removals of YouTube-downloader bots for this reason, though some downloader bots do exist on the platform (inconsistently enforced, not something to rely on).

## Decision

**Remove the download subsystem entirely** — not feature-flag it off, not gate it per-guild:

- Bot: `functions/download/**` (commands, processor, service, validator, yt-dlp wrapper, path manager — ~30 files), `utils/download/downloadHelpers.ts`, the `download` command-category registration, the `download` feature toggle.
- Shared: `Download` Prisma model + its FK to `Guild`, `GuildSettings.allowDownloads` / `downloadCooldown` columns, the `download` entry in `FeatureToggleService`/`featureToggles.ts`/`featureToggle.ts` types.
- Frontend: the `download` feature-toggle option in the features store/page + its e2e fixtures.
- DB: migration `prisma/migrations/20260810014436_remove_download_feature/` drops the `downloads` table and the two `guild_settings` columns.

While generating that migration, `prisma migrate diff` also surfaced pre-existing unrelated drift (`reminders` table had no FK to `guilds` at all; `afk_statuses` was missing its `guildId` index) — split into its own migration (`20260810014435_fix_schema_drift/`) and tracked separately in issue #1955, not folded into this decision.

## Alternatives considered

- **Per-guild opt-in toggle (keep `allowDownloads`).** Rejected — the guideline prohibits the capability outright; it isn't a usage or consent question, so gating it off by default doesn't clear a listing review that can still inspect the code/command surface.
- **Restrict to sources with clear licensing (e.g. Creative Commons only).** Rejected — `yt-dlp` has no reliable way to verify license status per-URL at request time; scope would collapse to near-nothing and still can't be verified.
- **Keep it, accept listing risk.** Rejected — a rejected/pulled listing resets the review queue (already 4 weeks in) for a feature with no measured demand signal driving the resubmission.

## Consequences

**Positive:** removes the single clearest Top.gg guideline violation before resubmission; drops a real dependency surface (`yt-dlp` binary, `youtube-dl-exec`, download-path filesystem management) that has caused prior CI/postinstall breakage (#874, #1827, #1486).
**Negative:** users who relied on `/download` lose it with no replacement — no migration path, since the capability itself is the compliance problem.
**Neutral:** this is independent of the vote webhook / `/voterewards` work (already shipped, #729/#730) and of the pending Top.gg ad campaign (#1784, still blocked on listing approval).

## Revisit when

- Top.gg's guidelines change to explicitly permit licensed-source downloading, or Lucky adds a real rights-checked content pipeline (not `yt-dlp` scraping) — no timeline, not planned.
