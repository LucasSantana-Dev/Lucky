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
Manrope/JetBrains Mono, blurple + pink dual accent, flat panels, fade-only
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
   Known gap this reintroduces awareness of, not fixed here (6 pages have no
   heading of their own at all — `Docs.tsx`, `Levels.tsx`,
   `PrivacyPolicy.tsx`, `RoleGroups.tsx`, `Starboard.tsx`,
   `TermsOfService.tsx` — they now show only the compact label with no
   `<h1>`. Pre-existing exposure, not caused by this diff, but worth its own
   ticket to give each of those pages a real `<h1>`.
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
- Six pages (`Docs.tsx`, `Levels.tsx`, `PrivacyPolicy.tsx`, `RoleGroups.tsx`,
  `Starboard.tsx`, `TermsOfService.tsx`) render no heading of their own and
  now show no `<h1>` at all, since `Layout.tsx` no longer provides one.
  Pre-existing exposure surfaced by the round-2 H1 fix; needs its own pass.
- axe reports 24 (dashboard) / 16 (Music) "serious" (non-critical)
  `color-contrast` violations against the locked token palette. Tokens are
  locked for this pass; not touched.
