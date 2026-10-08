# Output Patterns — audit-deep

Full reconciliation format when N > 3 findings or NEEDS_REVIEW sections are substantial.

## Full findings format

```
AUDIT DEEP — <repo> — <date>

VERDICT: <SCORE/100> <STATUS>
  SCORE: Sum of non-INFO findings severity weights:
    CRITICAL: -30 each
    HIGH: -10 each
    MEDIUM: -3 each
    INFO: 0 each
  STATUS: CLEAN (100), HEALTHY (80–99), DEGRADED (60–79), CRITICAL (<60)

CRITICAL (N):
  [<skill>] Finding 1
           Root: [cross-skill ref]
           Fix: /<composite-skill> (estimated effort)
           Memory status: AUTO_FIX | suppressed (reason + ref)

HIGH (N):
  [<skill>] Finding 2
  ...

MEDIUM (N):
  [<skill>] Finding
  ...

INFO (N):
  [<skill>] Finding
  ...

REMEDIATION PLAN (by impact-per-effort):
  1. /<skill> (resolves N findings)
     Steps: <brief outline>
     Effort: <duration>
  2. ...

NEEDS_REVIEW (manual reconciliation required):
  • Finding X — conflicts with memory <ref>
    Decision: <accepted | awaiting user reconciliation>
    Link: <memory file | ADR>

SUPPRESSED FINDINGS (reconciled, not fixed):
  • Finding Y — prior decision still valid
    Comment added: <file> line <N>
    Memory ref: <identity>

Snapshot: <path to audit_deep_<repo>_<date>.md>
Open watch:
  • <future obligation | none>
```

## Signal-first inline format (when 3 or fewer findings)

```
AUDIT DEEP — <repo> — <date>

VERDICT: 72/100 DEGRADED

TOP ISSUES:
  1. [CRITICAL] Test suite 37x ceiling (1467 vs target 150)
     Root: config-drift HIGH (99% functions gated)
     Fix: /fix-the-suite (~2–4h)

  2. [HIGH] 2 transitive vulns (CVSS ≥7)
     Fix: /dependency-update-batch (~30min)

  3. [HIGH] Hook spam every 10 turns
     Status: already applied 2026-05-08 (commit 04ec576)

REMEDIATION PLAN:
  1. /fix-the-suite (resolves 1 CRITICAL + 2 MEDIUM)
  2. /dependency-update-batch (resolves 1 HIGH)

NEEDS_REVIEW:
  • Finding X conflicts with memory #3415; user to decide

Snapshot: ~/.claude/projects/-Volumes-External-HD-Desenvolvimento/memory/audit_deep_<repo>_<date>.md
```

## Partial/Error format

```
AUDIT DEEP — <repo> — <date>

STATUS: PARTIAL (some audits errored)

Completed audits:
  • test-health ✓
  • config-drift-detect ✓
  • hook-effectiveness ✓

Errored audits:
  • security-audit — <error message>
  • mcp-audit — <error message>

Findings from completed audits: <verdict + top-3>

Next steps:
  1. Rerun failed audits via `/audit-deep` or individual skills
  2. Reconcile recall (Phase 3) once all audits complete
```

## Memory file naming

```
audit_deep_<repo-slug>_<YYYY-MM-DD>.md
Example: audit_deep_homelab_2026-06-22.md
```

Store in: `$HOME/.claude/projects/-Volumes-External-HD-Desenvolvimento/memory/` (symlinked to knowledge-brain).

## Trend tracking example (in MEMORY.md)

```markdown
# Audit Deep Trend

- [2026-06-22](audit_deep_homelab_2026-06-22.md) — 72/100 DEGRADED (test ceiling spike)
- [2026-06-15](audit_deep_homelab_2026-06-15.md) — 81/100 DEGRADED (hook spam added)
- [2026-06-08](audit_deep_homelab_2026-06-08.md) — 86/100 HEALTHY
- [2026-06-01](audit_deep_homelab_2026-06-01.md) — 87/100 HEALTHY

Note: Test suite regression 2026-06-22 tied to Wave 6 gate change.
Suppressed findings: agent-box:latest pin (memory #3415 — intentional exception).
```
