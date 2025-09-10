# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Unified management script (`scripts/lukbot.sh`) combining Docker and development operations
- Comprehensive depcheck configuration (`depcheck.config.cjs`) for cleaner dependency management
- Docker-first approach for all application operations
- Enhanced script organization with clear command categorization

### Changed

- **BREAKING**: Consolidated `docker.sh` and `dev.sh` into single `lukbot.sh` script
- **BREAKING**: Updated all package.json scripts to use unified script interface
- Improved Docker integration with fallback to local operations when Docker unavailable
- Enhanced help system with categorized commands (Docker vs Local Development)
- Updated Husky pre-commit hook to v9 compatible format

### Removed

- Separate `scripts/docker.sh` and `scripts/dev.sh` files
- Test support from development scripts (project doesn't use tests)
- Redundant script commands and duplicate functionality

### Fixed

- Husky deprecation warnings in pre-commit hooks
- Package-lock.json tracking issues (moved to .gitignore)
- Script command organization and maintainability

## [2.0.0] - 2024-09-10

### Added

- **Discord.js 14.22.1** integration with modern slash commands
- **Discord Player 7.1.0** for advanced music playback
- **YouTube and Spotify** music streaming support
- **Advanced download system** with yt-dlp integration
- **Comprehensive logging** with Sentry integration
- **TypeScript 5.9.2** with strict type checking
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

## [1.0.0] - 2024-01-01

### Added

- Initial release of LukBot
- Basic Discord bot functionality
- Music playback capabilities
- YouTube integration
- Basic command system

---

## Version History

- **v2.0.0**: Complete rewrite with modern architecture, Docker support, and advanced features
- **v1.0.0**: Initial release with basic functionality

## Migration Guide

### From v1.x to v2.0.0

1. **Update dependencies**: Run `npm install` to get new dependencies
2. **Update environment variables**: Check `env.example` for new required variables
3. **Docker setup**: Consider using Docker for consistent environments
4. **Script changes**: Use new unified `lukbot.sh` script instead of separate scripts
5. **Configuration**: Update any custom configurations to match new structure

### Breaking Changes

- **Script consolidation**: `docker.sh` and `dev.sh` merged into `lukbot.sh`
- **Package.json scripts**: All scripts now use unified interface
- **Docker-first approach**: Primary operations now use Docker by default
- **Test removal**: Test support removed from development scripts

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
