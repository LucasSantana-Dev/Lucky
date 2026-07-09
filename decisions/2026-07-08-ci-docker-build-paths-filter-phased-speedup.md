# ADR 2026-07-08 — CI speedup: paths-filter docker-build first, cache diagnostic before architecture change

**Status:** Accepted (Phase 1 shipped; Phase 2 pending)
**Deciders:** Lucas Santana (via 4-lens debate: feasibility, production-safety, pragmatism, architecture; synthesis by Fable)
**Related:** PR #1711 (Phase 1 implementation), `.github/workflows/ci.yml`, `.github/workflows/docker-publish.yml`
**Trigger:** operator request "CI/CD takes way too long" (2026-07-08).

## Context

Measured across 8 recent PR runs: total CI wall-clock ~5-11 min. Critical-path breakdown of
one representative run (id 28978740134, 644s total):

- `build-shared`: 48s
- `docker-build` matrix (4 services, no `needs:` on `build-shared`, starts after a ~48s
  runner-queue gap): **`Build — bot` 419s — the single largest job, and the critical path.**
  `Build — backend` 356s, `Build — frontend` 260s, `Build — nginx` 16s.
- `Checks` (lint+typecheck+build): 175s, parallel with docker-build.
- `Test — *`: 85-127s each, parallel.
- `SonarCloud Scan`: 83s.

`docker-build` runs the full multi-stage `docker/build-push-action` build of each
production image (`push: false`, pure PR-time validation — never publishes), using
`cache-from/cache-to: type=gha`. The bot image needs `@discordjs/opus`, which has no
prebuilt binary for the current Node/Alpine ABI and source-compiles via node-gyp — a known,
deliberate, documented tradeoff in the Dockerfile already.

It ran **unconditionally on every `pull_request`/`merge_group` event, with no `paths:`
filter** — unlike `docker-publish.yml` (the workflow that builds and pushes the *real*
release images), which already gates on one:

```yaml
paths:
  - 'packages/**'
  - 'prisma/**'
  - 'Dockerfile'
  - 'Dockerfile.*'
  - 'nginx/**'
  - 'package*.json'
  - '.github/workflows/docker-publish.yml'
```

Root-cause hypothesis for the 400s+ duration (not yet confirmed): `cache-from/cache-to:
type=gha` may not be landing cache hits on the expensive `npm ci` + native-compile layer,
forcing a cold native rebuild of `@discordjs/opus` on every run regardless of whether
`package-lock.json` changed.

## Decision

**A 4-lens debate converged unanimously on a phased approach — ship the safe, high-value
win now; don't commit to a bigger architecture change (pre-built base image, cache-backend
switch) without data.**

**Phase 1 — shipped (PR #1711):** add a `detect-docker-changes` job to `ci.yml` that diffs
the PR against its base and mirrors `docker-publish.yml`'s existing paths list (plus
`ci.yml` itself, so edits to the `docker-build` job definition stay validated). Gates
`docker-build`'s `if:` on the result. `docker-build-check` (the required branch-protection
status check, `"Build — Docker images"`) still *always* runs and explicitly reports
success/skip/fail, so the required check never goes missing — it reports fast instead of
waiting on a build that couldn't have been affected by the diff.

**Phase 2 — pending, not yet started:** root-cause the cache-effectiveness question before
deciding between fixing the cache config (cheaper) vs. a pre-built "deps" base image with
natives pre-compiled (bigger, more durable, more complex):

1. Two-scenario diagnostic: inspect Buildx logs for the `npm-mount` cache layer on (a) a
   recent PR that touched `Dockerfile` only (no lockfile change — should show `CACHED` if
   the cache mechanism works at all) and (b) a recent PR that bumped `package-lock.json`
   (expected cache miss either way — isolates whether the 400s is legitimate compile cost
   or a cache misconfiguration bug).
2. In parallel: measure `docker-publish.yml`'s catch rate over the last ~100 merged PRs —
   how often does the post-merge real build catch a break `ci.yml`'s `docker-build` missed?
   This bounds how safe a cheaper PR-time validation (build stage only, or a reduced
   matrix) would be, independent of the cache question.
3. Decision fork on the data: cache hit on scenario (a) → the 400s is real compile cost,
   escalate to a pre-built base image only if the ROI over 6-12 months justifies the added
   complexity. Cache miss on scenario (a) → fix the cache config/backend directly, cheaper
   than a base-image rearchitecture.

## Alternatives considered

- **Fix the GHA cache miss directly, first (skip the paths filter).** Rejected as the
  *first* move: unconfirmed root cause, and even if fixed, PRs that DO touch Docker-relevant
  paths still pay the compile cost on every push within that PR — the paths filter is
  strictly complementary, not a substitute, and is zero-risk to ship immediately while the
  cache question is still being diagnosed.
- **Pre-built deps base image immediately (Option C).** Rejected as a first move: real
  architecture change, meaningful complexity (refresh-on-lockfile-change pipeline,
  additional registry surface), and the debate's feasibility lens flagged it as premature
  before confirming the cache hypothesis — building this without knowing whether it's a
  cache-config bug or genuine compile cost risks solving the wrong problem.
- **Downgrade PR-time validation immediately (Option D — build-stage only, or reduced
  matrix).** Rejected as a first move, not rejected outright: the production-safety lens
  argued this shifts real regression risk to post-merge without first measuring how often
  `docker-publish.yml` actually catches something `ci.yml` would have missed. Deferred to
  Phase 2's parallel measurement — if divergence is low (<2%), this becomes an acceptable
  fallback; if not, full validation stays.
- **Make `docker-build` advisory/non-blocking instead of required (Option E).** Rejected
  outright by all 4 lenses — defers the wait-time friction rather than solving it, and
  removes a real safety signal for zero speed benefit (the job still runs and takes the
  same wall-clock time; only its blocking status changes).

## Consequences

**Positive:** PRs that touch only docs, unrelated workflow files, or config (e.g. Renovate
config, `.env.example`) skip ~5-8 min of unnecessary Docker validation entirely, with zero
regression risk (the required check still always reports). No architecture change risked
on an unconfirmed hypothesis.

**Negative:** PRs that genuinely touch Docker-relevant paths (the majority of real app-code
and dependency PRs, per this session's own 6 PRs — all 6 were correctly classified
`RELEVANT`) see no speedup yet from Phase 1 alone; the actual 419s bottleneck is
untouched until Phase 2 lands a fix.

**Neutral:** `docker-publish.yml` (the real release build) is unaffected — it already had
its own, separate paths filter.

## Revisit when

- **Phase 2 diagnostic completes** — re-open this ADR (or a follow-up) with the cache
  hit/miss data and commit to fixing the cache config vs. building the pre-built base image.
- **`docker-publish.yml` catch-rate measurement shows >5% divergence** from `ci.yml`'s
  `docker-build` — keep full validation, deprioritize Option D entirely.
- **`docker-publish.yml` catch-rate measurement shows <2% divergence** — Option D (cheaper
  PR-time validation) becomes a live option worth prototyping.
- **The `detect-docker-changes` paths list drifts out of sync with `docker-publish.yml`'s** —
  if one gets updated without the other, re-align them (they're currently duplicated by
  hand, not shared — a future refactor could extract a reusable composite action or
  `paths-filter` config if this becomes a maintenance burden).
