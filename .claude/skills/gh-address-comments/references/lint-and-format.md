# Lint and Format Commands

Run per-language tooling on full directories (not just staged files) to catch CI
discrepancies. **Always format before committing.**

## TypeScript / JavaScript (Prettier + ESLint)

```bash
# Full-directory lint
npx eslint apps/web/src/__tests__/

# Format
npx prettier --write <files>
npx prettier --check <files>

# Verify
git diff --check
```

## Python (Ruff)

```bash
# Full-directory lint
ruff check tests/

# Format
ruff format <files>
ruff format --check <files>
```

## Common pitfall

Pre-commit hook lints only staged files. CI lints the entire directory. Mismatch →
"passes locally, fails on CI". Always lint full target directory before staging.
