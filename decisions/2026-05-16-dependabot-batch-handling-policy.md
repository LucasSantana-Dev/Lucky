# ADR — Dependabot batch handling: split majors from patches

- **Date:** 2026-05-16
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Related:** PR #897 (config change), PRs #891–#896 (the trigger batch),
  memory `feedback_dependabot_alert_triage.md` (2026-04-25 incident note)

## Context

Dependabot opened six PRs against `main` on 2026-05-16:

- `#891` trufflehog SHA bump
- `#892` Codium-ai/pr-agent SHA bump
- `#893` LucasSantana-Dev/.github quality.yml ref bump
- `#894` actions/checkout 4 → 6 (GHA major)
- `#895` dev-dependencies group × 15 (patch/minor only)
- `#896` production-dependencies group × 13 — **bundles `youtubei.js` 16 → 17 (major), `@npmcli/fs` 5 → 6 (major), and `unique-filename` 5 → 6 (major) alongside 10 patch/minor bumps**

`youtubei.js` is the YouTube extraction library used by the bot's audio
streaming path (`packages/bot/src/utils/music/youtubeErrorHandler/` and
`playerFactory.ts`). The Discord / YouTube integration paths have **no
integration tests** — failures surface only in production via Sentry and
user reports in Discord. This was explicitly accepted in
`2026-05-14-discord-integration-testing-strategy.md`.

The previous dependabot config grouped by `dependency-type` only,
producing two weekly PRs (one all dev, one all prod) with no separation
between safe patches and breaking majors:

```yaml
groups:
    dev-dependencies:
        dependency-type: 'development'
    production-dependencies:
        dependency-type: 'production'
```

A 2026-04-25 incident note already captured the failure mode: "Hold mixed
major+patch PRs; grep source for vulnerable API before patching." The
existing batch reproduced exactly that pattern.

## Decision

Split each npm dependabot group on `update-types` so majors arrive in
dedicated PRs separate from the auto-mergeable patch/minor stream:

```yaml
groups:
    dev-patches:
        dependency-type: 'development'
        update-types: ['patch', 'minor']
    dev-majors:
        dependency-type: 'development'
        update-types: ['major']
    production-patches:
        dependency-type: 'production'
        update-types: ['patch', 'minor']
    production-majors:
        dependency-type: 'production'
        update-types: ['major']
```

GHA and Docker dependabot groups are unchanged — those already publish
one PR per bump.

For the current batch: close `#896`, comment `@dependabot recreate` so
the prod-deps PR is rebuilt under the new grouping; auto-merge the four
GHA SHA/major bumps (`#891`–`#894`) and the dev-deps patches+minors PR
(`#895`); manually triage the new `production-majors` PR when it
re-opens.

## Alternatives considered

- **Auto-merge all 6 as-is (status quo).** Fastest. Rejected: CI has no
  integration coverage for the YouTube/Discord paths, so a breaking
  `youtubei.js` API change would ship to production and surface as a
  Sentry incident plus Discord user reports. The 2026-04-25 memory note
  exists because this happened before.
- **One-time triage only (close #896, cherry-pick youtubei.js, merge the
  rest).** Handles the current batch. Rejected: same issue returns next
  week with the next major dependency bump. Doesn't address the
  generative cause.
- **Selectively merge low-risk only (#891–#894), full manual triage on
  the grouped PRs forever.** Rejected: wastes the auto-merge value of
  grouping for patch/minor bumps; bleeds calendar time weekly.
- **Hold all six until a maintenance window.** Rejected: defers risk
  without resolving it; PRs accumulate merge conflicts; the lockfile
  drifts.

## Consequences

### Positive

- Breaking changes are forced into a dedicated reviewable PR — a manual
  triage gate that CI cannot replace for paths without integration
  coverage.
- Patch/minor PRs remain auto-mergeable, preserving the speed benefit of
  grouping for low-risk bumps.
- Config is durable: solves the recurring class, not just this week's
  instance.
- Audit trail: when a future regression is traced back to a major bump,
  the dedicated PR identifies the version transition cleanly.

### Negative

- Up to four weekly npm dependabot PRs instead of two when majors land
  in both `dev` and `prod` (typically zero or one, not always both).
- One-time migration cost: close `#896`, comment `@dependabot recreate`,
  wait for the split PRs (~10 min plus dependabot's reconciliation
  window).
- `@npmcli/fs` 6 and `unique-filename` 6 majors arrive alongside the
  youtubei.js 17 major in the recreated PR, but both are deep transitive
  tooling — manual triage is cheap.

### Neutral

- GHA `actions/checkout 4 → 6` (#894) and similar action-version majors
  continue to arrive as standalone PRs under the existing `github-actions`
  ecosystem block — already the right shape; no config change needed
  there.

## Revisit when

- Bot integration tests start covering the YouTube/Discord streaming
  paths in CI. With coverage, the "no CI guard against breaking deps"
  argument falls away and re-bundling majors with patches becomes
  defensible again. (Currently deferred per
  `2026-05-14-discord-integration-testing-strategy.md`.)
- Dependabot's `update-types` group syntax is deprecated or replaced —
  re-evaluate against whatever replaces it.
- The split policy produces >2 majors per week sustained — review
  whether a different cadence (monthly major-only batches) reduces
  triage thrash.
- The repo moves to a different package manager or update bot
  (Renovate, etc.) — port the policy or re-derive.

## Execution

PR #897 makes the config change. Follow-up sequence documented inline in
that PR's body.
