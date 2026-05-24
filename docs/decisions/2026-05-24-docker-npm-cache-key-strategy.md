# ADR: Docker BuildKit npm cache key strategy

**Date:** 2026-05-24
**Status:** Accepted

## Context

The `Build & Push Docker Images` workflow failed with:

```
npm error Error: Expected "0.28.0" but got "0.27.3"
npm error path /app/node_modules/tsx/node_modules/esbuild
npm error command sh -c node install.js
```

The Dockerfile has two `npm ci` stages that use `--mount=type=cache` to persist `/root/.npm` (npm's download cache) across BuildKit runs:

- `npm-build-stage` — full install in the `build` stage
- `npm-deps-production` — prod-only install in the `deps-production` stage

The GHA workflow also uses `type=gha,mode=max` for Docker layer caching. When `tsx`'s nested esbuild dependency was updated (0.27.3 → 0.28.0 in the lockfile), the stale binary surfaced through either the BuildKit mount cache or the GHA layer cache, causing esbuild's postinstall version check to fail.

## Decision

Use the lockfile hash as the BuildKit npm mount cache key, passed from the workflow as a build arg:

**Dockerfile:**
```dockerfile
ARG NPM_CACHE_KEY=v1
...
RUN --mount=type=cache,id=npm-build-stage-${NPM_CACHE_KEY},...
RUN --mount=type=cache,id=npm-deps-production-${NPM_CACHE_KEY},...
```

**docker-publish.yml:**
```yaml
build-args: |
    COMMIT_SHA=${{ github.sha }}
    NPM_CACHE_KEY=${{ hashFiles('package-lock.json') }}
```

Both cache mounts are updated — using the same key ensures build and production stages always share a consistent npm cache state when the lockfile changes.

The `ARG NPM_CACHE_KEY=v1` default allows local `docker build` invocations and non-GHA CI to work without passing the arg (they get `v1`, which is stable between runs without the workflow).

## Alternatives considered

**A. Remove `--mount=type=cache` entirely.** GHA runners are ephemeral — the mount cache doesn't persist across runs anyway. This would guarantee a clean npm install on every build. Rejected: keeps the door open for self-hosted runners where the cache IS persistent, and the keyed approach achieves the same correctness with better ergonomics.

**B. Bump the cache ID suffix manually** (`id=npm-deps-production-v2`). Unblocks immediately but requires a human to remember to bump it again on the next version mismatch. Rejected in favor of the self-healing lockfile-hash approach.

**C. Delete GHA cache entries via API.** No code change, immediate unblock. Rejected as a solo fix: doesn't prevent the same failure on the next dependency update.

## Consequences

- **Positive:** Any change to `package-lock.json` automatically invalidates both npm mount caches AND (via the ARG value changing the layer hash) the GHA layer cache for all downstream layers — guaranteeing a clean install.
- **Positive:** Self-healing. No manual intervention required when deps update.
- **Negative:** When the lockfile changes, the GHA layer cache for the `build` and `deps-production` stages is fully invalidated. Build time for those runs is longer (full npm download + compilation). This is the correct trade-off: correctness over cache hit rate when deps change.
- **Neutral:** Local `docker build` without `--build-arg NPM_CACHE_KEY=...` uses `v1` — a stable cache ID that behaves identically to the old hardcoded IDs.

## Revisit when

- Project switches to self-hosted runners: re-evaluate whether `--mount=type=cache` provides meaningful cross-run speedup (it would, with persistent runners). The current approach is compatible — the cache is still used, just busted on lockfile changes.
- `hashFiles('package-lock.json')` produces cache misses too frequently (e.g., if lockfile changes every PR due to automatic dep updates): consider scoping to a subset of the lockfile, or switching to a manual version suffix.
