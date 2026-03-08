# Nexus Current State (2026-03-07, Session 13)

## Version & Health
- Version: v2.0.1 on main
- Branch: main (trunk-based)
- Backend tests: 361 passing (24 suites, Jest 30)
- Frontend tests: 60 passing (8 suites, Vitest)
- E2E tests: 123/135 passing (Playwright — 8 visual + 4 auth expected failures)
- Build: all 4 packages pass (shared → bot + backend + frontend)
- Audit: 0 vulnerabilities
- GitHub: LucasSantana-Dev/Nexus, 0 open PRs, 0 open issues

## Services Verified Running
- **Bot**: LukBot#6741, 24 slash commands loaded, 154ms Discord latency
- **Backend**: Express on :3001, Redis session store
- **Frontend**: Vite dev on :5173, 171ms startup, 409 KB gzip
- **Postgres**: 18-alpine on :5432 (Docker)
- **Redis**: 8-alpine on :6380 dev / :6379 in Docker network

## Recent Changes (Session 13)
- Fixed handler import paths (reactionrole, roleconfig, twitch → ../handlers/)
- Fixed reactionrole option description >100 chars (Discord limit)
- Fixed Prisma 7 client import: `_require('../../generated/prisma/client.js')`
- Fixed empty REDIS_PASSWORD causing AUTH hang (`|| undefined`)
- Added unleash-client transitive deps to shared package
- Docker Redis mapped to :6380 (avoids Supabase conflict)
- Updated E2E visual regression snapshots
- Homelab deployment: Dockerfile fixes (prisma generate, Node 22, generated client copy)
- Cloudflare Tunnel service added to docker-compose.yml (opt-in via --profile tunnel)
- Updated .env.example with tunnel setup for nexus.lucassantana.tech

## Deployment Ready
- `docker compose --profile tunnel up -d --build`
- Cloudflare Tunnel to nexus.lucassantana.tech
- User hosting on homelab
