---
name: plan-to-issues
description: Turn a phased plan file into one GitHub issue per task with phase labels and optional milestone. Use to track plan tasks as GH issues.
user-invocable: true
auto-invoke: 'convert plan to issues + create issues from plan + open issues for each task'
argument-hint: '<plan-path> [--repo owner/name] [--milestone <name>] [--label-prefix phase-] [--dry-run]'
triggers:
    - convert plan to issues
    - create issues from plan
    - open issues for each task
    - plan to issues
    - issues from backlog
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/plan-to-issues
---

# Plan to Issues

Bridge from a markdown plan file (phases + tasks) to GitHub issues. Each task becomes
one issue with structured body, phase label, and optional milestone.

Replaces: manual `gh issue create` × N when you've already written a phased plan.

## When this fires

User-phrases:

- "convert this plan to issues"
- "create GH issues from this backlog"
- "open issues for each task in the plan"
- "I want to track these tasks in GitHub"

Also auto-invoked by `/scope-and-execute` when the user wants tasks visible to a
team before execution begins.

## Inputs

- `<plan-path>` — required, e.g. `.claude/plans/backlog-2026-05-14.md`. Same format
  parallel-phases reads (see its `Plan file format` section).
- `--repo owner/name` — target repo. Default: infer from current dir's git remote
  (`git remote get-url origin`), or from the plan's `repo:` frontmatter field if set.
- `--milestone <name>` — optional milestone. Creates it if missing (with confirmation).
- `--label-prefix phase-` — prefix for auto-created phase labels (`phase-1`, `phase-2`).
  Default: `phase-`. Pass `--label-prefix ""` to disable phase labels.
- `--assignee <user>` — optional assignee for all created issues.
- `--dry-run` — print planned issues without creating.

## Workflow

### Step 1 — Parse plan

Read the plan file. Extract phases and tasks using the same parser as
`/parallel-phases` Phase 1. Each task surfaces:

- `id` (e.g. `T1`, `T2`)
- `summary` (the task heading)
- `acceptance` (acceptance criteria, if present)
- `specialist`, `model_tier`, `scope_files_*` (optional, included as metadata)
- `depends_on` (optional, surfaced in the issue body as "Depends on: #N")

### Step 2 — Detect repo + auth

- Run `gh auth status` — must show authenticated. If not, instruct user to run
  `gh auth login`.
- Resolve `--repo`. If absent and current dir has no git remote, error with
  "specify --repo owner/name".
- Verify the repo exists: `gh repo view <owner/name>` (refuses if 404).

### Step 3 — Ensure labels exist

For each phase encountered, ensure label `<prefix><phase-id>` exists:

```bash
gh label create "phase-1" --description "Phase 1 — <name>" --color FBCA04 2>/dev/null || true
```

(Failure is fine if it already exists; check with `gh label list --search "phase-"`.)

### Step 4 — Ensure milestone exists (if `--milestone` set)

```bash
gh api "repos/<owner>/<name>/milestones" --jq '.[] | select(.title == "<name>")' | grep -q . \
  || gh api "repos/<owner>/<name>/milestones" -f title="<name>" --silent
```

Capture the milestone number for use in the next step.

### Step 5 — Create issues

For each task, in plan order:

```bash
gh issue create \
  --repo <owner>/<name> \
  --title "<phase.id>.<task.id>: <task.summary>" \
  --body "$(render_issue_body task)" \
  --label "<prefix><phase.id>" \
  --milestone <milestone-number-if-set> \
  --assignee <user-if-set>
```

The `render_issue_body` template:

```markdown
**Phase**: {{phase.id}} — {{phase.name}}
**Task ID**: {{task.id}}
{{#if task.specialist}}
**Specialist**: {{task.specialist}}
{{/if}}
{{#if task.model_tier}}
**Model tier**: {{task.model_tier}}
{{/if}}

## Acceptance

{{task.acceptance | "No acceptance criteria defined in plan"}}

{{#if task.scope_files_in or task.scope_files_out}}
## Scope

{{#if task.scope_files_in}}
**Files to read**: {{task.scope_files_in | join(", ")}}
{{/if}}
{{#if task.scope_files_out}}
**Files to write**: {{task.scope_files_out | join(", ")}}
{{/if}}
{{/if}}

{{#if task.depends_on}}
## Depends on

{{#each task.depends_on}}
- {{this}} (see plan file)
{{/each}}
{{/if}}

---

Created from `{{plan_path}}` by `/plan-to-issues`.
```

Capture the returned issue URL/number per task.

### Step 6 — Write the mapping file

Write `~/.claude/plans/<plan-basename>.issues.md`:

```markdown
# Plan → Issues mapping

Plan source: `<plan_path>`
Created: <timestamp>
Repo: <owner>/<name>
{{#if milestone}}
Milestone: <name> (#<number>)
{{/if}}

| Task  | Issue | Title                           |
| ----- | ----- | ------------------------------- |
| P1.T1 | #245  | P1.T1: Rebase PR #182 onto main |
| P1.T2 | #246  | P1.T2: Tag v0.24.0 release      |
| ...   | ...   | ...                             |
```

Print the mapping table to the user so they can see what was created.

### Step 7 — Update plan file (optional, ask first)

Offer to write `Tracked: <issue-url>` lines back into the plan file under each task,
for round-trip traceability. If user accepts, edit the plan in-place.

## Stop conditions

- `gh auth status` not authenticated → stop with `gh auth login` instruction
- `--repo` cannot be resolved → stop with usage hint
- A required phase label can't be created (no `repo:write` scope, etc.) → stop after
  zero issues created
- Issue creation fails partway → continue with remaining tasks; report at end which
  tasks failed and why; mapping file shows partial state
- More than 50 tasks → confirm with user before proceeding (likely API rate-limit risk
  and "create 50 issues, are you sure?" sanity check)

## Negative rules

- Do NOT create issues without `--repo` resolution succeeding first.
- Do NOT silently invent acceptance criteria when the plan has none — render "No
  acceptance criteria defined in plan" so the gap is visible.
- Do NOT close or modify existing issues; this skill only creates.
- Do NOT add `Co-Authored-By: Claude` trailers anywhere in issue bodies.
- Do NOT include the AI-attribution banner ("Created with Claude") in issue bodies —
  only "Created from `<plan_path>` by `/plan-to-issues`" which is operational metadata.
- Do NOT auto-assign to anyone other than `--assignee` user; never assign to the bot
  account.

## Outputs / Evidence

- N created issues with URLs
- Mapping file at `~/.claude/plans/<plan-basename>.issues.md`
- Optionally: updated plan file with `Tracked: <url>` lines

## Configuration

Optional `.claude/plan-to-issues.json`:

```json
{
    "default_assignee": null,
    "default_milestone": null,
    "default_label_prefix": "phase-",
    "phase_label_color": "FBCA04",
    "task_id_separator": "."
}
```

## Round-trip with `/parallel-phases`

```
# Day 1: Plan + create issues
$ <write .claude/plans/backlog.md>
$ /plan-to-issues .claude/plans/backlog.md --milestone "Sprint 42"

# Day 2: Execute by phase
$ /parallel-phases --from-issues 'milestone:"Sprint 42" label:phase-1'
```

The `--from-issues` mode of `/parallel-phases` reverses this skill — it reads back
the issue bodies (which contain the phase/task/acceptance) and reconstructs the
phases array.

## Related skills

- `/parallel-phases` — round-trip partner (execute the issues created here)
- `/plan` — writes the plan file this skill reads
- `/adt-ticket` — single-issue ticket creation (use for one-off bugs, not phased plans)
