# ADR — Bot test suite cleanup strategy and proportionality target

- **Date:** 2026-05-09
- **Status:** Accepted (in progress)
- **Owner:** Lucas Santana
- **Related:** PR #835 (coverage threshold), PR #836 (phase-2 batch 1),
  `.agents/plans/test-cleanup-phase2.md`,
  `~/.claude/skills/test-cleanup/`,
  `~/.claude/skills/fix-the-suite/`

## Context

The bot package's test suite had grown to **2,848 tests across 158 files
for 39,016 LOC of source**. The canonical `/test-cleanup` skill flagged
this as `BLOATED` and recommended targeting 50–200 tests per its
proportionality table. Three structural problems made that ceiling
unworkable as written:

1. **Lucky is not the "≤30 commands, ~5k LOC" bot the table assumes.** The
   bot has ~30+ slash commands across music/autoplay engine/Last.fm
   scrobbling/Twitch integration/web music/automod/mod digest/giveaways/
   voterewards/levels/Spotify recommendations/guild automation. By app
   type it is closer to the table's "full-stack 15k LOC → 200–600 tests"
   row, scaled 2.6× by source size — putting the realistic ceiling at
   **roughly 500–1,500 tests, not 50–200**.
2. **No `coverageThreshold` was configured.** The skill's per-batch
   verification step ("if coverage drops below threshold, restore") had
   no tripwire — pruning was effectively blind to coverage.
3. **The "obvious waste" patterns the skill targets (skipped tests,
   SUT-self-mocks, filler-only `it()` blocks) were not present.** A
   strict scan found 0 skipped, 0 SUT-self-mocks, and the 84
   `toBeDefined` / `toBeInstanceOf` calls were inline secondary
   assertions inside otherwise-meaningful tests, not deletable
   standalones.

## Decision

1. **Adopt a Lucky-specific test-count target of ≤ 1,500.** The 50–200
   bracket from the skill table does not apply. Future cleanup phases
   target the lower end of 500–1,500 only when the suite shrinks
   organically; aggressive deletion below 1,500 is not a goal. Tests
   are deleted only when they exercise no distinct branch.
2. **Pin a coverage floor at the round-down of the post-#821 baseline:**
   statements 65 / branches 60 / functions 60 / lines 65. Implemented
   in `packages/bot/jest.config.cjs` via PR #835 and merged to
   `release/v2.10.0` at `1778d144`. Tighten by 2-3 percentage points
   per phase as the suite shrinks, never down.
3. **Cleanup proceeds in single-file, gate-checked batches.** Each
   batch:
    - Modifies one or two spec files only.
    - Replaces same-shape `it()` clusters with `it.each` tables (note:
      this consolidates LOC and improves maintainability but does NOT
      reduce jest's reported test count — each row counts as one test).
    - Deletes only tests that prove no distinct branch (e.g., 6 'does
      not detect X' negatives all hitting the same default branch are
      replaced with one 'returns all-false flags' assertion).
    - Verifies the gate holds via
      `npx jest --silent --coverage --coverageReporters=text-summary`
      before commit. If coverage drops, restore the most-coverage
      contributing test rather than the whole batch.
4. **Defer mutation testing.** Stryker is not currently installed in
   this monorepo. Setting it up is its own project; in its absence the
   safety argument for each batch rests on (a) input/output
   preservation (every (input → expected) pair from the original tests
   appears as an `it.each` row in the rewrite) and (b) unchanged
   coverage numbers (same statements/branches/functions/lines reached).
   Once the cleanup pass settles, install Stryker and run a one-off
   mutation pass on the `autoplay/` and `lastfm/` modules to confirm
   surviving tests are genuinely protective.

## Consequences

- **The original `/test-cleanup` skill cannot reach a "BLOATED → HEALTHY"
  verdict on this repo without lowering its proportionality target for
  full-stack-tier bots.** Filed back into
  `~/.claude/skills/test-cleanup/` as a refinement: add a "polyglot
  bot" row to the table (15-50k LOC, ~500-1500 tests) so the skill's
  Step 1.5 conflict check produces a workable target instead of
  flagging Lucky as 14× over.
- **Phase-2 cleanup is multi-PR work, not one big PR.** Batch 1 (PR
  #836) shipped 2 files, −21 tests, −1097 LOC, gate held. Subsequent
  batches will continue per the plan and merge independently.
- **Future contributors must not lower the coverage threshold to
  accommodate aggressive deletion.** The threshold is the policy
  artifact; the test count is a downstream consequence. Lower numbers
  for the "right" reason (genuine duplication elimination) only.

## Alternatives considered

- **Aggressive deletion to ≤200 tests with replacement integration
  tests for everything.** Rejected: the integration-test rewrite is a
  multi-week project across the autoplay pipeline, player handlers,
  scrobbler, and command registry — too much surface area to land
  before v2.10.0 ships. Phase 2's per-file cleanup buys time without
  blocking the release.
- **Disable the coverage threshold entirely and let CI pass with any
  number.** Rejected: removes the only tripwire that prevents future
  contributors from re-padding the suite or deleting too aggressively.
- **Pin the threshold at current numbers (67/63/64/68) instead of the
  round-down.** Rejected: leaves zero headroom — the next legitimate
  refactor that touches a low-coverage area would crash CI on every
  push. The 2-3pp buffer is intentional.

## References

- Skill: `~/.claude/skills/fix-the-suite/SKILL.md` (composite workflow)
- Skill: `~/.claude/skills/test-cleanup/SKILL.md` (per-file pass)
- Skill: `~/.claude/skills/test-health/SKILL.md` (diagnostic baseline)
- Plan: `.agents/plans/test-cleanup-phase2.md` (per-batch targets)
- Memory: `~/.claude/projects/-Volumes-External-HD-Desenvolvimento-Lucky/memory/MEMORY.md`
