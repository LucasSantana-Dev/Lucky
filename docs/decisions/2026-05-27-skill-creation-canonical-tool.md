# ADR: Canonical Skill Creation Tool

**Date:** 2026-05-27
**Status:** Accepted

## Context

Four skills in `~/.agents/skills/` address skill authoring:

- `skill-creator` — full-featured canonical skill with metadata, validation, and support-file structure
- `create-skill` — a compatibility wrapper that explicitly delegates to `skill-creator`
- `write-a-skill` — older interactive approach, no validation, legacy folder layout
- `skill-maintainer` — catalog auditing (not creation)

The question: which is the right skill to invoke when authoring a new skill?

## Decision

Use **`skill-creator`** as the canonical tool for all skill creation and update tasks.

## Alternatives Considered

| Option             | Rejection reason                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `create-skill`     | Self-described compatibility wrapper; its own SKILL.md says "use `skill-creator` directly"                             |
| `write-a-skill`    | No validation script, uses legacy naming (REFERENCE.md vs references/), lacks frontmatter tier/canonical_source fields |
| `skill-maintainer` | Different scope — auditing/normalizing the catalog, not authoring new skills                                           |

## Consequences

- **Positive:** Single canonical path; `skill-creator` includes `scripts/quick_validate.py`, support-file conventions (`references/`, `scripts/`, `assets/`), and overlay metadata.
- **Neutral:** `write-a-skill` remains installed but effectively superseded.
- **Negative:** None identified.

## Revisit When

- `write-a-skill` is updated to match `skill-creator`'s feature set, at which point evaluate merging.
- A new skill creation tool is introduced into the ecosystem.
