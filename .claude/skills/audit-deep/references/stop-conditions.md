# Stop Conditions & Failure Handling — audit-deep

## Abort (entire skill stops)

| Condition              | Phase | Reconcile                                                         | Action                                                                        |
| ---------------------- | ----- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Not in a git repo      | 0     | `Pre-flight: (failed: not a git repo)`                            | Abort entirely. Surface to user.                                              |
| All audit skills error | 1     | `Discover: (failed: all audit skills errored; see details below)` | Report UNABLE_TO_AUDIT. Surface which audits failed and their error messages. |

## Skip (phase skipped, chain continues)

| Condition                                            | Phase | Reconcile                                                                                              | Behavior                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External HD unmounted                                | 0     | `Pre-flight: (skipped: External HD unmounted; RAG unavailable — continuing with local discovery only)` | Set `RAG_AVAILABLE=false`, skip skip-if-fresh gate, continue to Phase 1.                                                                                                                                                         |
| Prior audit exists, < freshness_days, no new commits | 0     | `Pre-flight: (skipped: prior audit from <date> within freshness threshold; user chose re-run)`         | Present cached summary; on user "use cached", jump to Phase 3. On "re-run", continue to Phase 1.                                                                                                                                 |
| No prior audit, or audit ≥ freshness_days            | 0     | `Pre-flight: (skipped: no prior audit or stale — running discovery)`                                   | Continue to Phase 1.                                                                                                                                                                                                             |
| Some (≥1 but not all) audit skills error             | 1     | `Discover: <N completed skills>✓, <M errored skills>✗`                                                 | Mark errored audits PARTIAL, continue with completed findings.                                                                                                                                                                   |
| All audits return CLEAN (no findings)                | 1     | `Discover: (skipped: all audits returned CLEAN)`                                                       | Write "no findings" memory baseline, jump to Phase 5 (memory). Reconciliation shows "no remediation needed".                                                                                                                     |
| Critic subagent unavailable                          | 2.5   | `Critic: (skipped: no subagent capability)`                                                            | Continue to Phase 3 with all findings assigned confidence=high (no critic notes).                                                                                                                                                |
| External HD unmounted before Phase 3                 | 3     | `Recall: (blocked: External HD unmounted; downgrading all findings to NEEDS_REVIEW)`                   | Downgrade every CRITICAL/HIGH/MEDIUM finding to NEEDS_REVIEW. Skip memory cross-check. Continue to Phase 4 with all AUTO_FIX tags removed. Explain to user: "Cannot verify prior decisions; all findings require manual review." |
| No approved items from Phase 4 planning              | 4     | `Remediation: (skipped: no AUTO_FIX findings or all findings are NEEDS_REVIEW)`                        | Jump to Phase 5. Include NEEDS_REVIEW section in output for user to address manually.                                                                                                                                            |

## Reconciliation blocks (output format per termination)

### Clean abort (not git repo)

```
AUDIT DEEP — (repo detection failed)

ERROR: Not in a git repository. Aborting.

Pre-flight: (failed: not a git repo)
```

### Partial discovery (some audits failed)

```
AUDIT DEEP — <repo> — <date>

STATUS: PARTIAL (1+ audit skills errored)

Completed audits (✓):
  • test-health
  • config-drift-detect
  • hook-effectiveness

Errored audits (✗):
  • security-audit — [error message]
  • mcp-audit — [error message]

VERDICT: <SCORE/100> <STATUS> (based on completed audits only)

TOP ISSUES:
  [top 3 from completed audits]

Discover: (partial: 5 completed, 2 errored)
Rank: <N findings ranked>
Critic: (skipped: completed findings only)
Recall: <CRITICAL/HIGH/MEDIUM reconciled against memory>
Remediation: [plan from AUTO_FIX findings]
Snapshot: [memory file path]

Next steps:
  1. Resolve errors in failed audits (run individually or re-invoke /audit-deep)
  2. Reconcile full findings once all complete
```

### Clean baseline (no findings)

```
AUDIT DEEP — <repo> — <date>

VERDICT: 100/100 CLEAN — All audits passed.

[No findings to report]

Pre-flight: <cache status>
Discover: (skipped: all audits returned CLEAN)
Rank: (skipped: no findings)
Critic: (skipped: no findings)
Recall: (skipped: no findings)
Remediation: (skipped: no findings)
Snapshot: ~/.claude/projects/.../audit_deep_<repo>_<date>.md (baseline — zero findings)
```

### Memory unavailable (External HD unmounted at Phase 3)

```
AUDIT DEEP — <repo> — <date>

VERDICT: <SCORE/100> <STATUS>

TOP ISSUES (N total):
  [all top-3 findings]

REMEDIATION STATUS: ⚠️ BLOCKED
  Cannot verify prior decisions — External HD unmounted.
  All findings downgraded to NEEDS_REVIEW for manual reconciliation.

Pre-flight: <cache status>
Discover: <N findings>
Rank: <M ranked>
Critic: <confidence scores | skipped>
Recall: (blocked: External HD unmounted — downgrading findings to NEEDS_REVIEW)
Remediation: (blocked: all findings require manual review)
Snapshot: [memory file path — zero AUTO_FIX tags]

⚠️ ACTION: Mount External HD and re-run /audit-deep to complete Phase 3.
```

## Early exits (intended stops mid-run)

| Scenario                                              | Phase | Output                                                                                                                                                                              |
| ----------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User invokes during active development                | 0-1   | Offer to run only security-audit + config-drift-detect (gating audits). Skip perf/test audits. Reconcile: `Discover: (partial: user requested gating-only audits)`                  |
| Same finding repeats 3+ cycles with no reconciliation | 3     | Escalate before Phase 4: "Finding X suppressed 3 cycles with no manual decision. Requires ADR or comment-based exception before continuing." Block remediation plan until resolved. |

## Logging (on every run, at the end)

Include in memory file (Phase 5):

- Entire reconciliation block (immutable shape)
- Exit reason if non-standard (skipped phase, downgraded findings, etc.)
- Token spend (if available from subagent logs)
- RAG query cache hit/miss (Phase 0)
- Critic challenge results summary (Phase 2.5)
