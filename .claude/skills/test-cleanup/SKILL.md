---
name: test-cleanup
description: Audit and prune bloated test suites to the minimum that hits the coverage threshold and guards behavior. Use when test count is disproportionate to app size.
triggers:
    - test cleanup
    - prune tests
    - reduce tests
    - bloated test suite
    - test efficiency
user-invocable: true
argument-hint: '[path/to/tests] [--dry-run]'
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/test-cleanup
invocation_type: internal
---

# Test Cleanup

**Goal: hit the coverage threshold with the fewest, fastest tests possible.**

Not zero tests. Not maximum deletion. The minimum set of well-written tests that:

1. Reach the project's coverage target
2. Guard real behavior and regressions
3. Run fast enough that nobody skips them

A bloated suite of 1.4k shallow tests gives worse protection than 150 integration tests
that actually exercise real code paths. Many shallow tests count coverage lines the same
way one integration test does — but the integration test finds real bugs.

---

## Step 1 — Detect runner and gather baseline numbers

Identify the test runner (vitest/jest/pytest/cargo/go) from config files, then run with coverage:

```bash
# Find runner and coverage threshold
grep -E "\"vitest\"|\"jest\"|\"pytest\"" package.json pyproject.toml 2>/dev/null | head -3
grep -r "coverageThreshold\|threshold\|coverage" jest.config* vitest.config* package.json \
  2>/dev/null | grep -v node_modules | head -10

# Run with coverage (adjust for your runner)
npm test -- --coverage --verbose 2>&1 | tee /tmp/test-baseline.txt
```

Record four baseline metrics: **Test count** · **Suite runtime** · **Coverage %** · **Source LOC**.

See [references/lookup-tables.md](references/lookup-tables.md#efficient-test-count-by-app-type) for the proportionality lookup table.

---

## Step 2 — Reality check: is the target reachable under the current gate?

See [references/coverage-conflict.md](references/coverage-conflict.md) for the full conflict resolution workflow.

Before touching anything, verify the proportionality target is achievable given the project's coverage threshold. If incompatible, STOP and surface the conflict to the user before pruning.

---

## Step 3 — Delete skipped and pending tests immediately

Sweep for `it.skip`/`xit`/`xdescribe`/`describe.skip`/`test.skip`/`test.todo`/`@pytest.mark.skip`/`@pytest.mark.xfail`. Delete the entire block. These are tests someone broke and never fixed, or wrote and never enabled.

## Step 4 — Use test names as a triage signal

Scan for bad names: `should work`/`test 1`/`handles the case`/`it works`/`works correctly`/`does the thing`/`basic test`/`simple test`/`dummy`/`placeholder`/`TODO`/`FIXME`. Files with many hits go to the top of the audit queue.

---

## Step 5 — Delete whole files

Delete the whole file if: source file no longer exists · every test mocks the module under test · only tests types/interfaces/enums · structural duplicate (>70% overlap) · all tests are filler (`toBeDefined()`, `toBeInstanceOf()`).

Find orphaned spec files where the source file is gone.

---

## Step 6 — Delete waste patterns within remaining files

See [references/waste-patterns.md](references/waste-patterns.md) for the full list of waste patterns with code examples.

Key patterns to delete: mocked-everything units · filler assertions (`toBeDefined`, `toBeInstanceOf`) · trivial structure tests · redundant same-path tests (keep 1) · snapshot bloat on pure data · slow tests with hardcoded waits.

---

## Step 7 — What to keep

A test earns its place if it meets **at least one**: catches a real bug (would fail if implementation deleted) · documents a non-obvious invariant · guards a known regression · covers a critical path (auth, payment, data mutation).

A test is waste if: would pass even with implementation deleted · tests the language/framework · has hardcoded expected value reflecting input · was written to hit a coverage number.

**Mental test**: delete the production branch, run the test. If it still passes → delete the test.

## Step 8 — Check coverage after each batch of deletions

After every 5–10 files, re-run coverage. If it drops below threshold: either write one replacement integration test covering those paths, or restore the single best test from that batch. Never restore a whole batch.

---

## Step 9 — Write replacement integration tests (mandatory when stuck)

See [references/integration-tests.md](references/integration-tests.md) for the full workflow.

This step is **not optional** when the count target hasn't been reached and you're up against the coverage gate. When pure deletion stalls: identify structural clusters of 5+ tests, write one integration test that subsumes the cluster, delete the cluster. Target: each integration test covers 3× the lines at 1/5th the test count. Use `it.each` for "same path, different inputs" clusters.

---

## Step 10 — Consolidate fragmented spec files

After deletion, merge surviving tests from multiple sparse spec files into one primary spec per module. Deduplicate `beforeEach` setup. Don't consolidate intentionally separated unit vs. integration files.

---

## Step 11 — Final count, timing, and coverage

Re-run coverage. Report: test count (before→after, % reduction) · suite runtime (before→after) · coverage (must be ≥ threshold) · replacement integration tests written · files deleted · top 3 waste patterns.

**Success = count target hit AND coverage threshold maintained AND runtime reduced.**

If coverage is below threshold, write more integration tests. If count is above target, continue deleting.

---

## Step 12 — Optional: mutation testing to validate the survivors

See [references/mutation-testing.md](references/mutation-testing.md) for commands and score interpretation.

Run mutation testing to verify surviving tests actually catch failures. Score >80% = genuinely protective, <60% = run another deletion pass.

---

## Failure / Stop Conditions

- If a deletion causes cascading failures in unrelated tests: shared state or bad
  isolation — fix the isolation, then continue deleting
- Writing integration tests is **never** out of scope for this skill. If you find
  yourself wanting to declare it so, that's the signal to do it now — see Step 9. The
  only valid stop conditions related to coverage are: (a) the user explicitly accepted
  a higher count in the Step 2 conflict resolution, (b) coverage gate has been lowered
  to a number compatible with the proportionality target, or (c) the remaining tests
  all pass the Step 7 keep criteria individually
- If coverage tooling cannot run at all (broken config, missing dependencies): stop and
  fix the tooling first; pruning blind to coverage is too risky
- If `--dry-run`: output the full deletion list and any replacement tests needed,
  without touching files

## Memory Hooks

- Write memory with: final test count, suite runtime, coverage %, and proportionality
  target so future sessions don't re-pad the suite
