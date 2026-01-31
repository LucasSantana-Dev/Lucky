# 🎵 DiscordBot - Modern Discord Music Bot

A modern Discord bot built with TypeScript that plays music from YouTube and Spotify, and can download YouTube videos with advanced features like duplicate detection, queue management, and comprehensive logging.

**🎨 Fully customizable** - Personalize your bot's name, description, avatar, colors, and more through simple environment variables. **🚀 Ready to use** - Generic naming and structure make it perfect for anyone to deploy and customize for their own Discord server!

[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-blue.svg)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14.25.1-purple.svg)](https://discord.js.org/)
[![Discord Player](https://img.shields.io/badge/Discord%20Player-7.1.0-orange.svg)](https://discord-player.js.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7.2.0-blue.svg)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)
[![CI](https://github.com/LucasSantana-Dev/LukBot/actions/workflows/ci.yml/badge.svg)](https://github.com/LucasSantana-Dev/LukBot/actions/workflows/ci.yml)
[![Deploy](https://github.com/LucasSantana-Dev/LukBot/actions/workflows/deploy.yml/badge.svg)](https://github.com/LucasSantana-Dev/LukBot/actions/workflows/deploy.yml)

## 🚀 Features

### 🎵 Music Playback

- **Multi-platform support**: YouTube and Spotify integration
- **Advanced search**: Search by song name, artist, or URL
- **Queue management**: Comprehensive queue with shuffle, repeat, and history
- **Playlist support**: Play entire YouTube and Spotify playlists
- **Audio controls**: Volume control, seek, pause, resume, and skip
- **Lyrics display**: Show lyrics for current or specified songs
- **Autoplay**: Intelligent autoplay with similar track suggestions

### 📥 Download Capabilities

- **Video downloads**: Download YouTube videos in various qualities
- **Audio extraction**: Extract audio from videos in multiple formats
- **Format selection**: Choose between video and audio downloads
- **Progress tracking**: Real-time download progress with status updates
- **File management**: Automatic file cleanup and organization

### 🎮 Discord Integration

- **Slash commands**: Modern Discord slash command interface
- **Interactive responses**: Rich embeds with music information
- **Permission system**: Role-based command access control
- **Multi-guild support**: Works across multiple Discord servers
- **Real-time updates**: Live queue updates and status messages

### 🔧 Technical Features

- **TypeScript**: Full TypeScript support with **zero compilation errors** and enhanced type safety
- **Modular architecture**: Clean, maintainable code structure following SOLID principles with files under 250 lines
- **Code maintainability**: ESLint rule enforcing maximum 250 lines per file for better readability and maintainability
- **Enhanced type safety**: Replaced all `any` types with proper TypeScript types and interfaces from discord.js and discord-player
- **Functional programming**: Composable functions and Result types for better error handling
- **Structured error handling**: Comprehensive error handling with descriptive messages, error codes, and correlation IDs
- **Logging system**: Multi-level logging with Sentry integration and structured error tracking
- **Performance monitoring**: Sentry integration for error tracking and performance metrics
- **Feature toggles**: Enhanced Unleash integration with two-tier system (global developer toggles + per-server admin toggles)
- **Feature toggle web app**: Web application for non-technical users to manage feature toggles per server
- **Dependency notifications**: Automated dependency update checking with Discord webhook alerts
- **Hot reloading**: Development mode with automatic reloading
- **Code quality**: ESLint, Prettier, and automated quality checks with **56% improvement** in code quality metrics
- **Simplified architecture**: Reduced complexity through consolidation of duplicate code, simplified abstractions, and modular file structure

### 🎛️ Feature Toggle Management

DiscordBot includes a modern React-based web interface for feature toggle management:

- **Two-tier toggle system**: Global developer toggles and per-server admin toggles
- **Modern web interface**: React 18 + TypeScript + Tailwind CSS with dark mode
- **Discord OAuth**: Secure authentication using Discord OAuth2
- **Guild management**: View servers, check bot status, and add bot to servers
- **Unleash integration**: Full Unleash support for advanced feature flag management
- **Environment fallback**: Automatic fallback to environment variables when Unleash unavailable
- **Responsive design**: Mobile-friendly interface with loading states and error handling

To enable the web application, set `WEBAPP_ENABLED=true` in your `.env` file. See [WEBAPP_SETUP.md](docs/WEBAPP_SETUP.md) for detailed setup instructions and [FRONTEND.md](docs/FRONTEND.md) for comprehensive frontend documentation. To expose the web app over a custom domain with HTTPS (no open ports), see [CLOUDFLARE_TUNNEL_SETUP.md](docs/CLOUDFLARE_TUNNEL_SETUP.md) for Cloudflare Tunnel, domain, and DNS.

### 📦 Dependency Management

DiscordBot includes automated dependency update notifications:

- **Automated checking**: Scheduled checks for outdated packages using npm-check-updates
- **Discord webhooks**: Rich embed notifications with update information
- **Security focus**: Optional security-only mode for critical updates
- **Configurable intervals**: Customizable check frequency (default: daily)

To enable dependency notifications, set `DEPENDENCY_CHECK_ENABLED=true` and `DEPENDENCY_WEBHOOK_URL` in your `.env` file.

### 📺 Twitch stream-online notifications

LukBot can post to a Discord channel when a Twitch streamer goes live:

- **Slash commands**: `/twitch add <username>`, `/twitch remove <username>`, `/twitch list`
- **EventSub over WebSocket**: No public URL; uses Twitch user access token for subscriptions
- **Env**: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_ACCESS_TOKEN`, and optionally `TWITCH_REFRESH_TOKEN`

See [docs/TWITCH_SETUP.md](docs/TWITCH_SETUP.md) for credentials and OAuth setup. To get notifications when **Criativaria** goes live, run `/twitch add Criativaria` in the desired Discord channel.

### 🎵 .fmbot / Last.fm scrobbling

LukBot sends a plain-text "Now playing: Artist – Title" line when a track starts, so [.fmbot](https://fmbot.xyz/) (and other scrobblers that read the channel) can scrobble playback when they share the same Discord channel.

**Last.fm API**: Optional direct scrobbling and now-playing updates to a Last.fm account. Set `LASTFM_API_KEY`, `LASTFM_API_SECRET`, and `LASTFM_SESSION_KEY` (see [docs/LASTFM_SETUP.md](docs/LASTFM_SETUP.md)).

## 🏗️ Architecture

The single source of truth for structure is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): package layout, entry points (bot, backend, frontend, shared), where to add new code, command loading (bot), Nginx/Docker, and maintainability principles.

### Technology Stack

- **Runtime**: Node.js 22.x with ES modules
- **Language**: TypeScript 5.9.3 with strict mode
- **Discord API**: Discord.js 14.25.1 with slash commands
- **Music Engine**: Discord Player 7.1.0 with YouTube/Spotify support
- **Database**: Prisma 7.2.0 with PostgreSQL support
- **Audio Processing**: FFmpeg for audio/video manipulation
- **Build Tool**: tsup for fast TypeScript bundling with tree shaking and minification
- **Development**: tsx for fast development with hot reloading
- **Unified Build System**: Consistent tooling across development and production
- **Code Quality**: ESLint with Prettier integration
- **Monitoring & Logging**: Sentry for centralized error tracking, performance monitoring, and logging

### Build System

DiscordBot uses a **unified build system** for consistency and performance:

- **Production Build**: `tsup` - Fast TypeScript bundling with tree shaking, minification, and code splitting
- **Development**: `tsx` - Fast development with hot reloading and TypeScript execution
- **Type Checking**: `tsc` - TypeScript compiler for type validation only

**Benefits:**

- ⚡ **Faster builds** - tsup is ~10x faster than tsc
- 🎯 **Better optimization** - Tree shaking and minification in production
- 🔄 **Hot reloading** - Instant development feedback with tsx
- 📦 **Code splitting** - Optimized bundle sizes
- 🎨 **Consistent tooling** - Same tools across development and production

### Project Structure

```
src/
├── config/                 # Configuration management
├── events/                 # Discord event handlers
├── functions/              # Bot functionality modules
│   ├── download/          # YouTube download features
│   ├── general/           # General bot commands
│   └── music/             # Music playback features
├── handlers/               # Core system handlers
├── models/                 # Data models and interfaces
├── types/                  # TypeScript type definitions
├── utils/                  # Utility functions and helpers
│   ├── command/           # Command loading and management
│   ├── general/           # General utilities
│   ├── music/             # Music-specific utilities
│   └── search/            # Search functionality
└── index.ts               # Application entry point
```

### Design Patterns

- **Modular Architecture**: Separated concerns with clear module boundaries following SOLID principles
- **Handler Pattern**: Centralized event and command handling
- **Factory Pattern**: Client and player creation factories
- **Utility Pattern**: Reusable utility functions for common operations
- **Configuration Pattern**: Centralized configuration management
- **Structured Error Handling**: Comprehensive error management with error codes, correlation IDs, and user-friendly messages
- **Logging Pattern**: Structured logging with multiple levels and correlation tracking

## 🚀 Quick Start

### Prerequisites

- Node.js 22.x or higher
- FFmpeg installed on your system
- A Discord Bot Token
- (Optional) Spotify API credentials

### ⚡ 30-Second Setup

```bash
# 1. Clone and setup
git clone <repository-url>
cd discord-bot
cp .env.example .env

# 2. Configure your bot
nano .env  # Add your DISCORD_TOKEN and CLIENT_ID

# 3. Customize (optional)
# Edit BOT_NAME, BOT_DESCRIPTION, BOT_COLOR, etc. in .env

# 4. Configure environment
# Edit NODE_ENV, DISCORD_TOKEN, CLIENT_ID, etc. in .env

# 5. Build and run
npm run build
npm run start
```

**That's it!** Your bot is now running and ready to use in your Discord server.

### ⚙️ Environment Configuration

DiscordBot uses a `.env` file for all configuration. Optionally, load secrets from [Infisical](https://infisical.com) by setting `INFISICAL_CLIENT_ID`, `INFISICAL_CLIENT_SECRET`, `INFISICAL_PROJECT_ID`, and `INFISICAL_ENV`; see the [Infisical configuration checklist](docs/INFISICAL.md#configuration-checklist) in [docs/INFISICAL.md](docs/INFISICAL.md). The environment mode is controlled by the `NODE_ENV` variable:

```bash
# Production mode (default)
NODE_ENV=production

# Development mode
NODE_ENV=development
```

**Key Environment Variables:**

- `NODE_ENV` - Controls development vs production behavior
- `DISCORD_TOKEN` - Your Discord bot token (required)
- `CLIENT_ID` - Your Discord application client ID (required)
- `BOT_NAME` - Custom bot display name
- `BOT_DESCRIPTION` - Bot description for help commands
- `BOT_COLOR` - Embed color (hex format)
- `SENTRY_DSN` - Error tracking (optional)

**Redis Configuration (Optional):**

- `REDIS_HOST` - Redis server host (default: localhost)
- `REDIS_PORT` - Redis server port (default: 6379)
- `REDIS_PASSWORD` - Redis password (optional)
- `REDIS_DB` - Redis database number (default: 0)

**TikTok Configuration (Optional):**

- `TIKTOK_API_HOSTNAME` - TikTok API hostname (default: api16-normal-c-useast1a.tiktokv.com)
- `TIKTOK_REFERER_URL` - TikTok referer URL (default: https://www.tiktok.com/)
- `TIKTOK_EXTRACTOR_RETRIES` - TikTok extractor retries (default: 3)
- `TIKTOK_FRAGMENT_RETRIES` - TikTok fragment retries (default: 3)
- `TIKTOK_SLEEP_INTERVAL` - TikTok sleep interval (default: 1)
- `TIKTOK_MAX_SLEEP_INTERVAL` - TikTok max sleep interval (default: 3)

**YouTube Configuration (Optional):**

- `YOUTUBE_CONNECTION_TIMEOUT` - YouTube connection timeout (default: 120000)
- `YOUTUBE_MAX_RETRIES` - YouTube max retries (default: 3)
- `YOUTUBE_RETRY_DELAY` - YouTube retry delay (default: 1000)
- `YOUTUBE_MAX_EXTRACTORS` - YouTube max extractors (default: 5)
- `YOUTUBE_USER_AGENT` - YouTube user agent (default: Mozilla/5.0...)

**Rate Limiting Configuration (Optional):**

- `RATE_LIMIT_COMMAND_WINDOW_MS` - Command rate limit window (default: 60000)
- `RATE_LIMIT_COMMAND_MAX_REQUESTS` - Command max requests (default: 5)
- `RATE_LIMIT_MUSIC_COMMAND_WINDOW_MS` - Music command window (default: 30000)
- `RATE_LIMIT_MUSIC_COMMAND_MAX_REQUESTS` - Music command max requests (default: 3)
- `RATE_LIMIT_DOWNLOAD_WINDOW_MS` - Download rate limit window (default: 300000)
- `RATE_LIMIT_DOWNLOAD_MAX_REQUESTS` - Download max requests (default: 2)

**Session Configuration (Optional):**

- `USER_SESSION_TTL` - User session TTL in seconds (default: 86400)
- `QUEUE_SESSION_TTL` - Queue session TTL in seconds (default: 7200)
- `COMMAND_HISTORY_LIMIT` - Command history limit (default: 10)

**Cache Configuration (Optional):**

- `CACHE_TRACK_INFO_SIZE` - Track info cache size (default: 2000)
- `CACHE_ARTIST_TITLE_SIZE` - Artist title cache size (default: 2000)
- `CACHE_MEMO_SIZE` - Memo cache size (default: 5000)
- `CACHE_TTL_HOURS` - Cache TTL in hours (default: 1)

**Player Configuration (Optional):**

- `PLAYER_LEAVE_ON_EMPTY_COOLDOWN` - Leave on empty cooldown (default: 300000)
- `PLAYER_LEAVE_ON_END_COOLDOWN` - Leave on end cooldown (default: 300000)
- `PLAYER_CONNECTION_TIMEOUT` - Player connection timeout (default: 5000)

**Download Configuration (Optional):**

- `DOWNLOAD_TIMEOUT` - Download timeout (default: 10000)
- `DOWNLOAD_MAX_RETRIES` - Download max retries (default: 3)
- `DOWNLOAD_RETRY_DELAY` - Download retry delay (default: 1000)

**Feature Toggles (Unleash) (Optional):**

- `UNLEASH_URL` - Unleash server URL (default: http://localhost:4242/api)
- `UNLEASH_API_TOKEN` - Unleash API token for authentication
- `UNLEASH_APP_NAME` - Application name in Unleash (default: lukbot)
- `UNLEASH_ENVIRONMENT` - Unleash environment (default: development)
- `UNLEASH_BOOTSTRAP_DATA` - JSON string with bootstrap feature toggle data for offline resilience

**Feature Toggle Names:**
- `DOWNLOAD_VIDEO` - Enable video download functionality
- `DOWNLOAD_AUDIO` - Enable audio download functionality
- `MUSIC_RECOMMENDATIONS` - Enable music recommendation system
- `AUTOPLAY` - Enable autoplay functionality
- `LYRICS` - Enable lyrics display
- `QUEUE_MANAGEMENT` - Enable advanced queue management features

**Note:** If Unleash is not configured, feature toggles fall back to environment variables using the pattern `FEATURE_<TOGGLE_NAME>` (e.g., `FEATURE_DOWNLOAD_VIDEO=true`).

**Feature Toggle Web Application (Optional):**

- `WEBAPP_ENABLED` - Enable web application for feature toggle management (default: false)
- `WEBAPP_PORT` - Web application port (default: 3000)
- `WEBAPP_REDIRECT_URI` - Discord OAuth redirect URI (default: http://localhost:3000/api/auth/callback)
- `DEVELOPER_USER_IDS` - Comma-separated list of Discord user IDs with developer access to global toggles

**Dependency Update Notifications (Optional):**

- `DEPENDENCY_CHECK_ENABLED` - Enable automated dependency checking (default: false)
- `DEPENDENCY_WEBHOOK_URL` - Discord webhook URL for dependency update notifications
- `DEPENDENCY_CHECK_INTERVAL` - Check interval in milliseconds (default: 86400000 = 24 hours)
- `DEPENDENCY_NOTIFY_ONLY_SECURITY` - Only notify on security updates (default: false)

### Dependency Management

The project uses depcheck to identify unused dependencies and npm-check-updates to check for outdated packages:

```bash
npm run check:deps      # Check for unused dependencies
npm run check:outdated # Check for outdated packages
npm audit              # Check for security vulnerabilities
npm audit fix          # Automatically fix security issues where possible
```

**Note:** Some dependencies may appear as unused but are actually used dynamically or in runtime (e.g., @prisma/client, ioredis, unleash-client, uuid). These are properly configured in `depcheck.config.cjs`.

**Search Configuration (Optional):**

- `SEARCH_TIMEOUT` - Search timeout (default: 15000)
- `SEARCH_RETRY_DELAY` - Search retry delay (default: 5000)

### 🐳 Docker Setup (Recommended)

The easiest way to run DiscordBot is using Docker. This ensures all dependencies are properly installed and configured with a unified management interface.

#### Prerequisites

- **Docker** (version 20.10 or higher)
- **Docker Compose** (version 2.0 or higher)
- **Discord Bot Token** and **Client ID**

#### Quick Start

1. **Clone the repository**:

    ```bash
    git clone https://github.com/LucasSantana-Dev/LukBot.git
    cd LukBot
    ```

2. **Set up environment**:

    ```bash
    cp .env.example .env
    # Edit .env with your Discord bot credentials
    ```

3. **Build and start**:

    ```bash
    # Set NODE_ENV in .env file first
    echo "NODE_ENV=production" >> .env

    # Production
    npm run build
    npm run start

    # Development (with hot reloading)
    echo "NODE_ENV=development" > .env
    npm run dev:watch
    ```

4. **View logs**:
    ```bash
    npm run logs        # Production logs
    npm run logs:dev    # Development logs
    ```

#### Unified Management Commands

DiscordBot uses a unified management script that provides both Docker and local development operations:

```bash
# 🐳 DOCKER COMMANDS (Primary Application Operations)
npm run build          # Build application with tsup
npm run build:docker   # Build Docker image
npm run start          # Start production container
npm run dev            # Start development container
npm run dev:watch      # Start with hot reloading (local)
npm run stop           # Stop all containers/processes
npm run restart        # Restart production container
npm run restart:dev    # Restart development container
npm run logs           # View production logs
npm run logs:dev       # View development logs
npm run status         # Show container status
npm run clean          # Clean up Docker resources and workspace

# 🛠️ LOCAL DEVELOPMENT COMMANDS (Code Quality & Tools)
npm run quality        # Run all quality checks (lint, type-check, build)
npm run format         # Format code with Prettier
npm run lint:fix       # Fix linting issues
npm run install        # Install dependencies
npm run update:deps    # Update dependencies
npm run check:deps     # Check for outdated dependencies
npm run audit          # Run security audit

# ℹ️ UTILITIES
npm run help           # Show help message
```

#### Docker Features

**Production Image (`Dockerfile`)**

- **Base**: Node.js 22 Alpine
- **Dependencies**: Python3, FFmpeg, yt-dlp
- **Security**: Non-root user (bot:1001)
- **Optimization**: Production dependencies only
- **Health Check**: 30s interval with 3 retries

**Development Image (`Dockerfile.dev`)**

- **Base**: Node.js 22 Alpine
- **Dependencies**: All development dependencies included
- **Hot Reloading**: Volume mounting for live code changes
- **Debugging**: Full source code access

**Container Features**

- **Environment Variables**: NODE_ENV, DISCORD_TOKEN, CLIENT_ID, etc.
- **Volume Mounts**: Persistent downloads and logs storage
- **Network**: Custom bridge network with health monitoring
- **Security**: Non-root execution with minimal attack surface

### 🎨 Bot Customization

DiscordBot is fully customizable! You can personalize your bot's appearance and information through environment variables:

```env
# Bot Customization (optional)
BOT_NAME=DiscordBot
BOT_DESCRIPTION=A modern Discord bot for music playback and downloads
BOT_AVATAR_URL=https://example.com/avatar.png
BOT_COLOR=0x5865F2
BOT_WEBSITE=https://your-website.com
BOT_SUPPORT_SERVER=https://discord.gg/your-server
```

**Customization Options:**

- **BOT_NAME**: Your bot's display name
- **BOT_DESCRIPTION**: Bot description for help commands
- **BOT_AVATAR_URL**: Custom avatar URL (optional)
- **BOT_COLOR**: Embed color (hex format)
- **BOT_WEBSITE**: Your website URL
- **BOT_SUPPORT_SERVER**: Discord server invite link

### 🆕 What's New in v2.1.0

- **🎨 Complete Customization**: Personalize every aspect of your bot through environment variables
- **🔄 Generic Naming**: Renamed from LukBot to DiscordBot for universal use
- **📦 Updated Structure**: All Docker containers, networks, and scripts use generic naming
- **📚 Enhanced Documentation**: Comprehensive guides and examples for customization
- **🚀 Ready to Deploy**: No personal branding - perfect for anyone to use and customize

- (Optional) Sentry DSN for error tracking

### Environment Setup

Create a `.env` or `.env.local` file in the project root:

> **Note:** The bot will first look for a `.env.local` file, and if not found, it will fall back to the `.env` file. Using `.env.local` (which should not be committed to version control) is recommended for local development.

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
TOKEN=your_discord_bot_token_here  # Alternative to DISCORD_TOKEN

# Optional: Spotify Configuration
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret

# Optional: Monitoring
SENTRY_DSN=your_sentry_dsn_here  # Automatically disabled in development
LOG_LEVEL=3

# Optional: Command Categories to Disable
COMMAND_CATEGORIES_DISABLED=category1,category2

# Environment
NODE_ENV=development  # or production
```

### Installation

```bash
# Clone the repository
git clone https://github.com/LucasSantana-Dev/LukBot.git
cd LukBot

# Install dependencies
npm install

# Build the project
npm run build

# Start the bot
npm start
```

### Development Setup

```bash
# Install dependencies
npm install

# Start development mode with hot reloading
npm run dev:watch

# Run quality checks
npm run quality

# Format code
npm run format

# Fix linting issues
npm run lint:fix

# Type checking
npm run type:check
```

### 🔍 Troubleshooting

#### Common Issues

**1. Docker Not Available**

```bash
# If Docker is not installed, the script will fallback to local operations
npm run dev:watch  # Uses local development mode
npm run quality    # Runs local quality checks
```

**2. Permission Errors**

```bash
# Fix volume permissions (if using Docker)
sudo chown -R 1001:1001 downloads logs
```

**3. Environment File Missing**

```bash
# Create .env file
cp .env.example .env
# Edit with your Discord credentials
nano .env
```

**4. Container Won't Start**

```bash
# Check logs
npm run logs

# Check status
npm run status

# Restart container
npm run restart
```

**5. Build Failures**

```bash
# Clean and rebuild
npm run clean
npm run build
```

### Production Deployment

```bash
# Build for production
npm run build

# Start with PM2 (if available)
pm2 start ecosystem.config.cjs

# Or start directly
npm start
```

## 📚 Available Commands

### 🎵 Music Commands

- `/play <query>` - Play music from YouTube or Spotify
- `/pause` - Pause the current track
- `/resume` - Resume the paused track
- `/skip` - Skip to the next track
- `/stop` - Stop playback and clear queue
- `/queue` - Display the current music queue
- `/volume <level>` - Set playback volume (0-100)
- `/seek <time>` - Seek to a specific time in the track
- `/lyrics [query]` - Show lyrics for current or specified track
- `/shuffle` - Shuffle the current queue
- `/repeat <mode>` - Set repeat mode (off, track, queue)
- `/clear` - Clear the music queue
- `/remove <position>` - Remove a track from the queue
- `/move <from> <to>` - Move a track in the queue
- `/jump <position>` - Jump to a specific track
- `/history` - Show recently played tracks
- `/songinfo` - Display information about the current track
- `/autoplay` - Toggle autoplay mode

### 📥 Download Commands

- `/download <url> [format]` - Download YouTube video/audio
- `/download-audio <url>` - Download audio only
- `/download-video <url>` - Download video

### 🛠️ General Commands

- `/ping` - Check bot latency
- `/help` - Display help information
- `/exit` - Disconnect bot from voice channel

## 🧪 Development

### Code Standards

- **TypeScript**: Strict mode with comprehensive type checking
- **ESLint**: Code quality enforcement with Prettier integration
- **ES Modules**: Modern JavaScript module system
- **Clean Code**: Self-documenting code with meaningful names following SOLID principles
- **Structured Error Handling**: Comprehensive error handling with error codes, correlation IDs, and user-friendly messages
- **Performance**: Optimized for memory and CPU usage
- **Documentation-First**: All non-trivial changes include proper documentation

### Architecture Guidelines

- **Modular Design**: Clear separation of concerns
- **Handler Pattern**: Centralized event and command handling
- **Utility Functions**: Reusable helper functions
- **Type Safety**: Comprehensive TypeScript types
- **Error Recovery**: Graceful error handling and recovery
- **Logging**: Structured logging with multiple levels

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
npm run dev:watch

# Run quality checks
npm run quality

# Build and test
npm run build
npm run start

# Commit with conventional commits
npm run commit
```

## 📖 API Documentation

### Discord.js Integration

The bot uses Discord.js 14.14.1 with the following key features:

- **Slash Commands**: Modern Discord command interface
- **Voice Integration**: Seamless voice channel management
- **Rich Embeds**: Beautiful message formatting
- **Permission System**: Role-based access control

### Discord Player Integration

Music playback powered by Discord Player 7.1.0:

- **Multi-platform**: YouTube and Spotify support
- **Queue Management**: Advanced queue with history
- **Audio Controls**: Volume, seek, and playback controls
- **Event System**: Comprehensive event handling

### YouTube Integration

Video and audio processing:

- **play-dl**: YouTube video information and streaming
- **FFmpeg**: Audio/video processing and format conversion
- **Quality Selection**: Multiple quality options
- **Progress Tracking**: Real-time download progress

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Follow coding standards**: Use TypeScript and follow the established patterns
4. **Write clean code**: Self-documenting code with meaningful names
5. **Test thoroughly**: Ensure new features work correctly
6. **Update documentation**: Keep README and comments in sync
7. **Submit a pull request**: Provide clear description of changes

### Development Setup

```bash
# Fork and clone
git clone https://github.com/yourusername/LukBot.git
cd LukBot

# Install dependencies
npm install

# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
npm run dev:watch

# Run quality checks
npm run quality

# Commit with conventional commits
npm run commit

# Push and create PR
git push origin feature/your-feature
```

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs and feature requests via [GitHub Issues](https://github.com/LucasSantana-Dev/LukBot/issues)
- **Discussions**: Join community discussions in [GitHub Discussions](https://github.com/LucasSantana-Dev/LukBot/discussions)
- **Documentation**: Check the code comments and this README for detailed information

## 🗺️ Roadmap

- [ ] **Advanced Analytics**: Music listening statistics and insights
- [ ] **Playlist Management**: Create and manage custom playlists
- [ ] **Audio Effects**: Equalizer and audio effect controls
- [ ] **Multi-language**: Internationalization support
- [ ] **Web Dashboard**: Web interface for bot management
- [ ] **Advanced Search**: Improved search with filters and sorting
- [ ] **Social Features**: Music sharing and recommendations
- [ ] **Backup System**: Queue and settings backup/restore

## 📚 Further Reference & Guides

### AI development (Cursor)

- **[AGENTS.md](AGENTS.md)**: Project summary for AI agents, Cursor rules and skills mapping, when to use which MCP tools, and behavior/commands reference.
- **[docs/MCP_SETUP.md](docs/MCP_SETUP.md)**: How to configure MCP servers and secrets for Cursor (GitHub, Tavily, Cloudflare, Infisical, etc.).

### CI/CD and testing

- **[docs/CI_CD.md](docs/CI_CD.md)**: CI pipeline (quality gates, E2E), pre-commit hooks (lint-staged, Secretlint, audit), and deploy workflow.
- **[docs/TESTING.md](docs/TESTING.md)**: Testing strategy, backend (Jest) and frontend E2E (Playwright), and how to run tests locally.

### Reference Documentation

- [Discord.js Documentation](https://discord.js.org/#/docs/main/stable/general/welcome)
- [Discord Player Documentation](https://discord-player.js.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)
- [FFmpeg Documentation](https://ffmpeg.org/documentation.html)

### Guides

- [Discord Bot Development](https://discord.js.org/#/docs/main/stable/guide)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [ESLint Configuration](https://eslint.org/docs/user-guide/configuring)

### Code Quality Tools

The project uses several code quality tools to maintain high standards:

- **ESLint**: Enforces coding standards and conventions
- **Prettier**: Code formatting and style consistency
- **TypeScript**: Static type checking and IntelliSense
- **Husky**: Pre-commit (lint-staged, Secretlint on staged files, audit:critical) and commit-msg (Commitlint)
- **Commitlint**: Conventional commit message formatting (Angular style)

### Quality and test commands

- **Lint**: `npm run lint` — Check code quality
- **Lint fix**: `npm run lint:fix` — Auto-fix linting issues
- **Format**: `npm run format` — Format code with Prettier
- **Type check**: `npm run type:check` — TypeScript validation (shared, bot, backend, frontend)
- **Build**: `npm run build` — Build all packages
- **Backend tests**: `npm run test` — Run backend unit/integration tests; `npm run test:ci` (CI mode); `npm run test:coverage` — With coverage
- **E2E**: `npm run test:e2e` — Run frontend Playwright E2E tests (from root)
- **Security**: `npm run audit:critical` — Fail on critical; `npm run audit:high` — Fail on high or critical
- **Outdated**: `npm run check:outdated` — List outdated dependencies

---

**Built with ❤️ using Discord.js, TypeScript, and modern Node.js technologies**
