# 2026-05-23 — Repo organisation: what AI-tool config is tracked

## Context

Lucky's `.gitignore` blanket-ignores `.claude/` and all other AI-tool directories, but three `.claude/` files were explicitly whitelisted as tracked exceptions since PR #842 (2026-05-13):

1. `.claude/dep-sweep-config.json` — `/dep-sweep` skill config
2. `.claude/branch-hygiene-config.json` — `/branch-hygiene` skill config
3. `.claude/standards/release-cadence.md` — release workflow documentation

As of v2.14.1 (2026-05-23), problems surfaced:

- `dep-sweep-config.json` had a stale `base_branch: "release/v2.10.0"` — already archived and deleted. That field goes stale every release cycle.
- `branch-hygiene-config.json` contains absolute local filesystem paths (`/Volumes/External HD/Desenvolvimento/.worktrees`), making it machine-specific — it should never have been tracked.
- `release-cadence.md` is project documentation, not operator config; hiding it under `.claude/standards/` made it invisible to contributors and undiscoverable from the README.

`docs/agents/` (three files: `domain.md`, `issue-tracker.md`, `triage-labels.md`) was also reviewed. These document repo-level conventions (ADR location, issue tracker patterns, triage labels) that any agent or contributor should follow. They are retained.

## Decision

**Remove mutable state from tracked `.claude/` config; keep stable policy.**

Specifically:

1. **`dep-sweep-config.json`** — remove `base_branch` and `base_branch_strategy` fields (mutable state, goes stale every release). Keep `sensitive`, `always_hold`, `auto_merge_minor`, `auto_merge_dev_deps` (stable dep policy). Operators pass the target branch explicitly when invoking `/dep-sweep`.

2. **`branch-hygiene-config.json`** — untrack entirely. The `/branch-hygiene` skill documents this config as optional with sane defaults. Machine-local paths have no place in the repo.

3. **`.claude/standards/release-cadence.md`** — move to `docs/RELEASE_CADENCE.md` and add to the README docs section. Content is unchanged; the location makes it discoverable.

4. **`docs/agents/`** — retain. These are project-level behavioral contracts for any agent operating in this repo, not operator-local state.

5. **`docs/` structure** — keep flat. README links 7 specific doc paths; reorganising into subdirectories would break those links for marginal navigability gain at current scale (~20 files).

## Alternatives considered

**Move JSON configs to `.config/` (tracked, cleaner location)** — rejected. The skills that consume these configs (`/dep-sweep`, `/branch-hygiene`) live in `~/.claude/skills/` (operator-local), not in the repo. Moving the configs requires updating the skill lookup path. The cost exceeds the benefit.

**Untrack `dep-sweep-config.json` entirely** — considered but rejected. The `sensitive` and `always_hold` lists are genuine shared policy (e.g., "never auto-merge discord.js majors"). Losing them from tracking means the policy lives only in operator memory.

**Track `dep-sweep-config.json` as-is, just fix `base_branch`** — rejected. `base_branch` would go stale again after the next release. Removing the field forces the operator to pass it explicitly, which is the right default.

**Reorganise `docs/` into subdirectories (setup/, development/, operations/)** — deferred. README links to 7 specific paths; the reorganisation would require a README update and offers little gain at current doc count.

## Consequences

- `/dep-sweep` skill: `base_branch` must be passed explicitly at invocation time. The skill falls back to `"release"` if missing (which will fail loudly if no such branch exists, surfacing the problem rather than silently targeting the wrong branch).
- `/branch-hygiene` skill: uses its built-in defaults for worktree root and PR threshold. Operators with non-standard worktree locations configure it locally.
- `docs/RELEASE_CADENCE.md` is now in the README's docs section and visible to contributors.
- `docs/agents/` is now referenced from the README.

## Revisit when

- The dep policy list in `dep-sweep-config.json` grows unwieldy → consider moving to a dedicated `docs/DEP_POLICY.md`.
- `/dep-sweep` or `/branch-hygiene` skills are moved into the repo (e.g., as `.github/` scripts) → revisit co-location of their configs.
