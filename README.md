# 🎵 DiscordBot - Modern Discord Music Bot

A modern Discord bot built with TypeScript that plays music from YouTube and Spotify, and can download YouTube videos with advanced features like duplicate detection, queue management, and comprehensive logging.

**🎨 Fully customizable** - Personalize your bot's name, description, avatar, colors, and more through simple environment variables. **🚀 Ready to use** - Generic naming and structure make it perfect for anyone to deploy and customize for their own Discord server!

[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-blue.svg)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14.14.1-purple.svg)](https://discord.js.org/)
[![Discord Player](https://img.shields.io/badge/Discord%20Player-7.1.0-orange.svg)](https://discord-player.js.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)
[![CI/CD Pipeline](https://github.com/LukSantana/LukBot/actions/workflows/deploy.yml/badge.svg)](https://github.com/LukSantana/LukBot/actions/workflows/deploy.yml)

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

- **TypeScript**: Full TypeScript support with strict type checking
- **Modular architecture**: Clean, maintainable code structure
- **Error handling**: Comprehensive error handling and recovery
- **Logging system**: Multi-level logging with Sentry integration
- **Performance monitoring**: Sentry integration for error tracking
- **Hot reloading**: Development mode with automatic reloading

## 🏗️ Architecture

### Technology Stack

- **Runtime**: Node.js 22.x with ES modules
- **Language**: TypeScript 5.3.3 with strict mode
- **Discord API**: Discord.js 14.14.1 with slash commands
- **Music Engine**: Discord Player 7.1.0 with YouTube/Spotify support
- **Audio Processing**: FFmpeg for audio/video manipulation
- **Build Tool**: tsup for fast TypeScript bundling
- **Development**: tsx for fast development with hot reloading
- **Code Quality**: ESLint with Prettier integration
- **Monitoring & Logging**: Sentry for centralized error tracking, performance monitoring, and logging

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

- **Modular Architecture**: Separated concerns with clear module boundaries
- **Handler Pattern**: Centralized event and command handling
- **Factory Pattern**: Client and player creation factories
- **Utility Pattern**: Reusable utility functions for common operations
- **Configuration Pattern**: Centralized configuration management
- **Logging Pattern**: Structured logging with multiple levels

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
cp env.example .env

# 2. Configure your bot
nano .env  # Add your DISCORD_TOKEN and CLIENT_ID

# 3. Customize (optional)
# Edit BOT_NAME, BOT_DESCRIPTION, BOT_COLOR, etc. in .env

# 4. Build and run
npm run build
npm run start
```

**That's it!** Your bot is now running and ready to use in your Discord server.

### 🐳 Docker Setup (Recommended)

The easiest way to run DiscordBot is using Docker. This ensures all dependencies are properly installed and configured with a unified management interface.

#### Prerequisites

- **Docker** (version 20.10 or higher)
- **Docker Compose** (version 2.0 or higher)
- **Discord Bot Token** and **Client ID**

#### Quick Start

1. **Clone the repository**:

    ```bash
    git clone https://github.com/LukSantana/LukBot.git
    cd LukBot
    ```

2. **Set up environment**:

    ```bash
    cp env.example .env
    # Edit .env with your Discord bot credentials
    ```

3. **Build and start**:

    ```bash
    # Production
    npm run build
    npm run start

    # Development (with hot reloading)
    npm run build:dev
    npm run dev
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
npm run build          # Build production Docker image
npm run build:dev      # Build development Docker image
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
git clone https://github.com/LukSantana/LukBot.git
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
cp env.example .env
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
- **Clean Code**: Self-documenting code with meaningful names
- **Error Handling**: Comprehensive error handling and logging
- **Performance**: Optimized for memory and CPU usage

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

- **Issues**: Report bugs and feature requests via [GitHub Issues](https://github.com/LukSantana/LukBot/issues)
- **Discussions**: Join community discussions in [GitHub Discussions](https://github.com/LukSantana/LukBot/discussions)
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
- **Husky**: Git hooks for pre-commit checks
- **Commitizen**: Conventional commit message formatting

### Quality Reports

Quality checks are available through the unified management system:

- **Quality Suite**: `npm run quality` - Run all quality checks (lint, type-check, build)
- **Linting**: `npm run lint` - Check code quality
- **Lint Fix**: `npm run lint:fix` - Auto-fix linting issues
- **Format**: `npm run format` - Format code with Prettier
- **Type Check**: `npm run type:check` - TypeScript validation
- **Dependency Check**: `npm run check:deps` - Check for unused dependencies
- **Update Dependencies**: `npm run check:outdated` - Check for outdated packages
- **Security Audit**: `npm run audit` - Run security audit

---

**Built with ❤️ using Discord.js, TypeScript, and modern Node.js technologies**
