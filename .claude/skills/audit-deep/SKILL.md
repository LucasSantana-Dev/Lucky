---
name: audit-deep
agent: general-purpose
context: fork
description: Composite project health check (testing, config, hooks, security, MCP, plugins) into one severity-ranked report. Use weekly or before major releases.
user-invocable: true
auto-invoke: weekly-per-repo + pre-release + tech-debt-review
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/audit-deep
triggers:
    - audit-deep
    - audit repo
    - health check
    - tech debt review
    - before release
---

# Audit Deep

Runs every audit skill in parallel against one repo, reconciles findings by severity,
and proposes a single prioritized remediation plan. Replaces the "run six audits
manually and try to remember what each said" pattern.

## Auto-invocation triggers

- User asks "is this project healthy", "audit this repo", "tech debt review"
- Weekly per-active-repo via launchd (combine with diagnostic-skills schedule)
- Pre-release (before any version bump on a production-bound repo)
- After significant architecture change or new team member onboarding

## Workflow

Canonical phase list (shared with `references/stop-conditions.md`, which holds abort, skip and
PARTIAL semantics per phase): 0 Pre-flight, 1 Discover, 2 Rank, 2.5 Critic, 3 Recall,
4 Remediation, 5 Snapshot.

### Phase 0: Pre-flight

Confirm a git repo (else abort: `Pre-flight: (failed: not a git repo)`), check External HD / RAG
availability, and apply the skip-if-fresh gate (`audit_freshness_days`, see
`references/config-schema.md`). Abort and skip rules: `references/stop-conditions.md`.

### Phase 1: Discover (parallel audit dispatch, always)

Invoke in parallel via Agent tool or sequential Skill calls:

- `test-health` — suite proportionality, coverage, runtime
- `config-drift-detect` — gate compatibility
- `hook-effectiveness` — hooks fire/exit/latency stats
- `performance-audit` or `performance-test` — runtime perf
- `security-audit` — secrets, deps, OWASP
- `mcp-audit` — MCP server usage
- `plugin-audit` — plugin enabled-vs-used
- `socket-audit` — supply chain (npm only)
- `forge-audit` — if Forge ecosystem repo
- `scripts/check-harness-manifest.sh` — verifies `.harness/manifest.json` sha256 fingerprints match tracked files and MCP policy invariants hold (`defaultDeny=true`, non-empty `dangerousPatterns` + `approvedServers`). Run from repo root when `.harness/` exists; non-zero exit is a CRITICAL finding.
- `skills/catalog-gardener` — detects dead links, stale artifacts, oversize skills (>8KB body, >150 lines), orphan skills, and frontmatter completeness issues. Outputs severity-ranked report with remediation hints. Run as part of Phase 1 parallel audit dispatch.

Each returns a structured verdict + findings.

### Phase 2: Rank (reconcile by severity)

Aggregate all findings into one ranked list:

- CRITICAL — blocks merge / release / production safety
- HIGH — degrades workflow significantly
- MEDIUM — measurable but not blocking
- INFO — track but no action

Cross-reference: a HIGH from `config-drift` that explains a HIGH from `test-health`
is reported as one root cause, not two findings.

### Phase 2.5: Critic

Single `critic` subagent challenges the ranked findings and assigns confidence
(prompt: `references/critic-prompt.md`). Skipped when `critic_enabled=false` or no subagent
capability; findings then proceed with confidence=high.

### Phase 3: Recall vs historical exceptions (mandatory before remediation)

Audits do not know history. Memory does. Before drafting fixes:

- For each HIGH/MEDIUM finding, run `recall`
  on the flagged file, image tag, config key, or symbol.
- If recall surfaces any past decision about that exact item (exception,
  intentional pattern, "do not change X" memory), tag the finding `NEEDS_REVIEW`
  instead of `AUTO_FIX`.
- Reconcile: either (a) the prior decision still holds → drop the finding +
  add an inline source comment defending the exception so the next audit cycle
  reconciles via comment instead of via memory, or (b) circumstances changed →
  proceed with the fix and supersede the old memory.
- Findings that pass recall with zero hits keep their `AUTO_FIX` tag.

**Why this phase exists:** 2026-05-14 Wave 6 (homelab PR #100) shipped a wrong
`agent-box:latest` pin because a subagent acted on a config-drift finding without
checking memory #3415 (2026-05-07) which explicitly documented the exception.
Required a revert commit before merge. This phase prevents the same class of
mistake at the audit-deep level.

### Phase 4: Remediation plan

For each `AUTO_FIX`-tagged CRITICAL + HIGH (Phase 3 filters out `NEEDS_REVIEW`):

- Recommend the specific composite skill to fix it (`fix-the-suite`,
  `secrets-rotate`, `gate-relax`, etc.)
- Estimate the effort
- Sort by impact-per-effort

`NEEDS_REVIEW` findings are listed separately with their conflicting memory
reference so the user can reconcile manually.

### Phase 5: Snapshot (memory + handoff)

Write the report to `~/.claude/projects/<slug>/memory/audit_deep_<repo>_<date>.md`
so trends are visible across audits. Update MEMORY.md index.

## Reconciliation

Single report. The closing block is one line per phase, in this exact order
(per-termination variants in `references/stop-conditions.md`):

```
AUDIT DEEP — <repo> — <date>

Overall health:  <SCORE/100> <STATUS>

CRITICAL (N):
  [test-health]    1467 tests vs target 40-150 (37x ceiling)
                   Root cause: [config-drift] 99% functions gate
                   Fix: /fix-the-suite (estimated 2-4h)

HIGH (N):
  [hook-effectiveness] turn-counter spam every 10 turns
                       Fix: applied 2026-05-08 (commit 04ec576)

  [security-audit] 2 high-severity vulns in transitive deps
                   Fix: /dependency-update-batch (estimated 30min)

MEDIUM (N): ...
INFO (N):   ...

REMEDIATION PLAN (ranked by impact-per-effort):
  1. /fix-the-suite (resolves 1 CRITICAL + 2 MEDIUM)
  2. /dependency-update-batch (resolves 1 HIGH)
  3. /secrets-rotate ANTHROPIC_API_KEY (it's been 90 days)

Pre-flight:            <cache status | (failed: ...) | (skipped: ...)>
Discover:              <N completed✓, M errored✗ | (skipped: all audits returned CLEAN)>
Rank:                  <N findings ranked | (skipped: no findings)>
Critic:                <confidence summary | (skipped: ...)>
Recall:                <HIGH/MEDIUM reconciled against memory | (blocked: ...)>
Remediation:           <plan from AUTO_FIX findings | (skipped: ...)>
Snapshot:              <path to handoff/audit report | (none — task ongoing)>
Open watch:            <future obligation | (none)>
```

## Outputs / Evidence

- Per-audit raw verdicts
- Reconciled severity-ranked findings
- Effort-sorted remediation plan
- Memory file written for trend tracking

## Failure / Stop Conditions

- Not a git repo: abort at Phase 0 (`Pre-flight: (failed: not a git repo)`)
- Some (not all) audit skills error → mark as PARTIAL, continue with the rest; all error → UNABLE_TO_AUDIT
- All audits return CLEAN → write a "no findings" memory; a clean baseline is
  itself valuable evidence
- If user invokes during active development → defer non-blocking audits to next
  scheduled run; only run the ones gating immediate work
