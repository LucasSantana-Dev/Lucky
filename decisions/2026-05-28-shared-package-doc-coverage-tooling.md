# ADR: TSDoc Coverage Enforcement for packages/shared

**Date:** 2026-05-28
**Status:** Accepted

## Context

`packages/shared` exports utilities, services, and types consumed by `bot`, `backend`, and `frontend`. As the module surface grew, exported symbols accumulated without documentation, making the public API hard to navigate for AI-assisted and human contributors alike.

The goal was to enforce a **measurable 80% documentation coverage gate** — a genuine percentage threshold that fails CI if fewer than 80% of exported symbols carry TSDoc comments.

Two options were evaluated:

**Option A — `eslint-plugin-jsdoc`:** Per-symbol ESLint rule that flags missing `@param`, `@returns`, etc. Integrates with the existing flat ESLint config. Produces a per-symbol pass/fail on the modified files in each PR.

**Option B — TypeDoc + `typedoc-plugin-coverage`:** TypeDoc generates an HTML reference from TSDoc comments. `typedoc-plugin-coverage` adds a percentage gate: scans all exported symbols and exits non-zero when any configured category falls below the threshold. Used by `discord.js`, `ts-node`, and similar large TypeScript projects.

The deciding criterion was **"percentage threshold on all exports simultaneously."** A CI gate that only fires on touched files allows coverage to drift on untouched exports without triggering the gate; a whole-project scan prevents this.

## Decision

Adopt **TypeDoc + `typedoc-plugin-coverage`** (Option B).

- Install as devDependencies in `packages/shared`.
- Configure via `packages/shared/typedoc.json` with entry point `src/index.ts`, `typedoc-plugin-coverage` plugin, and an 80% coverage threshold per symbol category.
- Add `docs:check` npm script that runs TypeDoc in validation mode (no HTML output) and exits non-zero below threshold.
- Wire `docs:check` into the `checks` CI job in `.github/workflows/ci.yml`.
- Write TSDoc comments on all exported symbols until the gate passes.

## Alternatives considered

**Option A (eslint-plugin-jsdoc):** Rejected for two reasons:

1. Per-file/per-symbol rules enforce _presence_ on modified symbols only — no global threshold means coverage can degrade on untouched exports across PRs.
2. Monorepo exported-symbol detection is brittle: ESLint processes files individually; re-exported symbols (common in shared) may not trigger the rule on the re-exporting barrel.

**Inline TSDoc only (no gate):** Rejected. Without a CI enforcement mechanism the threshold is aspirational, not enforced.

**tsdoc-validator / api-extractor:** Evaluated briefly. `api-extractor` is Microsoft's TypeScript public-API surface tooling — it validates TSDoc syntax but does not produce a coverage percentage. Over-engineered for this use case.

## Consequences

**Positive:**

- CI gate fails fast when coverage falls below 80% across all exports simultaneously — no coverage drift.
- TypeDoc HTML output is a bonus artifact (not CI-gated, but generateable on demand).
- `typedoc-plugin-coverage` is battle-tested in the `discord.js` ecosystem, matching this repo's primary dependency.
- Minimal footprint: 2 devDependencies, 1 JSON config file, 1 script, 1 CI step.

**Negative / friction:**

- TypeDoc requires an initial JSDoc pass on ~80% of exported symbols before the gate can pass.
- TypeDoc version compatibility with TypeScript 6.0.3 must be verified on first run.

**Neutral:**

- Plugin scoped to `packages/shared` only. Extension to `bot`/`backend`/`frontend` is a future decision.

## Revisit when

- TypeDoc 1.x stable releases or `typedoc-plugin-coverage` API changes break the configuration.
- Coverage requirement is raised above 80% across all packages.
