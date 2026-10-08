# Backlog Skill Output Patterns

## Plan File Structure

Generated at `.claude/backlog/<YYYY-MM-DD>.md` (with `-1`, `-2` suffix if same-day re-run).

### Plan File Header

From `templates/plan-header.md`:

```markdown
---
repo: <owner>/<name>
generated_by: /backlog
generated_at: <ISO timestamp>
backlog_run_id: <run-id>
sources:
    audit_deep: <memory path>
    ecosystem_health: <status summary>
    repo_state_snapshot: <snapshot path>
---

# Backlog <YYYY-MM-DD>
```

### Task Entry Format

```markdown
### T<N>: <title> [cat:<category>] [sev:<severity>] [effort:<size>]

acceptance: |

- Criterion 1
- Criterion 2
- Criterion 3

evidence:

- file:line reference
- audit-deep[source] finding summary
- commit reference if applicable

suggested_approach: |
Multi-line detailed approach explaining the fix or implementation strategy.
```

### Phase Grouping

Tasks grouped by severity into three phases:

```markdown
## Phase 1: Critical & High (this week)

### T1: ...

### T2: ...

## Phase 2: Medium (this month)

### T3: ...

### T4: ...

## Phase 3: Low (when convenient)

### T5: ...
```

For features with generated specs, include spec_path field:

```markdown
### T<N>: Add WebAuthn 2FA [cat:feature] [sev:medium] [effort:l]

spec_path: docs/specs/2026-05-14-add-webauthn-2fa/spec.md

acceptance: |

- ...
```

### Run Summary Section

Appended to plan file at end:

```markdown
## Run summary

- Created: <N> issues (<list of #numbers>)
- Skipped: <K> duplicates (#<list>)
- Failed: <F> creations (<reasons>)
- Comments left on existing: <C> (#<list>)
- Board: <BOARD_URL> (<N> cards added)
- Specs: <S> features → <list of paths>
```

## Empty Backlog Marker

If no findings, write `.claude/backlog/<date>-empty.md` with just header and "no tasks" marker. Phases 2-7 skipped.

## Memory Snapshot Format

Written to `~/.claude/projects/-Users-lucassantana/memory/backlog_<repo-slug>_<YYYY-MM-DD>.md`.

```markdown
---
name: backlog-<repo-slug>-<date>
description: /backlog run output for <repo> on <date>. <N> issues created, top finding: <title>.
metadata:
  type: project
---

# Backlog run: <repo> @ <date>

**Top 5 findings (by ROI):**

1. ...

**Created issues:** #N, #N, ...
**Board:** <url>
**Plan file:** .claude/backlog/<date>.md

**Why:** snapshot of the repo's prioritized backlog at run time, for use by `/next-priority` and `/recall` to answer "what should I work on in <repo>".

**How to apply:** when the user asks for status or priorities in <repo>, prefer this memory over re-running /audit-deep — it's the most recent ranked picture. Stale after 14 days (re-run /backlog).
```

Append one-line pointer to `MEMORY.md` only on first run per repo; subsequent runs update existing pointer.

## Reconciliation Block

Printed at end of every run, verbatim shape:

```
BACKLOG — <owner>/<repo>
  Discover:   <N findings> (skills: audit-deep, ecosystem-health, repo-state-snapshot)
  Rank:       <M ranked from N> (<K skipped: existing-issue dedup>)
  Propose:    <U approved by user, V rejected>
  Spec:       <F feature specs generated | (skipped: no features approved)>
  Plan:       .claude/backlog/<YYYY-MM-DD>.md
  Issues:     <list of #N URLs | (failed: <reason>)>
  Board:      <board URL with N cards added | (skipped: <reason>)>
  Snapshot:   ~/.claude/projects/-Users-lucassantana/memory/backlog_<repo>_<date>.md
  Queued:     /next-priority
  Open watch: <future-dated follow-up for any feature with ramp/cleanup date | (none)>
```

Every declared phase has a line — never silently omit. Skipped phases marked `(skipped: <reason>)`. Failed phases marked `(failed: <reason>)` and chain continues per stop conditions.
