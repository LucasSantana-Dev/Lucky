# Lucky Frontend — AI Studio UI/UX Context Pack

**Last updated:** 2026-04-21
**Target audience:** Google AI Studio (and any other design-assist tool) redesigning Lucky's dashboard.
**Source app:** [ai.studio/apps/0f0759d7-549d-4ad6-8148-e8e6e7ef3cb5](https://ai.studio/apps/0f0759d7-549d-4ad6-8148-e8e6e7ef3cb5)

This document is a single-file, self-contained snapshot of everything a UI/UX assistant needs to propose improvements without reading the full codebase. It captures the stack, design tokens, routing, page inventory, component library, data shapes, and the interaction / motion / accessibility rules already in play.

> ⚠️ There is an older `docs/FRONTEND.md` (~48 KB) in this repo. It documents an earlier React 18 / Tailwind 3 / Shadcn-only stack and is now partly stale. Treat **this file** as the source of truth for the current UI.

## 0. Redesign brief

Lucky should feel like a **Discord guild operations console**, not a generic SaaS admin
template. The dashboard is used by people who are actively running communities: checking
moderation state, configuring automation, controlling music, and keeping Discord servers healthy.

### Product promise

Lucky gives Discord admins one calm, high-signal place to understand and control their server.
The interface should communicate:

- Which guild is active.
- Whether the bot is ready.
- What needs attention.
- What the admin can safely do next.

### Design thesis

Use **editorial hierarchy on top of operational structure**:

- Strong page framing and one clear primary job per route.
- Dense, sharp control surfaces instead of decorative card grids.
- Task-based panels, case streams, side rails, and local navigation.
- Brand color as a system signal, not background decoration.
- Status, severity, timestamps, IDs, and live connection state treated as operational data.

### Non-goals

- Do not redesign Lucky into a generic analytics dashboard.
- Do not add decorative motion, glow, glass, radial backgrounds, or novelty effects to admin pages.
- Do not introduce paid-tier UI. Lucky is free-forever and has no premium product tier.
- Do not add new dependencies for visual polish unless the existing stack cannot reasonably do it.
- Do not hide RBAC or read-only state. Permission boundaries are part of the product.

### Recommended AI Studio output format

When asking AI Studio to redesign a page, request output in this order:

1. **Intent** — the page's primary job in one sentence.
2. **Layout** — desktop and mobile structure.
3. **States** — loading, empty, error, read-only, no guild selected, no bot installed.
4. **Components** — existing primitives to reuse and any new primitives needed.
5. **Copy** — concrete labels, headings, and status text.
6. **Implementation notes** — files to edit, tokens to use, and tests to update.

---

## 1. What Lucky is (product framing)

Lucky is an all-in-one Discord bot with a companion **web dashboard** at `lucky.lucassantana.tech`. The dashboard is how server admins configure the bot rather than using slash commands.

Three personas use the UI:

| Persona | Landing route | Primary loop |
|---|---|---|
| **Visitor** (unauthenticated) | `/` (marketing landing) → `/login` | Learn what Lucky does, click "Add to Discord" (OAuth2 bot invite) or "Login with Discord". |
| **Server admin** (authenticated, `manage` access) | `/` (dashboard) | Pick a guild, tune modules, read cases, control music, manage RBAC. |
| **Server member** (authenticated, `view` access) | `/` (dashboard in read-only) | Browse moderation, leaderboard, track history — forbidden from write endpoints. |
| **Developer** (`isDeveloper = true`) | All of the above + `/features` global toggles | Flip platform-wide feature flags. |

Free-forever, no premium tier. Self-hosting is not supported; dashboard is a SPA served from nginx.

---

## 2. Tech stack (authoritative, from `package.json`)

**Runtime**
- React **19.0.0** + React DOM 19
- TypeScript **6.0.3**
- Vite **8.0.9** (dev server + Rollup build)

**Routing & data**
- `react-router-dom` **7.14.0** (v7 data router, but currently used in classic `<Routes>` mode)
- `@tanstack/react-query` **5.96.2** (server state, configured with 5 min staleTime / 10 min gcTime / 1 retry — see `src/main.tsx`)
- `axios` **1.15.0** (REST client with `withCredentials: true`, 10 s timeout, 401 → auto-redirect to `/api/auth/discord`)
- `zustand` **5.0.12** with `persist` middleware for auth (`lucky-auth` localStorage key)

**UI**
- Tailwind CSS **4.1.18** via `@tailwindcss/postcss` (uses Tailwind v4's `@theme` / `@utility` directives in CSS — no JS config)
- `tailwindcss-animate`
- Radix UI primitives: `react-dialog`, `react-select`, `react-dropdown-menu`, `react-tabs`, `react-toast`, `react-tooltip`, `react-switch`, `react-checkbox`, `react-scroll-area`, `react-slot`, `react-avatar`, `react-label`
- `framer-motion` **12.38.0** (respects `useReducedMotion` everywhere)
- `lucide-react` icons
- `sonner` toasts
- `class-variance-authority`, `clsx`, `tailwind-merge` (standard shadcn-style `cn()` helper)

**Forms**
- `react-hook-form` **7.72.1** + `@hookform/resolvers`
- `zod` **4.3.6**

**Testing**
- Vitest **4.0.18** (unit + component, jsdom)
- Playwright **1.59.1** (e2e in `tests/e2e/`)
- Testing Library (`@testing-library/react` 16)

**Build output**
- Target: `packages/frontend/dist` → shipped via `Dockerfile.frontend` into `nginx:alpine` at `/usr/share/nginx/html`
- Manual chunk split: `vendor-react`, `vendor-radix`, `vendor-state`, `vendor-ui`, `vendor-forms`
- Dev proxy: `/api` → `http://localhost:3000` (Express backend)

---

## 3. Directory map

```
packages/frontend/
├── index.html                     # Minimal HTML shell (OG + JSON-LD SoftwareApplication schema)
├── vite.config.ts                 # Aliases @ → src, chunk splits, test config
├── tsconfig.json
├── postcss.config.js              # @tailwindcss/postcss only
├── components.json                # shadcn config (style: new-york, baseColor: slate)
├── public/
│   ├── favicon.png, favicon.svg
│   └── lucky-logo.png             # 32×32 min in sidebar, 48×48 in login
├── branding/
│   ├── BRANDING_GUIDE.md          # Brand rules (SEE §5)
│   └── DESIGN_SYSTEM.md           # Token reference (SEE §4)
├── tests/e2e/                     # Playwright specs, one per page
└── src/
    ├── main.tsx                   # React root: StrictMode → ErrorBoundary → QueryClientProvider → BrowserRouter → App + Toaster
    ├── App.tsx                    # Auth gate + route module guard (RBAC)
    ├── index.css                  # Tailwind v4 theme, tokens, type utilities
    ├── components/
    │   ├── ui/                    # Reusable primitives (SEE §8)
    │   ├── Layout/                # Sidebar, Layout, GuildSwitcher
    │   ├── Dashboard/             # ServerCard, ServerGrid, AddBotButton
    │   ├── Features/              # Global/Server toggle sections
    │   ├── Config/                # Moderation/Music/Commands config blocks
    │   ├── Music/                 # NowPlaying, PlaybackControls, QueueList, SearchBar, AutoplayGenres, ImportPlaylist
    │   ├── ErrorBoundary.tsx
    │   └── ProfileModal.tsx
    ├── pages/                     # 1 file per route + .test.tsx (SEE §7)
    ├── hooks/                     # use* hooks wrapping React Query + stores
    ├── stores/                    # Zustand: authStore, guildStore, featuresStore
    ├── services/                  # Axios client + per-domain API modules
    ├── lib/                       # rbac.ts, utils.ts (cn)
    ├── types/                     # Shared TS domain types (SEE §9)
    └── utils/
```

---

## 4. Design tokens — the complete palette

All tokens are declared in `src/index.css` using Tailwind v4's `@theme` block. CSS variables are derived in `:root` / `.dark` (the app is **always dark** — `<div className='dark'>` wraps everything). The `BRANDING_GUIDE.md` says "single accent Discord Blurple," but `index.css` ships **two** accent families because the neon refresh is mid-rollout. Both are live at runtime; see §5 for the intended end state.

### Surfaces (dark, darkest → lightest)
| Token | Hex | Role |
|---|---|---|
| `--lucky-surface-canvas` / `--lucky-bg-primary` | `#0f1117` | Page background |
| `--lucky-surface-sidebar` / `--lucky-bg-secondary` | `#161b22` | Sidebar, cards |
| `--lucky-surface-panel` / `--lucky-bg-tertiary` | `#1c2129` | Content panels inside cards |
| `--lucky-surface-elevated` | `#222831` | Modals, popovers |
| `--lucky-surface-highlight` / `--lucky-bg-active` | `#2a3140` | Active nav item, selected row |

### Borders
| Token | Hex |
|---|---|
| `--lucky-border-soft` / `--lucky-border` | `#2d333b` (default) |
| `--lucky-border-strong` | `#444c56` (hover/active upgrade) |

### Text
| Token | Hex | Role |
|---|---|---|
| `--lucky-text-strong` / `--lucky-text-primary` | `#e6edf3` | Headings, CTAs |
| `--lucky-text-body` / `--lucky-text-secondary` | `#adbac7` | Body |
| `--lucky-text-muted` / `--lucky-text-tertiary` | `#768390` | Secondary labels |
| `--lucky-text-subtle` / `--lucky-text-disabled` | `#545d68` | Meta, disabled |

### Brand / accent (⚠ dual palette, see §5)
| Token | Current value | Intent |
|---|---|---|
| `--lucky-brand` | `#5865f2` (blurple) in `:root`; `@theme` overrides to `#ec4899` (neon pink) | Primary CTA, active state |
| `--lucky-brand-strong` | `#4752c4` / `#db2777` | Hover |
| `--lucky-accent` | `#5865f2` / `#fb923c` (neon orange) | Secondary accent |
| `--color-lucky-neon-pink` | `#ec4899` | Landing page hero gradient |
| `--color-lucky-neon-orange` | `#fb923c` | Landing page hero gradient end |
| `--color-lucky-neon-purple` | `#8b5cf6` | Landing page glow backdrops |
| `--color-lucky-blurple-600` | `#5865f2` | Dashboard legacy accent |

### Status colors
| Token | Hex |
|---|---|
| `--lucky-success` | `#23a55a` |
| `--lucky-error` | `#f23f42` |
| `--lucky-warning` | `#f0b232` |
| `--lucky-info` | `#00aafc` |

### Typography
| Family | Value | Used for |
|---|---|---|
| `--font-lucky-display` | `Sora` → Segoe UI → system-ui | h1–h4, display text |
| `--font-lucky-body` / `--font-sans` | `Manrope` → Segoe UI → system-ui | Body text (default `body` font) |
| `--font-lucky-mono` / `--font-mono` | `JetBrains Mono` | Code, IDs, case numbers |

Fonts are loaded from Google Fonts via `@import url(...)` at the top of `index.css` (**Inter + JetBrains Mono + Sora + Manrope** — note `BRANDING_GUIDE.md` says "Inter only, no Sora, no Manrope" but the CSS still imports and uses all four).

### Type scale (`@utility` classes)
| Class | Size | Weight | Usage |
|---|---|---|---|
| `type-display` | clamp(2rem, 3.5vw, 3rem) | 700 | Landing hero |
| `type-h1` | clamp(1.6rem, 2.5vw, 2.25rem) | 700 | Page headings |
| `type-h2` | clamp(1.25rem, 2vw, 1.75rem) | 600 | Section headings |
| `type-title` | 1rem | 600 | Card titles |
| `type-body-lg` | 1rem | 400 | Lead paragraph |
| `type-body` | 0.9375rem | 400 | Default body |
| `type-body-sm` | 0.875rem | 400 | Secondary body, nav labels |
| `type-meta` | 0.6875rem | 600, uppercase, 0.07em tracking | Eyebrows, section labels |

### Surface utilities
| Class | Effect |
|---|---|
| `surface-panel` | Border `--lucky-border`, radius `lg`, bg `--lucky-bg-secondary`, soft shadow, hover → `--lucky-border-strong` |
| `surface-card` | Same shape, bg `--lucky-bg-tertiary` |
| `surface-elevated` | Strong border, bg `--lucky-surface-elevated`, larger panel shadow |
| `surface-glass` | Alias for `surface-panel` (glassmorphism was removed) |

### Shadows
| Token | Value |
|---|---|
| `--lucky-shadow-soft` | `0 4px 16px rgb(0 0 0 / 0.3)` |
| `--lucky-shadow-panel` | `0 8px 32px rgb(0 0 0 / 0.4)` |
| `--lucky-shadow-focus` | `0 0 0 3px rgb(88 101 242 / 0.4)` (used by `.lucky-focus-visible:focus-visible`) |

### Motion tokens
| Token | Value |
|---|---|
| `--lucky-motion-fast` | 120 ms |
| `--lucky-motion-standard` | 180 ms |
| `--lucky-motion-slow` | 280 ms |

### Allowed animations (keyframes in `index.css`)
| Name | Duration |
|---|---|
| `fade-up` | 0.25 s ease-out |
| `fade-in` | 0.2 s ease-out |
| `accordion-down` / `accordion-up` | 0.2 s ease-out |
| `count-up` | used by `useCountUp` hook |
| `animate-spin` | loaders only |

Explicitly **removed / disallowed**: `glow-pulse`, `float`, `shimmer`, `pulse-glow`. All components use framer-motion's `useReducedMotion()` and fall back to `{opacity: 0 → 1}` (or no animation) when the user prefers reduced motion.

### Gradients (landing page only)
| Name | Value |
|---|---|
| `--lucky-gradient-brand` | `linear-gradient(135deg, #ec4899 0%, #fb923c 100%)` |
| `--lucky-gradient-brand-soft` | Same gradient at 0.15 / 0.05 opacity |

Used in landing hero CTA and stat-strip numbers. Dashboard pages must stay flat.

---

## 5. Brand rules (from `branding/BRANDING_GUIDE.md`)

**Conflict alert for AI Studio:** The brand guide and the live CSS disagree. Treat the brand guide as the *target state*; `index.css` currently ships a hybrid because the neon refresh hasn't fully landed. When redesigning:

- **Keep** the dark surface palette (canvas `#0f1117` → sidebar `#161b22` → panel `#1c2129`).
- **Accent:** the dashboard should move to a **single accent** (either Discord blurple `#5865f2` for a professional look à la Dyno/Carl-bot, or neon pink `#ec4899` if the product goal is vibes-forward). The landing page already uses neon pink → orange gradient — pick one for internal pages and commit.
- **Fonts:** brand guide says Inter-only; live CSS uses Sora + Manrope + JetBrains Mono. If you consolidate, Inter is the safer pick for admin UI.
- **No** glassmorphism, radial page backgrounds, glow/shimmer/float animations, colored drop-shadows, or decorative Sparkles icons on dashboard pages. Landing page is the **only** place where neon blobs + gradient headlines live.
- Panel spacing: `p-4` or `p-5`. Content width: centered, `max-w-[1400px]`.
- Borders upgrade from `border-soft` to `border-strong` on hover — don't use color on hover.
- Active nav item: blurple-or-pink **3 px left accent bar** + `surface-highlight` background.
- Focus ring: 3 px, 40 % brand color, via `.lucky-focus-visible`.

---

## 6. Routing & auth

Routing lives entirely in `src/App.tsx`. Everything is wrapped in `<div className='dark'>` — light mode does not exist.

### Three states
1. **Legal paths** (`/terms`, `/terms-of-service`, `/privacy`, `/privacy-policy`) — rendered standalone, no auth required.
2. **Unauthenticated** — only `/` (Landing) and `/login` are accessible, everything else redirects to `/`.
3. **Authenticated** — `<Layout>` wraps all routes; unknown paths redirect to `/`.

### Route inventory (authenticated)
| Path | Page component | RBAC module | Mode |
|---|---|---|---|
| `/` | DashboardOverview | overview | view |
| `/servers` | ServersPage | — (always visible) | — |
| `/features` | Features | automation | view |
| `/config` | Config | settings | view |
| `/settings` | ServerSettings | settings | view |
| `/moderation` | Moderation | moderation | view |
| `/automod` | AutoMod | moderation | view |
| `/logs` | ServerLogs | moderation | view |
| `/commands` | CustomCommands | automation | view |
| `/automessages` | AutoMessages | automation | view |
| `/embed-builder` | EmbedBuilder | automation | view |
| `/reaction-roles` | ReactionRoles | automation | view |
| `/guild-automation` | GuildAutomation | settings | **manage** |
| `/levels` | Levels | settings | view |
| `/starboard` | Starboard | settings | view |
| `/music` | Music | music | view |
| `/music/history` | TrackHistory | music | view |
| `/music/artists` | PreferredArtists | music | view |
| `/lyrics` | Lyrics | music | view |
| `/twitch` | TwitchNotifications | integrations | view |
| `/lastfm` | LastFm | integrations | view |
| `/spotify` | Spotify | integrations | view |

All routes are **lazy-loaded** (`lazy(() => import(...))`) and wrapped in `<Suspense fallback={<PageLoader />}>`.

### RBAC guard
`RouteModuleGuard` (in `App.tsx`) checks `memberContext.effectiveAccess[module]` against the route's required `AccessMode`. On fail, it swaps the page for a `<ForbiddenModulePage>` (an `EmptyState` with shield icon). While `memberContextLoading`, it shows `<PageLoader />`.

### Auth flow
- `useAuthStore.checkAuth()` fires on first render of `<App>` and hits `GET /api/auth/status`.
- Login is a redirect to `GET /api/auth/discord` (Discord OAuth2) — handled by the backend.
- 401 from any API call → global interceptor redirects to `/api/auth/discord`.
- Logout → `GET /api/auth/logout`, then clears store.
- Auth store persists `user`, `isAuthenticated`, `isDeveloper` to `localStorage` under key `lucky-auth`.

---

## 7. Page inventory (every route, with UI intent)

### 7.1 Landing (`/`, unauthenticated)
**File:** `src/pages/Landing.tsx` (420 lines)

A marketing page — **the only place** that uses the neon aesthetic. Structure:

1. **HeroSection** — min-h-screen, `bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950` with two animated `blur-3xl` pulse blobs (pink + orange). Logo scales 1→1.03→1 on loop. Headline: "All-in-one Discord bot / **for your community**" (gradient clip-text). Two CTAs: "Add to Discord" (gradient button → opens Discord OAuth bot invite in new tab) and "Open Dashboard" (outline → triggers `authStore.login()`).
2. **FeatureSection** — 6-card grid: Music, Auto-mod, Custom Commands, Web Dashboard, Embed Builder, Artist Preferences. Each card: gradient bg tint, colored icon orb, title, short desc. Cards lift 4 px on hover.
3. **StatsSection** — 3 tiles: Servers / Users / Status. Numbers animated via `useCountUp` fetched from `GET /api/stats/public` (`totalGuilds`, `totalUsers`, `uptimeSeconds`, `serversOnline`). Font: `font-mono`, gradient clip-text.
4. **FAQSection** — 6 smooth-accordion questions (Is Lucky free? commands? autoplay? self-host? spam? support?).
5. **FooterSection** — 3-col footer: branding, legal links (Terms, Privacy, GitHub), support blurb.

All sections respect `useReducedMotion`.

### 7.2 Login (`/login`, unauthenticated)
**File:** `src/pages/Login.tsx` (141 lines)

Two-column layout (`lg:grid-cols-[1.1fr_0.9fr]`) inside `lucky-shell`:

- **Left:** logo tile + "Manage your Discord servers" headline + 3 `StatTile`s (32+ Modules, 100+ Commands, 24/7 Uptime).
- **Right:** `surface-card` with "Sign in with Discord" heading, full-width blurple button with Discord logo SVG that triggers `login()`. Below: 3 mini feature tiles (OAuth secured, Fast setup, Live controls).
- Footer: Terms · Privacy · © 2026 Lucky.

Uses `useAuthRedirect` hook to bounce to `/` if already logged in.

### 7.3 ServersPage (`/servers`)
**File:** `src/pages/ServersPage.tsx` (170 lines)

- **Profile card** — avatar + username + "Total servers N" badge on the right.
- **SectionHeader** with eyebrow "Guild management".
- **Tab row** — Servers (active) · Premium · Settings.
- **Two `ActionPanel`s** side-by-side: "Bot Installed" (X active) + "Invite Lucky" (Y missing).
- **`ServerGrid`** → grid of `ServerCard`s, each showing avatar, name, "Bot Active" / "No Bot" badge, member count, and either **Manage** (selects guild → `/`) or **AddBotButton** (links to Discord OAuth bot invite).

### 7.4 DashboardOverview (`/`, authenticated)
**File:** `src/pages/DashboardOverview.tsx` (611 lines)

The **primary landing after login**. Layout:

1. **SectionHeader** — "Dashboard" + description `Overview of ${guild.name}`, eyebrow "Server analytics".
2. **4-up stat grid** — Total Members, Active Cases, Total Cases, Auto-Mod Actions. Each is a `StatTile` with icon tone (`brand`, `accent`, `neutral`, `warning`). Skeletons while loading.
3. **Two-thirds / one-third split:**
   - `Recent Cases` panel (2 cols) — last 8 moderation cases as `CaseRow`s (case #, user, reason, action badge with color, relative timestamp). "View all" → `/moderation`.
   - `Quick Actions` column (1 col) — list of `ActionPanel`s filtered by RBAC: Moderation Cases, Auto-Moderation, Server Logs, Custom Commands, Music Player, Levels & XP, Starboard.
4. **Recent Music** panel (conditional on `music` access) — last 5 tracks (title, author, requester, relative time). "View all" → `/music/history`.
5. **Community** section (conditional on `settings` access) — 2-col grid: Level Leaderboard (top 5 by XP) + Starboard Highlights (top 3 starred).
6. **Cases by Type** — optional 6-tile `StatTile` row when `casesByType` has data.

All sections fade-up in sequence with `delay: 0.2/0.3/0.4/0.5` (respects reduced motion).

Empty state when no guild selected: `EmptyState` with Activity icon → "Select a Server".

### 7.5 Music (`/music`)
**File:** `src/pages/Music.tsx` (147 lines)

- Header row — Music2 icon + "Music Player" + subtitle `Connected to ${voiceChannelName}` or "Not connected…" + right-aligned **ConnectionBadge** (Live ✓ / Reconnecting) showing SSE status.
- **NowPlaying** card — split layout (album art left, metadata + progress + controls right). Glow when playing. Uses `PlaybackControls` (play/pause/skip/stop/shuffle/repeat cycle) + `VolumeSlider`.
- 2-col grid — `SearchBar` (YouTube/Spotify query) + `ImportPlaylist` (paste URL).
- `AutoplayGenres` — per-guild genre picker for autoplay.
- `QueueList` — drag-to-reorder queue with remove/move/clear.
- Error banner (red) if command failed.

Keyboard shortcut: **Space** toggles play/pause (unless an input is focused).

State is driven by a **Server-Sent Events connection** (`api.music.createSSEConnection(guildId)`) with exponential backoff reconnect (1s → 30s).

Sub-routes:
- `/music/history` — TrackHistory (play history + top artists + top tracks + clear history action)
- `/music/artists` — PreferredArtists (autoplay bias editor)
- `/lyrics` — Lyrics (on-demand lookup by title + optional artist)

### 7.6 Moderation suite
- **`/moderation`** — Mod Cases table with filters, pagination, case detail modal, create-case button.
- **`/automod`** — Rules editor for spam / caps / links / invites. Toggle per rule + per-rule options (`ModerationFilterOptions`).
- **`/logs`** — Server Logs audit view with category filter (Dashboard / Warnings / Moderation / Automod / Commands).

### 7.7 Automation suite
- **`/commands`** — Custom Commands CRUD (name, response, variables, permissions).
- **`/automessages`** — Schedule recurring messages to a channel.
- **`/embed-builder`** — Visual Discord embed composer (title, description, color picker, thumbnail, fields, footer).
- **`/reaction-roles`** — Bind emoji reactions on a message to role grants.
- **`/guild-automation`** — Higher-privilege (`manage`) automation workflows.

### 7.8 Community
- **`/levels`** — XP config, level role rewards, leaderboard table.
- **`/starboard`** — Threshold + channel + emoji config, top starred list.

### 7.9 Settings
- **`/settings`** (ServerSettings) — Nickname, command prefix, manager roles, updates channel, timezone, disable-warnings toggle; also listing info (description, invite URL, categories, social links) and RBAC editor.
- **`/config`** — Composed page with `CommandsConfig`, `ModerationConfig`, `MusicConfig` blocks.
- **`/features`** — Feature toggles. Developers see `GlobalTogglesSection`; everyone sees `ServerTogglesSection` scoped to the active guild.

### 7.10 Integrations
- **`/twitch`** — Twitch live-stream notifications (lookup Twitch user → pick Discord channel → add notification).
- **`/lastfm`** — Link/unlink Last.fm account for scrobble attribution.
- **`/spotify`** — Link/unlink Spotify for autoplay source.

### 7.11 Legal
- **`/terms`** / **`/terms-of-service`** — TermsOfService (standalone layout).
- **`/privacy`** / **`/privacy-policy`** — PrivacyPolicy (standalone layout).

---

## 8. Component library

### 8.1 Layout primitives (`src/components/Layout/`)

**`Layout.tsx`** — Renders the authenticated shell:
- Left: `<Sidebar>` (fixed 256 px, collapsible to mobile drawer).
- Right: sticky header (56 px) with route-specific **title + subtitle** (mapped in `ROUTE_COPY`) and a right-aligned `GuildChip` → click opens `/servers`.
- Main: `<main>` with `max-w-[1400px]` centered container, `px-4 md:px-6 lg:px-8 py-6`.
- Subtle 1 px `lucky-header-accent-line` divider below the header.

**`Sidebar.tsx`** — 600-line component with:
- **Mobile**: hamburger button at `top-3 left-3`, drawer slides in from left via framer-motion spring (`stiffness: 300, damping: 30`).
- **Desktop**: `hidden lg:flex`, sticky 100 vh, 256 px wide, bg `--lucky-bg-secondary`.
- **GuildHeader** (top): avatar + guild name + status badge (`Ready` / `Needs setup` / `Select a server`) + Switch-server button.
- **GuildSwitcher** (below header, opens inline) — dropdown listing all guilds with selection checkmark, "Invite bot" badge for guilds without Lucky, retry on error, re-authenticate CTA for 401/403.
- **NavSections** — 6 sections: Overview, Moderation, Automation, Community, Media, Integrations. Each item is `{ path, label, icon, module, requiredMode? }` and is hidden if user lacks `view` (or `manage`) access.
- Active item: 3 px brand-colored accent bar on the left, `bg-lucky-bg-active` background, icon switches to `text-lucky-brand`.
- **UserFooter** (bottom): 28 px avatar + name + `@username` + logout icon button.

### 8.2 UI primitives (`src/components/ui/`)

| Component | Purpose | Key props |
|---|---|---|
| `Button.tsx` | Primary button | `variant: primary|secondary|accent|ghost|destructive`, `size: sm|md|lg`, `loading` (adds spinner + `aria-busy`) |
| `Card.tsx` | Flat card wrapper | `hover`, `interactive` (lifts 1 px, cursor-pointer), `glow` (brand tint border) |
| `StatTile.tsx` | Metric tile | `label`, `value`, `icon`, `delta?` (+/- trend pill), `tone: brand|accent|success|warning|neutral` |
| `SectionHeader.tsx` | Page/section heading | `title`, `description?`, `eyebrow?`, `actions?` |
| `EmptyState.tsx` | Empty/no-data placeholder | `title`, `description`, `icon?`, `action?` |
| `ActionPanel.tsx` | Row-style CTA card | `title`, `description`, `icon`, `action` node |
| `PageLoader.tsx` | Full-page spinner | no props |
| `LoadingSpinner.tsx` | Inline spinner | — |
| `Skeleton.tsx` | Shimmerless skeleton | `className` for shape |
| `Shell.tsx` | `lucky-shell` container | — |
| `Toast.tsx`, `sonner.tsx` | Toaster wrappers | — |
| `avatar.tsx` | Radix Avatar with blurred bg fallback | — |
| `badge.tsx` | Status pill | `variant` |
| `checkbox.tsx` | Radix Checkbox | — |
| `dialog.tsx` | Radix Dialog with slide+zoom anim | — |
| `dropdown-menu.tsx` | Radix Dropdown | — |
| `input.tsx` | Styled `<input>` | — |
| `label.tsx` | Radix Label | — |
| `scroll-area.tsx` | Radix ScrollArea with thin scrollbar | — |
| `select.tsx` | Radix Select | — |
| `switch.tsx` | Radix Switch | — |

All UI primitives follow the **shadcn/ui new-york** style and delegate className merging to `cn()` from `lib/utils.ts` (which is `twMerge(clsx(...))`).

### 8.3 Domain components

**`components/Dashboard/`**
- `ServerCard` — guild tile (avatar w/ ✓ badge when bot added, status badge, member count, Manage or AddBotButton).
- `ServerGrid` — responsive grid wrapper.
- `AddBotButton` — opens `https://discord.com/oauth2/authorize?client_id=962198089161134131&scope=bot applications.commands&permissions=8`.

**`components/Features/`**
- `FeatureCard` — toggle card with icon + description + Radix Switch.
- `GlobalTogglesSection` — dev-only, flat list.
- `ServerTogglesSection` — per-guild, with guild picker.

**`components/Config/`**
- `CommandsConfig`, `ModerationConfig`, `MusicConfig`, `ModerationFilterOptions`.

**`components/Music/`**
- `NowPlaying` — album-art + metadata + controls + volume. `glow` prop on `Card` when playing.
- `PlaybackControls` — play/pause/skip/stop/shuffle/repeat with `RepeatMode` cycle (off → track → queue → autoplay).
- `VolumeSlider` — horizontal slider, 0–100.
- `QueueList` — draggable queue (current framer-motion-based, no library).
- `SearchBar` — query input → `onPlay`.
- `ImportPlaylist` — URL input → `onImport`.
- `AutoplayGenres` — chip grid for genre preferences.

**`components/ErrorBoundary.tsx`** — class component, logs, shows fallback UI. (Basic — the LIBRARY_RECOMMENDATIONS.md flags it for enhancement with Sentry + retry.)

**`components/ProfileModal.tsx`** — user profile popup.

---

## 9. Data model (TypeScript types you'll see everywhere)

### 9.1 Auth
```ts
interface User {
  id: string
  username: string
  discriminator?: string
  globalName?: string | null
  avatar: string | null        // Discord avatar hash (not URL)
  email?: string
  isDeveloper?: boolean        // gates global feature toggles
}
```

### 9.2 Guild + RBAC
```ts
interface Guild {
  id: string
  name: string
  icon: string | null          // Discord icon hash
  owner: boolean
  permissions: string          // Discord perm bitfield
  features: string[]
  memberCount?: number | null
  categoryCount?, textChannelCount?, voiceChannelCount?, roleCount?: number | null
  botAdded: boolean            // bot is installed in this guild
  effectiveAccess?: EffectiveAccessMap
  canManageRbac?: boolean
}

type ModuleKey = 'overview' | 'settings' | 'moderation' | 'automation' | 'music' | 'integrations'
type AccessMode = 'view' | 'manage'
type EffectiveAccess = 'none' | 'view' | 'manage'
type EffectiveAccessMap = Record<ModuleKey, EffectiveAccess>

interface GuildMemberContext {
  guildId: string
  nickname: string | null
  username: string
  globalName: string | null
  roleIds: string[]
  effectiveAccess: EffectiveAccessMap
  canManageRbac: boolean
}

interface ServerSettings {
  nickname: string
  commandPrefix: string
  managerRoles: string[]
  updatesChannel: string
  timezone: string
  disableWarnings: boolean
}
```

Discord avatar URLs are built client-side:
- Guild icon: `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=64` (or 128 on cards)
- User avatar: `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64`

### 9.3 Music
```ts
interface TrackInfo {
  id: string
  title: string
  author: string
  url: string
  thumbnail?: string
  duration: number             // ms
  durationFormatted: string
  requestedBy?: string
  source: 'youtube' | 'spotify' | 'soundcloud' | 'unknown'
}

interface QueueState {
  guildId: string
  currentTrack: TrackInfo | null
  tracks: TrackInfo[]
  isPlaying, isPaused: boolean
  volume: number               // 0-100
  repeatMode: 'off' | 'track' | 'queue' | 'autoplay'
  shuffled: boolean
  position: number             // ms into current track
  voiceChannelId, voiceChannelName: string | null
  timestamp: number
}
```

### 9.4 Moderation
```ts
type ModerationActionType = 'warn' | 'mute' | 'kick' | 'ban' | 'unban' | 'unmute'

interface ModerationCase {
  id: string
  caseNumber: number
  guildId: string
  userId: string
  userName?, userAvatar?: string
  moderatorId: string
  moderatorName?: string
  type: ModerationActionType
  reason: string | null
  duration: number | null      // ms, for temp actions
  expiresAt: string | null     // ISO
  active, appealed: boolean
  appealReason: string | null
  createdAt, updatedAt: string // ISO
}

interface ModerationStats {
  totalCases, activeCases, recentCases: number
  casesByType: Record<ModerationActionType, number>
}
```

### 9.5 Features
```ts
type FeatureToggleName =
  | 'DOWNLOAD_VIDEO' | 'DOWNLOAD_AUDIO'
  | 'MUSIC_RECOMMENDATIONS' | 'AUTOPLAY' | 'LYRICS' | 'QUEUE_MANAGEMENT'
  | 'REACTION_ROLES' | 'ROLE_MANAGEMENT'
type FeatureToggleState = Record<FeatureToggleName, boolean>
```

---

## 10. State management

### 10.1 Zustand stores

| Store | Purpose | Key state |
|---|---|---|
| `authStore` (persisted) | Discord session | `user`, `isAuthenticated`, `isLoading`, `isDeveloper`; actions: `login()` (redirect), `logout()` (API + clear), `checkAuth()` (dedupes in-flight) |
| `guildStore` | Guild list + active selection | `guilds`, `selectedGuild`, `selectedGuildId`, `isLoading`, `hasFetchedGuilds`, `guildLoadError: {kind: 'auth'|'forbidden'|'network'|'upstream', message, status?}`, `memberContext`, `memberContextLoading`, `serverSettings` |
| `featuresStore` | Feature catalog + toggles | `features`, `globalToggles`, `serverToggles: Record<guildId, FeatureToggleState>`, `isLoading`, `loadError: {kind, message, status?, scope: 'catalog'|'global'|'server'}` |

Auto-behaviors:
- On guild select, `guildStore.fetchMemberContext(guildId)` fires automatically.
- On guild list fetch, if no guild is selected, the first guild where `botAdded === true` is auto-selected.

### 10.2 React Query

Used in **`hooks/use*Queries.ts`** for all read-heavy pages (moderation, automod, levels, starboard, logs, track history). `main.tsx` sets `staleTime: 5 min, gcTime: 10 min, retry: 1`.

Mutations are invoked directly via `api.*` modules without `useMutation` wrappers (a known simplification opportunity). Music is **not** on React Query — it uses an SSE live channel instead.

### 10.3 Hooks inventory

| Hook | Purpose |
|---|---|
| `useAuthRedirect` | Bounce to `/` if already authed (used on `/login`). |
| `useAutoModQueries` | RQ wrapper for automod rules + settings. |
| `useClipboard` | Copy-to-clipboard with toast. |
| `useCountUp` | Animated number counter for stats (Landing). |
| `useDebounce` | Input debounce. |
| `useFeatures` | Wraps `featuresStore` + error retry + derived perms. |
| `useGuildSelection` | Reads selected guild + exposes setters. |
| `useLevelQueries` | XP + leaderboard queries. |
| `useLogsQueries` | Server logs paginated query. |
| `useMobile` | `window.matchMedia('(max-width: 768px)')`. |
| `useModerationQueries` | Cases + stats. |
| `useMusicCommands` | Wraps music API with optimistic updates + rollback. |
| `useMusicPlayer` | SSE-driven queue state + `useMusicCommands`. |
| `usePageMetadata` | Sets `<title>` + `<meta description>`. |
| `useServerFilter` | Filter guild list by text. |
| `useStarboardQueries` | Top starred messages. |
| `useTrackHistoryQueries` | Recent tracks + top artists/tracks. |

---

## 11. Backend API contract (what the frontend calls)

Base URL resolved by `services/apiBase.ts`:
- `VITE_API_BASE_URL` if set
- else `/api` on `*.lucassantana.tech`
- else `${protocol}//api.luk-homeserver.com.br/api` on `*.luk-homeserver.com.br`
- else `/api`

All requests use `withCredentials: true` (cookie session). 401 → full-page redirect to `/api/auth/discord`. Errors become `ApiError(status, message, details?)` instances thrown from the interceptor.

### Endpoint surface (see `src/services/api.ts`)

**Stats (public)**
- `GET /stats/public` → `{ totalGuilds, totalUsers, uptimeSeconds, serversOnline }`

**Auth**
- `GET /auth/status` → `{ authenticated, user? }`
- `GET /auth/user` → `User`
- `GET /auth/logout`
- `GET /auth/discord` (redirect URL, not called via axios)

**Guilds**
- `GET /guilds` → list
- `GET /guilds/:id`, `GET /guilds/:id/invite`, `GET /guilds/:id/me`, `GET /guilds/:id/channels`, `GET /guilds/:id/rbac`, `PUT /guilds/:id/rbac`
- `GET/POST /guilds/:id/settings`
- `POST /guilds/:id/automation/presets/criativaria/apply`
- `GET/POST /guilds/:id/listing`

**Modules & Commands**
- `GET /guilds/:id/modules`, `GET /guilds/:id/modules/:slug`, `POST /guilds/:id/modules/:id/toggle`
- `GET/POST /guilds/:id/modules/:slug/settings`
- `GET /guilds/:id/commands`, `POST /guilds/:id/commands/:id/toggle`
- `GET/POST /guilds/:id/commands/:id/settings`

**Features**
- `GET /features`
- `GET /toggles/global`, `POST /toggles/global/:name`
- `GET /guilds/:id/features`, `POST /guilds/:id/features/:name`

**Track history**
- `GET /guilds/:id/music/history?limit&offset`
- `GET /guilds/:id/music/history/stats`
- `GET /guilds/:id/music/history/top-tracks?limit`
- `GET /guilds/:id/music/history/top-artists?limit`
- `DELETE /guilds/:id/music/history`

**Integrations**
- Twitch: `/twitch/status`, `/twitch/users?login`, `/guilds/:id/twitch/notifications` (GET/POST/DELETE)
- Last.fm: `/lastfm/status`, `/lastfm/unlink`, redirect URL `/lastfm/connect`
- Spotify: `/spotify/status`, `/spotify/unlink`, redirect URL `/spotify/connect`
- Lyrics: `/lyrics?title&artist`

**Domain APIs** (each module has its own factory in `services/`):
`autoMessages`, `embeds`, `reactionRoles`, `automation`, `levels`, `starboard`, `music`, `moderation`, `automod`, `serverLogs`, `artists`.

**Music SSE** — `api.music.createSSEConnection(guildId)` returns an `EventSource` streaming `QueueState` JSON for live playback updates.

---

## 12. Interaction, motion, accessibility

**Motion rules**
- Every animated component calls `useReducedMotion()` and degrades to `{opacity: 0 → 1}` or no animation.
- Only `fade-up`, `fade-in`, `accordion-down/up`, `count-up`, and spinner rotations are allowed.
- Page enter: stagger `delay: index * 0.05` for list rows, `duration: 0.2 – 0.3 s`.
- Mobile drawer: framer-motion spring `stiffness: 300, damping: 30`.

**Focus & keyboard**
- Global focus utility: `.lucky-focus-visible:focus-visible { outline: none; box-shadow: var(--lucky-shadow-focus); }`.
- Focus rings are 3 px, brand-colored at 40 %.
- `Space` toggles play/pause on `/music` (unless input is focused).
- Sidebar nav uses `aria-current="page"` on active link.

**Touch targets**
- All icon buttons in sidebar / dialogs are `min-h-[44px] min-w-[44px]` (iOS HIG).

**Semantics**
- Pages use `<main>`, `<header>`, `<section aria-labelledby>` patterns.
- Loading states use `aria-busy`.
- Status badges use `role="status"`.
- Modals are Radix Dialog (focus trap, esc-to-close, overlay click to close, `sr-only` close text).

**Responsive breakpoints**
- Mobile: < 768 px (mobile drawer, 1-col grids).
- Tablet: `md:` (2-col grids, sidebar still drawer).
- Desktop: `lg:` (fixed sidebar, 3-col or 4-col grids).
- Max container: `max-w-[1400px]` centered.

---

## 13. Cross-screen redesign requirements

Apply these requirements to every redesigned screen.

### 13.1 Guild context

- Authenticated pages must make the active guild visible without relying only on the sidebar.
- Guild-scoped mutations must be visually tied to the current guild.
- If no guild is selected, show a route-specific empty state with a primary action to choose a server.
- If the bot is not installed in the selected guild, show setup/invite state instead of normal controls.
- Use guild avatars, names, readiness labels, and status chips together; do not use color alone.

### 13.2 RBAC and safety

- Read-only users can browse but cannot mutate. Disabled controls need an explanation, not just opacity.
- `manage`-only routes or actions must show why access is unavailable.
- Destructive actions need a shared confirmation pattern or undo toast.
- Bulk actions must preview impact before execution.
- Save state should distinguish `saved`, `dirty`, `saving`, and `failed`.

### 13.3 Information architecture

- Organize routes by admin workflow, not implementation module:
  - Overview
  - Moderation
  - Automation
  - Community
  - Media
  - Integrations
  - Settings / Advanced
- Long pages need local section navigation on desktop and a compact jump menu on mobile.
- Dense pages should expose filters first, then results, then details.
- Avoid repeating the same profile/guild summary on every page when the shell already provides it.

### 13.4 Mobile

- Do not simply stack desktop cards. Recompose pages around the primary mobile action.
- Tables should become labeled cards or a list/detail flow below `md`.
- Sticky actions must not cover the last form field or footer content.
- Icon-only controls need accessible labels and 44 px minimum touch targets.
- Mobile drawers should feel like command panels with visible guild context.

### 13.5 Copy and states

- Admin-screen copy is operational: short, specific, action-oriented.
- Avoid vague subtitles such as "Manage your settings" when the page can say what is controlled.
- Empty states should include the next useful action.
- Error states should distinguish auth, permission, network, upstream, and validation failures when known.
- Status text should be semantic: `Ready`, `Needs setup`, `Disconnected`, `Read-only`, `Saving`, `Failed`.

### 13.6 Visual system

- Dashboard pages stay flat and structured. Landing can be expressive.
- Use borders, spacing, grouping, and type hierarchy before color or shadow.
- Use the chosen single accent for active state, primary actions, and focus; do not mix blurple,
  pink, orange, and purple on internal pages.
- Use status colors only for status: success, error, warning, info.
- Use mono type for operational metadata: IDs, timestamps, case numbers, durations, API-ish labels.

---

## 14. Page-level redesign specs

These specs convert the current inventory into actionable redesign direction.

### 14.1 App shell and sidebar

**Primary job:** keep guild context, navigation, RBAC, and user session obvious at all times.

Requirements:
- Keep the persistent guild block at the top: avatar, name, readiness, switch action.
- Make active nav selection structural: 3 px accent rail, highlighted surface, icon state, `aria-current`.
- Group nav sections by workflow and consider collapsible groups for laptop-height screens.
- Nest related music routes under Media rather than giving each equal sidebar weight.
- Add room for module state chips such as `Setup`, `Alert`, `Live`, or `Read-only`.
- Mobile drawer must include current guild, switch action, nav, and user footer in one coherent panel.

Acceptance:
- A user can identify the active guild in under 2 seconds on desktop and mobile.
- The sidebar remains usable on a 13-inch laptop without losing logout/profile access.

### 14.2 Servers page

**Primary job:** choose the guild to operate, or invite Lucky where it is missing.

Requirements:
- Reframe from card gallery to guild roster/control board.
- Replace vague `Manage` language with `Enter Guild`.
- Show bot installation state, member count, readiness, permission health, and setup needs.
- Add filters or segmented controls: `All`, `Ready`, `Needs setup`, `Missing bot`, `Attention`.
- Selecting a guild must set `selectedGuildId` before navigation.
- Preserve search/filter state in URL when practical.

Acceptance:
- Wrong-guild navigation is structurally difficult.
- Missing-bot guilds clearly route to the bot invite flow instead of dashboard pages.

### 14.3 Dashboard overview

**Primary job:** show current guild health and the next useful admin actions.

Requirements:
- Lead with a guild status header: guild identity, bot readiness, RBAC mode, and urgent blockers.
- Replace equal-weight stat cards with an operations summary band:
  - moderation activity
  - automod health
  - music/live state
  - automation/config readiness
- Keep recent cases and quick actions, but prioritize actionable items above vanity metrics.
- Use real deltas only; remove hard-coded trend values.
- Keep community/music panels conditional on RBAC access.

Acceptance:
- The first viewport answers: "Is this server healthy, and what should I inspect next?"

### 14.4 Server settings and config

**Primary job:** configure the selected guild safely without form fatigue.

Requirements:
- Split settings into job-based sections:
  - Identity
  - Command behavior
  - Notifications
  - Permissions and RBAC
  - Moderation defaults
  - Listing and discovery
  - Automation dependencies
- Add sticky section nav on desktop and jump menu on mobile.
- Show dirty/saved state at section and page level.
- Replace raw channel/role IDs with searchable selectors when endpoint data exists.
- Keep page-level save, but expose which sections changed.

Acceptance:
- A user can find a setting without scanning the whole page.
- Save failures clearly identify which section or field failed.

### 14.5 Moderation, automod, and logs

**Primary job:** inspect incidents quickly and act with confidence.

Requirements:
- Treat `/moderation` as a case console: filters, case stream/table, detail pane, create-case action.
- On mobile, replace pseudo-table collapse with labeled case cards.
- Use mono for case numbers and timestamps.
- Severity/action/status badges must include text or icon, not color only.
- Automod rules need clear rule state, trigger summary, affected action, and test/preview affordance if possible.
- Logs should distinguish source, actor, target, timestamp, and outcome.

Acceptance:
- A moderator can filter, inspect, and understand a case without opening multiple routes.

### 14.6 Automation suite

**Primary job:** build predictable server automation without raw technical friction.

Requirements:
- `/commands` should emphasize command name, response preview, permissions, enabled state, and usage.
- `/automessages` should feel like a scheduler: cadence, destination, active state, next send time.
- `/embed-builder` should become a workspace, not a cramped modal:
  - desktop: templates/actions left, editor center, live preview right
  - mobile: `Content`, `Media`, `Fields`, `Preview` tabs or sections
- `/reaction-roles` should show message binding, emoji, role, channel, and health of the source message.
- Use shared dialog and confirmation components for create/edit/delete flows.

Acceptance:
- A non-technical admin can configure automation without pasting IDs when data is available.

### 14.7 Music and media

**Primary job:** control live playback and tune music behavior for the guild.

Requirements:
- Keep `/music` as the most energetic internal page, but frame it as a media operations deck.
- Lead with connection state: live, idle, disconnected, reconnecting, no voice channel.
- Separate search/import, now playing, autoplay, and queue management into distinct zones.
- Add safety to destructive queue clears.
- Consider a persistent mini-player across authenticated routes after the core shell is stable.
- Keyboard shortcuts must never trigger while typing in inputs or textareas.

Acceptance:
- Playback state is understandable from the first viewport, even when disconnected or reconnecting.

### 14.8 Community and integrations

**Primary job:** configure engagement and external connections with clear setup state.

Requirements:
- Levels and starboard should show current config, recent outcomes, and setup gaps.
- Integrations must lead with account/connection state and next action.
- Twitch notification setup needs a searchable Twitch user flow and Discord channel selector.
- Last.fm and Spotify pages should distinguish linked account, unavailable provider state, and unlink risk.

Acceptance:
- Each integration page answers: "Connected to what, doing what, and how do I fix it?"

### 14.9 Landing and login

**Primary job:** explain Lucky, convert to Discord invite/login, and transition cleanly into the app.

Requirements:
- Landing remains the only neon/gradient-heavy area.
- Login should bridge brand into the operational dashboard: fewer abstract flourishes, more guild-control cues.
- Keep CTAs explicit: `Add to Discord`, `Open Dashboard`, `Sign in with Discord`.
- Legal links remain visible.

Acceptance:
- The jump from landing/login into dashboard feels like the same product with a calmer internal mode.

---

## 15. Implementation waves

Use this order unless a bug or production issue changes priority.

### Wave 1 — Product identity and navigation

1. Resolve brand direction: single accent for dashboard, consistent typography choice.
2. App shell/sidebar density and guild context.
3. Servers page guild roster.
4. Dashboard overview command-center layout.

### Wave 2 — Operational clarity

1. Shared page header/status rail pattern.
2. Shared section nav and dirty/saved form state.
3. Server settings/config restructure.
4. Moderation case console and mobile case cards.
5. Shared destructive confirm/undo pattern.

### Wave 3 — Workflow polish

1. Auto Messages scheduler redesign.
2. Embed Builder workspace.
3. Reaction roles and custom commands clarity.
4. Music deck polish and optional persistent mini-player.
5. Integration setup-state consistency.

### Wave 4 — Power-user affordances

1. Global command palette (`Cmd/Ctrl + K`) if it can be built without a new dependency.
2. Global guild switcher shortcut.
3. Better trend data once backend supports real comparisons.
4. Targeted empty states per module.

---

## 16. Current implementation gap map

Checked against the existing `packages/frontend/src` application on 2026-04-21. The AI Studio app
at `https://ai.studio/apps/1fd5d19a-c793-4190-a354-777d6295bfd1` redirects to Google sign-in from
this session, so this map uses the local frontend code as the current-state source of truth.

### 16.1 Already present and should be preserved

| Area | Current state |
|---|---|
| Route surface | All core routes exist: overview, servers, settings, config, moderation, automod, logs, commands, automessages, embed builder, reaction roles, guild automation, levels, starboard, music, history, artists, lyrics, Twitch, Last.fm, Spotify, legal pages. |
| Auth and RBAC | `App.tsx` lazy-loads routes and wraps authenticated routes in `RouteModuleGuard`; denied modules render a clear `Access denied` empty state. |
| Guild context | `Sidebar.tsx`, `GuildSwitcher.tsx`, and `Layout.tsx` show active guild context and allow switching. |
| Sidebar grouping | Navigation is already grouped by Overview, Moderation, Automation, Community, Media, Integrations. |
| Loading states | Most pages and components use `Skeleton`; route fallback uses `PageLoader`. |
| Shared primitives | Buttons, cards, badges, dialogs, selects, switches, empty states, stat tiles, section headers, skeletons, and toasts already exist. |
| Music live state | `/music` uses `useMusicPlayer` with SSE and shows a live/reconnecting badge. |
| Selector replacement started | Server settings and AutoMod already fetch channel/role options and use selects where data exists. |
| No-guild states | Most pages render a no-server selected state. |

### 16.2 Global missing pieces

| Gap | Current evidence | Needed spec/work |
|---|---|---|
| Single dashboard brand direction | Dashboard still mixes `lucky-red`, blurple-like values, raw red/yellow/green/blue Tailwind colors, and landing neon tokens. | Pick one dashboard accent and normalize status/action styles through tokens. |
| Typography decision | CSS and docs still allow Inter/Sora/Manrope drift. | Decide final admin typography and document exact usage. |
| Command palette | No command palette or `Cmd/Ctrl + K` route switcher found. | Add no-dependency fuzzy route/action palette, RBAC-aware. |
| Global guild switcher shortcut | Guild switching exists only in sidebar/header routes. | Add keyboard-accessible guild switcher entry point. |
| Shared confirm/undo pattern | Embed Builder has a custom delete overlay; Auto Messages, queue clear, starboard disable, rewards removal, and case deactivate execute directly. | Add reusable destructive confirmation or undo toast primitive and migrate all destructive flows. |
| Dirty/saved state | Settings pages track `saving`, but not field/section dirty state or saved timestamps. | Add section-level `dirty`, `saving`, `saved`, `failed` indicators. |
| Read-only inline affordances | Route-level RBAC exists, but page controls do not consistently explain disabled manage actions. | Make read-only state visible inside pages and controls. |
| Consistent error taxonomy | Some stores classify errors; many pages catch and clear to empty arrays. | Show auth/forbidden/network/upstream errors with retry and re-auth actions. |
| Reduced-motion consistency | Several pages use `motion` without `useReducedMotion` branches (`EmbedBuilder`, `ReactionRoles`, `Levels`, `Starboard`, parts of AutoMod/CustomCommands). | Add reduced-motion branches to every animated component. |
| Mobile table/list patterns | Some pages collapse grids, but moderation rows are still one grid row with hidden labels on mobile. | Build route-specific mobile cards/detail flows. |
| Token-only styling | Multiple inline maps use raw Tailwind status colors; Embed Preview uses inline hex borders. | Move repeated action/status colors into token-aware helpers or badge variants. |
| File-size pressure | `AutoMod.tsx` and `DashboardOverview.tsx` are large; settings/moderation are also dense. | Extract domain components before adding large redesign logic. |

### 16.3 Page-by-page missing map

| Page/area | Existing application | Missing or partial |
|---|---|---|
| App shell/sidebar | Persistent guild header, readiness badge, grouped nav, mobile drawer, user footer. | Collapsible sections for laptop-height screens; nested Media routes; module state chips (`Live`, `Setup`, `Read-only`); shortcut entry point. |
| Layout header | Sticky route title/subtitle and guild chip. | Stronger page status rail: bot installed, access mode, save state, live module state. |
| Servers page | Profile card, server count, bot-installed summary, invite summary, server grid. | Remove `Premium` tab because Lucky has no paid tier; turn grid into roster/board; add search and filters; rename `Manage` to `Enter Guild`; show readiness/permission health. |
| Dashboard overview | Stat tiles, recent cases, quick actions, recent music, leaderboard, starboard highlights. | Guild health header; operations summary band; remove hard-coded `12%` delta; prioritize blockers and next actions before generic metrics. |
| Server settings | General settings, timezone, updates channel selector, manager role selector, RBAC, mobile save bar. | Sticky section nav; section dirty state; safer mobile save bar placement; split into job-based sections; confirm high-impact baseline/policy changes. |
| Config page | Composed command/moderation/music config blocks exist. | Needs alignment with settings IA so it does not duplicate or fragment configuration. |
| Moderation | Stats, filters, paginated cases, detail dialog, deactivate action. | Desktop side detail pane; mobile labeled case cards; create-case flow surfaced; confirm/undo before deactivate; tokenized action styles. |
| AutoMod | Rich rule cards, templates, channel/role pickers, normalization guards. | Reduced-motion branches; clearer rule health/testing; dirty/saved state; tokenized rule colors; split large file into focused components. |
| Logs | Audit route exists with filters/tests. | Should be treated as an incident/audit stream with actor, target, source, outcome, and stronger time filtering. |
| Custom Commands | Search, category chips, command cards, enable/disable switches. | No create/edit workflow in dashboard; no usage/permission preview; raw category color map; no read-only affordance around toggles. |
| Auto Messages | CRUD cards, Radix dialog, schedule badges, next post badge. | Still asks for raw Channel ID; no channel selector; no delete confirmation/undo; no message preview; interval is raw seconds instead of recurrence controls. |
| Embed Builder | Template grid, custom full-screen modal, live preview side rail, fields editor, custom delete overlay. | Should become a full-page or route-level workspace; replace custom modal/confirm with shared dialog; add mobile tabs/preview mode; replace inline hex styling where possible. |
| Reaction Roles | Read-only list of configured messages and mappings. | No create/edit/delete from dashboard; raw message/channel/role IDs dominate; uses `Sparkles` in dashboard empty state despite brand rule; no health/status for source message. |
| Guild Automation | Route exists and is `manage`-guarded. | Needs explicit workflow spec and safety model; high-impact automation should preview effects. |
| Levels | Leaderboard, config, rewards, role select for rewards. | Uses emoji medals in code; raw gradient inline style; announce channel is raw ID; reward removal has no confirm; no channel selector. |
| Starboard | Top entries and config panel. | Channel is raw ID; disable has no confirm; raw emoji input; no setup health; no channel selector. |
| Music | Live/reconnecting badge, now playing, search/import, autoplay, queue, keyboard shortcut. | No persistent mini-player; queue clear is immediate; shortcut ignores inputs but not textareas/contenteditable; no idle/disconnected/no-voice state taxonomy beyond subtitle. |
| Track history | History/stats routes exist. | Clear history needs confirm/undo; should share media IA with Music. |
| Preferred artists | Autoplay bias editor exists. | Needs clearer connection to autoplay behavior and empty/setup states. |
| Lyrics | Lookup page exists. | Needs fit into Media IA and stronger result/error states. |
| Twitch | Notification route exists. | Needs channel selector, connection/setup state, and clearer notification health. |
| Last.fm / Spotify | Link/unlink pages exist. | Unlink should confirm; show linked account/provider state and failure modes consistently. |
| Features | Global/server toggles, developer-gated global section. | Binary toggle wall; no grouping, dependency explanation, preview, impact copy, or read-only state. |
| Landing/login | Landing is expressive; login has Discord OAuth CTA and feature tiles. | Tone bridge into dashboard is still loose; dashboard accent/typography decision must come first. |

### 16.4 Highest-value missing work

1. Remove paid-tier residue from `/servers` (`Premium`) and docs/spec language.
2. Create a shared destructive confirmation/undo primitive and migrate queue clear, auto-message delete,
   starboard disable, level reward remove, moderation deactivate, integration unlink, and history clear.
3. Normalize brand tokens and status/action badge styling before redesigning more pages.
4. Replace remaining raw channel/role ID inputs in Auto Messages, Starboard, Levels, Reaction Roles, and integrations.
5. Add dirty/saved state and local section navigation to Server Settings and AutoMod.
6. Redesign Servers Page and Dashboard Overview first; they define the product identity after login.
7. Split `AutoMod.tsx`, `DashboardOverview.tsx`, and `ServerSettings.tsx` before deeper UI changes.
8. Add reduced-motion branches to all remaining animated pages.
9. Build mobile-specific moderation cards and Embed Builder mobile tabs.
10. Add command palette and global guild switcher after shell/navigation is stable.

---

## 17. `Lucky-redesign` repo comparison

Compared against `https://github.com/LucasSantana-Dev/Lucky-redesign` on 2026-04-21.
The deployed AI Studio Cloud Run URL
`https://ais-dev-vtphsgs2i4bebul2s4frkt-215587888371.us-east5.run.app/` is not publicly
inspectable from this session: browser access redirects to Google sign-in through AI Studio's
applet auth bridge, and `curl -I` returns `HTTP/2 302` to `__cookie_check.html`. Treat the GitHub
repo as the inspectable source for this prototype unless an authenticated export or screenshots are
provided.

### 17.1 What the redesign repo is

`Lucky-redesign` is an AI Studio / Next.js prototype, not a production implementation.

| Dimension | `Lucky-redesign` | Production frontend package |
|---|---|---|
| Framework | Next.js 15 App Router | React 19 + Vite 8 SPA |
| Data | Static mock arrays (`MOCK_SERVERS`, `CASES`, `STATS`, etc.) | Axios services + React Query + Zustand + SSE |
| Auth | None | Discord OAuth, persisted auth store, 401 redirect |
| RBAC | None | Route-level `RouteModuleGuard` + effective access map |
| UI primitives | Mostly raw HTML/Tailwind classes | Radix/shadcn-style primitives and domain components |
| Tests | None present | Vitest + Playwright + Testing Library |
| Deployment shape | Next applet | Static SPA built into nginx |
| Purpose | Visual direction and layout exploration | Functional dashboard connected to backend APIs |

Do **not** port the Next.js app wholesale. Use it as a visual reference and transplant selected
patterns into `packages/frontend`.

### 17.2 Route coverage comparison

| Product area | `Lucky-redesign` route | Production route(s) | Status |
|---|---|---|---|
| Landing | `/` | `/` unauthenticated landing | Prototype has stronger operational brand voice, but includes false pricing/premium copy. |
| Server picker | `/dashboard` | `/servers` | Prototype has better roster direction; production has real guild data and invite flow. |
| Guild overview | `/dashboard/[guildId]` | `/` authenticated | Prototype has stronger command-center layout; production has real moderation/music/community data. |
| Moderation | `/dashboard/[guildId]/moderation` | `/moderation` | Prototype has useful side detail pane; production has real filters, pagination, dialog, deactivate API. |
| AutoMod | `/dashboard/[guildId]/automod` | `/automod` | Prototype is visual only; production has real settings, templates, channel/role selectors. |
| Logs | `/dashboard/[guildId]/logs` | `/logs` | Prototype has good audit-console framing; production has backend query hooks. |
| Commands | `/dashboard/[guildId]/commands` | `/commands` | Prototype adds analytics/use-count ideas; production has real command toggles. |
| Auto Messages | `/dashboard/[guildId]/auto-messages` | `/automessages` | Prototype has scheduler feel; production has CRUD but still raw channel ID. |
| Embed Builder | `/dashboard/[guildId]/embeds` | `/embed-builder` | Prototype correctly models a full workspace; production still uses custom modal flow. |
| Reaction Roles | `/dashboard/[guildId]/roles` | `/reaction-roles` | Prototype has dashboard create/manage direction; production is read-only list from Discord command output. |
| Levels | `/dashboard/[guildId]/levels` | `/levels` | Prototype has stronger layout; production has real config/rewards/leaderboard APIs. |
| Starboard | `/dashboard/[guildId]/starboard` | `/starboard` | Prototype has better visual hierarchy; production has real config and entries. |
| Music | `/dashboard/[guildId]/music` | `/music`, `/music/history`, `/music/artists`, `/lyrics` | Prototype has a strong media deck and mini-player; production has real SSE/player behavior and more routes. |
| Integrations | `/dashboard/[guildId]/integrations` | `/twitch`, `/lastfm`, `/spotify` | Prototype consolidates integrations; production has provider-specific flows. |
| Settings | `/dashboard/[guildId]/settings` | `/settings`, `/config`, `/features` | Prototype has section nav and sticky dirty bar; production has real settings/RBAC/feature data. |
| Missing in prototype | — | `/login`, legal routes, `/features`, `/config`, `/guild-automation`, `/music/history`, `/music/artists`, `/lyrics`, provider-specific integration routes | Must stay in production app. |

### 17.3 Strong ideas to port from `Lucky-redesign`

| Idea | Source | Production target |
|---|---|---|
| Explicit guild-scoped URLs | `/dashboard/[guildId]/...` route model | Consider future URL-state migration or at least preserve selected guild in URL/query for `/servers` and deep links. |
| Guild roster language | `/dashboard` uses `Enter Guild`, `Bot Ready`, `Needs Setup`, `Not Linked` | Replace `/servers` card-gallery feel and `Manage` label. |
| Top operational bar | `app/dashboard/[guildId]/layout.tsx` shows selected guild, access level, global status | Extend `Layout.tsx` header with access mode, bot readiness, and module status. |
| Persistent music mini-player | `app/dashboard/[guildId]/layout.tsx` bottom-right mock player | Implement later using production `useMusicPlayer`, behind reduced-motion and responsive rules. |
| Operations summary band | `app/dashboard/[guildId]/page.tsx` moderation/automation/music/integrations status strip | Replace equal-weight dashboard stat-first layout. |
| Setup progress panel | `app/dashboard/[guildId]/page.tsx` right rail | Add real setup blockers and next-step CTAs to production dashboard. |
| Moderation side detail pane | `moderation/page.tsx` split case stream + details | Move production `/moderation` from row-click dialog to desktop side pane, with mobile dialog fallback. |
| Settings local nav + sticky dirty bar | `settings/page.tsx` | Add to production `ServerSettings.tsx`, but wire to real dirty state instead of always visible mock state. |
| Embed full workspace | `embeds/page.tsx` left tools, center editor, right preview | Replace production custom modal with route-level builder workspace. |
| Auto Messages scheduler framing | `auto-messages/page.tsx` cadence/next-send/health cards | Apply while preserving production CRUD/API and adding channel selector. |
| Integration status cards | `integrations/page.tsx` connection status grid | Use as overview if production keeps provider-specific detail pages. |

### 17.4 Do not port without correction

- **Stack:** do not migrate production from Vite SPA to Next.js unless there is a separate architecture decision.
- **Data model:** all mock arrays must be replaced by existing services/types/hooks.
- **Auth/RBAC:** prototype has no auth gate, no route guard, and no read-only state.
- **Premium/pricing copy:** prototype still says `Pricing`, `Premium`, and `Lucky Operations INC`; Lucky is free-forever.
- **False claims:** remove `50,000+ server owners`, `sub-millisecond latency`, `zero-lag`, `lossless`, and similar unverified marketing copy.
- **Motion:** prototype uses `animate-pulse`, `animate-bounce`, `animate-ping`, and `animate-in` without reduced-motion branches.
- **Accessibility:** prototype uses many raw buttons/inputs without shared Radix primitives, labels, or consistent focus behavior.
- **Images:** prototype uses `picsum.photos`; production must use Discord CDN avatars/icons, real thumbnails, or safe fallbacks.
- **Route gaps:** prototype sidebar links to `music/history` but the repo has no matching page.
- **Token drift:** prototype uses `brand-discord` plus `brand-accent` and neon gradient utilities; production needs one internal accent decision.

### 17.5 Practical merge strategy

1. Treat `Lucky-redesign` as visual reference only.
2. Start with production `packages/frontend` primitives and data hooks.
3. Port patterns in this order:
   - `/servers` roster language and status structure.
   - `Layout.tsx` operational bar additions.
   - `DashboardOverview.tsx` operations summary + setup progress.
   - `Moderation.tsx` side detail pane.
   - `ServerSettings.tsx` local nav + dirty bar.
   - `EmbedBuilder.tsx` full workspace.
   - Music mini-player after the shell is stable.
4. For every port, replace mock labels with typed production data from `@/types` and existing `api.*` services.
5. Add tests in the production package, not in `Lucky-redesign`.

### 17.6 MCP navigation findings

Ran the `Lucky-redesign` app locally from `/tmp/Lucky-redesign` on `http://localhost:3123` and
navigated with Playwright MCP because the deployed Cloud Run URL is AI Studio auth-gated.

Routes verified as rendering:

- `/`
- `/dashboard`
- `/dashboard/1`
- `/dashboard/1/moderation`
- `/dashboard/1/automod`
- `/dashboard/1/logs`
- `/dashboard/1/commands`
- `/dashboard/1/auto-messages`
- `/dashboard/1/embeds`
- `/dashboard/1/roles`
- `/dashboard/1/levels`
- `/dashboard/1/starboard`
- `/dashboard/1/music`
- `/dashboard/1/integrations`
- `/dashboard/1/settings`

Confirmed issues:

1. `/dashboard/1/music/history` returns Next's 404 page, but the sidebar links to it as `History`.
   Either add the page or remove/fix the nav item before using the prototype as a route reference.
2. `/dashboard/1/auto-messages` logs a React hydration error from invalid HTML nesting:
   a `<div>` is rendered inside a `<p>` in the next-send/status block.
3. Most routes log Next image warnings because `next/image` elements using `fill` lack `sizes`.
   The music page additionally warns that the above-the-fold image should use `priority`.
4. The landing page and footer still expose `Pricing`, `Premium`, and unverified scale/performance
   copy; remove before borrowing copy or nav labels.

---

## 18. Known UX pain points / redesign opportunities

These are the things the AI Studio redesign should prioritize fixing — drawn from code smells and the mismatch between `BRANDING_GUIDE.md` and live CSS.

1. **Brand inconsistency.** Landing is neon-pink-gradient; dashboard is blurple. Pick one system and apply it consistently. The brand guide says blurple + Inter-only, but CSS ships pink/orange/purple gradients and Sora/Manrope. Choose a single direction before redesigning pages.
2. **Typography drift.** `BRANDING_GUIDE.md` says "Inter only." `index.css` imports Inter, JetBrains Mono, Sora, **and** Manrope — with Manrope as the default body and Sora for display. Unify.
3. **Landing ↔ dashboard tonal whiplash.** Landing: big gradient, pulsing blobs, `font-mono` stat numbers. Dashboard: flat, tight typography, no gradients. A visitor going through login suddenly lands in a visually different product. Consider a transition page or tone-match one direction.
4. **Sidebar density.** 6 nav sections, up to 22 items. On smaller laptops this fills the viewport. Consider collapsible sections, nesting Music sub-items, or an icon-only collapsed state.
5. **`ServersPage` duplication of dashboard header.** Both show a user card and a guild count. When active guild is obvious from sidebar, the repeated context feels redundant.
6. **No global command palette (Cmd/Ctrl + K).** With 22 routes, a fuzzy-search palette would dramatically reduce navigation cost.
7. **`DashboardOverview` stat cards are static.** `delta` prop exists but is only passed on one tile (`stats.recentCases ? 12 : undefined` — hard-coded 12 %). Real trend deltas vs. last period would be more informative.
8. **Moderation `ACTION_COLORS` inline map** uses raw Tailwind colors (`yellow-500/15`, `red-500/15`) instead of design tokens — inconsistent with the rest of the app that uses `lucky-*` tokens.
9. **Music queue** is a vertical list only. A persistent mini-player (so you can control playback from other pages) is missing.
10. **Empty states look the same everywhere** (`<EmptyState>` with a single icon). Each module could get a targeted illustration or one-line "next step" CTA.
11. **No theme toggle.** App hard-codes `<div className='dark'>` in `App.tsx`. Dark-only is fine for a dev/admin tool, but a light option would help streamers/screenshotters.
12. **Features page is binary.** All toggles are bool flips with no grouping, no preview, no "what does this do" popover beyond the one-line description.
13. **Guild switcher is sidebar-only** (plus the header chip that routes to `/servers`). A one-key global switcher (`g` to open) would help power users.
14. **No skeleton shimmer** — `Skeleton` is a static bg. Adding a subtle shimmer improves perceived performance, but must respect reduced motion.
15. **Accessibility gaps** — color-only state on some badges (e.g., `AutoMod` rule severity) without a secondary icon.

---

## 19. File map — where to edit what

| Task | Primary file(s) |
|---|---|
| Change brand tokens | `src/index.css` (`@theme` block + `:root/.dark`) |
| Add a new page | create `src/pages/Name.tsx` → add `lazy()` import + `<Route>` in `src/App.tsx` → add nav entry in `src/components/Layout/Sidebar.tsx` → add `ROUTE_COPY` entry in `src/components/Layout/Layout.tsx` |
| Add a UI primitive | `src/components/ui/` (shadcn new-york style) |
| Add a data hook | `src/hooks/useXxxQueries.ts` (wrap RQ) |
| Change auth flow | `src/stores/authStore.ts` + `src/services/api.ts` (auth block) |
| Change sidebar nav layout | `src/components/Layout/Sidebar.tsx` (`navSections` const + render) |
| Change header copy per route | `src/components/Layout/Layout.tsx` (`ROUTE_COPY`) |
| Tune motion globally | `src/index.css` (`@keyframes` + `--lucky-motion-*`) |
| Change landing hero | `src/pages/Landing.tsx` (`HeroSection`, `FeatureSection`, `StatsSection`, `FAQSection`, `FooterSection`) |
| Redesign dashboard cards | `src/pages/DashboardOverview.tsx` + `src/components/ui/StatTile.tsx` / `ActionPanel.tsx` |

---

## 20. Rules for AI-generated changes

When proposing or generating new UI in AI Studio, follow these constraints to keep the change merge-ready:

1. **Use design tokens** — Tailwind classes like `bg-lucky-bg-secondary`, `text-lucky-text-primary`, `border-lucky-border`. Never hard-code hex unless you are extending `@theme` in `index.css`.
2. **Keep the `dark` class** — the app is dark-mode only via `<div className='dark'>` at the App root.
3. **Respect `useReducedMotion`** — every animated component must have a reduced-motion branch. See `Sidebar.tsx` for the canonical pattern.
4. **Stay inside `surface-panel` / `surface-card` / `surface-elevated`** for containers — they bake in the border + radius + shadow.
5. **Lazy-load new pages** via `lazy(() => import(...))` + `Suspense` fallback (already wired in `App.tsx`).
6. **Guard routes with RBAC** — pass the correct `module` + `requiredMode` to `RouteModuleGuard` (in `App.tsx`).
7. **Don't introduce new deps** unless unavoidable — the stack is intentionally small. Before adding, check `LIBRARY_RECOMMENDATIONS.md`.
8. **Hit `min-h-[44px]` touch targets** on mobile buttons.
9. **Provide skeletons** (`<Skeleton>`) for loading — never spinners on full-page content except route-level `<PageLoader>`.
10. **Fade-up list rows with `delay: index * 0.05`** for a consistent page-enter cadence.
11. **Type domain data from `@/types`** — don't redefine `Guild`, `User`, `TrackInfo`, `ModuleKey`, etc.
12. **Keep component files < 400 lines when possible.** `DashboardOverview.tsx` (611 lines) and `AutoMod.tsx` (984 lines) are the current offenders; new work should not grow them.
13. **No marketing language in admin screens.** Voice is direct, operational (per `BRANDING_GUIDE.md`).
14. **Emoji-free in code**; icons come from `lucide-react` only.

---

## 21. Acceptance checklist

Before considering a redesigned screen ready:

- Active guild is visible and unambiguous.
- Read-only/manage states are represented.
- Loading, empty, error, and no-guild states are designed.
- Mobile layout is intentionally composed and usable below 768 px.
- All interactive targets are keyboard reachable and 44 px minimum on touch.
- Color is not the only state indicator.
- Motion respects `useReducedMotion`.
- Text uses operational copy, not marketing filler.
- Containers use `surface-*` utilities or documented token extensions.
- New components reuse existing primitives where possible.
- Tests cover user-visible behavior, not only render existence.

---

## 22. Quick URLs

- Production dashboard: `https://lucky.lucassantana.tech`
- API base: same origin `/api` (or `api.luk-homeserver.com.br/api` on the homeserver CNAME)
- Bot invite: `https://discord.com/oauth2/authorize?client_id=962198089161134131&scope=bot applications.commands&permissions=8`
- GitHub: `https://github.com/LucasSantana-Dev/Lucky`
- Google AI Studio project: `https://ai.studio/apps/0f0759d7-549d-4ad6-8148-e8e6e7ef3cb5`

---

*This file is generated as a context pack for AI-assisted redesign. Update when the stack or design tokens materially change. For deeper historical detail, see `docs/FRONTEND.md` (React 18 era) and `docs/ARCHITECTURE.md`.*
