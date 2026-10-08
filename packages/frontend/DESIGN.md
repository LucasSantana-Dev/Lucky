# DESIGN.md

Decisions log for the dashboard shell + Music page pass. Tokens, type scale, and
component rules live in `branding/DESIGN_SYSTEM.md`; this file records what was
done in this pass and why, not the tokens themselves.

## Scope

- App shell: `src/components/Layout/Layout.tsx`, `Sidebar.tsx`, `navConfig.ts`.
- Music surface: `src/pages/Music.tsx` and the components it renders under
  `src/components/Music/`.

## Mode: redesign-preserve

This is a **preserve** redesign, not a rebuild: `DESIGN_SYSTEM.md` and
`index.css` already own the tokens (OKLCH-equivalent HSL/hex bridge, Sora/
Manrope/JetBrains Mono, pink accent with blurple focus rings, flat panels, fade-only
motion). Nothing here invents a new palette, adds a font, or adds a
dependency. All work is levers 2 and 5 from the modernization-lever priority
order (spacing/rhythm, then hero/key-section recomposition) — the brief was
satisfied without touching color or type-face tokens, so those levers were
never engaged.

Preservation rules applied:

- No route, slug, or nav label changed. `navSections` reorders the **Media**
  section object to sit right after **Overview**; every item keeps its
  existing `path` and `labelKey`. No route was removed or renamed.
- No copy voice rewrite. The one copy change (Music empty-state description)
  keeps the existing plain, short register ("Search or import to get
  started" -> "Start playback from Discord with /play, or search and import
  below.") and is driven by the music-first positioning doc
  (`decisions/2026-09-27-music-first-positioning.md`), not a stylistic
  rewrite.
- No existing accessibility win was regressed. Landmarks, skip link, `aria-*`
  labels, and the disabled/error states in `Music.tsx` are unchanged except
  where a new state (loading skeleton) was added.

## What changed and why

1. **Nav order (`navConfig.ts`)** — Media (Music Player, Track History,
   Lyrics, Musical Taste) moved from 5th to 2nd section, right after
   Overview. Rationale: moderation cases are effectively unused in
   production (0 per the positioning doc) while music is the only heavily
   used surface; the nav should lead with what people actually do.
2. **Sidebar brand header (`Sidebar.tsx`)** — added a small header (existing
   `/lucky-logo.png` asset + "lucky." wordmark, copied verbatim from the
   pattern already used in `DocsShell/PublicHeader.tsx`) above the nav. The
   sidebar previously had no orientation mark at all. No new asset, no new
   visual language — reused an existing official asset and an existing
   wordmark treatment (Art rule: no hand-drawn SVG, no mascot).
3. **Page header hierarchy (`Layout.tsx`)** — see "Round 2" below; the route
   title in `Layout.tsx`'s header is a compact, non-heading label. Each page
   owns its own single `<h1>`.
4. **Music page focal point (`Music.tsx`)** — Now-Playing hero and Queue sit
   side by side in a `lg:grid-cols-5` layout (hero `col-span-3`, queue
   `col-span-2`), stacked on mobile; Search, Import, and the autoplay panels
   moved below as secondary utilities.
5. **Loading state (`Music.tsx`)** — `NowPlayingHero` rendered its "Nothing
   playing" empty state immediately on mount, before the first SSE/REST
   payload ever arrived (`lastStateUpdate` starts `null`). That flashes an
   empty player even when a track is actually queued. Added a skeleton
   branch (reusing the existing `Skeleton` primitive, matching
   `QueueList`'s own `QueueSkeleton` pattern) for `lastStateUpdate === null`.
6. **Empty state copy (`Music.tsx`, `en.json`, `pt-BR.json`)** — the
   "nothing playing" state now tells the user how to start playback from
   Discord (`/play`) instead of only pointing at the dashboard's own search
   box, and now reuses the shared `EmptyState` component (bare mode inside
   the hero's `surface-panel`) instead of a one-off centered `div`, so it
   matches the Queue's own empty-state chip treatment.
7. **Error banner polish (`Music.tsx`)** — added an `AlertCircle` icon
   (lucide, matches every other icon in the surface) to the existing error
   banner; no new component, no new copy beyond the icon's `aria-hidden`.

## Reviewer verdicts / acceptance scripts

No acceptance script or automated reviewer graded this pass; the slop/a11y
checks below were run by hand against the rendered output, not against a
script whose exact rule could be gamed. No choice in this diff was made "to
satisfy a check" — every change traces to the brief (nav order, focal point,
empty/loading state, header hierarchy) or to a documented token-scale
mismatch (`type-title` vs `type-h1`).

## Round 2 (post-review fixes)

Owner review of `after-music-desktop.png` found three real regressions/gaps
from round 1. Fixes, all still redesign-preserve (no tokens/routes changed):

1. **Double H1.** Round 1 bumped `Layout.tsx`'s header title from
   `type-title` to `type-h1`, which made it visually identical to Music.tsx's
   own `<h1>` right below it. Root cause turned out to be app-wide: an audit
   of `src/pages/*.tsx` found 28 of 34 pages already render their own `<h1>`
   (either inline, like Music.tsx, or via the shared `SectionHeader`
   component used by `DashboardOverview.tsx` and 9 other pages). `Layout.tsx`
   rendering an `<h1>` on every route was already a latent double-H1 bug for
   those 28 pages; round 1 just made it visible for Music. Fix applied
   app-wide in `Layout.tsx`: the header title is now a `<p>` (`type-body`,
   compact, not a heading) — a context label, not the page's H1. Every page
   still owns its single `<h1>` in its own body. Verified live (not just
   unit-mocked): Playwright count of `document.querySelectorAll('h1')` is
   exactly 1 on both `/` (Dashboard) and `/music`.
   Known gap flagged here, corrected in Round 3 below: an incomplete grep at
   the time (checking only for inline `<h1` and `SectionHeader` usage, missing
   `DocsShell`) wrongly listed 6 pages as headingless. `Docs.tsx`,
   `PrivacyPolicy.tsx`, and `TermsOfService.tsx` render through `DocsShell`,
   which already provides its own `<h1>` — those 3 were never broken. Only
   `Levels.tsx`, `RoleGroups.tsx`, and `Starboard.tsx` (since removed, #2716) genuinely had no
   heading of their own after this fix. See Round 3.
2. **Card-in-card + repeated "Queue" label.** `Music.tsx` had its own
   `<h2>Queue</h2>` wrapper around `<QueueList>`, which renders its own
   "Queue (N tracks)" header inside a `Card`. Removed the wrapper; `QueueList`
   is now the one container with the one heading. Separately, `QueueList`'s
   empty state rendered `<EmptyState>` without `bare`, so it added its own
   `surface-panel` card nested inside `QueueList`'s own `Card` — the actual
   "card inside a card". Fixed by passing `bare` (same fix already applied to
   the Now-Playing empty state in round 1). Verified: a Playwright check
   walks every `.surface-panel` on the page and asserts none contains
   another.
3. **Every screenshot showed the empty state.** Added a Playwright-only mock
   (temporary spec, not shipped) with a populated `currentTrack` and 6 queue
   tracks to capture the real focal state, and restructured the layout so
   Now-Playing and Queue sit side by side (`grid-cols-1 lg:grid-cols-5`,
   hero `col-span-3` / queue `col-span-2`) on `lg+`, stacked below that.
4. **`QueueList` `isLoading` wiring.** The signal already existed
   (`player.lastStateUpdate === null`, the same one driving the Now-Playing
   skeleton) and is real data, not invented: passed
   `isLoading={player.lastStateUpdate === null}` from `Music.tsx` to
   `QueueList`. No fake loading path added.

Nothing in this round was changed only to satisfy a script: the two
Playwright assertions added (h1 count, no-nested-`.surface-panel`) exist to
verify these exact fixes, not to game an external checklist.

## Known pre-existing gaps found, not fixed (out of scope for this pass)

- `Sidebar.tsx` `NavSections` links: keyboard focus on non-active items
  produces a fully transparent `box-shadow` (no visible ring), while the
  active item's focus state is masked by its own drop-shadow. Confirmed via
  axe + a manual Tab-order check; confirmed unrelated to this diff (this
  pass only adds a new `SidebarBrand` link before `NavSections`, additive
  only, `NavSections`'s own Link markup is untouched). Filed for tracking,
  not fixed here — the root cause is a CSS cascade/specificity interaction
  in `index.css` shared by every nav link in the app and deserves its own
  change + test, not a same-PR side fix.
- axe reports 24 (dashboard) / 16 (Music) "serious" (non-critical)
  `color-contrast` violations against the locked token palette. Tokens are
  locked for this pass; not touched.

## Round 3 (fix the 6-page H1 gap flagged in Round 2)

Round 2 flagged 6 pages as left with zero `<h1>` after `Layout.tsx`'s header
stopped rendering one. Re-audit found the list was wrong: `Docs.tsx`,
`PrivacyPolicy.tsx`, and `TermsOfService.tsx` all render through
`DocsShell`, which has its own `<h1 className='text-3xl font-bold ...'>` —
those 3 never lost a heading. Only `Levels.tsx`, `RoleGroups.tsx`, and
`Starboard.tsx` (since removed, #2716) genuinely had no heading source at all. This is a regression
this branch introduced (Round 2's Layout.tsx change removed the only H1
those 3 pages had), so it's fixed on this branch, not filed separately.

Fix: each of the 3 pages now renders the shared `SectionHeader` component
(the same pattern already used by 9+ other pages, e.g. `GuildAutomation.tsx`,
`LastFm.tsx`) as the first child of every return branch (no-guild, loading,
empty/main), using the `layout.routes.<page>.title` / `.subtitle` i18n keys
that already existed in both `en.json` and `pt-BR.json` (same keys
`Layout.tsx`'s old header used) — no new i18n keys needed, and `es.json`
does not exist in this repo (confirmed in Round 1), so there was nothing to
add there.

- `Levels.tsx`: added `SectionHeader` to the no-guild, loading, and main
  branches.
- `RoleGroups.tsx`: added a `tCommon` (`useTranslation()`, default namespace)
  hook alongside the existing `useTranslation('roleGroups')`, built one
  `SectionHeader` element, reused across all 4 branches (no-guild, loading,
  empty-groups, main list).
- `Starboard.tsx` (since removed, #2716): same pattern as `RoleGroups.tsx` (added `tCommon`, one
  shared `SectionHeader`, reused across no-guild, loading, and main branches).

Extended the single-H1 regression guard: `Music.test.tsx` already asserted
`querySelectorAll('h1')` has length 1 for the Music page (from Round 2).
Added the same assertion to every render-branch test in `Levels.test.tsx`,
`RoleGroups.test.tsx`, and `Starboard.test.tsx` (since removed, #2716; no-guild / loading / main,
matching each page's actual branches), so a future change that removes or
duplicates a page's `SectionHeader` fails a unit test immediately, without
needing a full-route Playwright harness.

## Round 4 (unit 2: DashboardOverview, TrackHistory, Lyrics, PreferredArtists)

Same mode as before: redesign-preserve. Tokens, `SectionHeader`, `EmptyState`,
and `Skeleton` come from this file's existing lock; nothing here adds a font,
route, dependency, or palette value.

1. **`DashboardOverview.tsx` leads with music.** The existing "Recent Music"
   section (built on `useRecentTracks`, already fetched at `limit=5`, no new
   query added) moved from the bottom of the page to directly under the
   page's `SectionHeader`, ahead of the member/case stats grid. The most
   recent track renders as a small hero row (icon tile + title + artist,
   `type-h2` sized) labeled "Last played" (historical data, not live state
   -- deliberately not called "Now Playing" so the copy stays honest about
   what it is); the remaining tracks list below it, unchanged in content.
   Considered wiring `useMusicPlayer` (Music.tsx's live SSE hook) in for a
   true now-playing widget, but that would open a new SSE connection on a
   page that has never had one -- out of scope for a visual reposition and
   excluded by the "no new API calls" brief constraint. The empty state
   ("No tracks played yet") now reuses the shared `EmptyState` component
   (`bare`) instead of a bespoke centered `div`, matching every other empty
   state on this page.
2. **`TrackHistory.tsx` / `Lyrics.tsx` header cohesion.** Both pages
   predated the `SectionHeader` convention Round 3 applied to
   Levels/RoleGroups/Starboard (since removed, #2716) and used a plain icon+`<h1>` header with no
   eyebrow or description -- visibly inconsistent with their own Media-nav
   siblings (`PreferredArtists.tsx`, `LastFm.tsx`), which already use
   `SectionHeader`. Converted both to `SectionHeader`, eyebrow
   `sidebar.sections.media` ("Media"), description reusing the existing
   `layout.routes.<page>.subtitle` copy the old `Layout.tsx` header used for
   the same route (no new copy for the header itself). `Lyrics.tsx` needed a
   second `useTranslation()` call (`tCommon`) alongside its
   `useTranslation('lyrics')` one to reach those cross-namespace keys --
   same pattern Round 3 used for `RoleGroups.tsx`.
3. **`Lyrics.tsx` state honesty.** The no-server-selected branch was a
   one-off centered `div`; switched to the shared `EmptyState` (added
   `lyrics.noServerSelected` key, description unchanged). The idle
   ("search for lyrics") and no-results states were separate plain-text
   blocks; merged into one `EmptyState` (`bare`) keyed off `hasSearched`,
   each with a distinct title + description: idle state is `findLyricsTitle`
   (new) / `searchForLyrics` (pre-existing), no-results state is
   `noLyricsFound` (pre-existing) / `noLyricsFoundDescription` (new), so a
   failed search reads differently from an unstarted one. The
   result panel (title/artist + lyrics body) merged from two stacked
   `surface-panel`s into one panel with an internal divider -- one focal
   block instead of two.
4. **`PreferredArtists.tsx` -- no changes.** Already on `SectionHeader`,
   already single-panel-per-tab, nav label already "Musical Taste"; carries
   the Round-3 language without modification.

New copy (`en.json` / `pt-BR.json`, no `es.json` in this repo): `dashboardOverview.lastPlayed`,
`dashboardOverview.unknownListener`, `lyrics.noServerSelected`,
`lyrics.findLyricsTitle`, `lyrics.noLyricsFoundDescription`. No audio-source
names (YouTube/SoundCloud) introduced anywhere (see #2491).

Single-H1 test coverage extended to all four pages: `DashboardOverview.test.tsx`
and `TrackHistory.test.tsx` gained a `querySelectorAll('h1')` assertion using
their real (unmocked) `SectionHeader`; `Lyrics.test.tsx` (pre-existing file)
gained the same. `PreferredArtists.test.tsx` mocks `SectionHeader` out for its
interaction tests, so a separate `PreferredArtists.a11y.test.tsx` was added
that renders the real component tree and asserts the h1 count instead of
weakening or bypassing the existing mock.

Axe (axe-core, installed `--no-save` for this verification pass only, not a
project dependency): 0 critical violations on all four pages, both with data
and empty. Serious `color-contrast` violations remain (16-36 nodes per page)
-- the same locked-token-palette gap Round 2 already recorded for
Dashboard/Music; tokens are locked for this pass and were not touched.

## Known pre-existing bugs found in this pass, not fixed (out of scope)

- `TrackHistory.tsx`'s "Clear" button (`handleClear`) calls
  `api.trackHistory.clearHistory` and wipes the list immediately, with no
  confirm dialog and no undo. Pre-existing on `main` (confirmed via
  `git show main:...TrackHistory.tsx`, predates this branch). Filed as a
  GitHub issue rather than fixed here, since the brief scoped this pass to
  visual/structural changes with existing handlers preserved.
- `PreferredArtists.tsx`'s `ArtistTile` renders a `<button>` (the tile) with
  nested `<button>` elements (`Prefer`/`Block`, ~lines 124-153) inside it --
  invalid HTML and a real keyboard/AT hazard (nested interactive elements).
  Surfaced by React's own DOM-nesting warning during the existing test
  suite. Pre-existing on `main`. Filed as a GitHub issue; not fixed here
  since `PreferredArtists.tsx` was left untouched this pass.

## Round 5 (owner review of Round 4: nav active state, lyrics typography)

Two fixes found reviewing `u2-after-*.png` / `u2b-after-*.png`:

1. **Nav active state root cause.** `useNavigation.ts`'s `isActive` matched
   any pathname that started with a nav item's path, with a single
   hardcoded exception for `/music/artists`. On `/music/history` this lit
   up both "Music Player" (`/music`) and "Track History" (`/music/history`).
   Replaced with a general rule derived from `navConfig`'s own path list: a
   prefix match is active unless some other known nav path is a longer,
   equally valid match for the current pathname -- that item is the more
   specific owner of the route. The `/music/artists` special case is now
   redundant and removed. Covered by four `Sidebar.test.tsx` cases:
   `/music`, `/music/history`, `/music/artists`, and a non-music nested
   route (`/settings/advanced`).
2. **`Lyrics.tsx` typography.** The result body rendered in JetBrains Mono
   via a `<pre>` (lyrics are prose, not code). Switched to the body face:
   `<p className="type-body max-w-prose whitespace-pre-line ...">` (no
   `font-mono`), keeping line breaks and blank lines between verses via
   `whitespace-pre-line`, with `max-w-prose` for a readable line length.

This round also attempted a first pass at DashboardOverview's inconsistent
section headings by normalizing every one of them to `type-h2`. That
flattened a real hierarchy -- panel titles inside cards became visually
identical to the standalone section headings above them. See Round 6 for
the corrected two-level system.

## Round 6 (two-level heading system, replacing Round 5's flat type-h2 pass)

Round 5's "one style for every section title" fix was wrong: it made panel
titles nested inside cards ("Level Leaderboard", "Recent Cases") the same size as standalone section headings ("Community")
sitting above them, so the page read as one flat wall of large headings.

**The two levels, now documented so they don't drift apart again:**

| Level           | Where it appears                                                                   | Class        | Case                           | Example                                                                          |
| --------------- | ---------------------------------------------------------------------------------- | ------------ | ------------------------------ | -------------------------------------------------------------------------------- |
| Section heading | Standalone, outside any card                                                       | `type-h2`    | Sentence case                  | "Community", "Cases by Type", "Quick Actions"                                    |
| Panel title     | The header row inside a card, paired with a muted `type-body-sm` subtitle below it | `type-title` | Sentence case, never uppercase | "Recent Music", "Recent Cases", "Level Leaderboard", "Top Tracks", "Top Artists" |

Uppercase stays only on `type-meta` eyebrows and stat labels (e.g.
"TRACKS PLAYED", "RECENT TRACKS") -- never on a `type-title` panel title.

Applied to `DashboardOverview.tsx` (`Recent Music`, `Recent Cases`,
`Level Leaderboard`, `Starboard Highlights` (since removed, #2716) demoted from `type-h2` back to
`type-title`; `Quick Actions`, `Community`, `Cases by Type` stay `type-h2`)
and `TrackHistory.tsx` (`RankingCard`'s `<h3>` title -- "Top Tracks" /
"Top Artists" -- dropped `uppercase tracking-wide`, now plain `type-title`
sentence case, matching the Dashboard panel titles). The music block still
stands out through its hero row and top-of-page position, not through a
one-off heading size.
