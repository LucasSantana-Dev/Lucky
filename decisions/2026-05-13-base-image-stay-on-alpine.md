# ADR — Stay on `node:22-alpine` (not bookworm-slim, not distroless)

- **Status:** Accepted (flips Phase-1 recommendation)
- **Date:** 2026-05-13
- **Decided by:** `/research-and-decide` composite

## Context

Phase-1 research recommended migrating from `node:22-alpine` to `node:22-bookworm-slim` for better debuggability and to "fix" PR #846's class of native-module breaks. Critic Phase-2 review flipped this recommendation by surfacing the actual root cause of PR #846.

**Re-examined root cause of PR #846 (verified by reading commit `0eb13d0f` + PR body):**

- Dependabot PR #831 bumped `Dockerfile.frontend` from `node:22-alpine` to `node:26-alpine`.
- `Dockerfile.frontend`'s builder runs `npm ci` against the workspace ROOT, which installs `@discordjs/opus` (a bot-only native dep) into the frontend build.
- `@discordjs/opus@0.10.0` uses `@discordjs/node-pre-gyp@0.4.5`, which ships no Node-26 ABI prebuilt. Falls through to source compile.
- `node:26-alpine` has no C toolchain → build fails. `docker-publish` was red for 4 days.

**This is a prebuilt-binary availability problem, not a musl-vs-glibc problem.** Migrating to bookworm-slim would have produced the same failure (Debian-slim also lacks a C toolchain by default). The actual fixes are:

- Don't install `@discordjs/opus` in the frontend image (separate Dockerfile concerns — covered by ADR `2026-05-13-frontend-dockerfile-keep-separate.md`'s revisit trigger #1).
- Add build tools when needed (`apk add build-base` or `apt-get install build-essential`).
- Pin Node major until ecosystem prebuilts catch up.

## Decision

**Stay on `node:22-alpine` for bot + backend production images. Stay on `nginxinc/nginx-unprivileged:1.27-alpine` for frontend + reverse-proxy nginx (already shipped in PR #848).**

This is a reversal of Phase-1's recommendation. The migration to bookworm-slim was justified by a wrong root cause; the genuine wins (debuggability, glibc) are real but small relative to a solo-operator-with-Claude-Code workflow where observability (Langfuse + OTel + Sentry) reduces the value of `gdb` / `strace` on the image itself.

## Alternatives considered

- **`node:22-bookworm-slim`** — glibc, native `apt`, ships shell + utilities. Real upsides: prebuilt-binary availability is broader, `strace`/`gdb` available. Real downsides: ~200MB larger image (180MB → ~380MB for bot), longer pulls, larger surface for the webhook container that holds docker.sock (per critic). Rejected: no current break Alpine causes, observability stack reduces the human-debuggability case.
- **`cgr.dev/chainguard/node` (Wolfi)** — Daily CVE cadence is attractive but Wolfi lacks first-party python3 + ffmpeg + yt-dlp packaging. Migration cost is high and creates an unfamiliar base image to maintain solo. Rejected unless a CVE storm forces it.
- **`gcr.io/distroless/nodejs22-debian12`** — Smallest, glibc, but no shell at all. Incompatible with the current `CMD ["sh", "-c", "npx prisma migrate deploy ..."]` pattern. Would require a build-time entrypoint script. Rejected on operator-legibility grounds.
- **`FROM scratch`** — Listed for completeness in research. Not viable with `@discordjs/opus` native modules.

## Consequences

**Positive**

- Zero migration churn on the heels of PR #848.
- Smallest production images (~180MB bot, ~95MB backend).
- Consistent base across bot, backend, frontend builder, dev frontend — no per-image quirks.

**Negative**

- Native-module ecosystem support on musl remains thinner than glibc. New native deps (e.g., `sharp`, `canvas`) may require `apk add build-base` in the build stage.
- Debuggability on the image itself is minimal. Observability tooling (Langfuse, OTel, Sentry) must remain the primary diagnostic path — this is now a load-bearing assumption, not a tie-breaker.
- Node-major bumps from Dependabot must be reviewed for prebuilt availability on Alpine before merging. Lock `node:22-alpine` until `@discordjs/opus` or its successor publishes Node-24/26 prebuilts.

## Pilot / adoption plan

None required (no change). The follow-up work this ADR implies belongs in:

- ADR `2026-05-13-frontend-dockerfile-keep-separate.md` — trigger #1 covers stopping the frontend from installing bot's native deps.
- Dependabot config — ensure `Dockerfile.frontend` and `Dockerfile` Node bumps are reviewed by the operator, not auto-merged.

## Revisit when

1. **`@discordjs/opus` (or its replacement) ships Node-24 prebuilts on `linux-musl-x64`** — verify with `npm view @discordjs/opus@latest dist-tags` + `npm install` in an `alpine:latest` test container. If clean, the case for bumping past Node 22 reopens but does not force a base-image change.
2. **Alpine 0-day CVE escalation event** — flip to `node:22-bookworm-slim` or chainguard immediately. Track Alpine security advisories (alpine-security@ ML or `apk audit`).
3. **A new bot dependency requires glibc** (e.g., a closed-source vendor SDK with only glibc binaries) → bookworm-slim migration is forced.
4. **A bot/backend image exceeds 500MB** — re-evaluate; alpine is no longer paying for itself.
5. **Annual review on 2027-05-13** — confirm the assumption holds.

## Cross-decision interactions

- This ADR pairs with `2026-05-13-frontend-dockerfile-keep-separate.md`: keeping Alpine assumes the frontend stops needing the bot's native deps eventually (separate Dockerfile's trigger #1).
- This ADR is independent of `2026-05-13-orchestration-stay-on-compose.md`: base image and orchestrator are orthogonal at single-node scale.

## References

- PR #846 — `fix(docker): revert frontend image to node:22-alpine`
- PR #831 — Dependabot Node 26 bump (the trigger)
- PR #848 — `chore/docker-overhaul`
- Critic Phase-2 root-cause re-analysis (this composite session)
