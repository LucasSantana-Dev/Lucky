# ADR — Docker Surface Overhaul (chore/docker-overhaul)

- **Status:** Proposed
- **Date:** 2026-05-13
- **Branch:** `chore/docker-overhaul`
- **Base:** `release/v2.11.0`

## Context

The Lucky container surface accumulated friction:

- `0eb13d0f` (PR #846) reverted the frontend image to `node:22-alpine`, signalling
  Docker drift between dev and prod was already biting.
- Build context was shipping the entire repo, including `.worktrees/` (3.4GB),
  `worktrees/` (707MB), `.wt-specs/` (41MB), `.claude/` (115MB), and `.agents/`
  (183MB) — ~4.5GB of redundant data sent to the daemon on every build.
- `docker-compose.dev.yml` referenced a `target: development` stage that did
  not exist in `Dockerfile`, so dev compose was broken.
- The bot `HEALTHCHECK` was `node -e "console.log('Service is running')"` —
  always exit 0, completely useless as a liveness signal.
- `Dockerfile.nginx` and `Dockerfile.frontend` ran as root to bind port 80
  with `nginx:alpine`.
- No memory or CPU limits on any compose service.
- `almir/webhook:latest` was unpinned despite the service having
  `/var/run/docker.sock` mounted (effective host root).
- `cloudflared` ran as `user: root` unnecessarily.
- A no-op `base-runtime-backend` intermediate stage existed.
- yt-dlp installed via `pip3 install --break-system-packages`.

## Decision

Single PR (`chore/docker-overhaul`) ships eight focused commits:

1. `.dockerignore` excludes worktrees, agent state, archive, downloads.
2. Real bot HEALTHCHECK via raw RESP `PING` over TCP to `${REDIS_HOST}`.
3. `development` stage added to `Dockerfile`, wired by dev compose.
4. nginx + frontend switched to `nginxinc/nginx-unprivileged:1.27-alpine`
   (UID 101, port 8080). Compose port mapping + nginx confs adjusted.
   Cloudflared config on the homelab must be updated to point at `:8080`
   before merge.
5. Resource limits via three YAML anchors (`small-svc` / `medium-svc` /
   `large-svc`) applied to every service. `env_file: .env` added as
   fallback for bot + backend. Cloudflared `user: root` removed.
6. `almir/webhook` pinned to `2.8.3`.
7. Stage consolidation, venv-based yt-dlp, frontend dev image aligned to
   node 22, BuildKit cache mount preserved.
8. This ADR (audit findings inline above; no separate audit doc).

## Consequences

**Positive**

- Build context shrinks by ~4.5GB → faster local + CI builds and lower
  daemon memory pressure.
- Dev compose actually works (`docker compose -f docker-compose.dev.yml up`).
- Orchestrators can detect a wedged bot (Redis-unreachable or node-stuck).
- nginx no longer needs root; minor but durable hardening win.
- No service can OOM the homelab host.
- Supply-chain risk on the webhook container (which holds docker.sock)
  drops to "Almir's account stays uncompromised" only.

**Negative / Required follow-ups**

- The homelab `cloudflared/config-lucky.yml` ingress entry must be edited
  from `http://nginx:80` to `http://nginx:8080` BEFORE merging this PR.
- `env_file: .env` introduces a precedence layer; verified explicit
  `environment:` still wins, so behavior is preserved.
- Resource limits are best-guess; revisit if any service hits OOM under
  steady-state traffic.

## Out of scope

- Migrating from compose to k8s / nomad.
- Switching to a distroless or wolfi base.
- BuildKit `--secret` for build-time credentials (not currently needed).
- Frontend Dockerfile sharing the main multi-stage build (worth doing,
  but would couple frontend builds to the bot/backend build cache and
  inflate PR scope).

## Revisit triggers

- Container OOM events in homelab journalctl.
- Cloudflared / nginx 502s after merge → first check tunnel config port.
- `almir/webhook` reaches end-of-life or upstream publishes a CVE fix
  newer than 2.8.3.

## References

- PR #846 (`fix(docker): revert frontend image to node:22-alpine`)
- Audit memory: `audit_deep_lucky_2026-05-13`
- TBD policy memory: `feedback_tbd_release_branches`
