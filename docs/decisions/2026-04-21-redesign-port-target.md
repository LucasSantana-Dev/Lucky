# ADR — Lucky redesign port target

- **Date:** 2026-04-21
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Related:** `.claude/plans/backlog-redesign-2026-04-21.md`,
  `docs/LOVABLE_PROMPT.md`,
  `docs/FRONTEND_AI_STUDIO_CONTEXT.md`

## Context

A new visual redesign of the Lucky dashboard exists at:

- Repo: `github.com/LucasSantana-Dev/Lucky-redesign` (private; created 2026-04-21).
- AI Studio app: `https://ai.studio/apps/1fd5d19a-c793-4190-a354-777d6295bfd1`.

The redesign is a **Next.js 15 App Router prototype** with mocked data only:
no auth, no API client, no RBAC, no SSE, no tests. Stack: Next 15.4.9 +
React 19.2 + Tailwind v4 + `motion` + `class-variance-authority` + Firebase
Hosting tooling + `@google/genai`.

The production app at `packages/frontend/` is a **Vite 8 + React Router v7
SPA** with: Discord OAuth, RBAC `RouteModuleGuard`, Zustand stores,
TanStack Query 5, axios with 401 → `/api/auth/discord` interceptor, SSE
music channel with exponential-backoff reconnect, Radix primitives, Sonner
toasts, react-hook-form + Zod, Vitest unit + 24 Playwright e2e specs.
Hosted via nginx in Docker.

## Decision

**Port the redesign's visual language back into the existing Vite SPA,
page by page. Do not migrate to Next.js.**

Adopt the redesign repo's brand commit:

- **Dual accent:** Discord blurple `#5865f2` (primary CTA) + neon pink
  `#ec4899` (secondary).
- **Typography:** Sora display + Manrope body + JetBrains Mono mono. Drop
  the `BRANDING_GUIDE.md` "Inter only" rule.
- **Token short-form aliases** (`--color-canvas`, `--color-sidebar`,
  `--color-panel`, `--color-elevated`, `--color-highlight`,
  `--color-brand-discord`, `--color-brand-accent`,
  `--color-text-strong/body/muted/subtle`, `--shadow-soft/panel`) added
  alongside existing `--lucky-*` tokens for the duration of the migration.

## Reasoning

- The Vite SPA already implements every behavior the dashboard needs
  (OAuth, RBAC, SSE, toasts, optimistic mutations, error boundaries).
  Rebuilding those on Next would be multi-week effort across multiple PRs
  with high regression risk against the existing Playwright surface.
- The redesign repo contains **no behavior** to port — only JSX and
  Tailwind classes. Behavior-free ports are well-suited to per-page PRs
  with snapshot diffs, which is exactly the workflow the existing test
  suite supports.
- Hosting/deploy chain (nginx + Docker + Cloudflare tunnel) is already
  battle-tested. Switching to Firebase Hosting or Vercel introduces a new
  failure surface for zero product gain.
- The dual-accent + Sora/Manrope brand decision resolves the long-standing
  conflict between `BRANDING_GUIDE.md` ("Inter only, single accent") and
  the live `index.css` (which already imports four font families and ships
  both blurple and neon palettes). Adopting the redesign's commitment
  ends the indecision.

## Consequences

**Positive**
- All existing tests, hooks, stores, and API modules keep working without
  modification.
- Each page port ships as one reviewable PR with clear visual-diff scope.
- Bundle size and build chain stay stable; no platform-migration churn.
- Brand decision is now documented and committed.

**Negative / accepted trade-offs**
- The visual port is incremental — production will run a mixed-style
  dashboard while pages migrate one at a time. Acceptable because each PR
  ships an internally-consistent page.
- We carry both `--lucky-*` and short-form tokens during the migration.
  Cleanup PR is queued for after the page ports complete.
- We do not pick up the redesign's `@google/genai` dependency until a
  concrete LLM feature spec exists.

## Out of scope

- Migrating to Next.js, Firebase Hosting, or Vercel.
- Adopting `@google/genai` without a feature spec.
- Deleting `pages/PreferredArtists.tsx`, `pages/GuildAutomation.tsx`,
  `pages/Lyrics.tsx`, `pages/Features.tsx`, or `pages/Config.tsx` — these
  get demoted to tabs inside their natural parent pages instead.

## Execution plan

Per `docs/LOVABLE_PROMPT.md`:

1. Token aliases + brand guide update (one PR).
2. `<SectionHeader>` extension with `eyebrowIcon` + `statusBand` (one PR).
3. `<Layout>` top bar with Access Level chip + global status (one PR).
4. Per-page ports (one PR each, 13 pages, in priority order).
5. Sidebar `nav.config.ts` extraction.
6. `--lucky-*` cleanup pass after all page ports land.

Success criteria for each PR: lint, type-check, vitest, playwright e2e,
build all pass; total compressed bundle within +5 KB of pre-port baseline.
