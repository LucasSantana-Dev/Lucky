# ADR — Monorepo test runner unification: Jest → Vitest migration

- **Date:** 2026-07-20
- **Status:** Accepted (planned)
- **Owner:** Lucas Santana
- **Related:** Issue #1634, `packages/backend/jest.config.cjs`,
  `packages/bot/jest.config.cjs`, `packages/shared/jest.config.cjs`,
  `packages/frontend/vite.config.ts`

## Context

The monorepo currently runs **two different test runners**:

| Package   | Runner       | Config                        |
|-----------|-------------|-------------------------------|
| backend   | Jest 30     | `jest.config.cjs`             |
| bot       | Jest 30     | `jest.config.cjs`             |
| shared    | Jest 30     | `jest.config.cjs`             |
| frontend  | Vitest v4   | `vite.config.ts` (`test:`)    |

This means developers must know both runners, two DI semantics, two coverage
providers, and two CLI interfaces. Onboarding friction grows with every new
package or contributor. Shared test utilities (e.g., `@lucky/shared` mocks,
Prisma test helpers) are not truly portable across the boundary — the frontend
cannot reuse Jest-specific setup files, and backend/bot packages cannot import
Vitest-specific helpers without adapter shims.

## Decision

**Migrate all packages to Vitest.** Keep Jest in place until the migration is
complete; do not run a mixed-state repo longer than necessary.

### Why Vitest over Jest

| Criterion              | Jest (current)                     | Vitest (target)                  |
|------------------------|--------------------------------------|-----------------------------------|
| ESM native             | Requires `ts-jest` + `extensionsToTreatAsEsm` | Native ESM, no transform hacks |
| Monorepo `moduleNameMapper` | Manual regex mapping per package | `resolve.alias` reuses Vite config |
| Watch mode             | Good                                 | Faster (Vite dev server reuse)    |
| Coverage               | `istanbul` or `v8`                   | `v8` (same, single provider)      |
| Mock API               | `jest.mock` / `jest.fn`              | `vi.mock` / `vi.fn` (drop-in)   |
| Snapshot format        | Jest snapshots                       | Compatible (minor path diffs)   |
| TypeScript in config   | `.cjs` configs only                  | Native `.ts` config support       |
| Ecosystem lock-in      | Meta (slow release cadence)          | Vite ecosystem (active, aligned)  |

The frontend already uses Vitest successfully; expanding to the rest of the
monorepo means one runner, one coverage report, one `expect` API, and one
mental model.

### Sequencing (lowest risk → highest)

1. **Prototype: `packages/shared`** — smallest surface area, no Discord.js
   or React dependencies, pure TypeScript logic. Validate that
   `moduleNameMapper` → `resolve.alias` migration works, coverage thresholds
   hold, and CI stays green.
2. **Backend** — HTTP API tests, Prisma integration, route fixtures. Higher
   count but deterministic (no WebSocket/gateway mocking).
3. **Bot** — Discord.js integration, player handlers, event simulations.
   Largest suite, highest risk. Defer until shared + backend prove the
   pattern.
4. **Root config cleanup** — delete `jest.config.cjs` files, remove
   `ts-jest` / `jest` dependencies, unify `test` scripts to `vitest`.

### Per-package migration checklist

- [ ] Convert `jest.config.cjs` → `vitest.config.ts` (or inline in `vite.config.ts`)
- [ ] Replace `jest.mock` → `vi.mock`, `jest.fn` → `vi.fn`, `jest.spyOn` → `vi.spyOn`
- [ ] Replace `beforeEach`/`afterEach` Jest globals → Vitest imports (or keep `globals: true` temporarily)
- [ ] Migrate `moduleNameMapper` regex → `resolve.alias` map
- [ ] Migrate `setupFilesAfterEnv` → `setupFiles` (Vitest path)
- [ ] Verify coverage thresholds match (or improve) pre-migration baseline
- [ ] Update package scripts: `test` → `vitest`, `test:coverage` → `vitest --coverage`
- [ ] Remove Jest-specific dependencies (`jest`, `ts-jest`, `@types/jest`)

### Risk mitigation

- **No test count reduction.** Migration is a mechanical transform; tests are
  NOT rewritten or deleted. If a test count drops, the transform is wrong.
- **Coverage threshold parity.** Post-migration thresholds must meet or
  exceed the pre-migration baseline for each package. A drop signals a
  coverage-provider difference (Istanbul vs v8) that must be investigated, not
  accepted.
- **CI dual-run during transition.** For each package under migration, add a
  temporary Vitest job to CI while keeping the Jest job. Once Vitest passes
  with 100% test parity, remove the Jest job. No required check is removed
  before its replacement is green.
- **Snapshot diff review.** Vitest snapshots are ~99% compatible with Jest, but
  path separators and absolute paths may differ. A one-time snapshot review
  per package is expected.

## Consequences

- **Single runner across the monorepo.** New packages default to Vitest
  without debate. Shared test utilities become truly portable.
- **ESM alignment.** The project is already ESM-first (`"type": "module"` in
  root `package.json`). Vitest removes the last CJS transform hack (`ts-jest`
  with `module: CommonJS`).
- **Contributor onboarding simplified.** One `npm test` interface, one
  `expect` API, one coverage report format.
- **Cost:** 3–4 focused PRs (one per package), each touching every spec file in
  that package. Bot package is the largest (158 files at last count) and may
  need to be split into two PRs to keep reviewable.

## Alternatives considered

- **Migrate frontend to Jest instead.** Rejected: the frontend is already on
  Vitest via Vite, and Vite is the project's bundler. Moving away from the
  bundler's native test runner adds friction, not removes it. Jest also lacks
  native ESM support without `ts-jest` workarounds that the project has already
  outgrown.
- **Keep both runners permanently.** Rejected: the fragmentation cost is
  ongoing, not one-time. Every new shared utility needs two test harnesses,
  every CI change touches two configs, and every new developer must learn both.
- **Use `vite-plugin-jest` or similar bridge.** Rejected: adds a third layer
  of abstraction rather than solving the root problem. The bridge would still
  require Jest knowledge and would likely lag behind both Jest and Vitest releases.

## References

- Issue: #1634 (finding + acceptance criteria)
- Vitest docs: <https://vitest.dev/guide/migration.html>
- Frontend config: `packages/frontend/vite.config.ts` (`test:` section)
- Bot config: `packages/bot/jest.config.cjs`
- Backend config: `packages/backend/jest.config.cjs`
- Shared config: `packages/shared/jest.config.cjs`
