# CI runtime: baseline accepted, sharding deferred

Date: 2026-05-24

## Context

After test-reduction PRs #1013–#1018 (Phase 4 bot/backend test cleanup), CI wall time
was re-measured across four recent runs on the `main`-targeting workflow:

| Run | test-backend | test-bot | SonarCloud | Total wall |
| --- | ------------ | -------- | ---------- | ---------- |
| #1  | 2:11         | 1:42     | 1:03       | ~3:50      |
| #2  | 2:02         | 1:38     | 0:58       | ~3:40      |
| #3  | 2:08         | 1:44     | 1:01       | ~3:50      |
| #4  | 2:05         | 1:41     | 1:00       | ~3:45      |

Critical path: `test-backend` (~2:02–2:11) → `SonarCloud` (~1 min) = **~3-4 min**.

The memory reference to "8-10 min" pre-dates these PRs (baseline from v2.14.0 ship notes
for the CI parallel-jobs restructure in PR #942, which itself cut from ~13-15 min to ~8-10
min). Current state is meaningfully better.

The project's memory note at `project_v2_14_1_ship_2026-05-23` and the broader discussion
raised the question of whether further optimization was warranted — specifically Jest
sharding (`--shard N/M` flag) across matrix runners for `test-backend`.

PRD #966 is open and plans ~29 additional test removals across `memberHandler.spec.ts`,
`embed.spec.ts`, and `errorHandlers.spec.ts`. This was not yet applied when measurements
were taken.

## Decision

Accept the current 3-4 min baseline. Do not introduce Jest sharding or runner-count
expansion at this time. Continue executing PRD #966 (deferred test cleanup) on its own
merits.

## Alternatives considered

**Jest sharding (`--shard N/M` across 2-4 matrix runners)** — Splits the `test-backend`
suite across multiple runners in parallel. Maximum gain if `test-backend` is the critical
path is ~1 min (halving ~2 min, assuming even distribution). Rejected:

- Fails the effort-to-impact threshold at 3-4 min baseline. Saving 1 min from an already
  fast pipeline introduces matrix configuration, coverage-artifact merging (`lcov-result-merger`
  or equivalent), `quality-gate` fan-in changes, and ongoing maintenance surface.
- GitHub-hosted runners are 2 vCPU; `maxWorkers: '50%'` = 1 effective worker. Adding
  shards spreads the _process count_ but does not improve per-shard CPU parallelism.
- Merging coverage from N shards before the SonarCloud job adds a new failure mode and
  requires explicit merge logic not currently present.

**Increase `maxWorkers`** — Raising `maxWorkers` above `'50%'` on a 2-vCPU runner causes
CPU contention; test time increases or is unchanged. Rejected.

**Move SonarCloud to non-blocking** — SonarCloud's ~1 min occupies the critical path after
`test-backend`. Making it advisory-only would cut wall time by ~1 min but remove the
quality gate enforcing the coverage floor. Rejected: quality gate is load-bearing.

**Continue PRD #966 only** — Planned ~29 test removals reduce suite size, which shortens
`test-backend` slightly without pipeline complexity. Not a substitute for sharding if CI
becomes a problem later, but the right next step from the current baseline.

## Consequences

**Positive:**

- No new CI infrastructure complexity introduced.
- 3-4 min is within acceptable feedback-loop latency for a monorepo of this size.
- PRD #966 execution removes tests of questionable value, improving suite quality
  independent of runtime.

**Negative:**

- Suite continues to grow with new features; if sharding is needed later, it will need to
  be introduced reactively.

**Neutral:**

- The `maxWorkers: '50%'` setting in `backend/jest.config.cjs` and `bot/jest.config.cjs`
  is appropriate for 2-vCPU runners and remains unchanged.

## Revisit when

- Post-PRD #966, `test-backend` consistently exceeds **4 min** in wall time (currently ~2 min).
- A new feature phase adds a large test surface (e.g., integration test expansion from
  `docs/decisions/2026-05-09-autoplay-integration-tests-phase-a.md`).
- Runner count increases (self-hosted runners with >2 vCPU would change the `maxWorkers`
  calculus and make sharding more impactful).
