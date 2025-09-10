# 🐳 LukBot Docker Setup

This document provides comprehensive instructions for running LukBot in Docker containers for both development and production environments.

## 📋 Prerequisites

- **Docker** (version 20.10 or higher)
- **Docker Compose** (version 2.0 or higher)
- **Discord Bot Token** and **Client ID**

## 🚀 Quick Start

### 1. Environment Setup

Create a `.env` file in the project root:

```bash
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_token_here
CLIENT_ID=your_client_id_here

# Optional: Disable specific commands or categories
COMMANDS_DISABLED=
COMMAND_CATEGORIES_DISABLED=
```

### 2. Build and Run

#### Production Environment

```bash
# Build and start production container
./scripts/docker.sh build-prod
./scripts/docker.sh start-prod

# View logs
./scripts/docker.sh logs prod
```

#### Development Environment

```bash
# Build and start development container
./scripts/docker.sh build-dev
./scripts/docker.sh start-dev

# View logs
./scripts/docker.sh logs dev
```

## 📁 Docker Files Overview

### Core Files

- **`Dockerfile`** - Production image with optimized build
- **`Dockerfile.dev`** - Development image with hot reloading
- **`docker-compose.yml`** - Production orchestration
- **`docker-compose.dev.yml`** - Development orchestration
- **`.dockerignore`** - Excludes unnecessary files from build context

### Management Script

- **`scripts/docker.sh`** - Comprehensive Docker management script

## 🔧 Docker Management Commands

### Using the Management Script

```bash
# Build images
./scripts/docker.sh build-prod    # Build production image
./scripts/docker.sh build-dev     # Build development image

# Start containers
./scripts/docker.sh start-prod    # Start production container
./scripts/docker.sh start-dev     # Start development container

# Stop containers
./scripts/docker.sh stop          # Stop all containers

# View logs
./scripts/docker.sh logs prod     # Production logs
./scripts/docker.sh logs dev      # Development logs

# Restart containers
./scripts/docker.sh restart prod  # Restart production
./scripts/docker.sh restart dev   # Restart development

# Container status
./scripts/docker.sh status        # Show all container statuses

# Cleanup
./scripts/docker.sh clean         # Clean up Docker resources

# Help
./scripts/docker.sh help          # Show all available commands
```

### Direct Docker Commands

```bash
# Production
docker-compose up -d              # Start production
docker-compose down               # Stop production
docker-compose logs -f            # View production logs

# Development
docker-compose -f docker-compose.dev.yml up -d    # Start development
docker-compose -f docker-compose.dev.yml down     # Stop development
docker-compose -f docker-compose.dev.yml logs -f  # View development logs
```

## 🏗️ Docker Image Details

### Production Image (`Dockerfile`)

- **Base**: Node.js 18 Alpine
- **Dependencies**: Python3, FFmpeg, yt-dlp
- **Security**: Non-root user (bot:1001)
- **Optimization**: Multi-stage build, production dependencies only
- **Health Check**: 30s interval with 3 retries

### Development Image (`Dockerfile.dev`)

- **Base**: Node.js 18 Alpine
- **Dependencies**: All development dependencies included
- **Hot Reloading**: Volume mounting for live code changes
- **Debugging**: Full source code access

## 📊 Container Features

### Environment Variables

- `NODE_ENV` - Environment mode (production/development)
- `DISCORD_TOKEN` - Discord bot token
- `CLIENT_ID` - Discord client ID
- `COMMANDS_DISABLED` - Comma-separated list of disabled commands
- `COMMAND_CATEGORIES_DISABLED` - Comma-separated list of disabled categories
- `SENTRY_DSN` - Sentry DSN for error tracking (automatically disabled in development)

### Volume Mounts

- `./downloads:/app/downloads` - Persistent download storage
- `./logs:/app/logs` - Persistent log storage
- `.:/app` - Source code (development only)

### Network Configuration

- **Bridge Network**: `lukbot-network`
- **Port Exposure**: 3000 (for health checks)

### Health Monitoring

- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3 attempts
- **Start Period**: 40 seconds (development), 5 seconds (production)

## 🔍 Troubleshooting

### Common Issues

#### 1. Permission Errors

```bash
# Fix volume permissions
sudo chown -R 1001:1001 downloads logs
```

#### 2. Environment File Missing

```bash
# Create .env file
cp .env.example .env
# Edit with your Discord credentials
nano .env
```

#### 3. Container Won't Start

```bash
# Check logs
./scripts/docker.sh logs prod

# Check container status
./scripts/docker.sh status

# Restart container
./scripts/docker.sh restart prod
```

#### 4. Build Failures

```bash
# Clean Docker cache
./scripts/docker.sh clean

# Rebuild from scratch
docker system prune -a
./scripts/docker.sh build-prod
```

### Debug Commands

```bash
# Enter running container
docker exec -it lukbot-discord sh

# Check container resources
docker stats lukbot-discord

# Inspect container
docker inspect lukbot-discord

# View container logs
docker logs -f lukbot-discord
```

## 🚀 Deployment

### Production Deployment

1. **Build the image**:

    ```bash
    ./scripts/docker.sh build-prod
    ```

2. **Set up environment**:

    ```bash
    # Create .env file with production credentials
    cp .env.example .env
    # Edit .env with your Discord bot credentials
    ```

3. **Start the service**:

    ```bash
    ./scripts/docker.sh start-prod
    ```

4. **Monitor the service**:
    ```bash
    ./scripts/docker.sh logs prod
    ./scripts/docker.sh status
    ```

### Development Workflow

1. **Start development container**:

    ```bash
    ./scripts/docker.sh start-dev
    ```

2. **Make code changes** - Changes are automatically reflected

3. **View logs**:

    ```bash
    ./scripts/docker.sh logs dev
    ```

4. **Restart when needed**:
    ```bash
    ./scripts/docker.sh restart dev
    ```

## 🔒 Security Considerations

### Container Security

- **Non-root user**: Container runs as `bot:1001`
- **Minimal base image**: Alpine Linux for smaller attack surface
- **No unnecessary packages**: Only required dependencies installed
- **Health checks**: Regular monitoring of container health

### Environment Security

- **Environment variables**: Sensitive data passed via environment
- **Volume isolation**: Downloads and logs in separate volumes
- **Network isolation**: Custom bridge network

## 📈 Performance Optimization

### Production Optimizations

- **Multi-stage builds**: Reduced final image size
- **Alpine base**: Smaller footprint than Ubuntu/Debian
- **Production dependencies**: Only necessary packages included
- **Layer caching**: Optimized Docker layer structure

### Resource Management

- **Log rotation**: 10MB max file size, 3 files max
- **Automatic restarts**: `unless-stopped` restart policy
- **Health monitoring**: Regular health checks
- **Resource limits**: Configurable via docker-compose

## 🔄 Updates and Maintenance

### Updating the Bot

```bash
# Stop containers
./scripts/docker.sh stop

# Pull latest code
git pull origin main

# Rebuild and restart
./scripts/docker.sh build-prod
./scripts/docker.sh start-prod
```

### Regular Maintenance

```bash
# Clean up old images and containers
./scripts/docker.sh clean

# Update base images
docker pull node:18-alpine

# Check for security updates
docker scan lukbot:latest
```

## 📝 Logs and Monitoring

### Log Locations

- **Container logs**: `docker logs lukbot-discord`
- **Application logs**: `./logs/` directory
- **Download logs**: Console output

### Monitoring Commands

```bash
# Real-time logs
./scripts/docker.sh logs prod

# Container status
./scripts/docker.sh status

# Resource usage
docker stats lukbot-discord

# Health check status
docker inspect lukbot-discord | grep Health -A 10
```

## 🆘 Support

If you encounter issues:

1. **Check logs**: `./scripts/docker.sh logs prod`
2. **Verify environment**: Ensure `.env` file is properly configured
3. **Check status**: `./scripts/docker.sh status`
4. **Restart container**: `./scripts/docker.sh restart prod`
5. **Clean and rebuild**: `./scripts/docker.sh clean && ./scripts/docker.sh build-prod`

For additional help, check the main README.md or create an issue in the repository.
