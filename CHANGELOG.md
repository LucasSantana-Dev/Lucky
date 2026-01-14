# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added - Web Application

- **Complete Discord OAuth Implementation**
  - DiscordOAuthService for token exchange and user/guild fetching
  - SessionService with Redis-based session management
  - Express session middleware with secure cookie configuration
  - Authentication middleware with requireAuth and optionalAuth
  - Complete OAuth flow: login, callback, logout, status checking

- **Discord API Integration**
  - GuildService for fetching user guilds and checking bot membership
  - Bot invite URL generation
  - Guild status checking (bot added/not added)
  - Admin permission filtering

- **React Frontend Application**
  - Vite + React 18 + TypeScript setup
  - Tailwind CSS with custom dark mode palette (#c33d41 primary, #151516 background)
  - Zustand stores for state management (auth, guild, feature)
  - Axios API client with error interceptors
  - React Router for navigation
  - TypeScript type definitions

- **UI Components**
  - Layout components: Sidebar, Header, ServerSelector
  - Dashboard: ServerGrid, ServerCard, AddBotButton
  - Feature Management: GlobalTogglesSection, ServerTogglesSection, FeatureCard
  - UI primitives: Button, Card, Skeleton, Toast, ErrorBoundary

- **Feature Toggle Management**
  - Global developer toggles (system-wide, developer-only)
  - Per-server/guild toggles (server-specific, admin-managed)
  - Clear visual separation between toggle types
  - Permission-based access control

- **Styling & Polish**
  - Responsive design with mobile-first approach
  - Loading states with skeleton components
  - Error handling with ErrorBoundary and Toast notifications
  - Smooth transitions and animations
  - Dark mode optimized color palette

- **API Routes**
  - Global toggle routes with developer permission checks
  - Per-server toggle routes with admin permission checks
  - Guild management routes
  - Authentication routes

- **Documentation**
  - WEBAPP_SETUP.md with complete setup guide
  - API endpoint documentation
  - Environment variable documentation
  - Security considerations

## [Unreleased]

### Added

- **Codebase Simplification and Optimization**: Major refactoring to reduce complexity and improve maintainability
  - Consolidated command loaders: Merged three duplicate command loading utilities into a single implementation
  - Configuration consolidation: Merged `environmentConfig.ts` into `config.ts` for centralized configuration
  - Redis abstraction simplification: Reduced Redis abstraction layers from 4+ to 2 (BaseRedisService + implementations)
  - Service Factory simplification: Simplified ServiceFactory pattern with consistent singleton exports
  - Error handling unification: Removed unused BaseErrorHandler abstract class, unified error handling pattern
  - Player handler modularization: Split 653-line `playerHandler.ts` into focused modules (errorHandlers, trackHandlers, lifecycleHandlers)
  - Queue command refactoring: Extracted formatting and grouping logic from 341-line `queue.ts` into separate modules
  - Enhanced feature toggle system: Two-tier system with global developer toggles and per-server admin toggles
  - Feature toggle web application: Express.js web app for non-technical users to manage feature toggles per server
  - Dependency update notifications: Automated system that checks for dependency updates and sends Discord webhook alerts
  - Monitoring simplification: Consolidated monitoring to Sentry + basic health checks, removed telemetry/metrics complexity

### Changed

- **Architecture Improvements**:
  - Command loading: Single consolidated loader with environment-aware file extension handling
  - Configuration management: Centralized configuration in `config.ts` with environment variable support
  - Redis services: Simplified service instantiation with direct singleton exports
  - Player event handling: Modular event handlers for better maintainability
  - Queue display: Separated formatting and grouping logic for cleaner code organization
  - Feature toggles: Enhanced with `isEnabledGlobal()` and `isEnabledForGuild()` methods
  - Monitoring: Simplified to Sentry error tracking and basic health checks only

### Removed

- **Code Cleanup**:
  - Removed duplicate command loader files: `loadCommands.ts`, `loadCommandsFromDir.ts`
  - Removed `environmentConfig.ts` (merged into `config.ts`)
  - Removed unused `BaseErrorHandler` abstract class
  - Removed complex telemetry/metrics system (simplified to Sentry only)

### Added

- **Unleash Feature Toggle Integration**: Integrated Unleash for feature flag management
  - Replaced custom feature toggle system with Unleash client SDK
  - Support for contextual feature toggles (user/guild-based)
  - Bootstrap data support for offline resilience
  - Automatic fallback to environment-based toggles when Unleash unavailable
  - Feature toggles: DOWNLOAD_VIDEO, DOWNLOAD_AUDIO, MUSIC_RECOMMENDATIONS, AUTOPLAY, LYRICS, QUEUE_MANAGEMENT
- **FFmpeg Replacement**: Replaced deprecated fluent-ffmpeg with direct FFmpeg CLI wrapper
  - Created custom FFmpeg wrapper utility using child_process.spawn
  - Maintains same functionality with better control and fewer dependencies
  - Support for both file and stream inputs
  - Progress tracking support
- **Dependency Updates**: Updated all dependencies to latest versions
  - discord.js: `^14.22.1` → `^14.25.1`
  - @prisma/client: `^6.16.3` → `^7.2.0` (major version upgrade)
  - @sentry/node: `^10.17.0` → `^10.32.1` → `^10.34.0` (security fix)
  - youtubei.js: `^15.1.1` → `^16.0.1` (major version upgrade)
  - @discordjs/builders: `^1.11.3` → `^1.13.1`
  - ffmpeg-static: `^5.2.0` → `^5.3.0`
  - ioredis: `^5.8.0` → `^5.8.2` → `^5.9.1`
  - unleash-client: `^5.4.0` (new, v6.9.0 available but requires migration review)
  - @commitlint/cli: `^20.3.0` → `^20.3.1`
  - @commitlint/config-conventional: `^20.3.0` → `^20.3.1`
  - @types/node: `^25.0.3` → `^25.0.8`
  - @typescript-eslint/eslint-plugin: `^8.51.0` → `^8.53.0`
  - @typescript-eslint/parser: `^8.51.0` → `^8.53.0`
  - All dev dependencies updated to latest versions
- **Removed Dependencies**:
  - fluent-ffmpeg: Removed deprecated package
  - @types/fluent-ffmpeg: Removed as no longer needed
- **Prisma v7 Migration**: Migrated to Prisma v7 with new client architecture
  - Updated generator provider from `prisma-client-js` to `prisma-client`
  - Added required `output` path for generated client
  - Created `prisma.config.ts` for datasource configuration (replaces `url` in schema)
  - Generated client now located at `src/generated/prisma-client`
- **Type Safety Improvements**: Enhanced type safety for Prisma operations with explicit type conversions

### Changed

- **Dependency Validation**: Updated depcheck.config.cjs to properly recognize all used dependencies
  - Added unleash-client, @prisma/client, ioredis, uuid to ignores (used but not detected by static analysis)
  - Added test framework packages to ignores
  - All dependency checks now pass without false positives
- **Feature Toggle System**: Migrated from custom Redis-based toggles to Unleash platform
  - More robust feature flag management with UI and API
  - Support for gradual rollouts and A/B testing
  - Better observability and feature flag lifecycle management
  - Automatic synchronization with Unleash server
- **FFmpeg Integration**: Replaced fluent-ffmpeg with direct CLI wrapper
  - No breaking changes to API surface
  - Better error handling and process management
  - Reduced dependency footprint
- **BREAKING - Prisma v7**: Major breaking changes in Prisma configuration
  - Database connection URL moved from `schema.prisma` to `prisma.config.ts`
  - Generated client location changed (now in `src/generated/prisma-client`)
  - Updated all Prisma Client usage to handle new type system
- **ESLint Configuration**: Updated to ignore generated Prisma client files
- **TypeScript Types**: Improved type safety in DatabaseService with explicit type conversions

### Fixed

- **Security Vulnerabilities**: Addressed security issues where possible
  - Updated @sentry/node to 10.34.0 to fix moderate severity vulnerability (GHSA-6465-jgvq-jhgp)
  - Production dependencies are secure - all vulnerabilities are in dev dependencies only
  - Remaining vulnerabilities in dev dependencies (hono via @prisma/dev, tmp via commitizen) are non-critical
  - These are in development tooling and do not affect production runtime
  - Prisma dev dependency vulnerability (hono) will be resolved when Prisma updates their dev dependencies
- **Dependency Detection**: Fixed depcheck false positives for runtime dependencies
  - All used dependencies now properly recognized by depcheck
- **Prisma v7 Compatibility**: Fixed all Prisma-related type issues
- **Type Safety**: Added explicit type conversions for Prisma query results
- **Build System**: Verified build works with all updated dependencies
- **Type Checking**: All TypeScript compilation errors resolved

### Added

- **Complete TypeScript Error Resolution**: Fixed all 47 TypeScript compilation errors to achieve 100% type safety
- **Major ESLint Improvements**: Reduced ESLint issues from 676 to 296 (56% improvement)
- **Modular Music Recommendation Service**: Refactored MusicRecommendationService.ts (617 lines) into 5 focused modules:
  - `types.ts`: Type definitions and interfaces (44 lines)
  - `vectorOperations.ts`: Vector operations and calculations (115 lines)
  - `similarityCalculator.ts`: Similarity algorithms (161 lines)
  - `recommendationEngine.ts`: Core recommendation logic (250 lines)
  - `index.ts`: Main service orchestration (164 lines)
- **Modular Track Management System**: Refactored trackManagement/index.ts (481 lines) into 8 focused modules:
  - `types.ts`: Type definitions (57 lines)
  - `trackValidator.ts`: Track validation logic (197 lines)
  - `queueOperations.ts`: Queue management operations (226 lines)
  - `queueStateManager.ts`: Queue state management (156 lines)
  - `service.ts`: Main service orchestration (225 lines)
  - `index.ts`: Module exports (39 lines)
- **Enhanced Type Safety**: Replaced all `any` types with proper TypeScript types from discord.js and discord-player
- **Improved Error Handling**: Fixed duration type mismatches and null assertion issues
- **Better Code Organization**: All files now under 250 lines following SOLID principles

### Fixed

- **TypeScript Compilation**: Resolved all 47 TypeScript errors including:
  - Duration type mismatches (string vs number)
  - Import/export resolution issues
  - Type assertion and null check problems
  - Missing method implementations
- **ESLint Issues**: Fixed 380+ ESLint issues including:
  - Non-null assertion violations
  - Explicit `any` type usage
  - Unsafe member access warnings
  - Unused parameter violations
- **Module Resolution**: Fixed circular import issues and missing exports
- **Type Safety**: Improved type definitions throughout the codebase

### Changed

- **File Structure**: Reorganized large files into smaller, focused modules
- **Import Strategy**: Updated import paths to use direct module imports where needed
- **Type Definitions**: Enhanced type safety with proper interfaces and type guards
- **Code Quality**: Improved maintainability with single responsibility functions

### Technical Improvements

- **Zero TypeScript Errors**: Achieved 100% TypeScript compilation success
- **56% ESLint Improvement**: Reduced from 676 to 296 issues
- **Modular Architecture**: All files under 250 lines following SOLID principles
- **Enhanced Type Safety**: Proper TypeScript types throughout the codebase
- **Better Error Handling**: Descriptive error messages and proper type guards

- **ESLint Max Lines Rule**: Added ESLint rule to enforce maximum 150 lines per file for better code maintainability
- **Modular Player Handler**: Refactored playerHandler.ts (764 lines) into smaller, focused modules:
  - `playerFactory.ts`: Player creation and extractor registration
  - `errorHandlers.ts`: Error handling and YouTube error management
  - `lifecycleHandlers.ts`: Player lifecycle event handlers
  - `trackHandlers.ts`: Track management and playback events
- **Modular Play Command**: Refactored play.ts (518 lines) into specialized modules:
  - `queryDetector.ts`: Query type detection and validation
  - `spotifyHandler.ts`: Spotify track and playlist handling
  - `youtubeHandler.ts`: YouTube search and playlist handling
  - `queueManager.ts`: Queue management and track prioritization
  - `responseHandler.ts`: Response formatting and user feedback
- **Modular Embed System**: Refactored embeds.ts (452 lines) into focused modules:
  - `constants.ts`: Embed colors and emojis
  - `types.ts`: Embed type definitions
  - `core.ts`: Core embed creation functions
  - `messageEmbeds.ts`: Message-specific embed functions
  - `musicEmbeds.ts`: Music-related embed functions
  - `errorEmbeds.ts`: Error embed functions
- **Modular Track History Service**: Refactored TrackHistoryService.ts (437 lines) into specialized modules:
  - `types.ts`: Service type definitions
  - `redisKeys.ts`: Redis key management
  - `historyManager.ts`: History management operations
  - `metadataManager.ts`: Track metadata operations
  - `duplicateDetector.ts`: Duplicate detection logic
  - `analytics.ts`: Analytics and statistics
- **Modular Monitoring System**: Refactored monitoring/index.ts (377 lines) into focused modules:
  - `sentry.ts`: Sentry error tracking and monitoring
  - `telemetry.ts`: OpenTelemetry span management
  - `metrics.ts`: Metrics recording and collection
  - `health.ts`: Health check functionality
- **Modular Error Handling**: Refactored errorHandler.ts (361 lines) into specialized modules:
  - `types.ts`: Error handling type definitions
  - `errorWrapper.ts`: Error wrapping and user message creation
  - `retryHandler.ts`: Retry logic and error recovery
- **Modular Duplicate Detection**: Refactored duplicateDetection.ts (355 lines) into focused modules:
  - `types.ts`: Duplicate detection type definitions
  - `tagExtractor.ts`: Tag and genre extraction
  - `similarityChecker.ts`: Track similarity algorithms
  - `duplicateChecker.ts`: Duplicate detection logic
- **Modular Queue Command**: Refactored queue.ts (350 lines) into specialized modules:
  - `types.ts`: Queue display type definitions
  - `queueStats.ts`: Queue statistics calculation
- **Enhanced Play Command Implementation**: Completed modular play command structure:
  - `responseHandler.ts`: Success response creation with rich embeds
  - `queueManager.ts`: Queue management and track prioritization
  - `spotifyHandler.ts`: Spotify track and playlist handling with proper error handling
  - `youtubeHandler.ts`: YouTube search and playlist handling with logging
  - `queryDetector.ts`: Enhanced query type detection
- **Improved Error Handling**: Standardized error handling across all handlers:
  - Fixed type inconsistencies in interaction handlers
  - Improved error message creation and user feedback
  - Enhanced error logging with proper context
- **Code Quality Improvements**: Resolved all linting errors and improved type safety:
  - Fixed unused parameter warnings
  - Improved function signatures and type definitions
  - Enhanced code readability and maintainability
- **Redis Module Refactoring**: Completely refactored Redis configuration to meet line limits:
  - `types.ts`: Redis type definitions and configuration types
  - `config.ts`: Redis configuration setup and environment integration
  - `eventHandlers.ts`: Redis event handling and connection management
  - `operations/base.ts`: Base Redis operations with error handling
  - `operations/stringOperations.ts`: String-specific Redis operations
  - `operations/keyOperations.ts`: Key management Redis operations
  - `client.ts`: Main Redis client implementation
- **Promise Handling Improvements**: Fixed all Promise misuse errors:
  - Replaced async event handlers with proper Promise handling
  - Added proper error catching for async operations
  - Improved event handler reliability
- **Type Safety Enhancements**: Improved type safety across the codebase:
  - Fixed nullish coalescing operator usage
  - Enhanced strict boolean expression handling
  - Improved import type consistency
- **Additional Code Quality Improvements**: Continued refactoring and error fixes:
  - Fixed forbidden non-null assertions in Redis operations
  - Resolved unnecessary conditional warnings
  - Fixed object destructuring warnings
  - Improved unsafe error call handling with proper type guards
  - Fixed missing type imports and unused variable warnings
  - Enhanced error handling in download utilities with proper type checking
- **Further Code Quality Enhancements**: Additional fixes and improvements:
  - Fixed strict boolean expression warnings with proper null checks
  - Resolved nullable number value conditional warnings
  - Fixed unsafe error calls in ytDlpUtils with proper type guards
  - Enhanced music command type safety with proper imports
  - Fixed queue type issues in music commands
  - Improved help command type safety
  - Fixed unused variable warnings with proper error handling
- **Continued Code Quality Improvements**: Additional fixes and enhancements:
  - Fixed unnecessary conditional warnings in Redis and download utilities
  - Resolved strict boolean expression warnings in download services
  - Fixed unsafe error calls in download utilities with proper type checking
  - Enhanced queue command type safety with proper EmbedBuilder types
  - Fixed missing imports in queue commands
  - Improved download video service error handling
- **Aggressive Code Quality Improvements**: Comprehensive fixes across multiple modules:
  - Fixed multiple strict boolean expression warnings in download utilities
  - Resolved unnecessary conditional warnings across download services
  - Enhanced type safety in help command with proper Command type handling
  - Fixed unsafe method calls in music commands (clear, move, lyrics)
  - Improved error handling in ytDlpUtils with proper type guards
  - Fixed template literal expressions and unsafe assignments
  - Enhanced download audio error handling with try-catch blocks
- **TypeScript Error Priority Fixes**: Focused on critical TypeScript errors:
  - Fixed all max-params errors by refactoring functions to use options objects
  - Resolved prefer-optional-chain errors with proper optional chaining
  - Fixed unused variable errors with proper naming conventions
  - Enhanced type safety across music commands (play, pause, move, lyrics)
  - Improved error handling with explicit null/undefined checks
  - Fixed unsafe method calls with proper type casting
- **Aggressive TypeScript Error Resolution**: Comprehensive fixes across multiple modules:
  - Fixed all prefer-optional-chain errors with proper optional chaining
  - Resolved unused variable errors with proper naming conventions
  - Enhanced type safety in music commands (remove, skip, volume, queueEmbed)
  - Fixed strict boolean expression warnings with explicit null/undefined checks
  - Improved error handling in download services with proper type guards
  - Enhanced response handler type safety with proper nullish coalescing
  - Fixed unnecessary conditional warnings across multiple files
- **Comprehensive TypeScript Error Priority Fixes**: Aggressive fixes across multiple modules:
  - Fixed all prefer-optional-chain errors with proper optional chaining
  - Resolved unsafe calls and member access errors with proper type imports
  - Enhanced type safety in music commands (skip, pause, move, lyrics, play)
  - Fixed strict boolean expression warnings with explicit null/undefined checks
  - Improved error handling in download services with proper type guards
  - Enhanced event handler type safety with proper import statements
  - Fixed unnecessary conditional warnings across multiple files
  - Improved Redis service type safety with proper type casting
  - `queueDisplay.ts`: Queue display formatting
  - `queueEmbed.ts`: Queue embed creation
- **Enhanced Type Safety**: Replaced all `any` types with proper TypeScript types
- **New Utility Types**: Added common utility types and composables for better code organization

### Fixed

- **Permanent Opus Fix**: Resolved Docker opus encoder issues by adding proper system dependencies (opus, opus-dev, opus-tools, build-base) to Alpine Linux containers
- **Improved Opus Module Installation**: Moved @discordjs/opus to optionalDependencies and removed fragile post-install workarounds
- **Enhanced Docker Build Process**: Streamlined npm install process without ignoring scripts, ensuring proper native module compilation
- **Autoplay Functionality**: Fixed autoplay track identification and queue replenishment to properly show autoplay songs in queue display

### Changed

- **Complete English Translation**: Translated all user-facing text from Portuguese to English throughout the entire codebase
    - Queue display: "Tocando Agora" → "Now Playing", "Próxima música" → "Next song"
    - Music commands: All error messages, success messages, and descriptions translated
    - Track formatting: "Duração" → "Duration", "Solicitado por" → "Requested by"
    - Statistics: "Ativado/Desativado" → "Enabled/Disabled", "músicas" → "songs"
    - Error messages: "Erro" → "Error", "Música não encontrada" → "Song not found"
    - Command parameters: "para" → "to", "de" → "from", "posicao" → "position", "modo" → "mode", "vezes" → "times"
    - Volume messages: "Volume atual" → "Current volume", "Volume alterado" → "Volume changed"
    - Queue status: "Fila vazia" → "Empty queue", "A fila está vazia" → "The queue is empty"

### Added

- **BREAKING**: Renamed project from LukBot to DiscordBot for generic use
- Unified management script (`scripts/discord-bot.sh`) combining Docker and development operations
- Comprehensive depcheck configuration (`depcheck.config.cjs`) for cleaner dependency management
- Docker-first approach for all application operations
- Enhanced script organization with clear command categorization
- Bot customization options via environment variables (BOT_NAME, BOT_DESCRIPTION, BOT_AVATAR_URL, etc.)
- Generic Docker container names and network configuration
- **Structured Error Handling System**: Comprehensive error management with error codes, correlation IDs, and user-friendly messages
- **Error Types and Classes**: Domain-specific error classes (AuthenticationError, NetworkError, MusicError, YouTubeError, ValidationError, ConfigurationError)
- **Error Correlation Tracking**: UUID-based correlation IDs for error tracking across the application
- **Retry Mechanisms**: Intelligent retry logic with exponential backoff for recoverable errors
- **User-Friendly Error Messages**: Automatic mapping of technical errors to user-friendly Discord embed messages
- **Unified Build System**: Consistent build tooling using tsup for production builds and tsx for development

### Changed

- **BREAKING**: Consolidated `docker.sh` and `dev.sh` into single `discord-bot.sh` script
- **BREAKING**: Updated all package.json scripts to use unified script interface
- Improved Docker integration with fallback to local operations when Docker unavailable
- Enhanced help system with categorized commands (Docker vs Local Development)
- Updated Husky pre-commit hook to v9 compatible format
- **Enhanced Error Handling**: Updated existing error handling to use structured approach with correlation IDs
- **Improved Logging**: Enhanced logging system with structured error information and correlation tracking
- **Updated Documentation**: Enhanced README.md and documentation to reflect new error handling capabilities
- **Build System Optimization**: Replaced mixed tsc/tsup/tsx usage with unified tsup for production and tsx for development

### Removed

- Separate `scripts/docker.sh` and `scripts/dev.sh` files
- Test support from development scripts (project doesn't use tests)
- Redundant script commands and duplicate functionality

### Fixed

- Husky deprecation warnings in pre-commit hooks
- Package-lock.json tracking issues (moved to .gitignore)
- Script command organization and maintainability

## [1.0.0] - 2024-12-19

### Added

- **Bot Customization System**: Complete personalization via environment variables
    - `BOT_NAME`: Custom bot display name
    - `BOT_DESCRIPTION`: Bot description for help commands
    - `BOT_AVATAR_URL`: Custom avatar URL (optional)
    - `BOT_COLOR`: Embed color (hex format)
    - `BOT_WEBSITE`: Website URL
    - `BOT_SUPPORT_SERVER`: Discord server invite link
- **Generic Project Structure**: Renamed from LukBot to DiscordBot for universal use
- **Enhanced Documentation**: Comprehensive customization guide and examples
- **Docker Configuration**: Updated container and network names for generic use

### Changed

- **BREAKING**: Project renamed from LukBot to DiscordBot
- **BREAKING**: Package name changed from `lukbot` to `discord-bot`
- **BREAKING**: Script renamed from `lukbot.sh` to `discord-bot.sh`
- **BREAKING**: Docker images renamed to `discord-bot:latest` and `discord-bot:dev`
- **BREAKING**: Container names changed to `discord-bot` and `discord-bot-dev`
- **BREAKING**: Network names changed to `discord-bot-network`
- Updated all documentation to reflect generic naming
- Enhanced env.example with comprehensive customization options

### Removed

- Personal branding references throughout the codebase
- LukBot-specific naming in favor of generic DiscordBot naming

### Fixed

- All script references updated to use new naming convention
- Documentation consistency across all files
- Docker configuration alignment with new naming scheme

## [0.2.0] - 2024-09-10

### Added

- **Discord.js 14.22.1** integration with modern slash commands
- **Discord Player 7.1.0** for advanced music playback
- **YouTube and Spotify** music streaming support
- **Advanced download system** with yt-dlp integration
- **Comprehensive logging** with Sentry integration
- **TypeScript 5.2.2** with strict type checking
- **Docker support** for both development and production
- **Hot reloading** for development workflow
- **Queue management** with shuffle, repeat, and history
- **Autoplay functionality** with intelligent track suggestions
- **Lyrics display** for current and specified tracks
- **Volume control** and audio manipulation
- **Permission system** with role-based access control
- **Multi-guild support** across Discord servers
- **Error handling** and recovery mechanisms
- **Performance monitoring** with OpenTelemetry
- **Code quality tools** (ESLint, Prettier, Husky)
- **Conventional commits** with commitizen integration

### Technical Features

- **Node.js 22.x** with ES modules
- **Alpine Linux** Docker images for production
- **FFmpeg** integration for audio/video processing
- **Modular architecture** with clean separation of concerns
- **Handler pattern** for centralized event management
- **Utility functions** for reusable operations
- **Configuration management** with environment variables
- **Structured logging** with multiple levels
- **Health checks** for container monitoring
- **Security best practices** with non-root containers

### Commands

- **Music Commands**: play, pause, resume, skip, stop, queue, volume, seek, lyrics, shuffle, repeat, clear, remove, move, jump, history, songinfo, autoplay
- **Download Commands**: download, download-audio, download-video
- **General Commands**: ping, help, exit

## [0.1.0] - 2024-01-01

### Added

- Initial release of LukBot
- Basic Discord bot functionality
- Music playback capabilities
- YouTube integration
- Basic command system

---

## Version History

- **v1.0.0**: Generic naming and customization system - renamed to DiscordBot with full personalization options and unified build system
- **v0.2.0**: Complete rewrite with modern architecture, Docker support, and advanced features
- **v0.1.0**: Initial release with basic functionality

## Migration Guide

### From v0.2.x to v1.0.0

1. **Update dependencies**: Run `npm install` to get new dependencies
2. **Update environment variables**: Check `env.example` for new required variables
3. **Docker setup**: Consider using Docker for consistent environments
4. **Script changes**: Use new unified `discord-bot.sh` script instead of separate scripts
5. **Configuration**: Update any custom configurations to match new structure
6. **Build system**: Now uses unified tsup/tsx build system for better performance
7. **Add customization**: Configure `BOT_NAME`, `BOT_DESCRIPTION`, etc. in your `.env` file
8. **Update documentation**: All references now use DiscordBot naming

### Breaking Changes

- **Script consolidation**: `docker.sh` and `dev.sh` merged into `discord-bot.sh`
- **Package.json scripts**: All scripts now use unified interface
- **Docker-first approach**: Primary operations now use Docker by default
- **Test removal**: Test support removed from development scripts
- **Project renaming**: LukBot → DiscordBot (v1.0.0)
- **Docker naming**: All container and network names updated for generic use
- **Build system**: Unified tsup/tsx build system replaces mixed tsc/tsup/tsx usage

## Contributing

When adding new features or making changes:

1. Update this changelog with your changes
2. Follow conventional commit format
3. Update documentation as needed
4. Test thoroughly before submitting PR

## Links

- [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [Conventional Commits](https://www.conventionalcommits.org/)
