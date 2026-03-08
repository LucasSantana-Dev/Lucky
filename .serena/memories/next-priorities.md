# Nexus — Next Priorities

Last updated: 2026-03-07 (Session 13)

## Completed (Sessions 1-13)

1-18. All previous items (see git log)
19. ✅ AutoMod schema alignment (v2.0.0)
20. ✅ Bot startup fixes — import paths, description length, Prisma client path
21. ✅ Redis password fix — empty string AUTH hang
22. ✅ Full test run — 361 backend + 60 frontend + 123 E2E passing
23. ✅ Homelab deployment config — Dockerfiles, Cloudflare Tunnel, .env.example
24. ✅ All services verified running (bot, backend, frontend, postgres, redis)

## Current State
- v2.0.1 on main, 0 open PRs, 0 issues, 0 vulns
- 556 total tests (544 passing, 12 expected E2E failures)
- Deployment ready for homelab (nexus.lucassantana.tech)

## Next Steps
1. **Deploy to homelab** — run docker compose with tunnel on homelab server
2. **Discord OAuth redirect** — add nexus.lucassantana.tech callback URL in Discord Developer Portal
3. **Prisma migration** — `npx prisma migrate deploy` on production DB
4. **Bot rename** — change display name from LukBot to Nexus in Discord Developer Portal
5. **EmbedBuilderService** — missing service referenced in codebase
6. **Prisma type cleanup** — remove `as any` workarounds in services
7. **Additional E2E coverage** — fix 4 auth E2E tests (need backend mock or running server)
8. **CI/CD pipeline** — GitHub Actions for automated build/test/deploy
