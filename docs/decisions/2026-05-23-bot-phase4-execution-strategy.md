# ADR — Bot Phase 4 test-reduction execution strategy: staged pilot before full parallel

- **Date:** 2026-05-23
- **Status:** Superseded by `docs/decisions/2026-05-23-bot-phase4-continuation-strategy.md`
- **Owner:** Lucas Santana
- **Related:** `docs/decisions/2026-05-23-bot-test-reduction-phase4-replacement-strategy.md`, issues #956–964, #966

## Context

Phase 4 has 8 independent issues (#956–963), all `ready-for-agent`. Three distinct
replacement test patterns exist:

- **P1 — Pure algorithmic** (`it.each` consolidation): `candidateScorer.spec.ts` (#958)
- **P2 — API delegation** (response-shape flow tests): `lastFmApi.spec.ts` + `spotifyApi.spec.ts` (#957)
- **P3 — Command handler flow tests** (happy path + rejection): `queueManipulation.spec.ts` (#956), five command-suite issues (#959–963)

The coverage gate holds only ~0.4pp headroom (65/60/60/65). A failed replacement
that doesn't cover the deleted branches will trip CI immediately. P3 covers 62.5% of
the work (6 of 8 issues including #956) and uses a novel pattern (Discord.js interaction
stubs + behavioral assertions on returned command result). No existing working examples
of this pattern exist in the codebase.

## Decision

Run a staged parallel pilot before full parallel batch.

**Step 1 — Parallel pilot:** Dispatch #958 (P1) and #956 (P3) simultaneously, each
in its own git worktree. These two issues validate the two distinct replacement patterns.

**Step 2 — Full batch:** After both pilots land and pass CI, dispatch the remaining 6
issues (#957, #959–963) in parallel worktrees.

**Step 3 — Gate tightening:** Issue #964 (tighten to ~68/63/63/68) after all 8 are
confirmed green.

P2 (#957) is not piloted separately — it is structurally similar to P3 (fake external
boundary, assert behavioral output); P3 validation is sufficient evidence that P2 will
succeed.

## Alternatives considered

**Option C — Pilot P1 only, then batch 7:** Rejected. P3 is 62.5% of the work and
uses an unvalidated pattern. If P3 is wrong, 7 implementations need rework. The 1–2 day
savings from smaller pilot does not justify the cascade risk.

**Option B — Full parallel immediately (all 8):** Rejected. No replacement test pattern
has been written yet. Batching all 8 without a validated template risks 8 implementations
sharing the same incorrect pattern, all failing the coverage gate simultaneously.

**Option A — Sequential (one at a time):** Rejected. Issues are independent;
sequential execution wastes available parallelism and is explicitly prohibited for ≥2
independent tasks per project workflow standards.

## Consequences

- **Positive:** Pattern failures surface on 1–2 pilots, not 6–8 simultaneous agents.
- **Positive:** P2 risk is low-cost (only 2 issues) even if the P3-subsumes-P2 assumption is wrong.
- **Negative:** Pilot phase adds ~1–2 days wall-clock before full batch starts.
- **Neutral:** Coverage gate protection is unchanged; staged gates provide an additional checkpoint.

## Revisit when

- Coverage gate headroom increases to ≥1.5pp — at that point full parallel becomes safe without staged pilots.
- A working P3 replacement test template exists in the codebase — then piloting P3 is redundant for future Phase 4 passes.
- If P2 fails during the batch despite P3 succeeding — indicates the two patterns diverge more than expected; update this ADR with the failure mode.
