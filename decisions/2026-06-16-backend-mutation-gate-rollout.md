# Backend Stryker mutation gate: tiered incremental rollout, stays advisory, pilot-gated

- Status: accepted (rollout plan with a cost-measurement gate)
- Date: 2026-06-16

## Context

PR #1455 (#1449) bootstrapped Stryker mutation testing in `packages/backend`:
`stryker.conf.json` (`inPlace:true`, `incremental:true`, `concurrency:2`), a
`mutation-backend` CI job, and a single gated module —
`src/utils/oauthRedirectUri.ts` at 93.75%, with `thresholds.break: 90`. That left
an open question: **how far, in what order, and at what threshold do we expand the
backend gate** — or do we leave the single-module canary as-is?

Evidence (verified against `main`):

- **Backend is integration-skewed.** 74 non-test source files (31 routes, 13
  middleware, 7 services, 5 utils, 7 schemas, plus startup/errors/constants) and 69
  test files, of which ~29 are integration route specs running through supertest
  with a mocked Prisma client. Mutation testing re-runs the relevant suite per
  surviving mutant, so integration-tested code (route handlers) is dramatically
  slower to mutate and more timeout-/equivalent-mutant-prone than pure unit-tested
  code.
- **The gate is advisory, not blocking.** Required status checks on `main` are
  Quality Gates, Security, SonarCloud Scan, `madge / packages/bot`, and
  `Build — Docker images`. `mutation-backend` (and `mutation-shared`) are **not**
  required — a failing mutation run turns the job red but does **not** block merge.
- **Shared is the precedent.** `packages/shared` reached 17 gated modules,
  combined 83.67%, `thresholds.break: 82`, built incrementally with a batched-PR
  playbook (harden several specs → add all to `mutate` at once → one full gate run
  → ratchet `break` once → one PR closing several issues). Shared modules are
  unit-tested and fast (~10–30s/module). Shared plateaued near an ~83% equivalent-
  mutant ceiling.
- **`break: 90` on the canary is not transferable.** oauthRedirectUri at 93.75% is
  unusually high for a trivial pure function. Any real backend module (services,
  middleware) will land ~75–82%, so the first real module added to `mutate` drops
  the combined score below 90 and fails the run. The 90 must come down before — or
  in — the first real-module PR.
- **Per-module backend mutation cost is unmeasured.** No backend module beyond the
  trivial canary has been run, so CI-minute cost per tier is a projection, not data.

A `critic` review (Opus, artifact+contract only, no stated preference) returned
**REVISE** — it did not flip the tiered/incremental/batched-PR approach, but
corrected four things now folded into this decision: (1) lower `break` proactively;
(2) **defer** routes rather than permanently **exclude** them; (3) make the
advisory-vs-required posture explicit instead of implicit; (4) pilot one module to
measure cost before committing to full tiers. (One critic claim was wrong on
verification — `artistSuggestion.ts` does have a unit test — so the services tier is
covered.)

## Decision

**Expand the backend gate incrementally in coverage tiers, keep it advisory, and
gate the expansion behind a one-module cost pilot.** Concretely:

1. **Stays advisory.** Do **not** promote `mutation-backend` to a required status
   check as part of this rollout. Its value is as a _spec-hardening driver_ during
   AI-agent test work, not as a merge blocker. Promotion is a separate decision (see
   revisit triggers) — required-gate enforcement is premature before cost is known
   and coverage is broad.
2. **Tier 1 pilot first (the cost gate).** Harden + gate **one** real module —
   `src/middleware/requestId.ts` (small, pure-ish, unit-tested) — and **measure**
   per-module mutation wall-time, survivor count, and spec-hardening effort. In the
   same PR, lower `thresholds.break` 90 → 82 to match shared. This is the 1-unit
   prototype the no-big-bang rule requires.
3. **Proceed by tiers only if the pilot is cheap** (per-module mutation time
   roughly ≤60s, no pervasive timeouts), using the shared batched-PR playbook, one
   PR per tier:
    - **Tier 1** — utils + pure middleware (`validate.ts`, `errorHandler.ts`, the
      remaining utils).
    - **Tier 2** — the 7 services (DiscordOAuth, Session, Guild, GuildAccess,
      LastFmAuth, Spotify, artistSuggestion) — highest business-logic bug-risk.
    - **Tier 3** — remaining stateful middleware (auth, session stores).
    - **Tier 4 (deferred, optional)** — routes. Decided by a _separate_ pilot on the
      smallest route (`health.ts`) after Tier 3 stabilizes; expand only if route
      mutation time/timeout behaviour is acceptable. Routes are **deferred, not
      permanently excluded** — they are the highest-traffic code and their 8.7k LOC
      of integration tests are already maintained.
4. **Ratchet `break` per tier** to ~1pt below the combined score, as on shared; stop
   ratcheting at the equivalent-mutant ceiling (~80–83% expected).

## Alternatives considered

- **Leave the single-module canary (status quo).** Rejected: wastes the bootstrap
  and the spec-hardening value; the canary alone catches nothing of substance.
- **Broad / all-at-once** (add every testable module, low break, ratchet up).
  Rejected: a big-bang bet with unmeasured CI cost; violates the incremental-
  delivery + prototype-first rule.
- **Routes-first.** Rejected: highest mutate cost, highest timeout/equivalent-mutant
  risk on supertest integration tests, lowest signal-per-CI-minute. Wrong end of the
  ROI curve to start on.
- **Promote `mutation-backend` to a required check now.** Rejected as premature: a
  blocking gate before cost is measured and coverage is broad would block merges on
  a half-built gate. Folded into a revisit trigger instead.
- **Tiered incremental, advisory, pilot-gated (chosen).** Mirrors the proven shared
  playbook, bounds the risk to one measured module, and is honest about the gate
  being advisory.

## Consequences

- Positive: bounded, measured rollout; reuses a playbook proven on 17 shared
  modules; spec-hardening on real backend logic (services/middleware) where bugs
  actually live; `break` stops contradicting reality.
- Negative: an advisory gate's value is soft until/unless promoted to required — the
  work competes with higher-priority required-check health; integration-test
  mutation cost is a real unknown until the pilot runs.
- Neutral: consistent with the measure-before-building posture and the shared
  mutation arc (#1426). Subagent parallelism is **not** used — tiers integrate
  serially in the main worktree (stryker.conf + the single `break` threshold is a
  serialization point, and parallel subagent worktrees proved unreliable in #1426).

## Revisit when (concrete triggers)

- **Tier 1 pilot shows per-module mutation time > ~60s or pervasive timeouts** →
  halt expansion, reconsider scope (smaller module set, or stop at utils).
- **`mutation-backend` is proposed for promotion to a required check** → re-open as
  its own decision; ROI shifts up and the tier cadence accelerates. Candidate
  trigger: combined backend score stable > 82% for 3 consecutive PRs.
- **A production regression slips through that route mutation would have caught** →
  re-open the Tier 4 (routes) deferral immediately.
- **Backend combined score plateaus** (equivalent-mutant ceiling, as shared did near
  83%) → stop ratcheting `break`; further modules are coverage-theater.

## References

- Issue #1426 — Stryker mutation-gate arc (umbrella, closed 2026-06-16); PR #1455 (#1449) — backend bootstrap
- `packages/backend/stryker.conf.json` (`mutate`, `thresholds.break`), `.github/workflows/mutation.yml` (`mutation-backend` job)
- `packages/shared/stryker.conf.json` (17 modules, break 82 — the precedent)
- Memory: `project_mutation_backlog_1426_2026-06-15` (batched-PR playbook, subagent-worktree-unreliable lesson)
