# ADR 2026-05-21 — Migrate backend code from Zod 3 to Zod 4 API

**Status:** Accepted (implementation pending)
**Context-Pack:** Session 2026-05-21 — PR #915 close note + issue #907 reopened
**Supersedes:** none
**Unblocks:** [`2026-05-21-replace-plan-limited-review-tools`][cve] (the brace-expansion CVE override that PR #915 attempted)

[cve]: ./2026-05-21-replace-plan-limited-review-tools.md

## Context

Lucky's monorepo currently runs two Zod majors at the same time, and the lockfile only works by historical accident:

- `packages/frontend/package.json` pins `"zod": "^4.4.3"`
- `packages/shared/package.json` pins `"zod": "^4.4.3"`
- `packages/backend/src/middleware/validate.ts:4` imports `ZodTypeDef` (Zod-3-only name; removed in 4)
- `packages/backend/src/schemas/autoMessages.ts:9,37` uses `required_error: "..."` (Zod-3-only option; replaced by `error: ...` in 4)

The existing `package-lock.json` hoists Zod 3.25.76 at root and nests 4.4.3 inside the workspaces that pin 4. That hoist is **not** declared anywhere — it's the outcome of one specific resolution order from a past `npm install`. Any lockfile regen (`npm audit fix`, an `overrides` edit, a dependabot bump) can flip root to Zod 4. When that flip happens, the backend's TS build fails with:

```
src/middleware/validate.ts(4,45): error TS2724: '"...zod/v4/classic/external"' has no exported member named 'ZodTypeDef'.
src/schemas/autoMessages.ts(9,13): error TS2769: 'required_error' does not exist in type '{ error?: ... }'.
```

Both PR #915 attempts at the brace-expansion CVE patch (CVE-2024-45049 / GHSA-jxxr-4gwj-5jf2) triggered this flip. The PR was closed and issue #907 reopened with this exact root cause.

## Decision

Migrate the backend code to Zod 4 API in a dedicated PR. After this lands, the backend matches `^4.4.3` natively, the hoist is no longer load-bearing, and dependency updates stop being a ticking time bomb.

Concrete changes (verified scope, ~1 hour engineering time):

1. **`packages/backend/src/middleware/validate.ts:4`** — replace the `ZodTypeDef` import. The export was removed in Zod 4; the equivalent constraint at the usage site is `z.ZodTypeAny`, or drop the import entirely if the generic was load-bearing only for `z.infer<>`.
2. **`packages/backend/src/schemas/autoMessages.ts:9,37`** — replace each `{ required_error: "..." }` with `{ error: () => "..." }` per Zod 4's unified error API.
3. **Tests adjacent to these files** — re-run the suite; only assertions on `ZodError.format()` shape would break, and Zod 4's shape is backward-compatible enough that most tests pass unchanged.

The PR is purely a refactor; no functional behaviour change. After merge, the brace-expansion CVE override (which Lucky already keeps in `package.json` overrides for several other deps) is a 3-line edit that no longer fights the lockfile.

## Alternatives considered

- **B — Pin backend to Zod 3 via per-workspace `package.json` overrides.** Rejected. Trades 1 hour of work now for permanent monorepo fragmentation: contributors and AI agents have to remember why backend is on v3, the override becomes fragile when `@infisical/sdk@6` drops Zod 3 support, and every future lockfile regen is a ticking time bomb under the override.
- **C — Wait for next major-touching change.** Rejected. The CVE stays unpatched. Lockfile fragility makes every dependabot patch a roll of the dice — half of them will trip the Zod flip and require this same migration anyway.
- **D — Roll frontend + shared back to Zod 3.** Rejected. Frontend likely uses Zod-4-only features (verified in [INTERFACE-DESIGN.md][lang] scan plan); even if it didn't, downgrading two packages is the worse direction than upgrading two files.
- **E — Migrate all three packages to Zod 4 in one PR.** Rejected as scope creep. Frontend + shared are already on Zod 4; only backend has the API drift. A monolithic PR re-touches code that doesn't need it.

[lang]: ../../README.md

## Consequences

### Positive

- Lockfile no longer depends on accidental hoist. Any future regen (`npm audit fix`, dependabot, overrides change) is safe.
- The brace-expansion + ws CVE patches in #907 unblock immediately after this lands. ~3-line edit.
- Backend stays on the same Zod major as the rest of the monorepo. One mental model, one set of error-API conventions.
- Future Zod 4 features (better tree-shaking, new error callbacks, smaller bundle on server-side esbuild builds) become available to backend.

### Negative

- One hour of engineering time spent on a refactor that isn't a user-visible feature.
- If the backend has hidden Zod-3-specific behaviour expectations beyond the 3 cited line numbers (e.g. an obscure `ZodError.format()` consumer), the migration could surface them. Mitigated by the existing test suite + the `validate.ts` middleware being thin.

### Neutral

- `@infisical/sdk@5.0.2` still pulls Zod 3 nested under shared's tree. Not load-bearing on the backend after this migration; just a transitive runtime dep. Will resolve naturally when `@infisical/sdk` updates.

## Implementation plan

Pilot scope = one PR.

1. Branch `refactor/backend-zod4` from `release` (bare; or `release/v2.12.0` if Lucky's migration to bare hasn't landed yet).
2. Apply the 3 listed code changes.
3. Run `npm run type:check --workspace=packages/backend` + `npm run test:ci --workspace=packages/backend`. Both must pass.
4. **Lockfile sanity test**: `rm -rf node_modules package-lock.json && npm install --ignore-scripts`. Confirm Zod hoists to 4.x at root and the backend's checks still pass against the regenerated lockfile.
5. Commit + PR with conventional `refactor(backend): migrate validate.ts + schemas to Zod 4 API`. Squash-merge to release.
6. Reopen the brace-expansion + ws CVE work as a new PR: 3-line `package.json` overrides edit (`brace-expansion: ">=5.0.6"`, `ws: "8.20.1"`) + lockfile regen. Verify `npm audit` clean.
7. Close issue #907 after the CVE PR merges.

Rollback: revert the refactor commit. No downstream impact — backend is a leaf in the Lucky dependency graph.

## Revisit triggers

- **The 3 line changes aren't actually surgical** (TS build emits other Zod 4 errors not enumerated above). Surface in PR description, scope up to E (migrate-all) if too tangled.
- **`@infisical/sdk` drops Zod 3 support** (likely within 6-12 months). Independent of this migration; just removes the transitive Zod-3 install from the tree.
- **Zod 5 ships.** Re-evaluate; may want to skip 4 and jump to 5 if release timing aligns.
- **A new Lucky package wants Zod and pins a different major.** Pattern signal that the monorepo needs a single root-pinned Zod version. Currently each package pins independently — fine for 4 packages, fragile beyond.

## Related artefacts

- Issue #907 (reopened) — brace-expansion + ws CVE; blocked on this ADR's implementation.
- PR #915 (closed) — two failed CVE-fix attempts that produced the Zod flip in CI.
- Memory: `~/.claude/projects/-Volumes-External-HD-Desenvolvimento-Lucky/memory/project_supabase_migration.md` (notes Zod 3→4 will affect Prisma's `z.infer<>` patterns).
- `CONTEXT.md` — "Module / Interface / Adapter" vocab still applies; this is purely impl-side, no Seam change.
