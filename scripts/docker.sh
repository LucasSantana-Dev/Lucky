#!/bin/bash

# LukBot Docker Management Script
# Usage: ./scripts/docker.sh [command]

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

# Function to check if .env file exists
check_env() {
    if [ ! -f .env ]; then
        print_error ".env file not found!"
        print_warning "Please create a .env file with your Discord bot configuration:"
        echo "DISCORD_TOKEN=your_discord_token_here"
        echo "CLIENT_ID=your_client_id_here"
        echo "COMMANDS_DISABLED="
        echo "COMMAND_CATEGORIES_DISABLED="
        exit 1
    fi
}

# Function to build production image
build_prod() {
    print_status "Building production Docker image..."
    docker build -t lukbot:latest .
    print_success "Production image built successfully!"
}

# Function to build development image
build_dev() {
    print_status "Building development Docker image..."
    docker build -f Dockerfile.dev -t lukbot:dev .
    print_success "Development image built successfully!"
}

# Function to start production container
start_prod() {
    check_env
    print_status "Starting production container..."
    docker-compose up -d
    print_success "Production container started!"
    print_status "Use 'docker-compose logs -f' to view logs"
}

# Function to start development container
start_dev() {
    check_env
    print_status "Starting development container..."
    docker-compose -f docker-compose.dev.yml up -d
    print_success "Development container started!"
    print_status "Use 'docker-compose -f docker-compose.dev.yml logs -f' to view logs"
}

# Function to stop containers
stop() {
    print_status "Stopping containers..."
    docker-compose down
    docker-compose -f docker-compose.dev.yml down
    print_success "All containers stopped!"
}

# Function to view logs
logs() {
    if [ "$1" = "dev" ]; then
        print_status "Showing development logs..."
        docker-compose -f docker-compose.dev.yml logs -f
    else
        print_status "Showing production logs..."
        docker-compose logs -f
    fi
}

# Function to restart containers
restart() {
    stop
    if [ "$1" = "dev" ]; then
        start_dev
    else
        start_prod
    fi
}

# Function to clean up Docker resources
clean() {
    print_status "Cleaning up Docker resources..."
    docker-compose down --volumes --remove-orphans
    docker-compose -f docker-compose.dev.yml down --volumes --remove-orphans
    docker system prune -f
    print_success "Docker resources cleaned up!"
}

# Function to show container status
status() {
    print_status "Container status:"
    echo ""
    echo "Production containers:"
    docker-compose ps
    echo ""
    echo "Development containers:"
    docker-compose -f docker-compose.dev.yml ps
}

# Function to show help
show_help() {
    echo "LukBot Docker Management Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  build-prod    Build production Docker image"
    echo "  build-dev     Build development Docker image"
    echo "  start-prod    Start production container"
    echo "  start-dev     Start development container"
    echo "  stop          Stop all containers"
    echo "  restart [env] Restart containers (env: prod or dev)"
    echo "  logs [env]    Show logs (env: prod or dev)"
    echo "  status        Show container status"
    echo "  clean         Clean up Docker resources"
    echo "  help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 build-prod"
    echo "  $0 start-dev"
    echo "  $0 logs dev"
    echo "  $0 restart prod"
}

# Main script logic
case "$1" in
    "build-prod")
        build_prod
        ;;
    "build-dev")
        build_dev
        ;;
    "start-prod")
        start_prod
        ;;
    "start-dev")
        start_dev
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
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac

