# ADR 2026-07-08 — CI speedup: paths-filter docker-build first, cache diagnostic before architecture change

**Status:** Accepted (Phase 1 shipped; Phase 2 diagnostic complete; Phase 3 shipped and empirically verified)
**Deciders:** Lucas Santana (via 4-lens debate: feasibility, production-safety, pragmatism, architecture; synthesis by Fable)
**Related:** PR #1711 (Phase 1), PR #1712 (Phase 3), `.github/workflows/ci.yml`, `.github/workflows/docker-publish.yml`
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
release images), which already gates on one.

## Decision

**A 4-lens debate converged unanimously on a phased approach — ship the safe, high-value
win now; don't commit to a bigger architecture change (pre-built base image, cache-backend
switch) without data.**

**Phase 1 — shipped (PR #1711):** add a `detect-docker-changes` job to `ci.yml` that diffs
the PR against its base and mirrors `docker-publish.yml`'s existing paths list (plus
`ci.yml` itself). Gates `docker-build`'s `if:` on the result. `docker-build-check` (the
required branch-protection status check, `"Build — Docker images"`) still *always* runs and
explicitly reports success/skip/fail, so the required check never goes missing.

**Phase 2 — diagnostic, complete:**

Two-scenario Buildx log inspection, using real PRs from this session as the two cases
(rather than manufacturing synthetic ones):

- **Scenario A (Dockerfile-only change, no lockfile bump):** PR #1709's `Build — bot` job
  (run 28978750203, job 85992194845). **Zero `CACHED` layer hits anywhere in the 1968-line
  build log** — every stage executed fresh, including on a change that touched nothing
  `npm ci`-relevant.
- **Scenario B (lockfile bump):** PR #1708's `Build — bot` job (run 28978740134, job
  85992163490). Same result: **zero `CACHED` hits.**
- **The actual dominant cost in both scenarios was not `npm ci` or native compilation** —
  it was step `#50 exporting to GitHub Actions Cache` (`cache-to: type=gha,mode=max`):
  **180.5s on scenario A, 260.8s on scenario B** — larger than every other step combined.
  `npm ci` itself was 39-75s per stage, real but secondary.
- **Root cause identified:** neither `ci.yml`'s 4-way `docker-build` matrix nor
  `docker-publish.yml`'s (separate) 4-way matrix specify a `scope:` on their `type=gha`
  cache config. Buildx's GHA cache backend defaults to a single shared scope when
  unspecified — meaning **8 distinct build configurations across 2 workflows** (bot,
  backend, frontend, nginx × {ci.yml, docker-publish.yml}) were all writing `mode=max`
  exports (large: base image + all native-compiled deps) into **one shared cache
  namespace**, on a repo that merges/pushes multiple times per day. Under GHA's cache
  quota/eviction, each write plausibly evicted the last before it could ever be reused —
  explaining the 0% observed hit rate independent of which scenario ran.
  - Corroborating signal: `docker-publish.yml` already has a comment fixing this *exact*
    bug class for a different resource — Trivy SARIF upload category is deliberately keyed
    per-service ("category per service so matrix runs don't overwrite each other") — but
    the same fix was never applied to the Docker build cache in either workflow. This reads
    as an overlooked gap, not a deliberate tradeoff.
- **`docker-publish.yml` catch-rate measurement:** last 30 runs (2026-07-02 through
  2026-07-04) — 28 success, 2 cancelled (superseded by a newer push under
  `concurrency: cancel-in-progress`), **zero failures.** Caveat: narrow window (~2 days),
  not the full ~100-PR sample originally planned — directionally supports that full
  PR-time validation may be more conservative than strictly necessary, but not a strong
  enough sample to justify downgrading validation (Option D) on its own.

**Phase 3 — shipped (this PR):** add `scope: ${{ matrix.service }}` to both `cache-from`
and `cache-to` in **both** `ci.yml`'s `docker-build` job and `docker-publish.yml`'s
`build-and-push` job, using the *same* scope naming in both files. This gives each of the 4
services its own persistent cache namespace (no more matrix-sibling or cross-workflow
collision), and — because both workflows now key on the identical `${{ matrix.service }}`
scope — a PR's `docker-build` validation run can warm the cache that the eventual
merge-time `docker-publish.yml` build reuses, and vice versa.

**Empirically verified** on PR #1712 itself: the first `Build — bot` run after this fix
landed took 5m8s (308s, a cold write into the newly-scoped, previously-empty namespace —
expected). A same-job rerun moments later (`gh run rerun --job`, same branch/commit, same
scope, same content) completed in **16s — a ~19x speedup** — with 40 `CACHED` layer hits in
the log and confirmed cache import (`#10 importing cache manifest from gha:...`). Root cause
and fix both confirmed correct, not just plausible.

## Alternatives considered

- **Fix the GHA cache miss directly, first (skip the paths filter).** Rejected as the
  *first* move: unconfirmed root cause at the time, and even once fixed, PRs that DO touch
  Docker-relevant paths still need the cache to actually work — the paths filter (Phase 1)
  is strictly complementary to the cache fix (Phase 3), not a substitute, and was zero-risk
  to ship immediately.
- **Pre-built deps base image (Option C).** Rejected for now: Phase 2 found a much cheaper,
  well-evidenced root cause (missing cache scope) before this bigger architecture change was
  ever needed. Revisit only if Phase 3's scope fix, once verified, still leaves `npm ci` /
  native-compile time as the dominant cost on genuine cache hits.
- **Downgrade PR-time validation (Option D).** Deferred, not adopted: the 30-run
  `docker-publish.yml` sample showed 0 failures, weakly supporting that full validation may
  be conservative, but the sample is too narrow (~2 days) to act on. Revisit with a longer
  window if Phase 3's fix doesn't deliver the expected speedup.
- **Make `docker-build` advisory/non-blocking (Option E).** Rejected outright — defers wait
  time rather than solving it, removes a real safety signal for zero speed benefit.

## Consequences

**Positive (Phase 1):** PRs that touch only docs, unrelated workflow files, or config skip
Docker validation entirely, zero regression risk.

**Positive (Phase 3, confirmed):** the `bot` service's build dropped from 308s (cold, first
write to the new scope) to 16s (warm, ~19x speedup) on a same-commit rerun. Benefit applies
to PRs that touch Docker-relevant paths *and* run reasonably close in time to a prior
same-service build — the shared-scope alignment across `ci.yml`/`docker-publish.yml` means
both workflows draw from the same warm cache.

**Negative:** GHA cache scoping by service still means the *first* build after this ships
(and after any long gap between builds of a given service) pays the full cold cost — this
is expected, not a bug, and was directly observed (the 308s first run on PR #1712 itself).

**Neutral:** `docker-publish.yml`'s actual publish behavior (tags, push targets) is
unchanged — only its cache configuration.

## Revisit when

- **If a future regression shows `CACHED` hits stop landing again** — the next hypothesis is
  GHA cache quota/eviction pressure from `mode=max`'s export size (still large per-scope,
  just no longer collision-prone); consider `mode=min` or per-stage cache scoping before
  escalating to Option C (pre-built base image).
- **`docker-publish.yml` failure rate over a longer window** (aim for the original ~100-run
  sample) diverges meaningfully from the 0/30 measured here — re-evaluate Option D.
- **The `detect-docker-changes` paths list drifts out of sync with `docker-publish.yml`'s**
  — they're duplicated by hand, not shared; a future refactor could extract a reusable
  composite action if this becomes a maintenance burden.
