---
status: accepted
date: 2026-05-19
supersedes: per-guild feature toggle scope from PR #614
---

# Per-guild feature toggles are retired; only global toggles remain

PR #614 (2026-04-14) introduced per-guild feature toggles backed by the `GuildFeatureToggle` Prisma model and exposed via `setGuildFeatureToggle` / `isEnabledForGuild` on `FeatureToggleService`. PR #801 (2026-05-04, "feat(admin): add admin panel with writable global feature toggles") replaced that path with global toggles: a new admin panel writes to `GlobalFeatureToggle`, and the backend's `/api/toggles/guild/...` routes were removed. The commit body of #801 explicitly says: _"Remove per-guild toggle routes."_

The removal in #801 was deliberate, but it left orphans: the `GuildFeatureToggle` Prisma model + `guild_feature_toggles` DB table remained, and two test files (`packages/shared/src/services/FeatureToggleService.spec.ts` + `packages/backend/tests/integration/routes/toggles.test.ts`) still referenced the deleted methods. The shared test suite has been red since #801 because of the resulting TS2551 compile errors; the failure was hidden until `/adt-ship-check` surfaced it on 2026-05-19.

This ADR ratifies the removal retroactively and ships the cleanup.

## Decision

Per-guild feature toggles are **not** part of Lucky's surface area going forward. Feature toggles are **global**, sourced in order from:

1. `GlobalFeatureToggle` DB row (set by the admin panel, writes via `setGlobalFeatureToggle`)
2. Vercel Flags (`@vercel/flags-core` when `FLAGS` env var is configured)
3. Fallback defaults from `getFeatureToggleConfig()` in `@lucky/shared/config`

Cleanup performed in this commit:

- `packages/shared/src/services/FeatureToggleService.spec.ts` rewritten to test only the surviving global path; dead `describe` blocks (`getDbOverride (via isEnabledForGuild)`, `setGuildFeatureToggle`, `isEnabledForGuild with DB override`) removed.
- `packages/backend/tests/integration/routes/toggles.test.ts` mock object stripped of `mockSetGuildFeatureToggle`, `isEnabledForGuild`, `setGuildFeatureToggle` entries.
- `prisma/schema.prisma`: `model GuildFeatureToggle` removed; `Guild.featureToggles` relation deleted.
- `prisma/migrations/20260519000000_retire_per_guild_feature_toggles/migration.sql`: `DROP TABLE IF EXISTS "guild_feature_toggles";`.

## Considered options

- **A — Retire per-guild toggles (accepted).** Codifies the path #801 already took; closes the test + schema gap.
- **B — Restore per-guild toggles.** Rejected: no product driver. The admin panel introduced in #801 deliberately moved to a global-only model, with the rationale that operator-facing kill switches need cluster-wide reach and per-guild scoping was unused. Restoring would re-introduce a feature with no current consumer.
- **C — Leave the orphan in place; only fix the tests.** Rejected: the schema and DB table would continue to exist as dead state, future schema audits would re-surface this as a finding, and someone would eventually reintroduce a half-baked per-guild path believing the substrate was load-bearing.

## Consequences

**Positive:**

- Shared test suite drops from 2 failing suites to 1 (only `__tests__/utils/spotify/artistApi.test.ts` remains red and is tracked separately).
- DB schema matches application reality. Future schema introspection won't suggest a dead model.
- `CONTEXT.md` is consistent: feature toggles are global; `GuildFeatureToggle` no longer appears in the Prisma model list.

**Negative:**

- Retiring the table is destructive. The migration drops `guild_feature_toggles` with `IF EXISTS`; rows in production environments (if any) are lost. Per the deployment chain summary in [[reference-lucky-deploy-chain-architecture-2026-05-15]], the homelab Postgres is the only production DB; spot-check confirms no consumers write to this table, so data loss risk is bounded to whatever rows #614 wrote before #801 stopped writing them.
- If a future product driver wants per-guild toggle scoping, it will be a fresh design rather than a revival of this substrate — schema, service path, route, and UI would need to be rebuilt.

## Revisit when

- A product requirement arrives for per-guild feature flag scoping (e.g. per-Guild paid-tier gating, beta-cohort selection). Reopening this ADR would propose a new design rather than restoring #614's substrate.
- The Vercel Flags integration is replaced (e.g. moved to LaunchDarkly, OpenFeature, or a fully self-hosted toggle service). The "global" path is the only one that survives, so its replacement is a load-bearing decision.

## Cross-references

- PR #614 (2026-04-14) — introduced per-guild toggles + the `GuildFeatureToggle` model.
- PR #762 (2026-04-25 era) — adopted `@vercel/flags-core`.
- PR #801 (2026-05-04) — admin panel, removed per-guild routes, retained per-guild method/spec/schema by oversight.
- Diagnostic session 2026-05-19 (this session) — surfaced the orphan via `/adt-ship-check` + `/diagnose`.
- `CONTEXT.md` — the `GuildFeatureToggle` Prisma model entry should not be added (was never in glossary).
