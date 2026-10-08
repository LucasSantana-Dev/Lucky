# Project skills

Copies of the operator's personal skills (private `LucasSantana-Dev/skills`
repo) that matter most for Lucky, so cloud sessions on claude.ai, which never
see `~/.claude/skills`, can use them too.

On the operator's machine the personal copy wins: when a personal and a project
skill share a name, the personal one is used. These copies only take effect
where the personal ones are absent (cloud sessions, other contributors).

## What is here and why

Picked by how often each skill shows up in the operator's session memory
(overall and in Lucky work), plus fit with this repo.

| Skill | Why |
| --- | --- |
| `research-and-decide` | Most used in Lucky sessions: answer from evidence, then decide |
| `backlog`, `audit-deep`, `plan-to-issues` | Most used overall: audit, rank and file the backlog as issues |
| `next-priority` | What to work on next from open PRs, issues and handoffs |
| `test-cleanup` | Frequent in Lucky: prune low-value tests |
| `debug-deep`, `hotfix` | Prod incidents on the homelab bot |
| `gh-fix-ci`, `gh-address-comments`, `pr-merge-readiness`, `merge-confidently`, `ship-it` | Drive PRs to green and merged |
| `dep-sweep` | Dependabot/Renovate batches (`.claude/dep-sweep-config.json`) |
| `adr-write` | Lucky records decisions in `decisions/` |

## In a cloud session

- No `gh` CLI. Where a skill runs `gh pr ...`, `gh run ...` or `gh api ...`,
  use the GitHub MCP tools for the same call.
- No `~/.claude/handoffs`, `~/.claude/projects/*/memory`, `~/.claude/rag-index`
  or `/Volumes/External HD`. Phases that read them (RAG pre-flight, memory
  snapshots, prior handoffs) are skipped and reported as skipped.
- `backlog` and `audit-deep` dispatch to sub-skills that are not copied here
  (`ecosystem-health`, `test-health`, `security-audit`, ...). Missing ones are
  reported in the reconciliation block, not silently dropped.

## Updating

The private `skills` repo is the source of truth. To refresh, copy the skill
directory again without its `evals/` folder, then run `npm run lint:secrets`
before committing: this repo is public.
