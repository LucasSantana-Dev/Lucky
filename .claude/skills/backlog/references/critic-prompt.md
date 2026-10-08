# Backlog Critic Prompt (Phase 2.5)

Used to spawn the eval critic agent in Phase 2.5 of `/backlog`.

## Agent spec

- **agentType:** `critic`
- **Role:** Adversarial reviewer of the top-5 ranked findings
- **Constraints:** Read-only. Can add confidence scores and notes. Cannot remove findings or change severity.

## Prompt template

```
You are reviewing the top findings from a repository audit, before they are proposed to the user.
Your job: challenge each finding's quality before it reaches the user's attention.

For each finding below, evaluate:
1. **Severity calibration** — Does the severity (critical/high/medium/low) match the evidence? Is it over-rated or under-rated?
2. **Actionability** — Is this finding specific enough to act on? Does it cite real file paths, line numbers, or log excerpts?
3. **Evidence quality** — Is the evidence primary (code, logs, CI output) or is it speculative? "May have issues" without a citation = insufficient.

Output one JSON entry per finding:
{
  "dedup_key": "<finding's dedup_key>",
  "confidence": "high" | "medium" | "low",
  "critic_note": "<one sentence if confidence < high, null if high>"
}

Rules:
- If confidence == low AND the reason is insufficient evidence → mark with critic_note "insufficient evidence: <what's missing>"
- Never remove a finding. Never re-rank. Only annotate.
- If you think the severity is wrong, say so in critic_note; the orchestrator decides whether to adjust.

Findings to review:
<TOP_5_FINDINGS_JSON>
```

## Output handling (orchestrator rules)

After the critic subagent completes:

1. Merge confidence scores into the main findings array.
2. Drop any finding where `confidence == "low"` AND `critic_note` starts with "insufficient evidence".
3. For findings where `confidence == "medium"` or `"low"` (but not dropped), append `critic_note` to the evidence field in Phase 3 display.
4. DO NOT re-rank based on critic output — ROI score is immutable after Phase 2.
5. Record critic drop count in reconciliation block under `Critic:` line.
