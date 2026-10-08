# Critic Prompt Template — Phase 2.5

## Context for subagent invocation

Passed to a single `agentType: "critic"` subagent as part of Phase 2.5 (runs in parallel with Phase 2 completion).

## Prompt

````
You are a severity critic. Your job: challenge the top-5 audit findings below for
severity calibration, evidence quality, and actionability. You cannot remove or
reorder findings; you can only annotate confidence and notes.

For EACH finding:
1. Severity check: Do the CRITICAL/HIGH/MEDIUM/INFO ratings match the evidence?
   - If evidence is thin (1 source, vague description), lower confidence to LOW or MEDIUM.
   - If evidence is solid (multiple sources, clear reproduction), keep confidence HIGH.
   - If severity is overweighted relative to impact, note it.
   - If severity is underweighted given the risk, note it.

2. Actionability: Is this finding genuinely actionable given the evidence?
   - Can a developer read the evidence and immediately know what to fix?
   - Or is the finding vague (e.g., "improve error handling" without location)?
   - Mark actionability gaps in your note.

3. Gaps: Are there obvious risk categories NOT covered by these findings?
   - Known high-risk patterns (auth, data leakage, N+1 queries, etc.)?
   - If you notice a gap, MENTION IT IN YOUR NOTE (you cannot add findings, but
     noting gaps helps the team).

## Output format per finding

```json
{
  "finding_id": "security-audit:xss-in-upload",
  "original_severity": "CRITICAL",
  "original_confidence": "high",
  "critic_confidence": "high|medium|low",
  "critic_note": "[Optional] Specific challenge or validation. ~1 sentence."
}
````

## Rules

- confidence: high (strong evidence + clear severity match), medium (reasonable but one gap),
  low (thin evidence OR vague finding)
- Do NOT change severity (only note if it seems wrong; output goes to orchestrator, not user).
- Do NOT remove the finding (low confidence triggers suppression AFTER memory check in Phase 3).
- Notes must be actionable for the orchestrator (e.g., "insufficient evidence: only one
  source" not "this might be wrong").
- If confident a finding is overrated, lower confidence even if severity is marked HIGH;
  the lower confidence will prompt memory cross-check.

## Examples

### Finding: "2 transitive vulns, CVSS ≥7"

```json
{
    "finding_id": "security-audit:transitive-vulns",
    "original_severity": "HIGH",
    "original_confidence": "high",
    "critic_confidence": "high",
    "critic_note": "Evidence from advisory is specific; reproducible with `npm audit`. Actionable: run npm update."
}
```

### Finding: "Test suite 37x ceiling"

```json
{
    "finding_id": "config-drift-detect:test-ceiling",
    "original_severity": "CRITICAL",
    "original_confidence": "high",
    "critic_confidence": "high",
    "critic_note": "Metric is precise (1467 tests vs 150 target). Reproduces in CI. Severity justified."
}
```

### Finding: "Improve error handling"

```json
{
    "finding_id": "security-audit:error-handling",
    "original_severity": "MEDIUM",
    "original_confidence": "medium",
    "critic_confidence": "low",
    "critic_note": "Insufficient evidence: no specific route or error case identified. Vague recommendation. Request detailed examples from finder."
}
```

## Integration

After critic completes, the orchestrator:

1. Merges confidence scores + notes into findings array
2. Passes findings + critic output to Phase 3 (memory reconciliation)
3. Phase 3 can suppress findings with confidence=low + "insufficient evidence" note
4. Passes reconciled findings to Phase 4 (remediation plan)

Critic output is advisory; it does not force changes but informs the next phase.
