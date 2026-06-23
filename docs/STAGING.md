# Staging environment

A shared, isolated mirror of production on the homelab for **visually verifying
dashboard/frontend changes on a real branch before they merge to `main`**. The
dashboard is a live Discord OAuth client, so it can't be meaningfully reviewed
without real auth + guild data — staging provides exactly that.

- **Frontend:** https://lucky-staging.lucassantana.tech
- **Backend:** https://lucky-staging-api.lucassantana.tech
- **Stack:** `docker-compose.staging.yml` (project `lucky-staging`) — postgres,
  redis, backend, frontend, nginx. **No bot** (the dashboard reads guild data via
  Discord REST; staging reuses the prod bot's presence in the test guild) and
  **no tunnel/webhook of its own** (reuses production's).

## How to use it

1. Add the **`staging`** label to your PR.
2. `Deploy Staging` (`.github/workflows/deploy-staging.yml`) fires, POSTs the
   homelab `deploy-staging` webhook with the PR's branch, and comments the URL.
3. The homelab builds the branch's images locally (~2-3 min) and brings up the
   `lucky-staging` stack; every subsequent push to the labeled PR redeploys.
4. Open the URL, log in with Discord, review with real data.

Manual deploy of any ref: run the **Deploy Staging** workflow via
`workflow_dispatch` with a branch/SHA.

> Staging is a **single shared environment** — one PR occupies it at a time
> (the most-recently-labeled/pushed wins). Coordinate if two changes need eyes
> at once.

## Isolation (why it's safe next to prod)

| Layer | Production | Staging |
|---|---|---|
| Compose project | `lucky` | `lucky-staging` |
| Containers | `lucky-*` | `lucky-staging-*` |
| Network | `lucky_lucky-network` | `lucky-staging-network` |
| DB / Redis volumes | `postgres_data` / `redis_data` | `staging_postgres_data` / `staging_redis_data` |
| nginx host port | 8090 | 8093 |
| Tunnel routing | `nginx:80` (docker net) | `http://100.95.204.103:8093` (host port) |
| Discord OAuth | prod redirect | shares `CLIENT_ID`, adds the staging redirect URI |
| Bot | runs the gateway | none (REST-only data via the prod bot's token) |

## Host-managed (not in the repo)

- `/home/luk-server/lucky-staging` — the staging git checkout (the deploy script
  checks out the target ref here and builds from it).
- `/home/luk-server/lucky-staging/.env.staging` — staging env: prod values with
  `WEBAPP_*` pointed at the staging domains, a distinct `WEBAPP_SESSION_SECRET`,
  and `NGINX_PORT=8093`.
- `~/.cloudflared/config-lucky.yml` — ingress rules routing the two staging
  hostnames to `http://100.95.204.103:8093`.
- Cloudflare DNS — `lucky-staging` + `lucky-staging-api` CNAMEs → the tunnel.
- Discord app `962198089161134131` — the staging redirect URI registered.
