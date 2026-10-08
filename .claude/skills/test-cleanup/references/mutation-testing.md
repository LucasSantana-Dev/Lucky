# Mutation Testing (Optional Validation)

Run mutation testing against the cleaned suite to verify the tests that survived actually catch failures when the source is broken.

```bash
# JavaScript/TypeScript — Stryker
npx stryker run

# Python — mutmut
mutmut run && mutmut results

# Go — go-mutesting
go-mutesting ./...
```

**Mutation score interpretation:**

- > 80% — the suite is genuinely protective
- 60–80% — acceptable, some gaps remain
- <60% — significant portions of the surviving suite are not catching failures; run another deletion pass to remove tests with 0 mutation kills
