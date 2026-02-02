# Docker

## Compose files

- **docker-compose.yml** – Production-like stack: postgres, redis, bot, backend, frontend, nginx. Use for full local prod-like runs.
- **docker-compose.dev.yml** – Development: postgres, redis, bot (with volume mount and dev target). Use with `NODE_ENV=development` and `./scripts/discord-bot.sh start`.

## Build targets

| Image                | Command                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| Bot (production)     | `docker build --target production-bot -t lukbot-bot:latest .`                   |
| Backend (production) | `docker build --target production-backend -t lukbot-backend:latest .`           |
| Bot (development)    | `docker build --target development --build-arg SERVICE=bot -t lukbot-bot:dev .` |
| Frontend             | `docker build -f Dockerfile.frontend -t lukbot-frontend:latest .`               |
| Nginx                | `docker build -f Dockerfile.nginx -t lukbot-nginx:latest .`                     |

Compose builds these when you run `docker compose up -d` or `docker compose -f docker-compose.dev.yml up -d`.

## Ports

In production compose only **nginx** is exposed on the host (port **8080**). Access the app at `http://localhost:8080`. Backend and frontend are not published; traffic goes through nginx.

## Logging

All services use the `json-file` driver with `max-size: "10m"` and `max-file: "3"` to limit log growth.

## Scripts

- `./scripts/discord-bot.sh build` – Builds bot image (production or development from `NODE_ENV`).
- `./scripts/discord-bot.sh start` – Starts compose (prod or dev from `NODE_ENV`).
- `./scripts/discord-bot.sh stop` – Stops both prod and dev compose stacks.
- `./scripts/discord-bot.sh logs` – Streams logs for the active stack.

## Nginx configs

- **nginx/nginx.conf** – Reverse proxy (used by the nginx container): `/api` → backend, `/` → frontend.
- **nginx/frontend.conf** – Static serving only (used by the frontend container): SPA fallback for `/`.

## Optional: Portainer

To deploy via Portainer instead of SSH, use `scripts/portainer-deploy.sh` and `scripts/portainer-webhook.sh`. Set `PORTAINER_URL`, `PORTAINER_USERNAME`, `PORTAINER_PASSWORD`, `PORTAINER_STACK_ID`, and `PORTAINER_ENDPOINT_ID`; the main deployment path is [CI_CD.md](CI_CD.md) (GitHub Actions → SSH).
