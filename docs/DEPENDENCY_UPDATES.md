# Dependency update plan

Phased plan for updating LukBot dependencies. Run each phase on a branch; verify build, type-check, tests, and `npm run audit:critical` before merging.

**Plan status:** Phase 1, Phase 2 (2a–2d), and Phase 3 are complete. Ongoing: re-run `npm audit` / `audit:critical` when upstreams release fixes; retry Zod 4 when `@hookform/resolvers` supports it.

## Current stack summary

| Area     | Key deps                                                                                  | Notes                                                                |
| -------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Root     | @prisma/client ^7.2, ESLint 9, Jest 30, Prettier 3.7, TypeScript 5.9                      | Prisma CLI not in package.json (scripts use `prisma`; add as devDep) |
| Backend  | Express 5, connect-redis 9, tsx, TypeScript 5.9                                           |                                                                      |
| Bot      | discord.js 14, discord-player 7, youtubei.js 16, play-dl, Sentry 10                       | Transitive: undici, tar (audit issues)                               |
| Frontend | Vite 7, React 19, Tailwind 4, Radix, Zod 3.25, Playwright 1.57                            | Zod 4 deferred (hookform/resolvers); Node 20.19+ / 22.12+ for Vite 7 |
| Shared   | @prisma/client 7.2, Sentry 10, ioredis, unleash-client, Zod 3.25, optional @infisical/sdk |                                                                      |

## Phase 1: Safe patch/minor and audit fixes

**Goal:** Bump within semver range, add missing Prisma CLI, fix what `npm audit fix` can fix without `--force`.

1. **Branch:** `chore/deps-phase1-safe-updates`

2. **Root**
    - Add devDependency: `prisma@^7.3.0` (CLI for `db:generate`, `db:migrate`, etc.).
    - Bump `@prisma/client` to `^7.3.0`.
    - Bump: `prettier`, `globals`, `@typescript-eslint/*` to latest within range.
    - Run at repo root:
        ```bash
        npm install prisma@^7.3.0 --save-dev
        npm update
        npm audit fix
        ```
    - If `audit fix` suggests `--force`, do **not** use it in this phase (avoid breaking discord stack).

3. **Workspaces**
    - From root: `npm update` (respects each package’s semver).
    - Manually bump in package.json where “Wanted” ≠ “Current” for non-major bumps (e.g. `@prisma/client` 7.3 in shared, `express-session`, `ws`, `ioredis`, `@sentry/node`, `axios`, `react-router-dom`, `lucide-react`, `postcss`, etc.).

4. **Verification**

    ```bash
    npm run type:check
    npm run build
    npm run test:ci
    npm run audit:critical
    ```

5. **Commit:** e.g. `chore(deps): phase 1 – safe patch/minor and audit fix`.

---

## Phase 2: Major upgrades (optional, separate PRs)

Do these only after Phase 1 is merged and stable.

### 2a. Tailwind CSS v3 → v4 (frontend)

- **Ref:** [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide); Context7 `/websites/tailwindcss`.
- **Steps:**
    1. Branch: `chore/deps-tailwind-v4`.
    2. From repo root: `npx @tailwindcss/upgrade` (Node 20+). Prefer running in `packages/frontend` if the tool supports it.
    3. If not using the tool: install `tailwindcss`, `@tailwindcss/postcss` (or `@tailwindcss/vite`), remove `autoprefixer` if v4 handles it; replace `@tailwind base/components/utilities` in `packages/frontend/src/index.css` with `@import "tailwindcss"`; switch Vite to `@tailwindcss/vite` in `packages/frontend/vite.config.ts` per [Tailwind v4 Vite guide](https://tailwindcss.com/docs/upgrade-guide).
    4. Adjust any renamed/removed utilities (e.g. default `ring` width change; use `ring-3` if keeping v3 look).
    5. Re-run build and E2E; fix styles as needed.

### 2b. React 18 → 19 (frontend)

- Bump `react`, `react-dom`, `@types/react`, `@types/react-dom` to React 19.
- Check Radix, react-hook-form, and other UI libs for React 19 compatibility.
- Run frontend build and E2E.

### 2c. Zod v3 → v4 (frontend + shared) — **Deferred**

- [Zod 4 migration](https://zod.dev/v4/versioning): subpaths and API changes.
- **Deferred:** `@hookform/resolvers` (v3) expects Zod 3 schema types; with Zod 4.3.x the resolver reports `ZodObject<...>` not assignable to `Zod3Type<...>` (version check mismatch). Revisit when `@hookform/resolvers` supports Zod 4 or when using a Zod 4–compatible resolver.
- When retrying: ensure `@hookform/resolvers` and other Zod consumers support Zod 4 (peer deps); update imports/types per Zod 4 docs; run tests and type-check.

### 2d. Vite 6 → 7, other frontend majors

- **Vite 7:** [Migration from v6](https://vite.dev/guide/migration): Node 20.19+ / 22.12+ required; default `build.target` updated; Sass legacy API removed; deprecated plugins/hooks removed. Update `vite` and `@vitejs/plugin-react` to Vite 7–compatible versions; ensure CI and local use Node 20.19+ or 22.12+.
- Recharts, tailwind-merge, date-fns, framer-motion, etc.: upgrade one at a time and run tests. **Done:** tailwind-merge ^3, date-fns ^4, framer-motion ^12, recharts ^3 (typecheck and build pass).

---

## Phase 3: Transitive / security (track only; no force-downgrade)

**Known audit issues (last updated: after Phase 2d; 32 vulnerabilities: 12 low, 14 moderate, 6 high):**

- **@smithy/config-resolver** (via @infisical/sdk): Override `@smithy/config-resolver@>=4.4.0` was tried; incompatible with AWS SDK v3 chain (SDK v3 uses @smithy v3). Wait for @infisical/sdk to upgrade to an AWS SDK that pulls @smithy v4+.
- **hono** (via prisma): Prisma 7.3+ may pull fixed hono; keep Prisma updated.
- **lodash** (via chevrotain → @mrleebo/prisma-ast): Prisma/ecosystem updates may resolve; no override unless patched.
- **tar** (via @discordjs/opus, cacache): `audit fix --force` would downgrade @discordjs/opus; **do not** use. Track upstream.
- **undici** (via discord.js, youtubei.js): Same; keep discord.js and youtubei.js at latest 14.x / 16.x and track releases.

**Actions:**

- Re-run `npm audit` and `npm run audit:critical` after Phase 1 and after any major upgrade.
- Add `overrides` in root `package.json` only when a specific patch is required and safe. Do **not** override `@smithy/config-resolver` to v4+ while @infisical/sdk uses AWS SDK v3 (incompatible). Test thoroughly.
- Document remaining known high/critical in this file or in a short “Known vulnerabilities” section and update when upstream fixes land.

---

## Scripts and CI

- Use existing: `npm run check:outdated`, `npm run audit:critical`, `npm run audit:high` (CI).
- Optional: from root, `npm update && npm audit fix` in a single script if you want a one-liner for Phase 1; avoid one-off throwaway scripts.

---

## Rollback

- Each phase is on its own branch; rollback = revert or drop the branch.
- If lockfile or node_modules get inconsistent: `rm -rf node_modules packages/*/node_modules package-lock.json` then `npm install` and re-apply Phase 1 changes without major bumps.
