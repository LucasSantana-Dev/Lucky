#!/bin/bash

# DiscordBot Unified Management Script
# Usage: ./scripts/discord-bot.sh <command>
#
# This script follows structured error handling patterns and provides
# comprehensive logging and error recovery mechanisms.

set -euo pipefail  # Enhanced error handling: exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
readonly SCRIPT_NAME="$(basename "$0")"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
readonly LOG_FILE="${PROJECT_ROOT}/logs/script.log"

# Create logs directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Function to log messages with timestamp
log_message() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$LOG_FILE"
}

# Function to print colored output with logging
print_status() {
    local message="$1"
    echo -e "${BLUE}[INFO]${NC} $message"
    log_message "INFO" "$message"
}

print_success() {
    local message="$1"
    echo -e "${GREEN}[SUCCESS]${NC} $message"
    log_message "SUCCESS" "$message"
}

print_warning() {
    local message="$1"
    echo -e "${YELLOW}[WARNING]${NC} $message"
    log_message "WARNING" "$message"
}

print_error() {
    local message="$1"
    echo -e "${RED}[ERROR]${NC} $message" >&2
    log_message "ERROR" "$message"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to load environment variables from .env file
load_env() {
    local env_file="${PROJECT_ROOT}/.env"

    if [ -f "$env_file" ]; then
        # Export variables from .env file (skip comments and empty lines)
        set -a  # automatically export all variables
        # Use a safer method to source the .env file
        while IFS= read -r line || [ -n "$line" ]; do
            # Skip comments and empty lines
            case "$line" in
                \#*|'') continue ;;
            esac
            # Only export if line contains an equals sign and doesn't start with special characters
            if [[ "$line" == *"="* ]] && [[ ! "$line" =~ ^[[:space:]]*[^A-Za-z_] ]]; then
                # Use eval to properly handle the export, but sanitize the line first
                eval "export $line" 2>/dev/null || {
                    print_warning "Skipping invalid environment variable: ${line%%=*}"
                }
            fi
        done < "$env_file"
        set +a  # disable automatic export
        print_status "Environment variables loaded from .env"
    else
        print_warning "No .env file found, using system environment variables"
    fi
}

# Function to check if .env file exists with structured error handling
check_env() {
    local env_file="${PROJECT_ROOT}/.env"

    if [ ! -f "$env_file" ]; then
        print_error "Environment file not found at: $env_file"
        print_warning "Please create a .env file with your Discord bot configuration:"
        echo ""
        echo "NODE_ENV=production"
        echo "DISCORD_TOKEN=your_discord_token_here"
        echo "CLIENT_ID=your_client_id_here"
        echo "COMMANDS_DISABLED="
        echo "COMMAND_CATEGORIES_DISABLED="
        echo ""
        print_status "You can copy from env.example: cp env.example .env"
        exit 1
    fi

    # Load environment variables
    load_env

    # Validate required environment variables
    local required_vars=("DISCORD_TOKEN" "CLIENT_ID")
    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}=" "$env_file" || [ -z "$(grep "^${var}=" "$env_file" | cut -d'=' -f2- | tr -d ' ')" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        print_error "Missing required environment variables: ${missing_vars[*]}"
        print_warning "Please set these variables in your .env file"
        exit 1
    fi

    print_success "Environment configuration validated"
}

# Function to check if Docker is available with enhanced error handling
check_docker() {
    if ! command_exists docker; then
        print_error "Docker is not installed or not in PATH!"
        print_warning "Please install Docker Desktop to use Docker commands."
        print_status "You can still use local development commands (format, lint, quality, etc.)"
        log_message "ERROR" "Docker command not found in PATH"
        return 1
    fi

    if ! docker info >/dev/null 2>&1; then
        print_error "Docker daemon is not running!"
        print_warning "Please start Docker Desktop"
        log_message "ERROR" "Docker daemon not accessible"
        return 1
    fi

    # Check Docker version compatibility
    local docker_version
    docker_version=$(docker --version | grep -oE '[0-9]+\.[0-9]+' | head -1)
    local required_version="20.10"

    if [ "$(printf '%s\n' "$required_version" "$docker_version" | sort -V | head -n1)" != "$required_version" ]; then
        print_warning "Docker version $docker_version detected. Recommended version: $required_version or higher"
        log_message "WARNING" "Docker version $docker_version may not be fully compatible"
    fi

    print_success "Docker is available and running"
    return 0
}

# Function to check if we're in development mode
is_development() {
    # Load environment variables if not already loaded
    if [ -z "${NODE_ENV:-}" ]; then
        load_env
    fi

    local env="${NODE_ENV:-production}"
    case "$env" in
        "development"|"dev"|"local")
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Function to cleanup resources on script exit
cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        print_error "Script exited with error code: $exit_code"
        log_message "ERROR" "Script cleanup triggered with exit code: $exit_code"
    else
        print_success "Script completed successfully"
        log_message "SUCCESS" "Script completed successfully"
    fi
}

# Set up cleanup trap
trap cleanup EXIT

# Function to handle script errors with structured logging
handle_script_error() {
    local error_code=$1
    local error_message="$2"
    local context="${3:-unknown}"

    print_error "Error in $context: $error_message"
    log_message "ERROR" "Script error in $context: $error_message (code: $error_code)"

    # Provide helpful suggestions based on error type
    case $error_code in
        1)
            print_warning "This is usually a configuration or permission issue"
            ;;
        2)
            print_warning "This might be a dependency or environment issue"
            ;;
        3)
            print_warning "This could be a network or service availability issue"
            ;;
        *)
            print_warning "Check the logs for more details: $LOG_FILE"
            ;;
    esac
}

# =============================================================================
# DOCKER COMMANDS (Primary Application Operations)
# =============================================================================

# Function to build Docker image (production or development based on NODE_ENV)
build() {
    if is_development; then
        print_status "Building development Docker image..."
        check_docker || exit 1
        docker build -f Dockerfile.dev -t discord-bot:dev .
        print_success "Development image built successfully!"
    else
        print_status "Building production Docker image..."
        check_docker || exit 1
        docker build -t discord-bot:latest .
        print_success "Production image built successfully!"
    fi
}

# Function to start container (production or development based on NODE_ENV)
start() {
    check_env
    if is_development; then
        print_status "Starting development container..."
        check_docker || exit 1
        docker compose -f docker-compose.dev.yml up -d
        print_success "Development container started!"
        print_status "Use 'npm run logs' to view logs"
    else
        print_status "Starting production container..."
        check_docker || exit 1
        docker compose up -d
        print_success "Production container started!"
        print_status "Use 'npm run logs' to view logs"
    fi
}

# Function to stop containers
stop() {
    print_status "Stopping containers..."
    if check_docker; then
        docker compose down
        docker compose -f docker-compose.dev.yml down
        print_success "All containers stopped!"
    else
        print_status "Stopping local processes..."
        pkill -f "node.*dist/index.js" || true
        pkill -f "tsx.*src/index.ts" || true
        print_success "Local processes stopped"
    fi
}

# Function to restart containers (uses NODE_ENV to determine environment)
restart() {
    stop
    start
}

# Function to view logs (production or development based on NODE_ENV)
logs() {
    if is_development; then
        print_status "Showing development logs..."
        if check_docker; then
            docker compose -f docker-compose.dev.yml logs -f
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
            docker compose logs -f
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
        docker compose ps
        echo ""
        echo "Development containers:"
        docker compose -f docker-compose.dev.yml ps
    else
        print_warning "Docker not available. Cannot show container status."
    fi
}

# Function to clean up Docker resources
clean() {
    print_status "Cleaning up resources..."
    if check_docker; then
        docker compose down --volumes --remove-orphans
        docker compose -f docker-compose.dev.yml down --volumes --remove-orphans
        docker system prune -f
        print_success "Docker resources cleaned up!"
    fi

    # Always clean local build artifacts
    npx rimraf dist/
    npx rimraf node_modules/.cache/
    print_success "Local workspace cleaned!"
}

# =============================================================================
# LOCAL DEVELOPMENT COMMANDS (Code Quality & Tools)
# =============================================================================

# Function to run quality checks
quality() {
    print_status "Running quality checks..."

    print_status "Formatting code..."
    npm run format

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


# =============================================================================
# HELP AND UTILITIES
# =============================================================================

# Function to show help
help() {
    echo "DiscordBot Unified Management Script"
    echo ""
    echo "Usage: ./scripts/discord-bot.sh <command>"
    echo ""
    echo "🐳 DOCKER COMMANDS (Primary Application Operations):"
    echo "  build          Build Docker image (production/development based on NODE_ENV)"
    echo "  start          Start container (production/development based on NODE_ENV)"
    echo "  dev            Start development container (NODE_ENV=development)"
    echo "  dev:watch      Start with hot reloading (local development)"
    echo "  stop           Stop all containers/processes"
    echo "  restart        Restart containers (environment based on NODE_ENV)"
    echo "  logs           Show logs (environment based on NODE_ENV)"
    echo "  status         Show container status"
    echo "  clean          Clean up Docker resources and workspace"
    echo ""
    echo "🛠️  LOCAL DEVELOPMENT COMMANDS (Code Quality & Tools):"
    echo "  quality        Run all quality checks (lint, type-check, build)"
    echo "  format         Format code with Prettier"
    echo "  lint:fix       Fix linting issues"
    echo "  install        Install dependencies"
    echo ""
    echo "ℹ️  UTILITIES:"
    echo "  help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./scripts/discord-bot.sh build"
    echo "  ./scripts/discord-bot.sh dev"
    echo "  ./scripts/discord-bot.sh logs"
    echo "  ./scripts/discord-bot.sh quality"
    echo "  ./scripts/discord-bot.sh restart"
    echo ""
    echo "Environment-based usage:"
    echo "  # Set NODE_ENV in .env file to control behavior"
    echo "  echo 'NODE_ENV=development' > .env  # Development mode"
    echo "  echo 'NODE_ENV=production' > .env   # Production mode"
}

# =============================================================================
# MAIN SCRIPT LOGIC
# =============================================================================

case "${1:-help}" in
    # Docker Commands
    "build")
        build
        ;;
    "start")
        start
        ;;
    "dev")
        start
        ;;
    "dev:watch")
        dev_watch
        ;;
    "stop")
        stop
        ;;
    "restart")
        restart
        ;;
    "logs")
        logs
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
