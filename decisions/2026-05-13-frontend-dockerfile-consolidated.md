# ADR — Consolidate frontend Dockerfile into main multi-stage build

- **Status:** Accepted
- **Date:** 2026-05-13
- **Supersedes:** `2026-05-13-frontend-dockerfile-keep-separate.md` (lives on
  parked branch `docs/docker-decision-adrs`; that ADR's 12-month-defer is
  overridden here for the reason documented below)
- **Related:** PR #846 (the actual incident), PR #848 (Docker overhaul)

## Context

Earlier today the `/research-and-decide` composite recommended keeping
`Dockerfile.frontend` separate with a 12-month re-evaluation trigger. The
trigger conditions included:

> **PR #846-class break recurs**: another native bot dep ships without
> prebuilts for the chosen Node version → frontend Dockerfile must stop
> installing bot deps.

Re-reading PR #846's commit body confirmed the bug had already happened
once. The "defer 12 months" decision was hedging against future breaks
when the cost of fixing the structural cause now is roughly equal to
shipping the workaround (the standalone Dockerfile).

The structural cause is unchanged regardless of base-image or Node-major
choice: a separate `Dockerfile.frontend` that runs `npm ci` at the
workspace root will _always_ pull in `@discordjs/opus` (and any future
bot-only native dep) and need to either compile or have prebuilts available.

## Decision

Consolidate `Dockerfile.frontend` into the main multi-stage `Dockerfile`
as two new stages:

- `build-frontend` (derives from existing `build` stage)
- `production-frontend` (runtime: `nginxinc/nginx-unprivileged:1.27-alpine`)

`Dockerfile.frontend` deleted. Compose + CI publish workflow + docs
updated.

## Why now instead of in 12 months

1. **PR #846 was a real production blocker** for 4 days. The deferred
   ADR's trigger #1 was hypothetical when written — it had already fired.
2. **Cost of the refactor turned out small**: 5 files, 28 insertions, 42
   deletions, one `docker-compose config -q` validation, no behavior
   change.
3. **The `build` stage already had `build-base + python3-dev + opus-dev`**.
   Sharing it means native compilation works even when prebuilts don't
   exist — making the frontend image resilient to future Node-major bumps
   that outrun `@discordjs/opus`'s prebuilt cadence.

## Consequences

**Positive**

- One Dockerfile to maintain. Frontend evolution can't drift from
  bot/backend evolution.
- ~10-12s saved per build (no duplicate `npm ci`).
- Frontend builds inherit the C toolchain → Dependabot Node-major bumps
  stop blowing up the frontend image.
- Resolves the open question in the previous ADR's "Revisit when"
  trigger #1.

**Negative**

- Cache invalidation: any change in `packages/bot` or `packages/backend`
  source now invalidates the frontend's `build-frontend` stage. In
  practice this is acceptable because the `build` stage's `npm ci` and
  prisma generate are the slow parts, and those are gated on
  package\*.json (unchanged by source edits).
- Lock-in: `target: production-frontend` is a docker-compose / `docker
build --target` idiom. Vercel or Cloudflare Pages won't read this; if
  the frontend moves off the homelab the consolidation needs to be
  unwound. Deploy-target ADR locks homelab so this is hypothetical.

## Alternatives considered (one more time)

- **Turborepo prune (`turbo prune --scope=frontend`)** — would minimize
  cache invalidation but pulls in `turbo` as a first-class CI primitive
  for a 4-package monorepo. Premature.
- **Cross-Dockerfile `COPY --from=<image>`** — keeps two files but adds a
  build-order dependency in CI (deps image must publish before frontend
  starts). Strictly more complex than this refactor.
- **Status quo** — already rejected by the data; see "Why now".

## Revisit when

1. **Frontend ship cadence ≥ 5×/week and bot ≤ 2/month** for 4
   consecutive weeks → invalidation isolation matters more than cache
   reuse; revisit Turborepo prune.
2. **Lucky moves off homelab to Vercel / Cloudflare Pages** → frontend
   build becomes Vercel's problem; this consolidation is harmless to
   unwind.
3. **Annual review on 2027-05-13.**

## References

- PR #846 — `fix(docker): revert frontend image to node:22-alpine`
- PR #848 — `chore/docker-overhaul`
- Superseded ADR — `2026-05-13-frontend-dockerfile-keep-separate.md`
  (parked branch `docs/docker-decision-adrs`)
