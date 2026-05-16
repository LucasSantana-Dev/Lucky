# 2026-05-16 — Next refactor target: bot circular dependencies (not dual-lockfile)

## Status

Accepted (decision). Selects the next `/refactor-pipeline` target after surveying the open refactor backlog.

## Context

`/refactor-pipeline` is a heavyweight composite (refactor-plan → three-man-team → fix-the-suite → adr-write → docs-sync → merge-confidently). It should only be invoked when the target genuinely warrants the full apparatus. Today's session had multiple plausible targets surface during cleanup work, and the question is which one to invest the next refactor cycle in.

Open refactor-shaped candidates as of 2026-05-16:

1. **#871 bot circular dependencies** — flagged HIGH in `audit_deep_lucky_2026-05-13`. `npx madge --circular packages/bot/src` confirms 15 active cycles across 4 clusters (types, monitoring, autoplay/queue, self-cycles).
2. **Dual-lockfile cleanup** — `pnpm-lock.yaml` is tracked alongside `package-lock.json`; CI uses `npm ci` so the pnpm lock is decorative + drifts. Memory `feedback_bulk_workflow_rollout_2026-05-13` documents recurring pain.
3. **`docker-publish.yml` extract trivy-image step to reusable composite action** — premature; the step is 20 minutes old.
4. **`config-drift-detect` HIGH findings** — diagnostic hasn't been re-run since v2.11; no data to ROI against.
5. **`WindowsAdmin` / `RBAC` service extraction** — speculative, no evidence of pain.

The question:

> Which refactor target gives the best ROI to invest the next `/refactor-pipeline` cycle in?

## Research

### Phase 1 candidates (with one-line tradeoffs)

| #   | Candidate           | Evidence of pain                             | Effort  | Composite fit                               |
| --- | ------------------- | -------------------------------------------- | ------- | ------------------------------------------- |
| 1   | bot circular-deps   | 15 cycles confirmed via madge; HIGH in audit | ~1 day  | yes — cross-module, structural              |
| 2   | dual-lockfile       | recurring CI churn                           | ½–1 day | **no** — cleanup, not refactor              |
| 3   | trivy-image extract | none yet                                     | S       | no — premature ("use 3 times then extract") |
| 4   | config-drift HIGH   | unknown                                      | unknown | no — no data                                |
| 5   | WindowsAdmin/RBAC   | speculative                                  | unknown | no — no evidence                            |

Initial leading option: **dual-lockfile** (smallest effort, real CI pain).

### Phase 2 critique (flipped the winner)

The `critic` agent returned **NO-GO** on dual-lockfile and **GO** on circular-deps. Three findings, all accepted:

1. **Dual-lockfile is cleanup, not refactor.** No cross-module API change, no consolidation of duplicated logic. Wrong composite (`/refactor-pipeline`) for the work; should ship as a routine PR if it ships at all.

2. **Inverted defer logic.** The proposal deferred circular-deps because the trivy-image Phase A rollout "needs attention" — but Phase A is _passive observation_ (post-ship), while circular-deps is a _blocking structural issue_ that pollutes every PR. Correct order: circular-deps first, dual-lockfile as routine cleanup later.

3. **Dual-lockfile scope was underestimated.** Critic flagged 4–6 files minimum (pnpm-lock, `bundle-size.yml` pnpm shim, Dockerfile comments, edge cases) — and the `bundle-size.yml` pnpm shim could silently degrade if pnpm-lock disappears. Untested risk.

### Phase 1 (revised, post-critique)

Leading option flipped: **#871 bot circular-deps** (1 day, real structural blocker, correct composite fit). Dual-lockfile demoted to routine-PR queue.

## Decision

1. **Next `/refactor-pipeline` target is #871 (bot circular-deps).** Total estimated effort 1 day (within the composite's 2-day ceiling).

2. **Sequenced as 4 PRs:**
    - **PR 1** — Cluster A (types barrel) + Cluster D (self-cycles): ~45 min total. Single commit, no test changes.
    - **PR 2** — Cluster B (monitoring): ~1 h. Extract `monitoring/types.ts` to break `SimplifiedTelemetry ↔ healthChecks/telemetryMetrics`.
    - **PR 3** — Cluster C (autoplay ↔ queue): 4–6 h. Real structural refactor. Break the `queueManipulation → autoplay/* ↔ each other` knot via an interface flip (autoplay accepts a callback or queue protocol, not a direct import).
    - **PR 4** — Add `madge --circular` to org reusable `quality.yml` as audit-only (`exit-code 0`), promote to blocking after PR 3 lands. Mirrors the Trivy Phase A → B pattern established today.

3. **Dual-lockfile is NOT this cycle.** Demote to a routine cleanup PR, sequenced AFTER circular-deps lands. When that PR is written:
    - Treat as a cleanup (no `/refactor-pipeline`).
    - Include explicit `bundle-size.yml` pnpm-shim regression test before removing `pnpm-lock.yaml`.
    - Document the npm-over-pnpm choice rationale (or revisit and pick pnpm if the org-standardization argument wins).

4. **Other candidates (#3-5) stay parked.**

## Consequences

### Positive

- Resolves a HIGH audit finding that's been open since 2026-05-13.
- Eliminates a class of "import-time error when files swap" failures that hit every bot rebuild.
- Establishes a CI guard (`madge --circular`) that prevents regression.
- The Phase A → B pattern (audit-only → blocking) is now reused twice in one week (Trivy image, madge); the pattern becomes load-bearing convention.
- Frees the dual-lockfile cleanup to ship cheaply later, after the structural issue is resolved.

### Negative

- 1 day of focused refactor work; everything else (Snyk re-scan, observability rollout deploys, homelab PR #135) stalls during the cycle.
- Cluster C (autoplay ↔ queue) is the riskiest piece — autoplay touches the music command path, which is the bot's highest-traffic surface. Test coverage on that area is decent (see `audit_deep_lucky_2026-05-13` test-ratio finding) but not exhaustive.
- 4 PRs is more bureaucratic overhead than ideal; PR 1 + PR 2 could merge into one. Kept separate for clean revert windows on Cluster C if it goes wrong.

### Neutral

- The dual-lockfile decision is deferred, not denied. Will return as a routine PR once #871 lands.
- `madge` becomes a tracked dependency (already present as a transitive; PR 4 elevates to a direct devDependency).

## Revisit when

- **PR 3 (Cluster C) reviewer rejects 2 phases in a row** → stop and revise the plan, per `/refactor-pipeline`'s Phase 2 stop condition. Likely means the interface flip isn't right; consider a façade instead.
- **Test coverage drops on autoplay** → per the composite's Phase 3 stop condition, revert PR 3 unless the user explicitly accepts the coverage drop with rationale.
- **A new circular-dep audit finding lands AFTER PR 4** → indicates the `madge` gate isn't strict enough; tighten threshold or scope.
- **Dual-lockfile cleanup is opened as a `/refactor-pipeline`** → re-read this ADR; it's a routine PR per critic, not a composite-weight task.
- **Org standardizes on pnpm across all TS repos** → revisit the npm-over-pnpm assumption for Lucky.

## Alternatives rejected (summary)

- **Dual-lockfile cleanup** — wrong composite (cleanup, not refactor); scope underestimated; defer to routine PR after #871.
- **Trivy-image extract to composite action** — premature (just shipped 20 minutes ago).
- **config-drift HIGH findings** — no data to ROI against; queue as diagnostic re-run, not refactor input.
- **WindowsAdmin/RBAC** — speculative, no evidence of pain.

## Related

- Issue [#871](https://github.com/LucasSantana-Dev/Lucky/issues/871) — the concrete target.
- `audit_deep_lucky_2026-05-13` (memory) — original HIGH finding.
- [[2026-05-16-trivy-image-scan-vs-snyk-in-ci]] — same-week, same Phase A → B rollout pattern.
- [[2026-05-15-no-ai-generated-docs-in-tracked-state]] — same-week decision style (delete + ADR + mechanical enforcement).
