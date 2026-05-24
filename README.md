<p align="center">
  <picture>
    <source srcset="assets/lucky-social-preview.webp" type="image/webp" />
    <img src="assets/lucky-social-preview.png" alt="Lucky — Verified Discord Bot" width="720" />
  </picture>
</p>

<p align="center">
  <b>The Discord music bot that can't be shut down — because you host it.</b><br>
  Self-hosted · Open-source · TypeScript monorepo · ~2500 tests · Zero prod incidents.
</p>

<p align="center">
  <a href="https://lucky.lucassantana.tech/invite?utm_source=github&utm_medium=readme&utm_campaign=readme-badge"><b>→ Invite Lucky</b></a> ·
  <a href="https://lucky.lucassantana.tech"><b>Dashboard</b></a> ·
  <a href="./docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="./CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/LucasSantana-Dev/Lucky/issues">Issues</a>
</p>

<p align="center">
  <a href="https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml"><img src="https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://lucky.lucassantana.tech/invite?utm_source=github&utm_medium=readme&utm_campaign=readme-badge"><img src="https://img.shields.io/badge/Invite-Lucky%20Bot-5865F2?logo=discord&logoColor=white" alt="Invite Lucky" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22.x-green.svg" alt="Node.js" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg" alt="TypeScript" /></a>
  <a href="https://discord.js.org/"><img src="https://img.shields.io/badge/Discord.js-14-purple.svg" alt="Discord.js" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-yellow.svg" alt="License" /></a>
</p>

---

## What is Lucky?

Lucky is a production-grade Discord bot built as a TypeScript monorepo. Music player with autoplay + recommendations, full moderation suite, auto-mod presets, and a React 19 dashboard — all self-hostable via Docker. Ships with /artist and /album commands for Spotify listening stats, session save/restore, a leveling system with XP and role rewards, and Twitch stream notifications.

**Live at** [lucky.lucassantana.tech](https://lucky.lucassantana.tech) · [Invite to your server](https://lucky.lucassantana.tech/invite?utm_source=github&utm_medium=readme&utm_campaign=readme-badge)

---

## Features

| Category | Highlights |
|----------|------------|
| **Music** | YouTube + Spotify + SoundCloud, queue management, autoplay with recommendations, lyrics, session save/restore |
| **Moderation** | Warn / mute / kick / ban, case tracking, scheduled digest reports, auto-mod presets |
| **Dashboard** | Discord OAuth, guild management, RBAC, moderation overview, music controls, feature toggles |
| **Engagement** | Leveling system with XP + role rewards, starboard, Last.fm scrobbling |
| **Integrations** | Twitch stream notifications, Sentry monitoring, Cloudflare Tunnel |

---

## Why Lucky?

Groovy, Rythm, Hydra — the biggest Discord music bots all died. YouTube API enforcement can kill any cloud-only bot overnight. Lucky can't be shut down because you host it.

- **Shutdown-proof** — self-hosted means no third-party service can take your bot away. Your server, your uptime.
- **Full-stack** — bot + React 19 dashboard in one monorepo. Control music, moderation, and settings from a web interface.
- **Production-grade** — ~2500 tests, zero production incidents, Sentry monitoring, and SonarCloud quality gates.
- **Multi-source** — YouTube + Spotify + SoundCloud, not locked to one provider.
- **Smart autoplay** — personalized recommendations from listening history, not just random tracks.
- **No paywall** — every feature included, free forever. No premium tier, no upsells.

### Maintenance model

Lucky is a **solo personal project** — actively developed and deployed to production, but not seeking external contributors. The codebase is open-source so others can learn from it, self-host it, and adapt it. Issues and PRs are welcome but response time is best-effort.

---

## Architecture

```
packages/
  shared/    # Shared types, services, Prisma client
  bot/       # Discord.js 14 bot (slash commands, music, moderation)
  backend/   # Express 5 REST API (auth, guild management)
  frontend/  # React 19 dashboard (Tailwind 4, shadcn/ui)
```

**Stack**: Node.js 22 · TypeScript 5.9 · Discord Player 7 · Prisma 7 · Redis · Docker

---

## Reliability

- **CI** — every PR runs lint + build + ~2500 tests + SonarCloud quality gate: [![CI](https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml/badge.svg)](https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml)
- **Security** — Trivy image scan on every Docker publish; Dependabot with auto-merge for patches, manual triage for majors
- **Monitoring** — Sentry error tracking + custom telemetry on production deployments

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/LucasSantana-Dev/Lucky.git
cd Lucky
cp .env.example .env        # Fill in DISCORD_TOKEN, CLIENT_ID, DATABASE_URL
docker compose up -d        # Starts postgres, redis, bot, backend, frontend, nginx
docker compose logs -f bot  # Verify startup
```

### Local

```bash
npm install
npm run build
npm run db:migrate
npm start
```

**Minimum requirements**: Node.js 22, FFmpeg, PostgreSQL, Redis, Discord Bot Token.

---

## Development

```bash
npm run dev:bot         # Bot with hot reload
npm run dev:backend     # Backend with hot reload
npm run dev:frontend    # Vite dev server

npm run verify          # Full pre-PR gate (lint + build + test)
npm run test:all        # All unit/integration tests (~2500 tests)
npm run test:e2e        # Playwright smoke tests
```

---

## Slash Commands

**Music** — `/play` `/pause` `/resume` `/skip` `/stop` `/queue` `/shuffle` `/repeat` `/lyrics` `/autoplay` `/songinfo` `/history` `/session`

**Moderation** — `/warn` `/mute` `/kick` `/ban` `/cases` `/digest`

**Auto-mod** — `/automod` (word filter, link filter, spam detection, presets)

**Engagement** — `/level` `/starboard` `/lastfm` `/social` (hug · pat · kiss · dance · bonk · wave)

**Twitch** — `/twitch add` `/twitch remove` `/twitch list`

**General** — `/ping` `/help` `/version` `/download`

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [CI/CD Pipeline](docs/CI_CD.md)
- [Testing Strategy](docs/TESTING.md)
- [Docker Setup](docs/DOCKER.md)
- [Release Cadence](docs/RELEASE_CADENCE.md)
- [Cloudflare Tunnel](docs/CLOUDFLARE_TUNNEL_SETUP.md)
- [Twitch Integration](docs/TWITCH_SETUP.md)
- [Last.fm Integration](docs/LASTFM_SETUP.md)
- [Environment Variables](.env.example)
- [AI Agent Contracts](docs/agents/) — behavioral contracts for agent-based workflows (issue tracker, triage labels, domain layout)

### Decision Log

Every non-trivial technical choice is documented as an Architecture Decision Record in [`docs/decisions/`](docs/decisions/). 20+ ADRs covering the music engine, CI/CD pipeline, database strategy, security posture, and more — each with context, alternatives considered, and revisit triggers.

### Admin Panel

The Admin Panel (`/admin`) is gated behind Discord OAuth and requires a developer Discord user ID.

**Setup:**

1. Add your Discord user ID to `.env`:
   ```env
   DEVELOPER_USER_IDS=your_discord_user_id
   ```
   Multiple IDs can be comma-separated: `DEVELOPER_USER_IDS=id1,id2`

2. Apply the database migration (required for writable global toggles):
   ```sh
   npx prisma migrate deploy --config prisma/prisma.config.ts
   ```

3. Restart the backend so it picks up the env var:
   ```sh
   docker compose restart backend
   ```

After setup, sign in via Discord on the `/admin` page and the panel will be accessible.

---

## Contributing

1. Fork → create a `feature/` or `fix/` branch
2. Follow [conventional commits](https://www.conventionalcommits.org/)
3. Run `npm run verify` before opening a PR
4. Keep functions under 50 lines

---

## License

ISC © [LucasSantana-Dev](https://github.com/LucasSantana-Dev)
