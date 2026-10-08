# Configuration Schema — audit-deep

Optional per-repo configuration: `.claude/audit-config.json`

## Fields

| Field                        | Type    | Default  | Description                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_freshness_days`       | integer | 7        | Days before a prior audit is considered stale. Phase 0 skip-if-fresh gate activates when prior audit exists AND (today - prior_created_at) < freshness_days AND no new commits. Reconciliation with config drift is preferred (e.g., set to 7 for security-critical repos, 14 for stable services). |
| `skip_accepted_risks`        | boolean | true     | In Phase 3, skip re-reconciling findings that were previously marked `SUPPRESSED_ACCEPTED_RISK` in prior runs. If false, every finding is re-checked against memory even if prior decision exists.                                                                                                  |
| `critic_enabled`             | boolean | true     | Run Phase 2.5 critic gate. If false, skip critic subagent entirely; all findings proceed to Phase 3 with confidence=high (no critic notes). Useful for fast audits on low-risk repos.                                                                                                               |
| `max_top_findings_to_critic` | integer | 5        | Number of top-severity findings to send to critic subagent. Reduces token spend on large finding sets; set to 0 to disable critic (equivalent to `critic_enabled=false`).                                                                                                                           |
| `rag_scope`                  | string  | "memory" | RAG query scope for Phase 0 and Phase 3. Options: "memory" (persisted audit runs), "handoff" (last handoff), "both" (memory + handoffs). Wider scope increases recall but costs more tokens.                                                                                                        |

## Example

```json
{
    "audit_freshness_days": 14,
    "skip_accepted_risks": true,
    "critic_enabled": true,
    "max_top_findings_to_critic": 5,
    "rag_scope": "memory"
}
```

## Defaults

If `.claude/audit-config.json` is absent or a field is missing, apply documented defaults above.

## Location

Place the file at the repo root: `<repo>/.claude/audit-config.json`

Not a git-tracked artifact — local to each developer's environment. For shared overrides, commit a canonical version to the repo and reference it in CLAUDE.md or .agents/memory.
