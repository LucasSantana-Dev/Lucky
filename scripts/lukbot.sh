#!/bin/bash

# LukBot Unified Management Script
# Usage: ./scripts/lukbot.sh <command>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if .env file exists
check_env() {
    if [ ! -f ".env" ]; then
        print_error ".env file not found!"
        print_warning "Please create a .env file with your Discord bot configuration:"
        echo "DISCORD_TOKEN=your_discord_token_here"
        echo "CLIENT_ID=your_client_id_here"
        echo "COMMANDS_DISABLED="
        echo "COMMAND_CATEGORIES_DISABLED="
        exit 1
    fi
}

# Function to check if Docker is available
check_docker() {
    if ! command_exists docker; then
        print_error "Docker is not installed or not in PATH!"
        print_warning "Please install Docker Desktop to use Docker commands."
        print_status "You can still use local development commands (format, lint, quality, etc.)"
        return 1
    fi
    return 0
}

# =============================================================================
# DOCKER COMMANDS (Primary Application Operations)
# =============================================================================

# Function to build production Docker image
build() {
    print_status "Building production Docker image..."
    check_docker || exit 1
    docker build -t lukbot:latest .
    print_success "Production image built successfully!"
}

# Function to build development Docker image
build_dev() {
    print_status "Building development Docker image..."
    check_docker || exit 1
    docker build -f Dockerfile.dev -t lukbot:dev .
    print_success "Development image built successfully!"
}

# Function to start production container
start() {
    check_env
    print_status "Starting production container..."
    check_docker || exit 1
    docker-compose up -d
    print_success "Production container started!"
    print_status "Use 'npm run logs' to view logs"
}

# Function to start development container
dev() {
    check_env
    print_status "Starting development container..."
    check_docker || exit 1
    docker-compose -f docker-compose.dev.yml up -d
    print_success "Development container started!"
    print_status "Use 'npm run logs:dev' to view logs"
}

# Function to start development mode with watch (local)
dev_watch() {
    print_status "Starting LukBot in development mode with watch..."
    check_env || exit 1
    npm run dev:watch
}

# Function to stop containers
stop() {
    print_status "Stopping containers..."
    if check_docker; then
        docker-compose down
        docker-compose -f docker-compose.dev.yml down
        print_success "All containers stopped!"
    else
        print_status "Stopping local processes..."
        pkill -f "node.*dist/index.js" || true
        pkill -f "tsx.*src/index.ts" || true
        print_success "Local processes stopped"
    fi
}

# Function to restart containers
restart() {
    stop
    if [ "$1" = "dev" ]; then
        dev
    else
        start
    fi
}

# Function to view logs
logs() {
    if [ "$1" = "dev" ]; then
        print_status "Showing development logs..."
        if check_docker; then
            docker-compose -f docker-compose.dev.yml logs -f
        else
            print_warning "Docker not available. Checking local logs..."
            if [ -f "logs/app.log" ]; then
                tail -f logs/app.log
            else
                print_warning "No log file found at logs/app.log"
            fi
        fi
    else
        print_status "Showing production logs..."
        if check_docker; then
            docker-compose logs -f
        else
            print_warning "Docker not available. Checking local logs..."
            if [ -f "logs/app.log" ]; then
                tail -f logs/app.log
            else
                print_warning "No log file found at logs/app.log"
            fi
        fi
    fi
}

# Function to show container status
status() {
    print_status "Container status:"
    if check_docker; then
        echo ""
        echo "Production containers:"
        docker-compose ps
        echo ""
        echo "Development containers:"
        docker-compose -f docker-compose.dev.yml ps
    else
        print_warning "Docker not available. Cannot show container status."
    fi
}

# Function to clean up Docker resources
clean() {
    print_status "Cleaning up resources..."
    if check_docker; then
        docker-compose down --volumes --remove-orphans
        docker-compose -f docker-compose.dev.yml down --volumes --remove-orphans
        docker system prune -f
        print_success "Docker resources cleaned up!"
    fi
    
    # Always clean local build artifacts
    rm -rf dist/
    rm -rf node_modules/.cache/
    print_success "Local workspace cleaned!"
}

# =============================================================================
# LOCAL DEVELOPMENT COMMANDS (Code Quality & Tools)
# =============================================================================

# Function to run quality checks
quality() {
    print_status "Running quality checks..."
    
    print_status "Running linter..."
    npm run lint
    
    print_status "Running type check..."
    npm run type:check
    
    print_status "Running build..."
    npm run build
    
    print_success "All quality checks passed!"
}

# Function to format code
format() {
    print_status "Formatting code..."
    npm run format
    print_success "Code formatted successfully"
}

# Function to fix linting issues
lint_fix() {
    print_status "Fixing linting issues..."
    npm run lint:fix
    print_success "Linting issues fixed"
}

# Function to install dependencies
install() {
    print_status "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Function to update dependencies
update_deps() {
    print_status "Updating dependencies..."
    npm run update:deps
    print_success "Dependencies updated"
}

# Function to check for outdated dependencies
check_deps() {
    print_status "Checking for outdated dependencies..."
    npm run check:outdated
}

# Function to run security audit
audit() {
    print_status "Running security audit..."
    npm audit
}

# =============================================================================
# HELP AND UTILITIES
# =============================================================================

# Function to show help
help() {
    echo "LukBot Unified Management Script"
    echo ""
    echo "Usage: ./scripts/lukbot.sh <command>"
    echo ""
    echo "🐳 DOCKER COMMANDS (Primary Application Operations):"
    echo "  build          Build production Docker image"
    echo "  build:dev      Build development Docker image"
    echo "  start          Start production container"
    echo "  dev            Start development container"
    echo "  dev:watch      Start with hot reloading (local)"
    echo "  stop           Stop all containers/processes"
    echo "  restart [env]  Restart containers (env: prod or dev)"
    echo "  logs [env]     Show logs (env: prod or dev)"
    echo "  status         Show container status"
    echo "  clean          Clean up Docker resources and workspace"
    echo ""
    echo "🛠️  LOCAL DEVELOPMENT COMMANDS (Code Quality & Tools):"
    echo "  quality        Run all quality checks (lint, type-check, build)"
    echo "  format         Format code with Prettier"
    echo "  lint:fix       Fix linting issues"
    echo "  install        Install dependencies"
    echo "  update:deps    Update dependencies"
    echo "  check:deps     Check for outdated dependencies"
    echo "  audit          Run security audit"
    echo ""
    echo "ℹ️  UTILITIES:"
    echo "  help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/lukbot.sh build"
    echo "  ./scripts/lukbot.sh dev"
    echo "  ./scripts/lukbot.sh logs dev"
    echo "  ./scripts/lukbot.sh quality"
    echo "  ./scripts/lukbot.sh restart prod"
}

# =============================================================================
# MAIN SCRIPT LOGIC
# =============================================================================

case "${1:-help}" in
    # Docker Commands
    "build")
        build
        ;;
    "build:dev")
        build_dev
        ;;
    "start")
        start
        ;;
    "dev")
        dev
        ;;
    "dev:watch")
        dev_watch
        ;;
    "stop")
        stop
        ;;
    "restart")
        restart "$2"
        ;;
    "logs")
        logs "$2"
        ;;
    "status")
        status
        ;;
    "clean")
        clean
        ;;
    
    # Local Development Commands
    "quality")
        quality
        ;;
    "format")
        format
        ;;
    "lint:fix")
        lint_fix
        ;;
    "install")
        install
        ;;
    "update:deps")
        update_deps
        ;;
    "check:deps")
        check_deps
        ;;
    "audit")
        audit
        ;;
    
    # Utilities
    "help"|"--help"|"-h")
        help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        help
        exit 1
        ;;
esac
