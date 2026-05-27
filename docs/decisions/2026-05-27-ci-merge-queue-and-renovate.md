# ADR: Strict Status Checks + Renovate to eliminate stale-cache CI failures

**Date:** 2026-05-27
**Status:** Accepted

## Context

PRs going stale (days/weeks behind `main`) caused repeated Docker BuildKit cache failures:

```
npm error Error: Expected "0.28.0" but got "0.27.3"
npm error path /app/node_modules/tsx/node_modules/esbuild
```

Root cause: Docker BuildKit GHA cache is keyed by `hashFiles('package-lock.json')`. When a PR is approved and CI passes against an older `main`, then `main` advances a binary dep (e.g., esbuild), the cached `npm ci` layer still holds the old binary. The PR merges cleanly in the Git sense but the BuildKit layer is stale — next docker-build run retrieves the wrong binary.

Three options were evaluated:

- **Option A (Kodiak):** GitHub App that auto-rebases stale PRs and queues merges (Eco Merge mode). Tactical: the rebase-merge lag (8-10min CI run) leaves a window where `main` can advance again before Kodiak completes the merge, leaving the cache stale.
- **Option B (GitHub Merge Queue + Renovate):** Native GH merge queue creates a synthetic branch (`main + PR`) at merge time and tests it before committing. Structural fix: the tested state equals the post-merge state by construction. **Plan-gated: requires GitHub Team or Enterprise. Not available on Free.**
- **Option C (Strict status checks + Renovate):** `strict_required_status_checks_policy: true` in branch ruleset forces each PR to be up to date before merge. Renovate `rebaseStalePrs: true` + `platformAutomerge` automates the rebase and merge. Small theoretical race window remains (between Renovate rebase and merge), but Renovate's Monday-morning rebase schedule makes the window near-zero in practice. Available on Free plan.

homelab repo (same org) already runs Renovate with `platformAutomerge: true` successfully — the migration pattern is proven.

## Decision

Adopt **Strict Status Checks + Renovate** (Option C).

- `strict_required_status_checks_policy: true` already active in the main branch ruleset (confirmed 2026-05-27 — was pre-existing).
- Add `merge_group` trigger to all CI job files (forward-compatible if plan ever upgrades to Team).
- Replace Dependabot with Renovate (`.renovaterc.json` modeled on homelab config).
- Remove `dependabot-auto-merge.yml` (Renovate `platformAutomerge` replaces it).

## Alternatives considered

**Option B (GitHub Merge Queue):** Evaluated first as the structural ideal. Rejected at configuration time: the "Require merge queue" rule does not appear in the Rulesets UI — confirmed to be gated behind GitHub Team/Enterprise plan. Would structurally eliminate the race window (tested state = post-merge state by construction). Revisit if the repo moves to a paid plan.

**Option A (Kodiak):** Rejected. Kodiak rebases stale PRs but the rebase-to-merge window (~8-10min while CI runs) is long enough for `main` to advance again. The root cause is not eliminated; it is just narrowed. Also introduces a third-party app with broad repo permissions and no prior art in this repo.

**Status quo (manual rebase on failure):** Already the current state. Unacceptable — operators had to manually run `gh pr update-branch` on 3 PRs in the same session (#944, #953, #954). Scales poorly.

**Tighten cache key further:** The existing `docker-npm-cache-key-strategy` ADR (2026-05-24) already fixes the Docker layer key to `hashFiles('package-lock.json')`. That fix addresses BuildKit layer selection but does not prevent a stale PR from presenting an old lockfile hash that matches a stale layer. Branch freshness enforcement is the correct layer to solve this.

## Consequences

**Positive:**

- `strict_required_status_checks_policy: true` prevents any PR from merging unless it is up to date with `main`. Stale-binary failures require both a stale rebase AND `main` advancing again in the CI window — rare in practice.
- Renovate `rebaseStalePrs: true` keeps PRs current automatically on Monday mornings, so the up-to-date gate rarely requires manual intervention.
- `platformAutomerge` for patches/minors removes the manual `dependabot-auto-merge.yml` workflow (simpler CI surface).
- `merge_group` trigger in `ci.yml` is forward-compatible: no change needed if merge queue is enabled later.
- No third-party app beyond Renovate (which is standard OSS tooling with no broad repo permissions).

**Negative / friction:**

- Theoretical race window remains: `main` could advance during the ~8-10min CI run after Renovate rebases but before the PR merges. In practice this requires two events to overlap within a narrow window on a solo repo — negligible risk.
- Dependabot → Renovate migration: close existing Dependabot PRs, Renovate re-opens them. ~1hr effort.

**Neutral:**

- The `merge_group` CI trigger is present but inactive until merge queue is enabled. No operational impact.

## Revisit when

- Repo moves to GitHub Team plan → enable "Require merge queue" in the existing ruleset to close the remaining race window structurally.
- Renovate introduces a dep regression that Dependabot's YouTube-dep guard (test-youtube-smoke job) would have caught → re-evaluate Renovate's group configuration for YouTube-adjacent packages.
- Race window causes an actual production failure → escalate to merge queue (plan upgrade) or Kodiak as interim.
