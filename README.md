<p align="center">
  <picture>
    <source srcset="assets/lucky-social-preview.webp" type="image/webp" />
    <img src="assets/lucky-social-preview.png" alt="Lucky — Verified Discord Bot" width="720" />
  </picture>
</p>

<p align="center">
  <b>🎵 The Discord music bot that can't be shut down — because you host it.</b><br>
  <strong>Self-hosted · Open-source · TypeScript monorepo · ~6,300 tests · Zero prod incidents</strong>
</p>

<p align="center">
  <a href="https://lucky.lucassantana.tech/invite?utm_source=github&utm_medium=readme&utm_campaign=readme-badge"><strong>→ Invite Lucky to Your Server</strong></a> · 
  <a href="https://lucky.lucassantana.tech"><strong>Dashboard</strong></a> · 
  <a href="./docs/ARCHITECTURE.md"><strong>Architecture</strong></a> · 
  <a href="./CHANGELOG.md"><strong>Changelog</strong></a>
</p>

<p align="center">
  <a href="https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml"><img src="https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="https://lucky.lucassantana.tech/invite?utm_source=github&utm_medium=readme&utm_campaign=readme-badge"><img src="https://img.shields.io/badge/Invite-Lucky%20Bot-5865F2?logo=discord&logoColor=white" alt="Invite Lucky" /></a>
  <a href="https://top.gg/bot/962198089161134131"><img src="https://img.shields.io/badge/top.gg-Lucky-FF3366?logo=topdotgg&logoColor=white" alt="Lucky on top.gg" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-24.x-green.svg" alt="Node.js 24" /></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.9-blue.svg" alt="TypeScript 5.9" /></a>
  <a href="https://discord.js.org/"><img src="https://img.shields.io/badge/Discord.js-14-purple.svg" alt="Discord.js 14" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-ISC-yellow.svg" alt="ISC License" /></a>
</p>

---

## 🎯 What is Lucky?

Lucky is a **production-grade, self-hosted Discord music bot** — built as a TypeScript monorepo with a React 19 dashboard, full moderation suite, and a leveling system. Supports **YouTube, Spotify, and SoundCloud** with smart autoplay powered by listening history recommendations.

Unlike Groovy, Rythm, or Hydra (all shut down by third-party enforcement), Lucky can't be taken offline because **you host it.** Every feature is included — no paywall, no premium tier.

- **Live demo**: [lucky.lucassantana.tech](https://lucky.lucassantana.tech)  
- **Invite to your server**: [Add Lucky now](https://lucky.lucassantana.tech/invite?utm_source=github&utm_medium=readme&utm_campaign=readme-badge)

---

## ✨ Features

<p align="center">
  <a href="https://lucky.lucassantana.tech"><img src="assets/screenshots/landing-features.png" alt="What Lucky does — feature overview" width="820" /></a>
  <br /><sub><i>Everything most servers need, in one bot — <a href="https://lucky.lucassantana.tech">see it live</a>.</i></sub>
</p>

### 🎵 Music Player
- **Multi-source playback**: YouTube, Spotify, SoundCloud
- **Smart autoplay**: Recommendations based on your listening history
- **Queue management**: Shuffle, repeat, clear, skip, pause/resume
- **Session save/restore**: Pick up where you left off
- **Lyrics on-demand**: `/lyrics` for currently playing track
- **Listening stats**: `/artist` and `/album` commands with Spotify integration

### 🛡️ Moderation & Auto-mod
- **Case tracking**: `/warn` `/mute` `/kick` `/ban` with full history
- **Auto-mod presets**: Word filter, link filter, spam detection
- **Scheduled digests**: Automated reports of moderation activity
- **RBAC**: Role-based access control on the dashboard

### 📊 Engagement & Community
- **Leveling system**: XP-based progression with role rewards
- **Starboard**: Community-curated highlight board
- **Last.fm integration**: Scrobble and share your listening activity
- **Social commands**: Hug, pat, kiss, dance, bonk, wave — interactive fun
- **Twitch notifications**: Stream alerts for your favorite streamers

### 🌐 Web Dashboard
- **Discord OAuth login**: Secure, permission-based access
- **Guild management**: Control settings and features per server
- **Music controls**: Queue, playback, and playlist management from the web
- **Moderation overview**: Case history, warnings, and actions
- **Feature toggles**: Enable/disable per-guild

### 📈 Reliability & Monitoring
- **CI/CD**: Every PR runs lint + build + ~6,300 tests + SonarCloud gates
- **Zero incidents**: Battle-tested in production with full test coverage
- **Sentry monitoring**: Real-time error tracking and telemetry
- **Security scanning**: Trivy container scans on every Docker publish
- **Dependency management**: Dependabot with auto-merge for patches

---

## 🚀 Why Self-Host?

**Groovy, Rythm, and Hydra were all killed by YouTube API enforcement.** Cloud-only bots have a single point of failure — if the hosting service shuts down, so does your bot.

Lucky solves this:

| Feature | Lucky | Cloud Bots |
|---------|-------|-----------|
| **Uptime** | Your control | Service-dependent |
| **Feature parity** | Full suite included | Pay-to-unlock model |
| **Data privacy** | On your servers | Third-party storage |
| **Customization** | Modify the source code | Limited options |
| **Shutdown risk** | None | High (enforcement, API changes) |

---

## 📦 Tech Stack

| Layer | Technology |
|-------|------------|
| **Bot** | Discord.js 14, Discord Player 7, TypeScript 5.9 |
| **Backend** | Express 5, REST API, Node.js 24 |
| **Frontend** | React 19, Vite, Tailwind 4, shadcn/ui |
| **Database** | PostgreSQL, Prisma ORM |
| **Cache** | Redis |
| **DevOps** | Docker, Docker Compose, Cloudflare Tunnel |
| **Testing** | ~6,300 unit + integration tests, Playwright e2e |
| **Quality** | SonarCloud, Trivy, Dependabot, ESLint |

---

## 🔧 Quick Start

### Prerequisites

- **Node.js 24+** (or Docker)
- **PostgreSQL** and **Redis**
- **FFmpeg** (for audio processing)
- **Discord Bot Token** ([create one](https://discord.com/developers/applications))
- **Spotify API credentials** (optional, for advanced features)

### Docker (Recommended)

One command gets you running:

```bash
git clone https://github.com/LucasSantana-Dev/Lucky.git
cd Lucky

# Configure environment
cp .env.example .env
# Edit .env to fill in:
#   - DISCORD_TOKEN (from Discord Developer Portal)
#   - CLIENT_ID (your bot's client ID)
#   - DATABASE_URL (postgres://...)
#   - REDIS_URL (redis://...)

# Start everything
docker compose up -d

# Watch the bot come online
docker compose logs -f bot
```

**That's it.** Postgres, Redis, bot, backend, frontend, and Nginx all run together.

### Local Development

```bash
# Install dependencies
npm install

# Set up database
npm run db:migrate

# Start the bot with hot reload
npm run dev:bot

# In another terminal, start the backend
npm run dev:backend

# And the React dashboard (localhost:5173)
npm run dev:frontend
```

### Configuration

See [`.env.example`](.env.example) for all options. Key settings:

```bash
# Discord
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id

# Database
DATABASE_URL=postgres://user:pass@localhost:5432/lucky
REDIS_URL=redis://localhost:6379

# Spotify (optional)
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# Sentry (monitoring, optional)
SENTRY_DSN=...
```

---

## 📖 Commands

### 🎵 Music
| Command | Purpose |
|---------|---------|
| `/play` | Play a song, playlist, or search query |
| `/pause` / `/resume` | Control playback |
| `/skip` | Skip to next track |
| `/stop` | Stop and clear queue |
| `/queue` | View current queue |
| `/shuffle` | Randomize queue order |
| `/repeat` | Toggle repeat modes (off / all / one) |
| `/lyrics` | Show lyrics for current track |
| `/autoplay` | Toggle smart recommendations |
| `/songinfo` | Details on current track |
| `/history` | Your recently played tracks |
| `/session` | Save/load playback sessions |

### 🛡️ Moderation
| Command | Purpose |
|---------|---------|
| `/warn` | Issue a warning with reason |
| `/mute` | Mute a user for specified duration |
| `/kick` | Remove a user from server |
| `/ban` | Ban a user permanently |
| `/cases` | View moderation history |
| `/digest` | Manual moderation report |
| `/automod` | Configure auto-mod rules and presets |

### 🎮 Engagement
| Command | Purpose |
|---------|---------|
| `/level` | Check your level and XP |
| `/starboard` | View community highlights |
| `/lastfm` | Link and view Last.fm stats |
| `/hug` `/pat` `/kiss` `/dance` `/bonk` `/wave` | Social interactions |

### 📡 Integrations
| Command | Purpose |
|---------|---------|
| `/twitch add` | Get stream alerts for a channel |
| `/twitch list` | View your stream subscriptions |

### ⚙️ General
| Command | Purpose |
|---------|---------|
| `/ping` | Check latency |
| `/help` | Command list and syntax |
| `/version` | Current bot version |
| `/download` | Get Lucky for your own server |

---

## 💻 Development

### Local Workflows

```bash
# Run all checks before committing (lint + build + test)
npm run verify

# Run all tests (~6,300 total)
npm run test:all

# Run e2e smoke tests (Playwright)
npm run test:e2e

# Watch mode for active development
npm run dev:bot         # Bot with hot reload
npm run dev:backend     # Backend with hot reload
npm run dev:frontend    # Vite dev server (port 5173)
```

### Code Organization

```
packages/
  shared/    # Shared types, services, Prisma client
  bot/       # Discord.js 14 bot (slash commands, music, moderation)
  backend/   # Express 5 REST API (auth, guild management)
  frontend/  # React 19 dashboard (Tailwind 4, shadcn/ui)
```

### Commit Conventions

Follow [conventional commits](https://www.conventionalcommits.org/):
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code restructuring
- `test:` Test additions/fixes
- `chore:` Tooling, dependencies

### Code Quality Standards

- Keep functions **under 50 lines**
- Write **tests before code** (TDD)
- Run `npm run verify` **before opening a PR**
- Aim for **>80% test coverage** on new logic

---

## 📚 Documentation

### Core Docs
- **[Architecture](docs/ARCHITECTURE.md)** — System design, data flow, API structure
- **[CI/CD Pipeline](docs/CI_CD.md)** — GitHub Actions, testing, deployment
- **[Testing Strategy](docs/TESTING.md)** — Unit, integration, e2e test patterns
- **[Docker Setup](docs/DOCKER.md)** — Containerization, compose configuration

### Deployment & Operations
- **[Cloudflare Tunnel Setup](docs/CLOUDFLARE_TUNNEL_SETUP.md)** — Expose without port forwarding
- **[Release Cadence](docs/RELEASE_CADENCE.md)** — Version strategy and process
- **[Environment Variables](.env.example)** — Full configuration reference

### Integrations
- **[Twitch Integration](docs/TWITCH_SETUP.md)** — Stream notification setup
- **[Last.fm Integration](docs/LASTFM_SETUP.md)** — Scrobbling configuration

### Architecture Decisions
Every non-trivial technical choice is captured as an **Architecture Decision Record** in [`decisions/`](decisions/). 20+ ADRs cover:
- Music engine architecture
- CI/CD pipeline design
- Database strategy
- Security posture
- Caching and performance

Browse decisions to understand tradeoffs and revisit triggers.

### Admin Panel Setup

The `/admin` panel requires Discord OAuth and developer role:

```bash
# 1. Add your Discord user ID to .env
DEVELOPER_USER_IDS=your_discord_user_id

# 2. Apply database migrations
npx prisma migrate deploy

# 3. Restart the backend
docker compose restart backend

# 4. Sign in via Discord at /admin
```

Multiple admin IDs can be comma-separated: `DEVELOPER_USER_IDS=id1,id2,id3`

---

## 🤝 Contributing

Lucky is a **solo personal project** — actively developed and deployed to production, but not seeking external contributors. The codebase is open-source so you can learn from it, self-host it, and adapt it for your needs.

**To contribute:**

1. **Fork** the repository
2. **Create a branch**: `feature/cool-thing` or `fix/bug-name`
3. **Follow conventions**: Conventional commits, <50 line functions, tests first
4. **Run the gate**: `npm run verify` (lint + build + ~6,300 tests)
5. **Open a PR** with a clear description

**Response time** is best-effort due to solo maintenance, but all PRs are reviewed.

---

## 🔒 Security & Maintenance

- **Automated scanning**: Trivy on every Docker build, Dependabot for dependencies
- **Merge strategy**: Auto-merge for patch updates, manual review for major changes
- **Monitoring**: Sentry for error tracking, custom telemetry in production
- **Incident response**: Zero production incidents to date; post-incident reviews are public

---

## 📄 License

ISC © [Lucas Santana](https://github.com/LucasSantana-Dev)

---

## 🙌 Acknowledgments

Inspired by community music bots like Groovy and Rythm. Built on the shoulders of:
- [discord.js](https://discord.js.org/) — Discord API library
- [Discord Player](https://discord-player.js.org/) — Music playback framework
- [Prisma](https://www.prisma.io/) — Type-safe ORM
- [React](https://react.dev/) — Frontend framework
- And 200+ open-source dependencies 💙
