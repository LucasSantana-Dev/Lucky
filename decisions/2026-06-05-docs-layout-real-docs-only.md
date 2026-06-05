# docs/ holds human documentation only; decisions tracked at root, specs/plans untracked

- Status: accepted
- Date: 2026-06-05
- Deciders: Lucas Santana

## Context

`docs/` had accumulated three different kinds of content: (a) human-facing project
documentation (ARCHITECTURE, CI_CD, \*\_SETUP, TESTING, runbooks, etc.), (b) 68 ADRs
under `docs/decisions/`, and (c) 16 machine-generated feature specs under `docs/specs/`
(from the `/backlog` spec tooling). The mix made `docs/` hard to read as "the project's
documentation" and committed AI/planning artifacts that mostly serve agents, not humans.

Two constraints shape the split:

- ADRs are **decisions of record**. The operating rule "repository is the single source
  of truth for agent-actionable context (ADRs, decisions) — must be committed" means
  they have to stay version-controlled and present on a fresh clone.
- Feature specs and plans are **AI/planning context**, not human documentation, and were
  already half-untracked (`.claude/` is gitignored; plans live in `.claude/plans/`).

## Decision

- **`docs/` = human-facing project documentation only** — the loose `*.md` references and
  `docs/agents/` (agent _conventions_ referenced by `CLAUDE.md`, kept tracked).
- **ADRs → `decisions/` at the repo root** (moved with `git mv`, history preserved).
  Still tracked — they remain decisions of record and clone-present. `docs/decisions/`
  references across the repo were rewritten to `decisions/`.
- **Feature specs → local-only**: removed from tracking, mirrored under `.claude/specs/`
  (gitignored), and `docs/specs/` is gitignored so the spec tooling can't re-track them.
- **Plans** stay under `.claude/plans/` (already untracked) — unchanged.

## Alternatives considered

- **Move ADRs to a non-tracked store too** — matches "everything AI elsewhere" but erases
  68 decisions from the repo and from anyone cloning / any CI/agent on a fresh checkout.
  Rejected: violates repo-as-source-of-truth for decisions.
- **Leave `docs/decisions/` in place** — smallest change, but keeps `docs/` mixed.
  Rejected: the goal was a clean human-docs tree.
- **Keep specs tracked** — they're generated AI artifacts that duplicate planning state;
  keeping them tracked contradicts `2026-05-15-no-ai-generated-docs-in-tracked-state`.

## Consequences

- `docs/` reads as real documentation; ADRs are easy to find at `decisions/`.
- Specs no longer clutter the tree or the diff; they remain available locally for agents.
- The `/backlog` + spec tooling still writes to `docs/specs/` but those writes are now
  untracked (gitignored) — a follow-up could repoint the tooling at `.claude/specs/`.
- Any external link to `docs/decisions/...` is now `decisions/...`.

## Revisit when

- A docs-site generator is adopted that expects ADRs under `docs/`.
- Specs need to be shared with non-local collaborators (would require re-tracking).
