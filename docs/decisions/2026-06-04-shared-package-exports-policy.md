# ADR 2026-06-04 — @lucky/shared subpath exports policy

**Status:** Accepted
**Issue:** #1196 (downscoped) · cubic finding on PR #1179

## Context

A cubic review of PR #1179 flagged that `@lucky/shared/errors/ValidationError` could throw `ERR_PACKAGE_PATH_NOT_EXPORTED` at runtime. A follow-up sweep escalated this to "~25 deep imports bypass the exports map" (#1196).

**That escalation was a misdiagnosis.** Investigation + empirical verification:

- The bot is ESM (`type: module`), tsc-compiled (NOT esbuild-bundled), run as `node dist/index.js`. Native Node ESM **enforces** the `exports` map.
- Node's `exports` `*` token matches **any characters including slashes**. So `"./utils/*": "./dist/utils/*.js"` resolves `@lucky/shared/utils/general/log` → `./dist/utils/general/log.js`. The deep `utils/**` and `services/**` imports are **covered**.
- **Empirical proof:** the bot runs in production value-importing `@lucky/shared/utils/general/log` and `.../errorSanitizer`; it would fail at startup if those were unresolved.
- A scan of **all** value-imports of `@lucky/shared/*` on `main` found **zero uncovered** subpaths (every one is under `utils/`, `services/`, `config`, `types`, or `constants`).
- The flagged `@lucky/shared/generated/prisma/models/CustomCommand` is `import type` → erased at compile → no runtime resolution.

**The one genuine gap:** PR #1179 introduces `@lucky/shared/errors/ValidationError` as a **value** import (a thrown class), and the exports map has **no `./errors` entry** → that PR really would crash the built backend.

## Decision

1. **Add `"./errors"` and `"./errors/*"` to the shared `exports` map.** This is the real, narrow fix — it unblocks #1179's ValidationError value-import. The `./errors` entry lands **with PR #1179** (the PR that introduces the import).
2. **Add a lightweight CI guard** (#1196, downscoped): a script that greps every non-`import type` import of `@lucky/shared/<subpath>` in `packages/bot/src` + `packages/backend/src` (excluding tests) and fails if the subpath is not under a key/pattern in the shared `exports` map. (The exact check used to verify this ADR — covered prefixes today: `utils`, `services`, `config`, `types`, `constants`, and now `errors`.)
3. **Do NOT normalize the existing deep imports to barrels.** They resolve correctly, AND barrels reintroduce a known bug: backend ts-jest only resolves the first `export *` of the `/utils` barrel, so new utils must be imported via submodule path (`@lucky/shared/utils/async`, etc.). Deep submodule imports are the **recommended** pattern here.
4. **Defer `./generated/*`** — the only `generated` import today is type-only (erased). Adding it speculatively would expose internal Prisma models as public API. Add only if a value-import of a generated symbol is ever needed.
5. **Downscope #1196** from "~25-file crisis" to "add `./errors` to exports (in #1179) + add the CI guard."

## Alternatives considered

- **Normalize all deep imports to barrels.** Rejected — they're already covered, it's churn on a misdiagnosis, and it reintroduces the ts-jest barrel quirk.
- **Switch `moduleResolution` to `node16`/`nodenext` to catch this at compile time.** Deferred — would surface uncovered VALUE imports at build (a real plus) but risks breaking other resolution; the CI guard achieves the same protection more cheaply. Revisit if the guard proves insufficient.
- **Add a top-level `./*` catch-all to exports.** Rejected — defeats the encapsulation the exports map provides; would let any internal file be imported.

## Consequences

**Positive:** #1179 ships safely; the actual risk (new value-imports of unexported subpaths) is guarded going forward; no needless churn; existing deep-import pattern (required for ts-jest) preserved.

**Negative:** the wildcard "coverage" depends on the internal `dist/` directory structure staying stable — renaming `utils/general/` would break importers despite the exports map. (True of any import path; not unique here.)

**Neutral:** `guilds.id`-style vestigial concerns don't apply; the CUID/exports topics are unrelated.

## Revisit when

- A value-import of an uncovered subpath is needed (e.g. `./generated/*`) → add that specific entry, don't catch-all.
- The CI guard produces false positives on dynamic imports / re-exports → refine its static detection.
- The build moves to a bundler (esbuild) for the bot → exports enforcement changes; re-evaluate whether the guard is still needed.
