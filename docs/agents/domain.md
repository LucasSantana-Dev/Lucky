# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

Single-context repo. ADRs live in **`decisions/`** (not the conventional `docs/adr/`) to match the existing `/adr-write` workflow.

```
/
├── CONTEXT.md                    ← not yet created; proceed silently if absent
├── decisions/                    ← ADRs live here (tracked, repo root)
│   └── YYYY-MM-DD-<slug>.md
├── docs/                         ← human-facing project documentation only
│   ├── agents/                   ← agent conventions (this file, issue-tracker, triage-labels)
│   └── *.md                      ← ARCHITECTURE, CI_CD, *_SETUP, runbooks, etc.
├── .claude/                      ← local-only (untracked): specs/ (/adt-specs-spec-new), plans/ (/plan)
├── packages/                     ← bot, backend, frontend, shared
└── ...
```

## Before exploring, read these

- **`CONTEXT.md`** at the repo root (if it exists).
- **`decisions/`** — read ADRs that touch the area you're about to work in. Filter by date and slug.

If `CONTEXT.md` doesn't exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The producer skill (`/grill-with-docs`) creates it lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR in `decisions/`, surface it explicitly rather than silently overriding:

> _Contradicts `decisions/2026-05-16-dependabot-batch-handling-policy.md` — but worth reopening because…_

Recent ADRs (as of 2026-05-19) cover: dependabot batch policy, no-AI-generated docs, security-scan policy, Docker decisions trio, token optimization, deploy target, refactor target selection, autoplay integration tests, branch strategy, bot test suite cleanup. Check `decisions/` for the current set before assuming a decision is unmade.
