# ADR: GitHub Merge Queue + Renovate to eliminate stale-cache CI failures

**Date:** 2026-05-27
**Status:** Accepted

## Context

PRs going stale (days/weeks behind `main`) caused repeated Docker BuildKit cache failures:

```
npm error Error: Expected "0.28.0" but got "0.27.3"
npm error path /app/node_modules/tsx/node_modules/esbuild
```

Root cause: Docker BuildKit GHA cache is keyed by `hashFiles('package-lock.json')`. When a PR is approved and CI passes against an older `main`, then `main` advances a binary dep (e.g., esbuild), the cached `npm ci` layer still holds the old binary. The PR merges cleanly in the Git sense but the BuildKit layer is stale — next docker-build run retrieves the wrong binary.

Branch protection on `main` does not require branches to be up to date before merging, so stale PRs can merge without triggering a fresh CI run against current `main`.

Two options were evaluated:

- **Option A (Kodiak):** GitHub App that auto-rebases stale PRs and queues merges (Eco Merge mode). Tactical: the rebase-merge lag (8-10min CI run) leaves a window where `main` can advance again before Kodiak completes the merge, leaving the cache stale.
- **Option B (GitHub Merge Queue + Renovate):** Native GH merge queue creates a synthetic branch (`main + PR`) at merge time and tests it before committing. Renovate replaces Dependabot with `rebaseStalePrs: true` and `platformAutomerge`. Structural: the tested state equals the post-merge state by construction.

homelab repo (same org) already runs Renovate with `platformAutomerge: true` successfully — the migration pattern is proven.

## Decision

Adopt **GitHub Merge Queue + Renovate** (Option B).

- Enable GitHub Merge Queue on `main` branch protection.
- Add `merge_group` trigger to all CI job files.
- Replace Dependabot with Renovate (`.renovaterc.json` modeled on homelab config).
- Remove `dependabot-auto-merge.yml` (Renovate `platformAutomerge` replaces it).

## Alternatives considered

**Option A (Kodiak):** Rejected. Kodiak rebases stale PRs but the rebase-to-merge window (~8-10min while CI runs) is long enough for `main` to advance again. The root cause (stale cache key at actual merge time) is not eliminated; it is just narrowed. Also introduces a third-party app with broad repo permissions and no prior art in this repo.

**Status quo (manual rebase on failure):** Already the current state. Unacceptable — operators had to manually run `gh pr update-branch` on 3 PRs in the same session (#944, #953, #954). Scales poorly.

**Tighten cache key further:** The existing `docker-npm-cache-key-strategy` ADR (2026-05-24) already fixes the Docker layer key to `hashFiles('package-lock.json')`. That fix addresses BuildKit layer selection but does not prevent a stale PR from presenting an old lockfile hash that matches a stale layer. Merge Queue is the correct layer to solve this.

## Consequences

**Positive:**

- Merge Queue guarantees CI always tests the exact commit that will be pushed to `main`. Stale-binary failures are structurally impossible.
- Renovate `rebaseStalePrs: true` keeps PRs current automatically, reducing the queue depth at any given moment.
- `platformAutomerge` for patches/minors removes the manual `dependabot-auto-merge.yml` workflow (simpler CI surface).
- No third-party app; merge queue is a native GitHub feature.

**Negative / friction:**

- One-time CI YAML change: add `merge_group` event to all job triggers (5-6 files).
- Dependabot → Renovate migration: close existing Dependabot PRs, Renovate re-opens them. ~1hr effort.
- Merge queue serializes merges (one at a time). For a solo operator with 3-5 concurrent PRs at peak, maximum queue wait is ~30-50min. Acceptable given the 30min production deploy gate already in place.
- Hotfix PRs cannot jump the queue by default. If a P0 is ever needed, merge queue can be temporarily bypassed via admin override.

**Neutral:**

- Merge queue does not change CI job parallelism. Each PR's CI jobs still run in parallel within their queue slot; only the merge sequence is serialized.

## Revisit when

- PR throughput regularly exceeds 8 concurrent open PRs (queue wait > 1hr) → evaluate Merge Queue `max_entries` tuning or Kodiak Eco Merge as queue overlay.
- Renovate introduces a dep regression that Dependabot's YouTube-dep guard (test-youtube-smoke job) would have caught → re-evaluate Renovate's group configuration for YouTube-adjacent packages.
- GitHub discontinues or charges for Merge Queue on public repos.
