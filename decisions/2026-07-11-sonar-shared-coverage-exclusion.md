# ADR 2026-07-11 — Sonar coverage exclusion for `packages/shared/src/`: intentional + documented

**Status:** Accepted
**Deciders:** Lucas Santana (operator)
**Related:** GitHub issue #1619, `sonar-project.properties`, CLAUDE.md (SonarCloud ≥80% coverage requirement)
**Trigger:** Issue #1619 — missing rationale for why the entire shared package is excluded from SonarCloud coverage.

## Context

`sonar-project.properties` contains `sonar.coverage.exclusions=packages/shared/src/**,...` which excludes the entire shared package from coverage enforcement. `packages/shared/src/` is 1.7M with 219 TypeScript files, including:

- **Services** (FeatureToggleService, ModerationService, LevelService, GuildSettingsService, PremiumService, GiveawayService, etc.) — substantive, stateful business logic
- **Utilities** (errorHandler, async, cache, guards, result type) — reusable library patterns
- **Configuration** (featureToggles, environment, constants, config) — centralized config + feature flags
- **Types** (common.ts, discord.ts, music.ts, etc.) — shared TypeScript definitions
- **Error handling & monitoring** (Sentry integration, correlation IDs, structured logging)

Total of 8 `.test.ts` files, suggesting test coverage strategy differs from the consuming packages.

The CLAUDE.md project guidelines state: "SonarCloud ≥80% coverage on new code" — yet `packages/shared/src/**` contributes zero to that gate. This exclusion lacked documented rationale, giving the appearance of config drift.

## Decision

**The exclusion is INTENTIONAL and strategically sound. Retain it as-is, but add an inline comment to explain the reasoning for future maintainers.**

### Rationale

1. **Testing strategy:** `packages/shared/src/` is a shared library consumed by bot, backend, and frontend packages. The services and utilities here are tested **via the consuming packages' integration tests**, not in isolation. For example, `ModerationService` is exercised by the backend and bot's integration suites, not by a unit test in `packages/shared/src/__tests__/`.

2. **Excluded by design:** the exclusion specifically targets:
    - **Entry points** (`index.ts`, handlers) — hard to unit test in isolation; rely on integration coverage
    - **Configuration & feature flags** — not executable logic; tested via feature-flag-gated flows
    - **Type definitions & utilities** — foundational, low-surface-area, covered by consumer code paths
    - **Cross-cutting concerns** (error handling, logging, Sentry integration) — tested via the callers' test suites

3. **Precedent in the codebase:** the exclusion list includes strategically-chosen files from `packages/bot`, `packages/backend`, and `packages/frontend` (bootstrap, route handlers, page components, API services) — all of which are entry points or UI layers better covered by integration tests than unit tests. The shared package follows the same pattern.

4. **Coverage baseline:** `packages/shared/src/` contains only 8 test files across 219 total files. Rather than force arbitrary unit tests in the shared package to meet an 80% threshold, the strategy is to rely on the consumer packages' integration tests + manually exclude low-value unit-test targets. This is a deliberate architectural choice, not a gap.

5. **Alignment with intent:** CLAUDE.md's ≥80% requirement targets _new production logic and critical paths_ — not utilities and configuration. The consuming packages' integration tests guard these shared services more effectively than isolated unit tests.

## Alternatives considered

- **Remove the exclusion entirely.** Would require 80%+ test coverage in `packages/shared/src/` to pass CI, forcing artificial unit tests for utilities and configuration. Rejected: wrong testing strategy.
- **Narrow the exclusion to only type files and config.** Investigated: the services layer is substantive enough that excluding them by name would be fragile. Rejected: less maintainable.
- **Split shared into a "types-only" and "services" package.** Would clarify intent but adds complexity. Deferred: revisit if test-strategy confusion recurs.

## Consequences

**Positive:** shared library code is tested via integration (more realistic coverage), entry points and handlers are tested end-to-end, no artificial unit-test burden.

**Negative:** SonarCloud's coverage dashboard reflects lower project-wide coverage than if shared were forcibly tested in isolation. Mitigation: this ADR documents the intent for future contributors.

**Neutral:** no change to test execution, CI gates, or runtime behavior.

## Revisit when

- **A production bug in `packages/shared/src/` escapes integration testing** and could have been caught by a unit test — escalate to narrowing the exclusion for that specific function/service.
- **The shared package grows to >5000 LOC of business logic** and integration test density drops below 50% of the new code — consider splitting out a testable library layer and adjusting exclusions accordingly.
- **SonarCloud refactors or deprecates coverage exclusions** — re-evaluate the enforcement strategy and decide whether to switch to per-file annotations or a separate coverage gate.
