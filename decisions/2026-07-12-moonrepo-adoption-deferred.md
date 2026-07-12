# Moonrepo (moon) adoption — deferred

- **Date:** 2026-07-12
- **Status:** Accepted (defer)
- **Deciders:** Lucas Santana
- **Scope:** Build-tooling for the Lucky monorepo — whether to adopt `moon` (moonrepo)
- **Method:** `/research-and-decide` — repo-evidence research → decision-critic (verdict
  SOUND, no flip; surfaced the missing CI-timing baseline + the script-sprawl framing
  error, both reconciled below) → this ADR

## Context

Question raised: is `moon` (moonrepo) worth implementing on this project?

`moon` is a Rust task-graph runner for monorepos: task caching (local + remote),
affected/changed-project detection, and toolchain pinning (it manages the Node version
itself). Its payoff scales with project count, toolchain diversity, remote-cache reuse,
and team size.

Current repo state (the evidence this rests on):

- **4 TypeScript packages**, one npm-workspaces monorepo: `shared` (built first, consumed
  by the other 3), `bot`, `backend`, `frontend`.
- **Single toolchain** — Node 22 + `tsc`. No Rust/Go/Python. **One maintainer.**
- Build: `shared` via `tsc -b`, then bot/backend/frontend each `tsc`; Prisma client
  generated into `shared`.
- **CI** (`ci.yml`): 7 jobs — `build-shared` then 6 dependents each `needs: build-shared`.
  Each job runs `npm ci --legacy-peer-deps --ignore-scripts` and rebuilds `shared`.
  npm dependency-cache on. No build-artifact cache between jobs; no remote cache.
- Root `package.json` orchestrates ~40 scripts by hand-chained `&&` across workspaces.
  (Note: this is an **organization** concern, not a build-tool one — turbo/moon _hide_
  these scripts behind `turbo.json`/`moon.yml`, they don't reduce them. Not a
  justification for adopting either; see Alternatives.)
- **Measured redundancy cost:** a cold `shared` rebuild (`tsc -b --force`) = **~6.5s**
  wall-clock. The redundant rebuild across 6 dependent jobs is therefore ~6.5s × 6 ≈ **39s
  gross per CI run**, and less net once `download-artifact` overhead (~2–3s/job) is
  subtracted. The dominant per-job cost is `npm ci`, not the rebuild. **The redundancy is
  real but small** — this is the empirical baseline the decision rests on.
- **Affected-detection already exists at the CI layer:** ADR
  `2026-07-08-ci-docker-build-paths-filter-phased-speedup` shipped a
  `detect-docker-changes` paths-filter job + `type=gha` docker cache. The repo already
  solves "don't rebuild what didn't change" with native GitHub Actions features — the
  headline `moon` value is largely already captured by cheaper means.

## Decision

**Defer `moon`.** Do not adopt it now. At 4 single-toolchain packages the task-graph +
toolchain-management machinery costs more (config layer, ~40-script migration, CI rework,
learning curve) than it returns. The concrete pain — each CI job re-running `npm ci` and
rebuilding `shared` — is a narrow redundancy addressable without any new tool.

**Measured caveat (from critique):** the redundancy is only ~39s gross/run (`shared` builds
in 6.5s). At today's release cadence that is a handful of minutes per _month_ — so even the
free option below is **not worth pulling yet**. Do it only when a concrete CI-time complaint
appears, and confirm the fix beats the `download-artifact` overhead first.

**If/when CI redundancy is worth fixing, climb the ladder cheapest-first:**

1. **Artifact-cache the `shared` build** across CI jobs — `build-shared` uploads its `dist`,
   the 6 dependents `download-artifact` instead of rebuilding. ~20 lines of workflow YAML,
   zero new dependency. Smallest change that removes the redundancy — but net savings are
   marginal (~30s/run after download overhead), so gate it on a real complaint, not on
   principle.
2. **Turborepo** only if task-result caching + `--filter=…[HEAD^]` affected-detection across
   _local dev_ (not just CI) becomes a real want — one `turbo.json`, no toolchain layer.
3. **moon** only past the revisit thresholds below.

## Alternatives considered

1. **Artifact-cache shared build (native GH Actions):** the minimal fix. Removes the
   redundant `shared` rebuild in 6 jobs with no new tool, no lock-in, fully reversible.
   Chosen as the first rung to pull _if_ CI speed is the actual complaint — but not
   executed as part of this decision (no current CI-time pain reported).
2. **Turborepo:** lighter than moon, ~80% of moon's benefit at this scale (caching +
   affected), no toolchain-pinning layer. Rejected _now_ — at 4 packages the affected-set
   is almost always "shared + 1", so filtering saves little; CI already has paths-filter
   affected-detection. Revisit trigger below.
3. **moon (full adoption):** most powerful (task graph, remote cache, toolchain pinning),
   most migration cost. Rejected — solves problems this repo has at _larger_ scale
   (many projects, polyglot, big CI spend, multi-dev cache reuse), not the ones it has at
   4 packages / 1 dev / single toolchain. Toolchain-pinning duplicates what
   `actions/setup-node@node-version: '22'` + `packageManager` already fix.
4. **No change, no ladder:** rejected as the _recorded_ stance — the redundant `shared`
   rebuild is a real (if minor) inefficiency; option 1 stays on the shelf as the sanctioned
   fix so a future agent doesn't reach for moon/turbo reflexively.

## Consequences

- **Positive:** zero adoption cost now; no new config layer, binary, or lock-in; the
  hand-chained scripts and native CI stay legible for a solo maintainer; the cheap fix
  (artifact-cache) is documented and ready if needed.
- **Negative:** the 6 CI jobs keep redundantly rebuilding `shared` until option 1 is
  pulled; root scripts stay verbose `&&` chains (no task-graph ergonomics).
- **Neutral:** decision is fully reversible — nothing is migrated, so adopting turbo/moon
  later starts from today's clean state.

## Revisit when

Adopt **Turborepo (option 2)** when ANY of:

- Package count exceeds **~8**, so the affected-set is meaningfully smaller than "all"; **or**
- Local-dev rebuild/test loops become a felt bottleneck (task-result caching pays off on
  the dev machine, not just CI); **or**
- A second regular contributor joins and would benefit from shared (remote) task caching.

Escalate to **moon (option 3)** when ANY of:

- The toolchain goes **polyglot** — a Rust/Go/Python package lands alongside the TS ones
  (moon's per-language toolchain management + unified task graph then earns its keep); **or**
- Package count exceeds **~12–15** and the _implicit dependency order_ between packages
  (not the script verbosity itself) becomes error-prone — a task-graph then buys
  correctness, not just ergonomics; **or**
- CI-minute spend on redundant work becomes material AND a remote build cache shared across
  many jobs/contributors would demonstrably cut it (measure first — don't adopt on vibes).

**Measure-first gate (applies to every rung, per critique):** before pulling _any_ option,
capture the actual number that would justify it — CI wall-clock/minute-spend for options 1–2,
package-count/toolchain-diversity for option 3. The `shared`-rebuild baseline is 6.5s today;
re-measure if the build materially grows. Do **not** adopt tooling to fix _script sprawl_ —
that is an organization refactor (thin `package.json`, logic in packages), which neither
turbo nor moon provides.

Re-open earlier than any threshold if a concrete CI-time or DX complaint appears that
option 1 (artifact-cache) demonstrably does **not** fix.
