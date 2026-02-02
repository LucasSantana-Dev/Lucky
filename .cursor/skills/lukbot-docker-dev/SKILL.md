---
name: lukbot-docker-dev
description: Run and test LukBot with Docker. Use when changing docker-compose, Dockerfiles, or local dev/CI runs.
---

# LukBot Docker & Local Dev

## When to use

- Changing `docker-compose.yml`, `docker-compose.dev.yml`, or Dockerfiles
- Running bot, backend, or full stack locally
- Debugging container or env issues

## Layout

- **Compose**: `docker-compose.yml` (prod-like), `docker-compose.dev.yml` (local dev)
- **Images**: `Dockerfile` (bot/backend), `Dockerfile.frontend`, `Dockerfile.nginx`
- **Nginx**: `nginx/nginx.conf` — `/api/*` → backend; `/*` → frontend

## Services (typical)

- postgres, redis, bot, backend, frontend, nginx. Env via `.env`; no hardcoded ports or secrets in compose.

## Scripts

- Prefer root `scripts/` (e.g. `setup-database.sh`, `discord-bot.sh`) for one-off or documented flows.
- Use npm scripts for build/test/lint: `npm run build`, `npm run dev:bot`, `npm run test`, etc.

## Conventions

- Use Docker for local when the project provides it; ensure `.env.example` documents required vars for Docker and local runs.
