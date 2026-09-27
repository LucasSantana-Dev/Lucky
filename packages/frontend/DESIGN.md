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
3. **Page header hierarchy (`Layout.tsx`)** — the route `<h1>` was set in
   `type-title` (1rem/600), which `DESIGN_SYSTEM.md` documents as the _card
   title_ scale, not the _page heading_ scale (`type-h1`,
   clamp(1.6rem,2.5vw,2.25rem)/700). Corrected to `type-h1` and bumped the
   header's vertical padding slightly (py-3.5/4 -> py-4/5) to give the larger
   heading room. This is a token-scale correction, not a new token.
4. **Music page focal point (`Music.tsx`)** — reordered the page body so
   Now-Playing hero + Queue sit immediately together at the top (Gestalt
   proximity groups "what's playing / what's next / controls" as one block);
   Search, Import, and the autoplay panels moved below as secondary
   utilities. No component was rewritten, only relocated in the JSX.
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
- `QueueList`'s `isLoading` prop and its `QueueSkeleton` are never actually
  passed a `true` value from `Music.tsx` (dead code path).
- axe reports 24 (dashboard) / 16 (Music) "serious" (non-critical)
  `color-contrast` violations against the locked token palette. Tokens are
  locked for this pass; not touched.
