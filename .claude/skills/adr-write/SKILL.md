---
name: adr-write
description: Record a technical decision as a DECISIONS.md line, or a full ADR when a record gate trips. Use for 'record this decision', 'write an ADR'.
triggers:
    - adr-write
    - architecture decision record
    - capture decision
    - document why
    - decision rationale
    - record alternatives
    - revisit when
    - decision log
user-invocable: true
argument-hint: '[<short title>]'
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/adr-write
---

# ADR Write

Architecture Decision Records preserve the _why_ behind a decision so future maintainers
(including future-you) don't undo the work to rediscover the same reasoning. Most
codebases lose this context within 6 months of the decision.

This skill records one decision at proportional fidelity: a one-line log entry by
default, a full ADR only for decisions whose stakes justify the template. Both formats
are grep-able, RAG-indexable, and readable by `improve-codebase-architecture` and
`refactor-plan`. Governing decision: global ADR `2026-07-23-proportional-fidelity-decision-records`.

## Record gate (apply FIRST)

Decide the fidelity before writing anything:

- **Afternoon-reversible** (undoing takes an afternoon or less): **no record**.
  Decide in-line, move on.
- **Sub-gate but worth keeping**: **one line** in the repo's `DECISIONS.md`
  (see section 1). This is the default output of this skill.
- **Full ADR** only when ANY gate trips:
    1. Public-facing repo (external consumers need in-repo provenance)
    2. Undoing costs >= a sprint (schema, auth model, storage, canonical-source choice)
    3. Rejection of a recurring alternative that keeps being re-proposed
    4. Forced post-incident record

## Use When (full ADR path)

- You just made a non-obvious technical decision AND a record gate above trips
  (library choice with sprint-level migration cost, schema design, auth model,
  canonical-source selection)
- A reviewer asks "why didn't you do X instead?" and the answer isn't already written
  somewhere
- You're about to undo a previous decision: capture both why the old one is being
  replaced and the new direction (also append a SUPERSEDED line to `DECISIONS.md`)
- You're starting a refactor and want the rationale on record before the diff lands

## Do Not Use When

- The decision is afternoon-reversible: no record at all, not even a log line
- The decision is obvious from the code (e.g., used the standard library function)
- The decision is captured in an existing PR description, design doc, or skill — link
  to it instead of duplicating
- The work is throwaway (spike, prototype, experiment that won't ship)

## Inputs / Prereqs

- Active repo with write access
- A clear statement of what was decided (you, the operator, must already know this —
  the skill records, it does not decide)
- Optional `<short title>` arg; otherwise the skill will ask

---

## Workflow

### 1. Choose the sink: `DECISIONS.md` (default) or `docs/adr/` (gated)

**Default sink: `<repo root>/DECISIONS.md`.** Create it lazily, only when the
first sub-gate decision lands, with this header:

```markdown
# Decision Log

Append-only. One line per decision. Never edit old lines; supersede by appending
a new line with status SUPERSEDED or BACKTRACKED. Newest at the bottom.

| Status | Date | Decision | Why (one line) |
| ------ | ---- | -------- | -------------- |
```

Each entry is one status-prefixed Y-statement row:

`| ACCEPTED | 2026-07-23 | Use Drizzle not Prisma for the web-app ORM | PG JSON ops required; Prisma migration cost |`

Statuses: `ACCEPTED`, `REJECTED` (name the refused alternative), `DEFERRED`
(include the re-open trigger), `SUPERSEDED`, `BACKTRACKED`.
If parallel worktrees hit append conflicts: add `DECISIONS.md merge=union` to
`.gitattributes`.

**Full-ADR sink (a record gate tripped): `docs/adr/`**, the ONLY per-repo ADR
location. Do not probe alternative conventions (`docs/decisions/`, `adr/`,
`.claude/adrs/`). If the repo has ADRs in a legacy location, leave them read-only
and note it; all new ADRs go to `docs/adr/` (create the dir if missing).
Harness-global decisions (about the agent system itself) go to
`~/.claude-env/adrs/`; `~/.claude/adrs/` is a symlink to it.

### 2. Name the file (full ADRs only): date slug, no numbering

New ADR filenames are date slugs: `YYYY-MM-DD-<slug>.md`. No NNNN numbering:
concurrent sessions and machines computing "next number" produced duplicate
numbers (6 collisions in the global dir). Date slugs sort chronologically and need
no allocator, but they are not unique on their own: two sessions recording the
same title on the same day get the same name. Step 5 never overwrites; it adds a
`-2`, `-3`, ... suffix instead. Existing NNNN files stay as-is.

### 3. Gather the decision content

For a `DECISIONS.md` line you need only: status, date, the decision as an
imperative Y-statement, and a one-line why (plus re-open trigger for DEFERRED).

For a full ADR, if the user did not provide all of these in the prompt, ask once
(one combined question, not one at a time):

- **Title** — short, imperative ("Use Drizzle instead of Prisma")
- **Context** — what situation forced this decision (1–3 sentences)
- **Decision** — what was decided (1–2 sentences, declarative)
- **Alternatives considered** — at least one, with one-line reason rejected
- **Consequences** — what changes because of this (positive and negative)
- **Revisit when** — concrete trigger that would re-open this decision

If the user gave a free-form statement, extract these fields from it; only ask for
fields that are genuinely missing. Do not interrogate them with one question per field.

### 4. Detect related context

Pull related signals to enrich the record without manual lookup:

```bash
# Recent commits on the area being decided
git log --oneline -10 --diff-filter=AM -- '<relevant path or glob>' 2>/dev/null

# Open PRs touching the area
gh pr list --search "<relevant keyword>" --state open --limit 5 2>/dev/null

# Existing records that may be superseded
grep -ilE "Drizzle|Prisma" DECISIONS.md docs/adr/*.md 2>/dev/null
```

If an existing ADR addresses the same area, mark the new ADR as
`Supersedes: <old filename>` and add `Superseded by: <new filename>` to the older
one in the same skill run. If the old record is a `DECISIONS.md` line, do not edit
it; the new ACCEPTED line with a matching subject is the supersession (newest wins).

### 5. Write the file (full ADR path)

```bash
# sed -E so this also runs on macOS/BSD sed (GNU-only `\|` left edge dashes in place)
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
DATE=$(date -u +%Y-%m-%d)
FILE="docs/adr/${DATE}-${SLUG}.md"
N=2
while [ -e "$FILE" ]; do   # never overwrite a same-day, same-title ADR
  FILE="docs/adr/${DATE}-${SLUG}-${N}.md"; N=$((N + 1))
done
mkdir -p docs/adr
```

Write this template (one per ADR, no skipped sections):

```markdown
# ADR-YYYY-MM-DD: <Title>

- **Status:** Accepted
- **Date:** YYYY-MM-DD
- **Deciders:** <names or roles>
- **Supersedes:** <ADR filename> (omit if none)
- **Superseded by:** (filled in later if/when replaced)

## Context

<1–3 sentences. What problem or pressure forced a choice. Include any constraints
the reader needs to know — performance budget, team size, deadline, vendor lock-in
risk, prior art in the codebase.>

## Decision

<1–2 sentences, declarative. "We will use X to do Y." Specific enough that someone
unfamiliar with the project can act on it.>

## Alternatives considered

- **<Alternative A>** — <one-line reason rejected>
- **<Alternative B>** — <one-line reason rejected>
- (At least one alternative; preferably 2–3.)

## Consequences

**Positive:**

- <What gets easier, faster, safer, cheaper>

**Negative:**

- <What gets harder, more expensive, more constrained>

**Neutral:**

- <Things that change but aren't strictly better or worse>

## Revisit when

- <Concrete trigger 1 — e.g., "Drizzle drops support for PostgreSQL JSON ops">
- <Concrete trigger 2 — e.g., "Team grows past 8 backend devs and migration friction
  becomes the bottleneck">
- (Without a revisit trigger, the ADR becomes permanent law it shouldn't be.)

## References

- <Link to PR, design doc, benchmark, RFC, library docs>
```

### 6. Update the ADR index (if present)

```bash
INDEX="docs/adr/README.md"
if [ -f "$INDEX" ]; then
  # Append a new row to the index table; do not rewrite the whole file
  echo "| ${DATE} | [${TITLE}](./$(basename "$FILE")) | Accepted |" >> "$INDEX"
fi
```

If no index exists, skip it: `DECISIONS.md` is the index surface now. Do not
backfill indexes for legacy ADR sets.

### 7. Mark superseded ADRs

If the new ADR replaces a previous one:

```bash
# Edit the old ADR to add "Superseded by: <new filename>" line
# and change Status from "Accepted" to "Superseded"
```

### 8. Stage and report

Stage only what this run wrote. Set `WROTE_DECISIONS=1` when this run appended a
`DECISIONS.md` line (the default path, or the SUPERSEDED line of a full ADR), so
unrelated edits already in that file are never swept in.

```bash
[ -n "$FILE" ] && git add "$FILE"
[ -n "$FILE" ] && [ -f "$INDEX" ] && git add "$INDEX"
[ -n "$SUPERSEDED" ] && git add "$SUPERSEDED"
[ -n "$WROTE_DECISIONS" ] && git add DECISIONS.md
```

Do not auto-commit. The record usually accompanies the change it documents — let the
user include both in the same commit.

```
Decision recorded: <DECISIONS.md line | docs/adr/YYYY-MM-DD-slug.md>
Gate tripped: <none (log line) | public-facing | sprint-undo | recurring-rejection | post-incident>
Supersedes: ${SUPERSEDED:-none}

Staged but not committed. Suggested:
  git commit -m "Record decision: ${TITLE}"

Or include with the implementation commit:
  git add <impl files> && git commit -m "<scope>: ${TITLE}"
```

---

## Outputs / Evidence

- One appended line in `DECISIONS.md` (default), or
- Date-slug ADR file at `docs/adr/YYYY-MM-DD-slug.md` (+ updated index and
  superseded ADR when applicable)
- Files staged for commit; not auto-committed

## Failure / Stop Conditions

- Repo has no commit yet → cannot place the record; ask user to make initial commit first
- User cannot articulate at least one alternative considered → push back ("if there
  was no alternative, this isn't a decision worth recording") and stop
- Full-ADR path and user cannot articulate a revisit trigger → still write the ADR
  but flag it; permanent decisions without revisit conditions tend to outlive their value

## Memory Hooks

- Read memory for any project-specific record conventions (different log location,
  different template, custom fields)
- Write memory only if you established a new convention this session worth reusing
  (e.g., "this repo uses MADR format, not the lightweight one above")
