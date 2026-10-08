---
name: backlog
description: 'Composite backlog builder for one repo: scores findings by ROI, groups themes, creates GitHub issues on a Project board. Use to build a backlog or plan sprints.'
user-invocable: true
auto-invoke: build a backlog, generate a backlog, find gaps, find opportunities, refactoring opportunities, what should i work on, what is missing in this repo, audit and plan, comprehensive backlog, project audit and plan, what can i get done this week, sprint planning, i have N days, prioritize my work, what has the most value
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/backlog
triggers:
    - backlog
    - what to work on
    - prioritize issues
    - plan sprint
---

# /backlog

End-to-end backlog builder for a single repo. Turns "what's wrong or missing
here?" into a curated, ROI-ranked, deduped set of GitHub issues on a Project
board — with full specs for new features and a propose-then-confirm gate
before any GitHub write.

Replaces: `/audit-deep`, `/repo-state-snapshot`, `/ecosystem-health`,
`/adt-specs-spec-new`, `/plan-to-issues`, and manual board management.

## When this fires

Auto-invoked on: "build a backlog", "what should I work on", "audit and plan",
"sprint planning", "I have N days", and similar queries. Also auto-queued by
`/onboard-new-repo` and auto-queues `/next-priority` at completion.

See [references/workflow.md § Triggers](references/workflow.md#triggers) for
the full auto-invoke list.

## Eight-phase workflow

Runs sequentially with parallel discovery in Phase 1. Each phase has explicit
stop/skip conditions and a reconciliation line — never silently omit.

**Phase summary:**

- **Phase 0:** RAG pre-flight + cache check for prior snapshot. Load approval
  history for category urgency penalties. See
  [references/memory-integration.md](references/memory-integration.md).

- **Phase 1:** Parallel discovery via `audit-deep`, `ecosystem-health`,
  `repo-state-snapshot`. Collect code markers and git history. Abort if not
  in a git repo.

- **Phase 2:** Normalize findings, assign `value_score` (1–5), compute ROI:
  `(severity × urgency × value_score) / effort`. Dedup against open issues.
  Group into 3–6 themed bundles. See
  [references/workflow.md § Ranking](references/workflow.md#phase-2--categorize-dedup-rank).

- **Phase 3:** Interactive propose gate. Display findings by theme with `Val`
  column and justification. Support `--budget 2d` greedy knapsack. No GitHub
  writes before approval. See
  [references/workflow.md § Propose](references/workflow.md#phase-3--propose-interactive-gated).

- **Phase 4:** Generate specs for approved features only (via
  `adt-specs-spec-new`). Skip if no features approved.

- **Phase 5:** Write `.claude/backlog/<YYYY-MM-DD>.md` plan file with
  phased task list grouped by severity.

- **Phase 6:** Create GitHub issues via `plan-to-issues` + post-processing.
  Apply labels, link specs, comment on duplicates. Failed creations are NOT
  rolled back — marked in reconcile, plan remains durable.

- **Phase 7:** Resolve "Active Backlog" Project board (or create with user
  confirmation). Add all created issues as cards in ROI order. Skip if user
  declines creation.

- **Phase 8:** Append run summary to plan file. Save memory snapshot for
  future `/next-priority` queries. Suggest invoking `/next-priority`.

## Reconciliation block

Every run prints a verbatim block with one line per phase (no silent omits):

```
BACKLOG — <owner>/<repo>
  Pre-flight: <snapshot date or none> · <approval history loaded or none>
  Discover:   <N findings>
  Rank:       <M ranked, K deduped>
  Themes:     <N themes with counts>
  Propose:    <U approved, V rejected> · budget: <status>
  Spec:       <F specs generated | skipped>
  Plan:       .claude/backlog/<YYYY-MM-DD>.md
  Issues:     <list or failed: reason>
  Board:      <URL or skipped>
  Snapshot:   ~/.claude/projects/.../backlog_<repo>_<date>.md
  Queued:     /next-priority
```

Skipped phases: `(skipped: <reason>)`. Failed phases: `(failed: <reason>)`.

## Constraints & config

**Negative rules** (strict enforcement): See
[references/stop-conditions.md](references/stop-conditions.md) for full list,
including: no issues without user approval, single-repo only, no duplicates
without explicit permission, no specs for non-features, read-only for app code.

**Configuration:** Per-repo settings at `.claude/backlog-config.json`. All
fields optional; defaults apply if absent. See
[references/config-schema.md](references/config-schema.md) for full schema.

**Key fields:** `project_url`, `max_findings_per_run`, `auto_create_board`,
`dedup_strategy`, `excluded_paths`.

## Architectural notes

- Phase 1 runs 3 skills in parallel (independent tool calls per
  `claude-code.md`).
- Phase 2 dedup runs before plan write → `plan-to-issues` never creates
  duplicates.
- Spec ownership: `adt-specs-spec-new` writes to `docs/specs/`; backlog
  populates content via Edit.
- Single "Active Backlog" board at @me-scope; `Repo` field distinguishes source.
- Read-only for app code; writes only plan, spec, config, label, memory.

See [references/workflow.md § Invariants](references/workflow.md#invariants)
for detailed architectural decisions and constraints.
