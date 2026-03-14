# Dependency update plan

Phased plan for updating Lucky dependencies. Run each phase on a branch; verify
with `npm run verify` before merging.

**Plan status:** High/critical remediation is complete on `main`
(`npm audit`: `high=0`, `critical=0` as of March 14, 2026). The next
dependency cycle is moderate-only follow-up.

## Current stack summary

| Area     | Key deps                                                                                   | Notes                                                              |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Root     | @prisma/client ^7.4.2, Prisma ^7.4.2, ESLint 9, Jest 30, Prettier 3.8, TypeScript 5.9     | `npm run verify` is the canonical local validation gate            |
| Backend  | Express 5, connect-redis 9, tsx, TypeScript 5.9                                            |                                                                    |
| Bot      | discord.js 14, discord-player 7, youtubei.js 16, play-dl, Sentry 10                        | High `undici` exposure mitigated via override on `main`            |
| Frontend | Vite 7, React 19, Tailwind 4, Radix, Zod 3.25, Playwright 1.57                             | Zod 4 remains deferred because resolver compatibility is not ready |
| Shared   | @prisma/client 7.4.2, Sentry 10, ioredis, unleash-client, Zod 3.25, optional @infisical/sdk |                                                                    |

## Phase 1: Safe patch/minor and audit fixes

**Status:** Complete.

Patch/minor refreshes and Prisma CLI alignment already landed. Do not reopen
this phase unless a new advisory or runtime regression proves a gap in the
current baseline.

---

## Phase 2: Major upgrades (optional, separate PRs)

**Status:** Complete except for deferred Zod 4 migration.

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

## Phase 3: Transitive / security follow-up

**Current audit state:** 10 moderate, 0 high, 0 critical.

- **file-type / yauzl chain**: the active moderate set is centered on
  `file-type`, `yauzl`, and the related `@xhmikosr/*` archive/decompress
  transitive packages.
- **@smithy/config-resolver** (via `@infisical/sdk`) stays watch-only: do not
  force a v4 override while the dependency chain still expects AWS SDK v3.
- **undici** and **flatted** are no longer open audit findings on `main`, but
  the overrides should be revisited and removed once upstream minimums absorb
  the patched ranges.

**Actions:**

- Re-run `npm audit` and `npm run audit:high` after every dependency PR and
  before each release cut.
- Add `overrides` in root `package.json` only when a specific patch is required and safe. Do **not** override `@smithy/config-resolver` to v4+ while @infisical/sdk uses AWS SDK v3 (incompatible). Test thoroughly.
- Prefer upstream dependency bumps over long-lived overrides; remove overrides
  once patched minimums are carried by the dependency graph.
- Track moderate-only cleanup in a dedicated issue/PR cycle instead of mixing it
  into product work.

---

## Scripts and CI

- Canonical local gate: `npm run verify`
- Dependency drift check: `npm run check:outdated`
- Security gate: `npm run audit:high` (used in CI)
- Playwright lane stays separate: `npm run test:e2e`

---

## Rollback

- Each phase is on its own branch; rollback = revert or drop the branch.
- If lockfile or node_modules get inconsistent: `rm -rf node_modules packages/*/node_modules package-lock.json` then `npm install` and re-apply Phase 1 changes without major bumps.
