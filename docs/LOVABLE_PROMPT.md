# Lovable Prompt — Port Lucky Redesign into the existing Vite SPA

Copy everything below the `--- BEGIN PROMPT ---` line into Lovable as a single
prompt. It briefs Lovable on both repos, the architectural constraint, the
token map, the page-port plan, and the exact deliverables.

If Lovable supports linking a GitHub source, attach **both** repos:
- `https://github.com/LucasSantana-Dev/Lucky` (current production app)
- `https://github.com/LucasSantana-Dev/Lucky-redesign` (the visual reference)

If it can pull live URLs, also pass:
- AI Studio app: `https://ai.studio/apps/1fd5d19a-c793-4190-a354-777d6295bfd1`
- Production: `https://lucky.lucassantana.tech`

---

--- BEGIN PROMPT ---

You are working on **Lucky** — a Discord bot dashboard. There are two
repositories in play, and your job is to **port the visual language of the
redesign repo back into the production app's Vite SPA, without rewriting any
of the production app's data wiring**.

# 1. The two repos

## Production app (do not replatform)

- Repo: `LucasSantana-Dev/Lucky`, frontend lives in `packages/frontend/`.
- Stack: **Vite 8 + React 19 + react-router-dom 7 (SPA)**, Tailwind v4
  (`@tailwindcss/postcss`), Zustand (auth + guild + features stores),
  TanStack Query 5 (server state), axios (with `withCredentials` + 10 s
  timeout + 401 → `/api/auth/discord` interceptor), framer-motion 12,
  Radix UI primitives, Sonner toasts, react-hook-form + Zod, Vitest +
  Playwright (24 e2e specs).
- App is **dark-mode only** (`<div className='dark'>` wraps the entire tree
  in `src/App.tsx`).
- All routes are lazy-loaded and gated by an RBAC `RouteModuleGuard` that
  reads `memberContext.effectiveAccess[module]` against an `AccessMode`
  (`'view'` or `'manage'`).
- Music page uses **Server-Sent Events** (`api.music.createSSEConnection(guildId)`)
  with exponential-backoff reconnect (1 s → 30 s) for live queue/playback state.
- Auth: redirect to `GET /api/auth/discord` (Discord OAuth2). Cookie-session.
- All design tokens live in `packages/frontend/src/index.css` under
  Tailwind v4's `@theme` block, currently prefixed `--color-lucky-*` and
  `--lucky-*`.

## Redesign reference (visual source of truth, do not adopt as runtime)

- Repo: `LucasSantana-Dev/Lucky-redesign` (private; created 2026-04-21).
- Stack: **Next.js 15 App Router + React 19**, Tailwind v4, `motion`
  (renamed `framer-motion`), `class-variance-authority`, `clsx`,
  `tailwind-merge`, **no auth, no API client, no RBAC, no tests, no SSE**.
  Every page hard-codes mock data inline.
- Sidebar config: `components/Sidebar.tsx`. Pages: `app/dashboard/[guildId]/*/page.tsx`.
- Tokens: `app/globals.css` uses **short-form** Tailwind v4 names
  (`bg-canvas`, `bg-sidebar`, `bg-panel`, `bg-elevated`, `bg-highlight`,
  `bg-brand-discord`, `bg-brand-accent`, `text-text-strong`,
  `text-text-body`, `text-text-muted`, `text-text-subtle`,
  `border-panel`).
- Brand decision the redesign commits to: **dual accent** — Discord
  blurple `#5865f2` for primary CTAs + neon pink `#ec4899` for secondary
  accents — and **Sora display + Manrope body + JetBrains Mono**.

# 2. The constraint

**Do not migrate Lucky to Next.js.** Reasons:
- The Vite SPA already implements Discord OAuth2, RBAC route guards, the
  SSE music channel, the axios 401 redirect interceptor, and 24 Playwright
  e2e specs. Replatforming would force reimplementing all of that.
- The redesign repo is a UI prototype only — every page mocks data inline;
  there is **no behavior** to port, only visual JSX + Tailwind classes.
- Hosting is nginx (Docker), not Vercel/Firebase.

**Do** port the redesign's visual language **page-by-page** into the
existing Vite SPA, reusing every existing hook (`useModerationCases`,
`useMusicPlayer`, etc.), store, and API module.

# 3. Token compatibility — do this first, in one PR

The redesign uses short-form tokens. Add them as **aliases** to the
production CSS so redesign JSX classes work verbatim, **without removing
the existing `--lucky-*` tokens** (we'll cut those over later):

In `packages/frontend/src/index.css`, inside the existing `@theme` block,
add:

```css
/* Short-form aliases for the 2026-04-21 redesign port. Same hex values
   as the existing --color-lucky-* tokens. Keep both during migration. */
--color-canvas: #0f1117;
--color-sidebar: #161b22;
--color-panel: #1c2129;
--color-elevated: #222831;
--color-highlight: #2a3140;

--color-brand-discord: #5865f2;
--color-brand-accent: #ec4899;

--color-text-strong: #e6edf3;
--color-text-body: #adbac7;
--color-text-muted: #768390;
--color-text-subtle: #545d68;

--shadow-soft: 0 4px 16px rgb(0 0 0 / 0.3);
--shadow-panel: 0 8px 32px rgb(0 0 0 / 0.4);
```

Also port these utility classes from the redesign's `app/globals.css` (drop
into the existing `@layer utilities` block in `index.css`):

```css
.discord-gradient {
  background: linear-gradient(135deg, #ec4899 0%, #fb923c 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}
.surface-panel { @apply bg-sidebar border border-panel rounded-xl shadow-soft; }
.surface-card { @apply bg-panel border border-panel rounded-xl shadow-soft; }
.surface-elevated { @apply bg-elevated border border-panel rounded-xl shadow-panel; }
.lucky-focus-ring { @apply focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-discord/40; }
```

Update `packages/frontend/branding/BRANDING_GUIDE.md` to record the new
brand decision: **dual accent (Discord blurple + neon pink), Sora display +
Manrope body + JetBrains Mono mono**. Drop the "Inter only" rule — the
redesign has resolved that.

# 4. The new visual patterns to introduce

These appear on **every** redesign page and have no equivalent in the
current SPA. Port them as reusable primitives:

### 4.1 Mono uppercase eyebrow
```tsx
<div className="flex items-center gap-2 text-text-muted mb-2">
  <ShieldAlert className="w-4 h-4" />
  <span className="text-[10px] font-mono uppercase tracking-widest">
    Moderation Security
  </span>
</div>
```
Add this as an `eyebrowIcon?: ReactNode` prop on the existing
`packages/frontend/src/components/ui/SectionHeader.tsx`.

### 4.2 Operational Summary Band
A 4-tile horizontal status row that sits below the page header, showing
each module's live state (`Healthy` / `Active` / `Standby` / `Sync Ready`).
Reference: `app/dashboard/[guildId]/page.tsx` lines 31–49 in the redesign.

```tsx
<div className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-sidebar p-1 rounded-2xl border border-panel">
  {bands.map((item) => (
    <div className="p-4 bg-canvas/30 rounded-xl border border-transparent hover:border-panel transition-all flex items-center gap-4 group">
      <div className="p-2 bg-elevated border border-panel rounded-lg group-hover:bg-highlight transition-colors">
        <item.icon className={cn("w-4 h-4", item.color)} />
      </div>
      <div>
        <p className="text-[10px] font-mono text-text-muted uppercase tracking-widest leading-none">{item.label}</p>
        <p className={cn("text-xs font-bold mt-1 leading-none", item.color)}>{item.status}</p>
      </div>
    </div>
  ))}
</div>
```

Add as a `statusBand?: BandItem[]` prop on `SectionHeader` **and wire it to
real data**, not mocks: pull module health from `useGuildStore`,
`useModerationStats`, `useMusicPlayer` (`isConnected`), and integration
status hooks.

### 4.3 Live status ping
Replace the current `<ConnectionBadge>` icon-based indicator on the Music
page with the redesign's pinging dot:

```tsx
<span className="text-xs font-bold text-brand-accent flex items-center gap-1.5">
  <span className="w-1.5 h-1.5 rounded-full bg-brand-accent animate-ping" />
  {voiceChannelName ?? 'Standby'}
</span>
```

### 4.4 Top operational bar (`<Layout>` header)
Add an "Access Level" chip showing the user's RBAC tier ("Full Admin",
"Manage", "View Only") and a right-aligned global status indicator. Wire
the access tier to `memberContext.canManageRbac` and the highest mode in
`memberContext.effectiveAccess`.

### 4.5 Page-enter animation
Add `animate-in fade-in duration-700 slide-in-from-bottom-4` to every page
wrapper. Respect `useReducedMotion()` — fall back to no animation when the
user prefers reduced motion.

### 4.6 Control strip
Standard pattern for search + filter rows:
```tsx
<div className="flex flex-col md:flex-row items-center gap-4 bg-sidebar p-2 rounded-2xl border border-panel">
  ...
</div>
```

### 4.7 Radius
Use `rounded-2xl` for top-level page panels (current uses `rounded-lg`).
Keep `rounded-xl` for inner cards and `rounded-lg` for buttons/inputs.

# 5. Page port order (one PR per page)

Anchor each port against the existing test file so regression coverage
holds. **Reuse every hook and store**; only the JSX/className layer
changes.

| Order | Current page | Redesign reference | Rename to |
|---|---|---|---|
| 1 | `pages/DashboardOverview.tsx` (611 LOC, has `.test.tsx`) | `app/dashboard/[guildId]/page.tsx` | "Guild Summary" (h1) |
| 2 | `pages/Moderation.tsx` (657 LOC, has `.test.tsx`) | `app/dashboard/[guildId]/moderation/page.tsx` | "Incident Console" (h1) |
| 3 | `pages/Music.tsx` (147 LOC, has `.test.tsx`) | `app/dashboard/[guildId]/music/page.tsx` | "Music Deck" (h1) |
| 4 | `pages/AutoMod.tsx` (984 LOC) | `app/dashboard/[guildId]/automod/page.tsx` | "Automod" |
| 5 | `pages/ServerLogs.tsx` | `app/dashboard/[guildId]/logs/page.tsx` | "Server Logs" |
| 6 | `pages/CustomCommands.tsx` | `app/dashboard/[guildId]/commands/page.tsx` | "Custom Commands" |
| 7 | `pages/AutoMessages.tsx` | `app/dashboard/[guildId]/auto-messages/page.tsx` | "Auto Messages" |
| 8 | `pages/EmbedBuilder.tsx` | `app/dashboard/[guildId]/embeds/page.tsx` | "Embed Builder" |
| 9 | `pages/ReactionRoles.tsx` | `app/dashboard/[guildId]/roles/page.tsx` | "Reaction Roles" |
| 10 | `pages/Levels.tsx` | `app/dashboard/[guildId]/levels/page.tsx` | "Levels" |
| 11 | `pages/Starboard.tsx` | `app/dashboard/[guildId]/starboard/page.tsx` | "Starboard" |
| 12 | `pages/ServerSettings.tsx` | `app/dashboard/[guildId]/settings/page.tsx` | "Settings" |
| 13 | New `pages/Integrations.tsx` (collapses Twitch + LastFm + Spotify into one page with three sections) | `app/dashboard/[guildId]/integrations/page.tsx` | "Integrations" |

For each port:
1. Read the redesign source for the matching route via the GitHub repo.
2. Copy JSX + className verbatim into the production page.
3. Replace mock data arrays with the existing hook calls
   (`useModerationCases`, `useRecentTracks`, `useLevelLeaderboard`,
   `useStarboardTop`, `useMusicPlayer`, etc.).
4. Apply the new header pattern (`SectionHeader` with `eyebrowIcon` +
   `statusBand`) and the page-enter animation wrapper.
5. Keep the existing `RouteModuleGuard` RBAC behavior intact (look at
   `src/App.tsx` for the wrapping pattern).
6. Run `npm run test --workspace=packages/frontend -- pages/<Name>.test.tsx`
   and update only assertions that depended on stale copy/structure.
7. Run `npm run test:e2e --workspace=packages/frontend -- <name>-page.spec.ts`.
8. Snapshot the bundle size before/after via the existing CI Bundle Size
   workflow; reject the PR if total compressed size grew > 5 KB.

# 6. Routes that stay (do not delete)

The redesign drops these — **keep them** as tabs inside their natural
parent. They have working backends, hooks, and tests.

| Current route | Demote to |
|---|---|
| `/lyrics` | Tab inside Music Deck. |
| `/music/artists` (PreferredArtists) | Tab inside Music Deck → "Taste". |
| `/guild-automation` | Tab inside `/settings` (manage-only). |
| `/features` | Tab inside `/settings` (developer-only). |
| `/config` | Fold into `/settings`. |
| `/terms-of-service`, `/privacy-policy` | Keep as-is (legal). |

Also keep:
- `/login` — Discord OAuth landing.
- `/servers` — guild picker.
- `/` (Landing) — marketing page for unauthenticated visitors.

# 7. Sidebar — port verbatim

Copy the redesign's `NAV_GROUPS` shape (`components/Sidebar.tsx` lines
30–74) into a new file `packages/frontend/src/components/Layout/nav.config.ts`
exporting a typed `navSections: NavSection[]`. Then thin
`packages/frontend/src/components/Layout/Sidebar.tsx` (currently 602 LOC)
to render from that config + the existing RBAC `canViewModule` filter.

Group renames:
- `Overview` keeps; rename "Dashboard" → **"Stats"**.
- `Moderation` → keep; rename "Mod Cases" → **"Incident Console"**, keep "Auto-Moderation"/"Server Logs".
- `Automation` → keep all four items; remove "Guild Automation" from sidebar (it lives inside `/settings`).
- `Community` → keep; rename "Level System" → **"Levels"**.
- `Media` → rename "Music Player" → **"Music Deck"**, promote "Track History" to top-level **"History"**, drop "Lyrics" + "Musical Taste" from sidebar (they're tabs inside Music Deck).
- New top-level group `Advanced` → "Integrations" + "Settings".

# 8. What success looks like

When all 13 page ports plus the token + `SectionHeader` extension land:

- `npm run lint --workspace=packages/frontend` passes with `--max-warnings 0`.
- `npm run type:check --workspace=packages/frontend` passes.
- `npm run test --workspace=packages/frontend` passes (all `pages/*.test.tsx`).
- `npm run test:e2e --workspace=packages/frontend` passes.
- `npm run build --workspace=packages/frontend` succeeds; `dist/` total
  compressed size is within +5 KB of the pre-port baseline.
- Every page has: mono uppercase eyebrow with icon + h1 + description on
  the left, action cluster on the right, optional Operational Summary
  Band, page-enter animation, `rounded-2xl` outer panels.
- No `--lucky-*` token is removed yet (cleanup is a separate PR).
- Auth, RBAC route guards, the Music SSE channel, the axios 401 redirect,
  and Discord OAuth all continue to work without modification.

# 9. What to avoid

- **Do not** introduce Next.js, Firebase, Vercel SDK, `@google/genai`, or
  any new state library.
- **Do not** delete the `branding/`, `tests/`, `services/`, `stores/`, or
  `hooks/` directories.
- **Do not** replace `framer-motion` with `motion` — it's the same library
  renamed; the Vite app's `framer-motion@12.38.0` is current.
- **Do not** ship mock data. Every list/stat in the redesign is mocked;
  every list/stat in the port must come from the existing hooks.
- **Do not** glow, shimmer, float, or pulse-glow anything outside the
  Landing page. Allowed animations: `fade-up`, `fade-in`, `accordion-up/
  down`, `count-up`, `animate-spin`, `animate-ping` (only on live status
  dots), `animate-in fade-in slide-in-from-bottom-4` (page enter).
- **Do not** remove `useReducedMotion()` checks from any motion-bearing
  component.

# 10. Deliverables

Open one PR per stage:

1. **`feat(frontend): add redesign token aliases + brand guide update`** —
   §3 above. No JSX changes.
2. **`feat(frontend): SectionHeader status band + mono eyebrow`** —
   §4.1, §4.2 + tests.
3. **`feat(frontend): Layout top bar with Access Level chip + global status`** —
   §4.4.
4. **`feat(frontend): port DashboardOverview to Guild Summary layout`** —
   §5 row 1.
5. ...one PR per row 2–13 in §5.
6. **`feat(frontend): consolidate twitch/lastfm/spotify into /integrations`** —
   §5 row 13 + legacy redirects.
7. **`refactor(frontend): extract Sidebar nav.config.ts`** — §7.
8. **`chore(frontend): drop --lucky-* token aliases after port`** — only
   after PRs 4–13 land.

Stop and ask if any of: (a) the port-target decision is rejected (i.e. the
team actually wants Next.js), (b) a hook/API doesn't exist for a panel the
redesign shows, or (c) the bundle-size budget would be blown.

--- END PROMPT ---

## Notes for the operator (you, not Lovable)

- This file is the prompt **and** the rationale. The text above the
  `--- BEGIN PROMPT ---` line is for you; everything below it is for
  Lovable.
- The architectural decision (port vs migrate) is documented in
  `.claude/plans/backlog-redesign-2026-04-21.md` §A-R1 with full evidence;
  the prompt summarizes it.
- If Lovable proposes Next.js anyway, point it back at the auth + RBAC +
  SSE + Playwright surface that would have to be rebuilt. If after that it
  still wants Next, that's a real product decision worth taking — but it's
  L+ effort across multiple weeks.
- Re-run this prompt against new redesign iterations by updating §3 (token
  map) and §5 (page table) only.
