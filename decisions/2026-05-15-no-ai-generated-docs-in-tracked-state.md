# 2026-05-15 — No AI-generated docs in tracked repo state

## Status

Accepted (decision). Triggered by reviewing `packages/frontend/LIBRARY_RECOMMENDATIONS.md` and discovering ~9,650 lines of similar noise across 18 tracked files.

## Context

Over the last 6 months, multiple AI tools (Claude Code, Lovable, AI Studio, RAG indexers) generated documentation that landed in the tracked repo state with no clear owner, no maintenance plan, and substantial overlap with upstream documentation. Examples:

- `docs/FFMPEG_USAGE.md` (839 lines): comprehensive ffmpeg reference — duplicates upstream docs; the only Lucky-specific content is three sentences in the introduction.
- `docs/DISCORD_JS_REFERENCE.md` (877 lines): duplicates discord.js docs.
- `docs/DISCORD_PLAYER_GUIDE.md` (852 lines): duplicates discord-player docs.
- `docs/FRONTEND_AI_STUDIO_CONTEXT.md` (1,314 lines): an explicit AI-tool context dump.
- `docs/LOVABLE_PROMPT.md` (352 lines): a prompt for an AI tool.
- `.context/lucky-rag-context.md` (441 lines): RAG indexer output.
- `packages/bot/TEST_MAP.md` (1,858 lines): auto-generated test inventory.
- `docs/plans/2026-03-25-*.md` (700 lines combined): planning docs superseded by later work.
- `docs/IMPLEMENTATION_STATUS.md` (173 lines): snapshot at v2.6.72 — currently shipping v2.12.0.

Total: 18 files, ~9,650 lines. None had ownership, none were updated alongside the code they described, and none provided value beyond what `git log`, the source tree, and upstream docs already provide.

The question:

> What's our policy for tracking AI-generated or auto-generated documentation in the Lucky repo?

## Research

### Options considered (Phase 1)

| Option                                 | Mechanism                                                                                                                   | Verdict                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **A. Delete + gitignore + ADR policy** | `git rm` clear cases, gitignore known generator outputs by exact name, ADR forbids future commits, pre-commit hook enforces | **Chosen**                                                                                                     |
| B. Move to `docs/archive/`             | `git mv` into a subdirectory, mark stale                                                                                    | Rejected: still indexed by IDE/grep, "archive" rots, clutters tree                                             |
| C. Long-lived `archive/ai-docs` branch | `git mv`, push branch, delete from main                                                                                     | Rejected: same outcome as A — `git log --follow -- FILENAME` recovers any deleted file from main's own history |
| D. Status quo — case-by-case           | No policy                                                                                                                   | Rejected: reproduces the current mess on every new project / migration                                         |

### Critique (Phase 2)

The `critic` agent flagged three concerns:

1. **Knowledge loss risk** for two duplicate-shaped docs (FFMPEG_USAGE, DISCORD_PLAYER_GUIDE). **Validated:** grep confirmed Lucky-specific content is limited to boilerplate intros ("Comprehensive guide for using X in Lucky"). The substantive content duplicates upstream docs.
2. **Over-broad gitignore wildcards** (e.g. `*_GUIDE.md` would catch future human-authored guides). **Accepted:** use exact filenames, not wildcards.
3. **No enforcement mechanism**, so the policy will rot within 2 sprints. **Accepted:** add a `.husky/pre-commit` hook that rejects matching paths.

## Decision

1. **Delete** 18 AI-generated / superseded / duplicate-of-upstream documentation files from tracked state. Full list in the PR. `git log --follow -- FILENAME` retains lossless history.

2. **Gitignore** the known generator outputs by exact name (no wildcards):
    - `.context/`
    - `packages/bot/TEST_MAP.md`
    - `docs/IMPLEMENTATION_STATUS.md`
    - `docs/LOVABLE_PROMPT.md`
    - `docs/FRONTEND_AI_STUDIO_CONTEXT.md`
    - `**/LIBRARY_RECOMMENDATIONS.md`
    - `**/CODE_EXAMPLES.md`

3. **Pre-commit hook** (`.husky/pre-commit`) rejects commits that stage any path matching the deny list, with a message pointing back to this ADR. `git commit --no-verify` remains the documented, audited escape hatch.

4. **Policy** for what may live in the tracked docs tree:
    - **Allowed:** `decisions/` (ADRs, at the repo root), `docs/runbooks/`, human-authored operational/architectural references with stated owners (README, ARCHITECTURE, CI_CD, \*\_SETUP, etc.), brand canon tied to actual code (BRANDING_GUIDE, DESIGN_SYSTEM).
    - **Not allowed (untracked):** RAG context dumps, AI-tool prompts, generated reference compendia that duplicate upstream docs, planning docs that aren't ADRs, snapshot status reports, **feature specs** (now local-only under `.claude/specs/` — relocated 2026-06-05, see `decisions/2026-06-05-docs-layout-real-docs-only.md`).
    - **Borderline (default to runbook):** if an AI tool surfaces a real Lucky-specific gotcha, convert it to a `docs/runbooks/` entry with explicit ownership and prune it from the AI output, rather than committing the AI output verbatim.

## Consequences

### Positive

- Repo tree drops ~9,650 lines of noise. Onboarding scanners (IDE, grep, search-MCP) stop returning duplicate-of-upstream results.
- `git log --follow -- FILENAME` retains lossless history. No information lost.
- Pre-commit hook prevents recurrence without manual policing.
- Future AI-tool runs that produce useful content are forced through the ADR/runbook channel, which has ownership and a maintenance contract.

### Negative

- A solo dev running AI tools that auto-generate docs will hit the hook and have to either move output to `docs/runbooks/`, gitignore it, or `--no-verify`. Adds 30 seconds per occurrence.
- New collaborators relying on grep-of-docs to find architectural context will instead find the source code or ADRs — slightly higher initial friction.

### Neutral

- Brand canon (`packages/frontend/branding/BRANDING_GUIDE.md`, `DESIGN_SYSTEM.md`) and operational doc `docs/review-tools.md` are kept — they have explicit ownership and tie back to ADRs / actual CSS variables in code.

## Revisit when

- Repo headcount hits 3+ sustained contributors AND any contributor cites a deleted doc as a blocker AND no ADR/runbook replaces it AND the content isn't in upstream docs. Threshold is high.
- An AI tool reliably generates Lucky-specific scaffolding (not duplicate-of-upstream) that solves a real onboarding gap. Then escalate that specific output to a runbook rather than relax the policy.
- A future workflow needs `TEST_MAP.md` as a tracked artifact (e.g., coverage diffs across PRs). Revisit the auto-generated-test-inventory exclusion.

## Alternatives rejected (summary)

- **Move to `docs/archive/`:** still clutters tree and IDE search; archives rot. `git log` is the proper archive.
- **Long-lived `archive/ai-docs` branch:** nobody will look at it; main's own history already serves this purpose.
- **Status quo:** every new AI tool and every new migration reproduces the same noise.

## Related

- Critic recommendation (Phase 2 of this decision): see PR description.
- Original cleanup trigger: `packages/frontend/LIBRARY_RECOMMENDATIONS.md` (166 lines, no owner, no link from anywhere else in the repo).
