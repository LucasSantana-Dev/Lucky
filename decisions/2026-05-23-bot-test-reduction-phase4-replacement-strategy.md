# ADR — Bot test reduction Phase 4: deletion + replacement strategy

- **Date:** 2026-05-23
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Supplements:** `decisions/2026-05-09-bot-test-suite-cleanup-strategy.md`
- **Related:** PRs #938, #939, #940 (Phases 1–3), issue #909 (shared coverage threshold)

## Context

The 2026-05-09 ADR set a ≤1,500-test target for `packages/bot` and established the
per-file, gate-checked cleanup protocol. Phases 1–3 (PRs #938–#940) executed that
protocol and reached **2,893 tests** — essentially flat from the starting baseline of
2,848 because new feature tests were added while delegation tests were removed.

A `/research-and-decide` pass evaluated two strategies for closing the 2,893 → ≤1,500
gap:

**Strategy A — `it.each` consolidation:** Rewrite repetitive `it()` blocks as
`it.each` tables. Reduces LOC and improves readability. Does NOT reduce Jest's
reported test count (each table row is counted as one test). The existing ADR already
documents this on line 53. Confirmed by independent critic review: Strategy A cannot
achieve the ≤1,500 target.

**Strategy B — Delete + replace with module-level flow tests:** Delete delegation-only
test clusters from mixed spec files, paired with coarser module-level flow tests that
maintain branch coverage with fewer cases. This is the path.

The critic review identified the blocker: "replacement integration tests" was undefined.
Until Phase 4 execution protocol and replacement test shape are specified, Strategy B
stalls after Phases 1–3.

## Decision

### 1. The deletion target requires replacement tests — not just deletion

Tests remaining after Phases 1–3 are no longer pure delegation (0 behavioral
assertions). The mixed files (queueManipulation, autoplay, lastFmApi, etc.) contain
delegation clusters interleaved with genuine behavioral tests. Deleting the delegation
clusters without replacement WILL drop below the 65/60/60/65 gate.

Protocol: **delete cluster → add replacement → gate check → commit**. Never commit a
deletion without a corresponding replacement unless the pre-deletion coverage scan
confirms zero branch contribution.

### 2. "Replacement test" definition

A replacement test is a **module-level flow test** that:

- Calls the **real function under test** (no mock of the SUT itself).
- Uses Jest fakes only at external boundaries: Discord.js client, HTTP clients
  (axios/got/spotify), database services, `autoModService`, etc.
- Has at least one **behavioral assertion** — a return value, a state change, an
  emitted event, or a thrown error. `toHaveBeenCalled` alone does not qualify as a
  replacement.
- Exercises ≥1 distinct branch that the deleted tests collectively covered.

One well-written replacement test can replace 5–15 delegation-only tests provided it
covers the same branches via different inputs, not via separate `toHaveBeenCalledWith`
assertions.

### 3. Execution protocol per file

1. Run `npx jest --coverage --collectCoverageFrom='src/path/to/module.ts'` to get
   per-file branch baseline.
2. Identify delegation clusters: consecutive tests where every `expect()` is
   `toHaveBeenCalled` or `toHaveBeenCalledWith` and no return value is asserted.
3. Write replacement test(s) first. Verify they pass and cover the same branch paths
   (coverage delta ≥ 0 on the target file).
4. Delete the delegation cluster.
5. Verify the global gate holds:
   `npx jest --silent --coverage --coverageReporters=text-summary`
6. Commit the pair as a single atomic change.

### 4. Revised targets for remaining high-count files

| File                        | Current tests | Target | Approach                                                                                          |
| --------------------------- | ------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `queueManipulation.spec.ts` | ~114          | ~55    | Delete `toHaveBeenCalled` chains; replace with queue-state assertions                             |
| `lastFmApi.spec.ts`         | ~90           | ~40    | Delete per-endpoint delegation; replace with response-shape flow test                             |
| `candidateScorer.spec.ts`   | ~75           | ~30    | Pure algorithmic — consolidate via `it.each` (this one DOES reduce count, it's pure input→output) |
| `spotifyApi.spec.ts`        | ~70           | ~30    | Same as lastFmApi                                                                                 |
| Command suites (15 files)   | ~300 total    | ~100   | One flow test per command covering happy path + rejection                                         |

Estimated post-Phase-4 count: **~2,300 tests** (not ≤1,500 in one pass).

### 5. Revised target timeline

The ≤1,500 target remains the long-term goal but requires multiple Phase 4 passes,
not one. Each pass targets one of the high-count file groups listed above. The
intermediate checkpoint after the first pass is **≤2,300 tests** with all five groups
addressed.

Reaching ≤1,500 requires also addressing the autoplay module (~180 tests), scrobbler
(~60 tests), and guild automation spec files as executors are added. This is ongoing
work, not a single sprint.

### 6. `it.each` use is allowed — as a secondary maintainability pass

After the deletion+replacement cycle reduces a file's test count, `it.each`
consolidation of the surviving algorithmic tests is a valid final step. Specifically
for pure input→output functions (candidateScorer, queueManipulation utility functions),
`it.each` consolidation DOES reduce test count because multiple previously-separate
`it()` blocks are merged into one table (but count stays the same per row). This only
helps when tests share the exact same code path with different inputs — then one
`it.each` with N rows replaces N `it()` blocks, and the redundant rows can be trimmed
to the minimal distinguishing set.

## Consequences

- **Positive:** Phase 4 is now unblocked — the replacement test shape and execution
  protocol are defined.
- **Positive:** The ≤1,500 target is preserved but explicitly staged: ≤2,300 after
  first Phase 4 pass, continuing toward ≤1,500 across subsequent passes.
- **Negative:** Writing replacement flow tests costs more per batch than pure deletion.
  Estimate 3–4 hours per high-count file (audit + write + delete + verify), not the
  20-minute batches of Phases 1–3.
- **Neutral:** Coverage gate (65/60/60/65) remains unchanged. Tighten by 2-3 pp only
  after the Phase 4 first pass lands and coverage delta is confirmed positive.

## Alternatives considered

- **Raise the target from ≤1,500 to ≤2,000** to reduce Phase 4 scope. Rejected: the
  gap from 2,893 to 2,000 is achievable with the first Phase 4 pass alone and sets a
  weak ceiling. Keeping ≤1,500 maintains pressure toward a suite proportional to the
  codebase size.
- **Lower the coverage gate temporarily to give deletion headroom.** Rejected by
  original ADR; this constraint stands.
- **Run Stryker first to identify which tests are genuinely protective.** Deferred
  (also in original ADR). Stryker installation is its own project. Phase 4 proceeds
  with the behavioral-assertion proxy instead.

## Revisit when

- After the first Phase 4 pass (all 5 high-count files addressed): check if ≤2,300
  was achieved and whether coverage headroom increased enough to tighten the gate.
- If new executor PRs (Roles, Channels, Onboarding, ReactionRoles, CommandAccess) each
  add >50 tests, revisit whether the executor test pattern is generating delegation
  bloat again.
- If Stryker is installed, run a mutation pass on `autoplay/` and `lastfm/` to
  validate Phase 4 replacement tests before the second pass.
