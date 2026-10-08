# Common CI Failure Patterns

Reference for frequent GitHub Actions and external check failures. Helps diagnose CI flakes and false positives.

## Formatter failures (Prettier / ruff)

**Symptom**: "X files would be reformatted" or "Code style issues found in N files"

**Root cause**: Code doesn't match the repo's formatter config (`.prettierrc`, `.ruff.toml`, etc.).

**Fix**: Run the formatter directly — do NOT manually reformat code:

```bash
npx prettier --write <files>   # JS/TS projects
ruff format <files>             # Python projects
```

Then commit and push. Never edit formatting by hand.

## CodeQL / GitHub Advanced Security false positives

**Symptom**: "File data in outbound network request" or "Network data written to file" alerts on utility scripts that intentionally fetch config from APIs or write status reports.

**Root cause**: CodeQL flags data-flow paths without distinguishing between untrusted (user input) and trusted (local config, CLI args) sources.

**Distinguish**: Check whether the flagged code is:

- (a) Reading local config files (package.json, server.json) to construct registry lookup URLs → **expected**, not a real vulnerability
- (b) Writing CLI-provided output paths with fetched data → **expected** for status/report scripts
- (c) Processing untrusted HTTP request data (form fields, query strings) → **real vulnerability**, do not suppress

**Fix**: Add suppression comments at the specific flagged lines.

For JavaScript:

```js
// codeql[js/request-forgery] intentional: url built from local manifest, not user-controlled data.
const response = await fetch(url, ...);

// codeql[js/path-injection] intentional: outputDir is a trusted CLI arg, not user HTTP input.
writeFileSync(path.join(outputDir, 'report.json'), ...);
```

For Python:

```python
result = subprocess.run(cmd, ...)  # noqa: S603  # trusted, not user-supplied
```

**Do NOT suppress** when the flagged code actually processes untrusted user input from an HTTP endpoint.

## Tag-to-version drift in release workflows

**Symptom**: A git tag `v1.2.3` was pushed but `package.json` still says `1.2.2`, causing publish mismatch or version check failures.

**Root cause**: Version was bumped but the tag was pushed from stale branch state, or version bump was forgotten.

**Prevention**: Add a version gate step in the CI `validate` job (before publish):

```yaml
- name: Verify tag matches package version
  if: startsWith(github.ref, 'refs/tags/v')
  run: |
      TAG_VERSION="${GITHUB_REF_NAME#v}"
      PKG_VERSION="$(node -p "require('./package.json').version")"
      [ "$TAG_VERSION" = "$PKG_VERSION" ] || { echo "Tag/package version mismatch: tag=$TAG_VERSION, pkg=$PKG_VERSION"; exit 1; }
```

## Flaky test isolation patterns

**Symptom**: A test passes locally but fails randomly in CI, or passes on retry.

**Common causes**:

- **Timing**: test assumes a fixed delay (use `waitFor` with retries instead of `sleep`)
- **Temp files**: multiple parallel test runners write to `/tmp` or `./tmp` without unique isolation dirs
- **Port collisions**: HTTP server tests bind to a fixed port; parallel runs collide
- **Environment**: test depends on an env var not set in CI (check `.github/workflows/*.yml` for `env:` sections)

**Fix strategies**:

1. Run test in isolation locally: `npm test -- --testNamePattern="<name>"` — if it passes, it's a race.
2. Use unique temp dirs per test: `path.join(os.tmpdir(), 'test-' + Math.random().toString(36))`
3. Bind to port 0 for tests: `server.listen(0)` → fetch the assigned port from `server.address().port`
4. Add env vars to CI workflow: `.github/workflows/test.yml` → `env: { NODE_ENV: test, DB_URL: ... }`

## Network timeout handling in Actions

**Symptom**: "ECONNREFUSED", "ETIMEDOUT", or "socket hang up" in CI but tests pass locally.

**Common causes**:

- Network dependency (API, database) is unreachable in CI environment
- Test doesn't wait for service startup (e.g., Docker container not ready)
- Timeout value is too aggressive for CI infra (2s local → 30s CI)

**Fix**:

1. **Check service startup**: ensure dependent services are running before tests:
    ```yaml
    services:
        postgres:
            image: postgres:15
            options: >-
                --health-cmd pg_isready
                --health-interval 10s
                --health-timeout 5s
                --health-retries 5
    ```
2. **Increase timeouts in CI**: use env vars:
    ```js
    const timeout = process.env.CI ? 30000 : 5000 // 30s in CI, 5s locally
    jest.setTimeout(timeout)
    ```
3. **Mock external services** if they're truly unavailable in CI; use a test double or HTTP mock.
