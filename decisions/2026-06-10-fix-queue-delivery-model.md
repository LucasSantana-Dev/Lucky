# Fix-queue delivery model: serial PR-per-issue, with a deletion-batch carve-out

- Status: accepted
- Date: 2026-06-10
- Decision drivers: 41 ready-for-agent issues queued; every main merge auto-deploys to production (5-min wait timer, no approval gate); solo operator is the verification bottleneck; documented agent-fabrication (2026-05-28) and worktree-escape (2026-05-30) incidents; squash-merge-only history; stateful production workload (live music/voice sessions die on a bad deploy).

## Context

The 2026-06-09 backlog run plus follow-up audits left ~41 small-to-medium issues
ready for delivery. Four delivery models were evaluated via /research-and-decide
(critic pass: Opus, artifact+contract only): (A) serial PR-per-issue, (B) themed
batch PRs, (C) parallel agent fan-out with worktrees, (D) hybrid risk-tiered
waves. Measured baseline: 5 serial issues/day with full per-merge production
verification (2026-06-09/10 sample, n=5 PRs).

## Decision

1. **Serial one-PR-per-issue remains the standing delivery model.** Each PR:
   branch → CI → squash-merge → deploy → verify deployed SHA live before the
   next behavior-touching merge.
2. **Carve-out — deletion batches:** dead-code removals may share one PR when
   they are (a) within a single package, (b) zero-interdependency, (c) verified
   zero-callers, and (d) contain no behavior changes. One package = one PR
   (e.g. #1299 bot, #1300 shared, #1261-sweep frontend).
3. **Merge-order heuristic:** high-severity / deploy-sensitive items first
   (while attention is fresh, one at a time), respecting dependencies
   (#1280 Redis-optional before #1111 KV migration); low-risk chores fill gaps.
4. **Model D (hybrid waves) is deferred** behind four prerequisites:
   automated post-deploy healthcheck gating (overlaps #1193 + #1294); a written
   rollback SLA/decision tree; risk-tier classification on the board (Priority
   field); per-PR time measured over the next 3–5 PRs to ground throughput math.
5. **Model C (parallel agent fan-out) is deferred** until worktree isolation is
   independently verified (test that simulates concurrent subagent edits) or a
   parallel local verification harness exists. The 2026-05-30 escape incident
   is disqualifying until then.
6. **Model B (themed batch PRs for behavior-touching code) is rejected** —
   coarser bisect/revert granularity under squash-merge with no real
   throughput gain (operator verification, not CI, is the bottleneck).

## Alternatives considered

- **B — themed batches:** rejected; one bad item blocks/reverts its whole batch,
  and deploy coalescing makes culprit isolation slow on a stateful bot.
- **C — parallel fan-out:** rejected for now; agent-fabrication history means
  the operator re-verifies everything anyway (parallelism amplifies, not
  relieves, the bottleneck), and worktree isolation has failed once.
- **D — hybrid waves:** strongest challenger; rejected _as stated_ because
  wave-end verification creates a 30–60 min window where a bad deploy hides
  behind subsequent merges. Becomes eligible once the prerequisites above turn
  per-merge manual verification into an automated gate.

## Consequences

- (+) Maximum bisectability: every production image maps to one issue.
- (+) Bad deploys implicate exactly one PR; active rollback stays simple.
- (+) Deletion batches cut PR count for the ~10 dead-code items without
  adding behavioral blast radius.
- (−) Queue completion is ~8 working days at measured throughput.
- (−) Deploy churn: one production deploy per behavior-touching merge
  (mitigated by docker-publish concurrency coalescing when merges are rapid).
- (n) The prerequisites for D are tracked work, not aspirations: #1193
  (rollback + healthcheck gate) and #1294 (deploy status callback) already
  exist; completing them is what unlocks the faster model.

## Revisit when

- Queue completion exceeds 6 working days AND operator has spare capacity →
  re-evaluate D **only if** its prerequisites are done.
- Any mid-batch production break or worktree-isolation failure → fall back to
  strict per-issue serial until root-caused.
- Worktree isolation verified + parallel verification harness in place → C
  becomes eligible for xs/s items.
- More than 2 delivery incidents (failed deploy, wrong merge, stalled PR) in
  10 days → re-run /research-and-decide on this question.
