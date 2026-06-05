---
status: accepted
date: 2026-05-27
revisit_after: 2026-06-08
---

# Docker build check uses parallel matrix in ci.yml without path filters

## Context

Two competing implementations landed on open PRs when the docker-build-check gate was designed:

- **PR #1061** (`ci/docker-build-required-check`): integrated into `ci.yml`, sequential 4-step job, no path filters.
- **PR #1062** (`ci/docker-build-pr-check`): separate `docker-build-check.yml` workflow, parallel matrix with path filters (`packages/**`, `prisma/**`, `Dockerfile*`, `nginx/**`, `package*.json`).

A `/research-and-decide` critique (2026-05-27) surfaced a critical flaw in PR #1062: **path-filtered workflows do not post status checks when the filter excludes the PR**. GitHub treats a missing required check as "pending," permanently BLOCKING the PR. Any PR touching only docs, `.github/workflows/ci.yml`, or other non-filtered paths would be BLOCKED indefinitely because "Build — Docker images" never posts.

PR #1062 also proposed path filtering to avoid running Docker builds on irrelevant PRs (e.g., a pure doc fix). This is a legitimate optimization, but it is incompatible with a **required** status check configuration: GitHub's branch protection requires the named check to be present AND pass before merge.

## Decision

Use a **parallel matrix with a summary job, no path filters, integrated in `ci.yml`**.

- `docker-build` matrix job: 4 parallel builds (bot, backend, frontend, nginx), `fail-fast: false`, `push: false`, `load: false`, GHA layer cache. Runs only on `pull_request` events.
- `docker-build-check` summary job: name `"Build — Docker images"`, `needs: docker-build`, `if: always() && github.event_name == 'pull_request'`. Posts pass/fail to branch protection.
- No path filters. Every PR targeting `main` triggers all 4 builds.

The summary job is the required check target. It always runs on PRs (via `if: always()`) so it always posts a status, regardless of what files the PR touches.

## Considered options

### File structure

- **A. Integrated in ci.yml (accepted).** All CI logic in one file; no cross-file context switch to understand why a PR is BLOCKED.
- **B. Separate `docker-build-check.yml`.** Cleaner file-level separation, but requires context switching and loses the single-file invariant. Not a meaningful benefit for a solo-developer project.

### Parallel vs sequential

- **A. Sequential 4-step job (original PR #1061).** If bot fails, backend/frontend/nginx never run. Slower combined time and incomplete failure signal.
- **B. Parallel matrix, fail-fast: false (accepted).** All 4 builds run concurrently; all failures visible in one run. Faster wall time (~2–4 min vs ~5–8 min sequential).

### Path filtering

- **A. No path filters (accepted).** Required check always posts on every PR. Overhead: ~2–4 min on PRs that don't touch Docker-relevant files.
- **B. Path-filtered workflow (rejected).** Path-filtered workflows don't post status checks when skipped. GitHub treats missing required check as "pending," BLOCKING the PR. This is a documented GitHub Actions footgun. Rejected unconditionally for required-check use.

## Consequences

**Positive:**

- Required check always posts; no PR can be BLOCKED by a missing status.
- All 4 build failures visible in one CI run (fail-fast: false).
- CI logic remains in a single workflow file.

**Negative:**

- Pure doc or config PRs (≥1 per week) spend ~2–4 min running Docker builds with no diagnostic value.
- 4 parallel jobs share GHA cache per-key; warming one cache entry doesn't help others.

**Neutral:**

- The revisit condition from the parent ADR (`decisions/2026-05-25-release-cadence-gates.md`) still applies: if unrelated Docker failures exceed 2/week by 2026-06-08, remove the gate.

## Revisit when

- A GitHub-native solution for "required check + path filter" becomes available (e.g., GitHub adds "treat skipped check as passing" at the branch-protection level).
- Build times exceed 10 min for the matrix, making the always-run overhead unacceptable.
- Same conditions as parent ADR: >2 unrelated Docker failures per week by 2026-06-08.

## Cross-references

- Parent gate ADR: `decisions/2026-05-25-release-cadence-gates.md`
- PR #1061 (`ci/docker-build-required-check`) — contains this implementation
- PR #1062 (`ci/docker-build-pr-check`) — closed; path-filter approach rejected
