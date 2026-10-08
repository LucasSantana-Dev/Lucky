# Writing Replacement Integration Tests

This step is **not optional** when the count target hasn't been reached and you're up against the coverage gate. Bailing out with "further deletion needs replacement tests and that's a separate scope" is the failure mode this skill exists to prevent.

When pure deletion stalls because the gate is binding:

1. **Identify the structural cluster** — group remaining tests by the source file or feature they cover. Look for groups of 5+ tests covering one module via different inputs/branches.

2. **Write the integration test that subsumes the cluster.** It should:
    - Enter through the public API of the module (exported function, command handler, route, message handler)
    - Drive the input that exercises every branch the cluster was covering, in one or a few realistic scenarios (table-driven `it.each` is fine — that's still one test)
    - Use real implementations of internal collaborators; mock only external boundaries (network, file system, time)
    - Assert on the observable output / side effect, not internal call sequences

3. **Delete the cluster.** All of it. Re-run coverage to confirm the gate still holds. If coverage drops, the integration test is missing a branch — extend it (don't restore the deleted unit tests).

4. **Repeat for every cluster** until either the count target is hit or every remaining test independently passes the keep criteria.

**Target: each integration test covers at least 3× the lines of the tests it replaces, at 1/5th the test count.** A 30-test cluster collapses into ~6 `it.each` rows in one integration test, with same or better coverage.

## When to use `it.each`

If the cluster is "same code path, different inputs" (e.g., 30 tests of "this input maps to that output"), `it.each` is a single test that covers all 30 cases without paying the per-test setup cost:

```ts
it.each([
    ['input-a', 'output-a'],
    ['input-b', 'output-b'],
    // ...28 more rows
])('maps %s → %s', (input, expected) => {
    expect(transform(input)).toBe(expected)
})
```

Replaces 30 individual `it()` blocks with 1, no coverage loss.

## Failure modes when the agent stops here

If you find yourself writing "further deletion needs replacement integration tests and that's separate scope" — that means you stopped exactly where the value was. The replacement-test phase IS the cleanup.
