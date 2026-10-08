# Backlog Skill Workflow Details

## Phase 1 — Discover (parallel)

### Discovery Shell Script

The discover phase collects metadata via:

```bash
~/.claude/skills/backlog/scripts/discover.sh > /tmp/backlog-discover-<run-id>.json
```

This script collects:

- Open issues (for dedup corpus)
- Closed issues (for "closed without fix" patterns)
- 90-day commit activity
- Code-marker hotspots (TODO/FIXME/HACK/XXX, capped at 200)

### Source Mapping Rules

- `audit-deep` severity → backlog severity:
    - CRITICAL → critical
    - HIGH → high
    - MEDIUM → medium
    - INFO → low

- `audit-deep` source_skill → category mapping:
    - `test-health`, `mutation-test` → test
    - `config-drift`, `dep-sweep` → tech-debt
    - `secure` (formerly `code-security`), `security-audit`, `socket-audit`, `semgrep` → security
    - `performance-audit`, `performance-test` → perf
    - `code-review`, `improve-codebase-architecture` → refactor
    - everything else → bug (conservative default)

- `ecosystem-health` `dirty_status=⚠️` for the active repo → MEDIUM tech-debt finding ("uncommitted changes on tracked branch")
- TODO/FIXME hotspots from `discover.sh` → LOW tech-debt findings (top 10 by clustering — group same-file markers into one finding)
- "Closed without fix" pattern (closed with `not_planned` AND mentioned in recent commit/PR) → MEDIUM bug finding

## Phase 2 — Categorize, dedup, rank

### Finding Normalization Schema

```json
{
    "title": "string (50-80 chars max)",
    "category": "bug|refactor|feature|security|tech-debt|docs|test|perf",
    "severity": "critical|high|medium|low",
    "effort": "xs|s|m|l",
    "evidence": ["file:line", "log excerpt", "commit ref"],
    "suggested_approach": "string (1-2 sentences)",
    "acceptance_criteria": ["criterion 1", "criterion 2"],
    "dedup_key": "audit-deep:<root-cause>:<scope> | code-marker:<file>:<line>",
    "value_score": "integer 1-5 (see Value Scoring Rubric below)",
    "value_justification": "string — one sentence explaining the user/business impact of completing this"
}
```

### Value Scoring Rubric

`value_score` measures the concrete benefit delivered when this item is **done** — independent of how severe or urgent the problem is. Score it honestly:

| Score | Meaning                                                     | Examples                                                  |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------- |
| 5     | Directly unblocks users or fixes a live user-facing defect  | Auth crash, broken checkout, data loss bug                |
| 4     | Measurably improves UX, reliability, or perf for real users | Slow page fixed, error rate drops, accessibility restored |
| 3     | Reduces significant future maintenance cost or tech risk    | Removes a major footgun, closes a known security class    |
| 2     | Internal DX / developer-only improvement                    | Faster CI, cleaner code, better logs                      |
| 1     | Cosmetic or nice-to-have, no clear user impact              | README nit, comment typo, unused import                   |

The value score is **not** the same as severity — a critical security vuln with no users yet might score 2; a medium UX bug that 500 users hit daily scores 5. Think: "If this ships, who benefits and how much?"

### Effort Estimation Rules

- Single file change, no tests required → xs (<1h)
- Single feature area, tests required → s (1-4h)
- Multi-file refactor or new feature → m (1-2d)
- Architecture change or external integration → l (>2d)

### Dedup Logic

Run via:

```bash
~/.claude/skills/backlog/scripts/dedup.sh /tmp/backlog-findings-<run-id>.json \
  <(jq '.open_issues' /tmp/backlog-discover-<run-id>.json) \
  > /tmp/backlog-dedup-<run-id>.json
```

Verdict per finding:

- `skip` — exact dedup_key match in an open issue body (silent skip; link as "previously surfaced as #N" in reconcile)
- `duplicate-of` — fuzzy title match (Levenshtein ≥ 0.85) against an open issue without our `backlog-skill` label. Flagged with `[DUP? #N]` in Phase 3 for user confirmation.
- `new` — propose normally

### ROI Score Formula

```
roi = (severity_weight × urgency × value_score) / effort_weight

severity_weight: critical=8, high=4, medium=2, low=1
effort_weight:    xs=1,       s=2,    m=4,      l=8
value_score:      1-5 (see Value Scoring Rubric above; default 3 if unscored)
urgency:          base=1.0
                  +0.5 if affects a file in the current branch's diff vs main
                  +0.3 if the dedup_key matches any of the last 5 closed PRs' touched files
                  +0.3 if finding is in a reverted area (from discover.sh PR revert scan)
                  +0.2 if the finding matches a deferred item from Phase 0 prior snapshot
                  −0.3 per run this category was rejected in Phase 0 approval history
                       (floor 0.5; never fully suppresses a finding — user still sees it)
```

The `value_score` multiplier is the most powerful lever in the formula: a finding with value=5 scores 5× more than the same finding with value=1, regardless of severity. This intentionally biases the list toward things users will actually notice.

**Category penalty from approval history:** Phase 0 loads prior approval decisions (see memory-integration.md). For each category where the user rejected ≥60% of proposals across ≥2 prior runs, apply −0.3/run urgency penalty. Cap at −0.9 total (never fully suppress). Surface the penalty visibly in Phase 3: _"Note: 'docs' has 100% rejection rate across 3 runs — items shown but deprioritized. Add 'docs' to Phase 3 response to override."_

Quick win threshold: `effort == xs AND severity >= medium AND value_score >= 3`.
Quick wins float to the top of the Phase 3 proposal table regardless of absolute ROI score.

Sort findings descending by ROI. Apply `max_findings_per_run` cap (default 25).

### Theme Grouping (Phase 3 display)

Before rendering the proposal table, cluster findings into 3–6 named themes based on category + file-path prefix + semantic similarity of titles. Themes make it easier to plan sprint focus — you can approve a whole theme rather than individual rows.

**Clustering heuristic (lightweight, no embeddings needed):**

1. Group by category first (security → "Security hardening", perf → "Performance", test → "Test coverage", etc.)
2. Sub-group by common file prefix (e.g. all `src/api/*` findings → "API layer")
3. If a category has only 1-2 items, fold them into the nearest neighbor theme

**Theme header format:**

```
━━━ 🔒 Security hardening  [3 items · total effort: s+m+s = ~3.5d · value: 4+5+3 = 12 pts] ━━━
```

Show items within each theme sorted by ROI descending. Global numbering (#1, #2…) is preserved across themes so user can still approve by number.

## Phase 3 — Propose (interactive, gated)

### Proposal Table Format

Render as themed sections (see Theme Grouping above). Within each theme, one row per finding plus a `Value:` justification line:

```
━━━ 🔒 Security hardening  [2 items · effort: s+s · value: 12 pts] ━━━

 # | ROI  | Val | Title                                       | Cat      | Sev      | Eff | Evidence (short)
---|------|-----|---------------------------------------------|----------|----------|-----|----------------------------------
 1 | 16.0 |  5  | RCE risk in upload route                    | security | critical | s   | src/api/upload.ts:42, audit-deep[secure]
     Value: Fixes active exploit path reachable by any authenticated user → immediate user safety impact
 2 |  8.0 |  4  | Sanitize error messages leaking stack traces| security | high     | s   | src/middleware/error.ts:18
     Value: Prevents info disclosure; improves trust for security-conscious users

━━━ ⚡ Performance  [2 items · effort: m+xs · value: 9 pts] ━━━

 3 |  4.0 |  3  | Cache /api/users list endpoint              | perf     | high     | m   | src/api/users.ts:14
     Value: Reduces p95 latency on most-used endpoint; directly improves UX for all users
 4 |  2.0 |  2  | Remove unused lodash dep from bundle        | perf     | medium   | xs  | src/utils/format.ts:1
     Value: Shrinks bundle by ~25kB; marginal improvement, mainly internal quality

━━━ ⚠️  Docs [deprioritized — 100% rejection rate, 3 runs] ━━━
 …
```

The `Val` column (1-5) lets you scan delivery value at a glance. The `Value:` line answers "so what?" — what changes for users when this ships.

### Sprint budget selection (if `--budget` or budget phrase detected)

After rendering the full proposal table, if the user specified a time budget (e.g. "I have 2 days", `--budget 2d`, `--budget 8h`):

1. Convert budget to effort units: `1d = s+s`, `2d ≈ m+s`, `3d+ ≈ l` or `m+m`
2. Run greedy knapsack: sort approved candidates by `value_score DESC, roi DESC`; greedily pick until effort budget is exhausted
3. Print a "Suggested for your Nd budget" block:

```
━━━ 🎯 Suggested for your 2d budget (max value within effort cap) ━━━
  #1 · RCE risk in upload route         · effort: s  · val: 5
  #3 · Cache /api/users list endpoint   · effort: m  · val: 3
  ─────────────────────────────────────────────────────────
  Total effort: s+m ≈ 1.5d   |   Total value: 8 pts

Override? Specify different items ("budget: 1,4,5") or approve the suggestion ("budget: ok")
```

4. The user's budget response filters the Phase 3 approval set before Phase 4 continues.

If no budget was specified, skip this block entirely.

### User Response Options

```
Approve which? Reply with:
  • a list like "1,3,5-8"
  • "all"           — approve every row
  • "none"          — abort cleanly
  • "cat:feature"   — approve every row in that category
  • "sev:high+"     — approve critical & high only
  • "top:N"         — approve the top N by ROI
  • "theme:<name>"  — approve all items in a named theme

For budget mode, additionally:
  • "budget: ok"    — confirm the suggested subset
  • "budget: 1,4,5" — override with specific items

For any [DUP? #N] row included in your approval, reply also with one of:
  • "keep dup"      — create new issue anyway
  • "skip dup"      — drop those rows
  • "comment dup"   — leave a comment on the existing issue instead (no new issue)
```

Block until response. No GitHub writes happen before this gate.

## Phase 4 — Spec generation (features only, conditional)

For each approved finding where `category == feature`:

1. Build slug: `slugify(title)` → kebab-case, max 50 chars
2. Invoke via Bash (not Skill):
    ```bash
    ~/.claude/rag-index/venv/bin/python ~/.claude/rag-index/specs.py new \
      "<slug>" \
      --repo "$(pwd)" \
      --tags "backlog,feature,<sev>"
    ```
3. Capture returned spec folder: `docs/specs/YYYY-MM-DD-<slug>/`
4. Append finding-specific content into `docs/specs/YYYY-MM-DD-<slug>/spec.md` under:
    - `## Goal` — from finding's title + suggested_approach
    - `## Context` — from evidence list
    - `## Approach` — expand suggested_approach into bullets
    - `## Verification` — from acceptance_criteria
5. Stash mapping `slug → spec_path` for Phase 6 post-processing

Skip condition: if no features in approved set, mark `Spec: (skipped: no features approved)` in reconcile.

## Phase 5 — Write plan file

Generate `.claude/backlog/<YYYY-MM-DD>.md`. See `output-patterns.md` for plan file template structure.

Tier-to-phase mapping:

- Phase 1 = `severity in {critical, high}`
- Phase 2 = `severity == medium`
- Phase 3 = `severity == low`

## Phase 6 — Create issues (via plan-to-issues + post-processing)

### Step 6a — Idempotent label creation

```bash
for label in backlog-skill \
             cat:bug cat:refactor cat:feature cat:security cat:tech-debt cat:docs cat:test cat:perf \
             sev:critical sev:high sev:medium sev:low \
             effort:xs effort:s effort:m effort:l; do
  gh label create "$label" --color "AAAAAA" --description "Created by /backlog" 2>/dev/null || true
done
```

Label colors:

- Severity: critical=B60205, high=D93F0B, medium=FBCA04, low=0E8A16
- Category: neutral grey (AAAAAA)
- Effort: xs=C2E0C6, s=BFD4F2, m=FBCA04, l=D93F0B

### Step 6b — Issue creation

Invoke via Skill tool:

```
/plan-to-issues .claude/backlog/<YYYY-MM-DD>.md --label-prefix phase-
```

Captures mapping file: `~/.claude/plans/<basename>.issues.md` (Task | Issue URL | Title).

### Step 6c — Per-issue post-processing

For each created issue:

```bash
gh issue edit <num> --add-label "backlog-skill,cat:<category>,sev:<severity>,effort:<size>"

# For features with specs, prepend spec link to body:
if [[ -n "$SPEC_PATH" ]]; then
  CURRENT_BODY=$(gh issue view <num> --json body --jq .body)
  NEW_BODY="**Spec**: [\`${SPEC_PATH}\`](${SPEC_PATH})\n\n---\n\n${CURRENT_BODY}"
  gh issue edit <num> --body "$NEW_BODY"
fi
```

Also append dedup metadata footer:

```
<sub>Surfaced by `/backlog` on YYYY-MM-DD. Dedup key: `<dedup_key>`.</sub>
```

Failed creations are NOT rolled back — marked `(failed: <reason>)` in reconciliation. Plan file remains as durable artifact for manual recovery.

### Comment-on-existing handling

From Phase 3 `comment dup` choices:

```bash
gh issue comment <existing-num> --body "Re-surfaced by /backlog YYYY-MM-DD with new evidence: ..."
```

## Phase 7 — Add to Project board

### Step 7a — Resolve target board

```bash
BOARD_JSON=$(~/.claude/skills/backlog/scripts/board.sh resolve)
BOARD_NUM=$(echo "$BOARD_JSON" | jq -r '.number')
BOARD_URL=$(echo "$BOARD_JSON" | jq -r '.url')
BOARD_SOURCE=$(echo "$BOARD_JSON" | jq -r '.source')
```

If `BOARD_SOURCE == "missing"`: ask user to create board. On `y`: create via `gh project create --owner @me --title 'Active Backlog'`, save URL to `.claude/backlog-config.json`.

### Step 7b — Ensure fields exist

```bash
~/.claude/skills/backlog/scripts/board.sh ensure-fields "$BOARD_NUM"
```

Idempotently creates: Priority (P0, P1, P2, P3), Effort (XS, S, M, L), Repo (TEXT).

### Step 7c — Add each created issue as a card

```bash
for finding in $approved_findings_sorted_by_roi_desc; do
  ~/.claude/skills/backlog/scripts/board.sh add-card \
    "$BOARD_NUM" "$ISSUE_URL" "$SEVERITY" "$EFFORT" "$REPO"
done
```

Returns each item-id on success. Failures logged and marked in reconcile.

## Phase 8 — Snapshot, memory, queue

### Step 8a — Append run summary

Append to `.claude/backlog/<YYYY-MM-DD>.md`:

```markdown
## Run summary

- Created: <N> issues (<list of #numbers>)
- Skipped: <K> duplicates (#<list>)
- Failed: <F> creations (<reasons>)
- Comments left on existing: <C> (#<list>)
- Board: <BOARD_URL> (<N> cards added)
- Specs: <S> features → <list of paths>
```

### Step 8b — Save run memory

Write to `~/.claude/projects/-Users-lucassantana/memory/backlog_<repo-slug>_<YYYY-MM-DD>.md`.

### Step 8c — Queue `/next-priority`

Suggest invoking `/next-priority` to pick top-ROI item. Per composite-contract.md: declared explicitly, NOT silently invoked.

## Invariants

- **Parallel discovery:** 3 discovery skills run in parallel in Phase 1 (audit-deep, ecosystem-health, repo-state-snapshot).
- **No cross-repo scope:** single-repo only. `/ecosystem-health` is the multi-repo entry point.
- **No auto-create board:** always ask user for explicit `y` confirmation on first run.
- **Read-only for app code:** only writes plan, spec, config, label, and memory files.
- **Dedup before write:** Phase 2 dedup runs before plan is written; Phase 6 only implements approved set.
- **No re-invoke audit-deep mid-run:** Phase 1 runs it exactly once; reuse output memory file.
