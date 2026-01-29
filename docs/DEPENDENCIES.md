# LukBot – Dependencies and maintenance

This document summarizes the project’s NPM dependencies: what is used where, what is reliable and non‑deprecated, and how to keep the stack maintainable without over‑engineering.

## Stack overview

| Layer        | Choices                    | Rationale |
|-------------|----------------------------|------------|
| Runtime     | Node 22+                   | LTS, ESM, current tooling |
| Monorepo    | npm workspaces             | Single lockfile, simple scripts |
| Bot         | discord.js 14, discord-player 7 | Actively maintained; player requires discord.js 14+ |
| Backend API | Express 5                  | Lightweight, no NestJS overhead |
| Database    | Prisma 7 + PostgreSQL      | Single schema, type‑safe client |
| Cache       | ioredis                    | Stable Redis client |
| Feature flags | unleash-client           | Not deprecated; optional, env fallback |
| Frontend    | Vite, React 18, Tailwind 3 | Fast dev, stable UI stack |
| Validation  | Zod 3                      | Type‑safe schemas; Zod 4 is optional upgrade |

## Package-by-package

### Root (`package.json`)

- **dependencies**: `@prisma/client` only – used by shared (workspace). `cors` lives in `packages/backend` only so root stays minimal.
- **devDependencies**: ESLint, Prettier, TypeScript tooling, Jest, `unfetch` (Jest/polyfill if needed). Keep one source of truth for lint/format/TS versions at root when possible.
- **optionalDependencies**: `@discordjs/opus` – native binding for voice; optional so install works without build tools.

### `packages/shared`

- **Core**: `@prisma/client`, `ioredis`, `zod`, `dotenv`, `uuid`, `chalk` – all current and maintained.
- **Observability**: `@sentry/node` – keep on recent patch (e.g. 10.37).
- **Feature flags**: `unleash-client` 5.x – not deprecated; 6.x is a major (check changelog before upgrading).
- **Optional**: `@infisical/sdk` – optional; no hard dependency.

### `packages/bot`

- **Discord**: `discord.js` 14, `@discordjs/builders`, `discord-player`, `discord-player-youtubei`, `youtubei.js` – all maintained; discord-player 7 is the current major.
- **Runtime**: `tsx` (dev), `tsup` (build) – bundler resolves modules; no need for `module-alias` at runtime.
- **Removed**: `module-alias` – unused in `packages/bot/src`; tsup handles resolution. Removed to avoid legacy runtime patching.
- **Optional**: `@discordjs/opus` (from root), `ffmpeg-static` – voice/encoding.

### `packages/backend`

- **Server**: `express` 5, `cors`, `express-session`, `connect-redis` – standard stack.
- **Types**: `@types/cors`, `@types/express`, `@types/express-session` in **devDependencies** (type-only); do not add them to dependencies.
- **Tests**: `jest`, `ts-jest`, `supertest`, `@types/jest`, `@types/supertest` – dev only.

### `packages/frontend`

- **Build**: Vite 6, React 18, TypeScript – current.
- **UI**: Radix UI, Tailwind 3, `tailwind-merge`, `clsx`, `class-variance-authority` – shadcn-style stack; no deprecation concerns.
- **Forms**: `react-hook-form`, `@hookform/resolvers`, Zod – standard.
- **Data**: `axios`, `zustand`, `react-router-dom` – maintained.
- **Upgrades**: Tailwind 4, React 19, Zod 4, Vite 7 are optional; plan as separate upgrades with testing.

## Reliability and deprecation

- **Discord.js 14** and **discord-player 7**: Actively maintained (2025); no change needed for “reliable” choice.
- **unleash-client**: Not deprecated; 6.x is a major version – upgrade when ready with changelog review.
- **module-alias**: Legacy; TypeScript + tsup resolve paths. Removed from bot; use `paths` in `tsconfig` + bundler.
- **Prisma 7**: Current; 7.3 is a minor – safe to adopt. Keep a single `@prisma/client` version across workspace (e.g. root or shared).
- **Zod 3**: Stable. Zod 4 has breaking changes; upgrade only when you can run full validation and type checks.

## Avoiding bloat and over-engineering

- **No duplicate type packages in dependencies**: Put `@types/*` only in devDependencies where they are used.
- **Single source for shared deps**: Prefer one version of `@prisma/client`, `zod`, `typescript` in the monorepo (root or shared) and align workspaces.
- **No redundant runtimes**: Bot uses tsup; no `module-alias` or extra path hacks.
- **Optional deps**: Keep `@infisical/sdk`, `@discordjs/opus` optional so install and CI work without optional build steps when possible.

## Upgrade order (suggested)

1. **Low risk**: Patch/minor updates – Prisma 7.2 → 7.3, Sentry 10.34 → 10.37, ioredis, ws, etc. Run tests and typecheck.
2. **Backend types**: `@types/cors`, `@types/express`, `@types/express-session` are in backend devDependencies. Root has no `cors` or `@types/cors` (backend-only).
3. **Bot cleanup**: `module-alias` removed from bot. Keep `unfetch`/`isomorphic-unfetch` in tsup `external` so a transitive dependency resolves at build time.
4. **Major upgrades**: Plan separately – e.g. unleash-client 6, Zod 4, Tailwind 4, React 19 – with docs and tests.

## Scripts and tooling

- **Build**: `npm run build` – shared → bot → backend (order matters).
- **Typecheck**: `npm run type:check` – per workspace.
- **Tests**: `npm run test` runs backend tests; add bot/frontend test scripts when needed.
- **Outdated**: `npm run check:outdated` – use for periodic review; fix in small PRs.

This doc should be updated when adding or removing major dependencies or when upgrading major versions.
