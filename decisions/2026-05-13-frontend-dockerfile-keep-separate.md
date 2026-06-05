# ADR — Keep `Dockerfile.frontend` separate (deferred consolidation)

- **Status:** Superseded by [PR #851 — `refactor/dockerfile-frontend-consolidation`](https://github.com/LucasSantana-Dev/Lucky/pull/851)
- **Date:** 2026-05-13
- **Superseded:** 2026-05-14
- **Decided by:** `/research-and-decide` composite
- **Related:** PR #848 (`chore/docker-overhaul`), PR #846 (Node 26 revert), PR #851 (consolidation)

## Context

The Lucky monorepo builds frontend images via a standalone `Dockerfile.frontend` that runs its own `npm ci` against the workspace root. The main `Dockerfile` builds bot + backend. The two Dockerfiles duplicate dependency installation, `prisma generate`, and shared package build steps.

PR #848 added a non-trivial `Dockerfile.frontend` (nginx-unprivileged migration, healthcheck, build cache) that diverged further from the main file. PR #846 surfaced a sharp downside of this separation: because the frontend Dockerfile runs `npm ci` at the workspace root, it pulls in the bot's native `@discordjs/opus` dependency, which lacked Node-26 prebuilt binaries on Alpine and broke `docker-publish` for two days.

The Phase-1 research evaluated five options:

1. Status quo — separate Dockerfiles, accept duplication
2. Consolidated multi-target Dockerfile
3. Shared `deps` stage across Dockerfiles via cross-image COPY
4. Pre-build dist in CI and ship a slim nginx
5. Turborepo prune to ship the frontend subgraph only

## Decision

**Keep `Dockerfile.frontend` separate for now (option 1). Mark consolidation as 12-month tech debt with a hard re-evaluation trigger.**

The status quo is defensible _now_ because PR #848 just stabilized it (non-root, healthcheck, pinned base) and adding refactor risk inside a security-hardening PR was not worth the blast radius.

**This decision was superseded on 2026-05-14.** PR #851 (`refactor/dockerfile-frontend-consolidation`) consolidates `Dockerfile.frontend` into the main `Dockerfile` as a `production-frontend` multi-stage target, addressing the root cause identified in the Revisit trigger #1 below (the frontend Dockerfile installing bot native deps). See PR #851 for the full rationale.

## Alternatives considered

- **Consolidated multi-target (option 2)** — Real cache wins on shared dep install, but couples the frontend image's evolution to the bot/backend Dockerfile. Lock-in to docker-compose `target:` syntax. Rejected on operability grounds.
- **Shared deps stage cross-Dockerfile (option 3)** — Stronger candidate after the critic review surfaced PR #846's actual root cause: the frontend installing the bot's native deps was the _real_ problem. Pruning or sharing-then-deduplicating would fix it. Rejected only because the simpler immediate fix — adding `apk add build-base` to the frontend builder or pruning the workspace — has lower blast radius and PR #846's revert already mitigated the bleeding.
- **Pre-built dist (option 4)** — Loses reproducibility (`docker build .` no longer matches CI output). Rejected.
- **Turborepo prune (option 5)** — Best long-term answer but pulls in Turborepo as a load-bearing CI dependency for a 4-package monorepo. Premature.

## Consequences

**Positive**

- Zero churn on PR #848's hardening work.
- Frontend image evolution stays independent of bot's native-module troubles.
- Junior-readable Dockerfiles, no cross-file references.

**Negative**

- Cache duplication (~10-12s per build, not the 40s originally estimated — confirmed by critic review).
- Frontend Dockerfile keeps installing the bot's `@discordjs/opus` for no functional reason. If `@discordjs/opus` or another native bot dep breaks again with a new Node bump, the frontend image break recurs.
- Two `prisma generate` invocations per release. Benign as long as `prisma/schema.prisma` is identical to both builds (it is, single source).

## Revisit when

Hard triggers (any one flips this to option 3 or option 5):

1. **PR #846-class break recurs**: another native bot dep ships without prebuilts for the chosen Node version → frontend Dockerfile must stop installing bot deps. _(This trigger was hit — see PR #851.)_
2. **Frontend ship cadence ≥5×/week** and bot ship cadence ≤2/month for 4 consecutive weeks → invalidation isolation matters less than cache reuse.
3. **CI build time > 8 min** for the frontend image → option 5 (Turborepo prune) becomes justified.
4. **12 months elapsed (2027-05-13)** with no other trigger → re-evaluate anyway. Defer-forever is a failure mode.

## References

- PR #848 — `chore/docker-overhaul`
- PR #846 — `fix(docker): revert frontend image to node:22-alpine`
- PR #851 — `refactor/dockerfile-frontend-consolidation` (supersedes this ADR)
- Critic review captured in this composite's Phase 2
- `feedback_tbd_release_branches` memory
