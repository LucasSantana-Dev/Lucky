# Record auto-rollback last-good from the deployed image's COMMIT_SHA, not git HEAD

- Status: accepted
- Date: 2026-06-05
- Deciders: Lucas Santana
- Supersedes: refines the auto-rollback added in [2026-06-04-deploy-time-active-rollback-over-bake-timer](2026-06-04-deploy-time-active-rollback-over-bake-timer.md)

## Context

`scripts/deploy.sh` `attempt_rollback()` redeploys the last known-good commit on a
failed health check by pulling `:${last_good:0:7}` images. Last-good is recorded on
each healthy deploy.

The recorded value was **git HEAD** (`git rev-parse HEAD`). But the
"Build & Push Docker Images" workflow (`docker-publish.yml`) is **path-filtered** —
it only builds on changes under `packages/** prisma/** Dockerfile* nginx/**
package*.json`. So an infra-only commit (`.gitignore`, `scripts/`, `deploy.yml`,
docs) advances git HEAD **without building images**. Recording such a HEAD as
last-good points the rollback at a `:<sha>` tag that does not exist in the registry,
so `attempt_rollback`'s pull misses and the self-healing rollback fails
("manual intervention required") — exactly when it is most needed.

This was proven live on the homelab: `git HEAD = ee23de19` while the running bot
container's baked `COMMIT_SHA = 9448de4b` (the real built image). `:ee23de1` images
do not exist; `:9448de4` images do. (Separately, no `.deploy-last-good-sha` existed
on the host — auto-rollback had no target at all — and the gitignore fix #1234 only
prevents future `git clean` wipes; it does not seed one.)

The manual `rollback_sha` path is unaffected — it takes an explicit built short-SHA.
Only the automatic self-healing rollback was broken.

## Decision

Record last-good as the **deployed image's baked `COMMIT_SHA`**, read from
`docker inspect lucky-bot` `.Config.Env`, instead of `git rev-parse HEAD`.

- The baked `COMMIT_SHA` is, by construction, the git SHA of the commit that built
  the running image — which therefore has `:<short>` images in the registry.
- Source it via `docker inspect` (daemon metadata), not `docker exec printenv`, so it
  resolves even when the container process is unhealthy/restarting.
- Empty-guard: if the value can't be read, **keep the prior last-good** and log a
  WARN — never overwrite a valid target with nothing.
- `attempt_rollback` is unchanged: it still truncates to `:${last_good:0:7}`, which is
  the registry's short-SHA tag.

## Alternatives considered

- **Validate git HEAD against the registry before recording** — requires ghcr auth +
  API latency at deploy-record time, and still records HEAD (which can drift); on a
  miss it silently keeps a stale/older target. Rejected: trades the bug for a new
  failure point without fixing the HEAD≠image root cause.
- **Remove the build path filter** so every push builds — wastes CI minutes and
  registry storage on docs/infra commits and still wouldn't validate image existence.
  Rejected: cargo-cult; root cause is "trust git HEAD", not "missing images".
- **Pull-time fallback to `:latest` on a tag miss in `attempt_rollback`** — a band-aid
  that masks recording a bad SHA and can roll back to a moving, unintended target.
  Rejected: patch, not fix.
- **Derive the last build-path-touching commit via `git log -- <paths>`** — reimplements
  the CI path filter in bash (drifts from the workflow) and answers "which SHA can we
  derive", not "which SHA is actually running and healthy". Rejected: solves the wrong
  problem.

## Consequences

Positive:

- Last-good is always an image-backed SHA → auto-rollback's pull cannot miss.
- Semantically exact: last-good = the image that is currently running and just passed
  health checks (true even after a local-build fallback or a pinned rollback deploy).
- Robust to an unhealthy container at record time (inspect, not exec).

Negative / neutral:

- Depends on `COMMIT_SHA` being baked into the image (true since the Dockerfile ARG→ENV
  was added; pre-baking images would read empty → keep prior last-good, safe).
- Reads from `lucky-bot` specifically; bot and backend are built from the same commit
  in one pipeline matrix, so their `COMMIT_SHA` always match.

## Revisit when

- Cascading failed deploys suggest rollback targets are unreliable → add explicit
  registry existence validation before recording.
- The image prune window (24h) ever races a rollback → extend retention or add a
  pre-flight check in `attempt_rollback`.
- The bot stops baking `COMMIT_SHA`, or bot/backend stop sharing a build → re-source.
