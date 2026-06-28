# ADR 2026-06-27 — Standardize test runner: migrate Jest tests to Vitest

**Status:** Accepted

**Deciders:** Lucas Santana

**Trigger:** config-drift-detect flagged mixed Jest/Vitest usage across packages; `sonar.check` requires consistent coverage reporting

**Related:** `decisions/2026-05-09-bot-test-suite-cleanup-strategy.md`

## Context

The Lucky monorepo has four packages with tests:

| Package  | Current runner | Test files | `jest.*` patterns                                                                                            | Status       |
| -------- | -------------- | ---------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| shared   | Jest           | ~295       | 527 `jest.fn()`, 64 `jest.mock()`, ~15 `jest.spyOn()`, ~19 `jest.useFakeTimers()`, ~3 `jest.requireActual()` | To migrate   |
| backend  | Jest           | ~390       | 0 patterns found (uses Prisma/testcontainers) — likely uses native mocks                                     | To migrate   |
| bot      | Jest           | ~202       | 2,273 `jest.fn()`, 581 `jest.mock()`, ~15 `jest.spyOn()`                                                     | To migrate   |
| frontend | Vitest ✅      | ~254       | 0 patterns — already clean                                                                                   | Already done |

**Total:** ~1,141 test files, of which ~887 are on Jest.

The initial assessment estimated ~90 Jest tests — this was off by ~10x because it did not account for `packages/shared` and `packages/bot`, and underestimated `packages/backend`.

### Why standardize

1. **Mixed-runner friction:** Developers need to remember which runner each package uses. Configs (`jest.config.cjs` vs `vitest.config.ts`), transform setup (`ts-jest` vs `esbuild`), and global APIs (`jest.fn()` vs `vi.fn()`) differ.
2. **SonarCloud consistency:** Sonar requires a single coverage reporter format. Vitest's `@vitest/coverage-v8` produces standard `lcov` Sonar consumes natively; Jest's `jest-sonar-reporter` is a separate plugin that can drift.
3. **Dependency reduction:** Removing `jest`, `ts-jest`, `@types/jest`, `jest-mock-extended`, and `@stryker-mutator/jest-runner` reduces `node_modules` weight and lockfile complexity.
4. **Speed:** Vitest's esbuild-based transform is measurably faster than `ts-jest` for the same test suite (typical 30–50% reduction).
5. **Feature parity:** Vitest covers the Jest API surface we use (`jest.fn()`, `jest.mock()`, `jest.spyOn()`, `jest.useFakeTimers()`, `test.each`, snapshot testing). The one API difference — `jest.requireActual()` → `vi.importActual()` (sync → promise) — is manageable at ~3 occurrences.

### Migration concerns identified

- **jest-mock-extended** (used in `packages/shared` and `packages/bot`) → `vitest-mock-extended`. API is identical (`mockDeep`, `mock`, `MockProxy`).
- **Stryker mutation testing** (`packages/shared/stryker.conf.json`, `packages/backend/stryker.conf.json`) uses `"testRunner": "jest"` → must switch to `@stryker-mutator/vitest-runner`.
- **discord.js mocks** (bot): extensive `jest.mock('discord.js', ...)` with manual `__mocks__` dirs. Vitest `vi.mock` handles hoisting similarly but path alias resolution (`@lucky/shared`) needs explicit `resolve.alias` in config.
- **jest.requireActual** (sync) → `vi.importActual` (async): ~3 occurrences, minor refactor needed.
- **Backend test patterns:** 390 test files with 0 `jest.*` — likely using Prisma/testcontainers with minimal mocking. Low migration risk.

## Decision

**Migrate all Jest tests to Vitest in two phases.**

### Phase 1: `packages/shared` (safe boundary)

Rationale: shared has no discord.js, no Prisma/testcontainers, uses standard Jest patterns. Lowest blast radius. Serves as proof of concept.

Steps:

1. Add `vitest` + `@vitest/coverage-v8` + `vitest-mock-extended` as devDependencies.
2. Create `vitest.config.ts` with `globals: true`.
3. Codemod `jest.fn/mock/spyOn/useFakeTimers` → `vi.fn/mock/spyOn/useFakeTimers`.
4. Codemod `jest.requireActual` → `vi.importActual` (async wrapping).
5. Replace `jest-mock-extended` → `vitest-mock-extended` imports.
6. Remove `jest`, `ts-jest`, `@types/jest`, `jest-mock-extended`.
7. Switch Stryker config from `jest-runner` to `vitest-runner`.
8. Verify: `vitest run` passes, coverage reports, Stryker works.

### Phase 2: `packages/backend` + `packages/bot` (parallel)

Rationale: Both depend on shared, so they benefit from Phase 1 proving the config pattern. Can run in parallel worktrees.

Steps (per package):

1. Same dependency swap as Phase 1.
2. Config with `globals: true` + `testTimeout` (for Prisma/testcontainers in backend).
3. Codemod jest → vi patterns.
4. For backend: ensure Prisma/testcontainers `beforeAll` / `afterAll` hooks work in Vitest's threading model. Set `pool: 'forks'` if needed.
5. For bot: handle `discord.js` mock hoisting and `@lucky/shared` path aliases in config.
6. Switch Stryker config.
7. Remove legacy configs.
8. Verify.

### Risk mitigation

- **Both runners coexist during migration** — no CI breakage. The root `package.json` scripts can be updated per-package as each phase lands. Jest configs stay until the phase is verified.
- **Fallback:** If a package's tests cannot migrate cleanly, the Jest config stays for that package and it gets documented as "still on Jest — blocked by [reason]." The ADR is then updated. This applies primarily to `packages/bot` if discord.js mock hoisting proves intractable.

## Alternatives considered

- **Standardize on Jest** — rejected: frontend already on Vite+Vitest; would require migrating frontend back to Jest, losing esbuild speed and adding `ts-jest` back.
- **Only migrate frontend (already done), leave others on Jest** — rejected: mixed-runner friction persists; SonarCloud coverage reporter inconsistency; missed dep reduction (~9 packages).
- **Gradual per-file migration** — rejected: creates a half-migrated state where developers need both `jest` and `vi` globals in mind simultaneously. Package-level phases are coarse enough for safety but clean enough for CI.
- **Do nothing** — rejected: config-drift surface grows over time; already flagged by monitoring.

## Consequences

**Positive:**

- Single test runner across all packages.
- ~9 npm dependencies removed (jest, ts-jest, @types/jest ×3, jest-mock-extended ×2, @stryker-mutator/jest-runner ×2).
- Faster test execution via esbuild transform.
- SonarCloud coverage from a single reporter.
- Config consolidation: one `vitest.config.ts` pattern per package vs `jest.config.cjs` + `ts-jest` + `babel` configs.

**Negative:**

- ~4–8 hours of codemod / config work (agent-assisted).
- Stryker configs need updating per package.
- `jest.requireActual` → `vi.importActual` introduces async changes in ~3 files.
- bot tests (~2,273 `jest.fn()` calls) will generate the largest diff.

**Neutral:**

- No test behavior change — codemod is mechanical.
- Snapshot format differences between Jest and Vitest are minimal (Vitest snapshots are compatible with Jest format).

## Revisit when

- **Phase 1 (shared) is complete and verified** — proceed to Phase 2.
- **If Phase 1 unearths an unexpected Vitest limitation** — re-scope: document the limitation in this ADR and keep Jest for affected packages.
- **Phase 2 bot migration blocked by discord.js mock hoisting** — open a tracking issue, keep bot on Jest documented, and route future bot PRs to the Jest workflow explicitly.
