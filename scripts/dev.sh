#!/bin/bash

# Development script for LukBot
# Usage: ./scripts/dev.sh <command>

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
        print_warning ".env file not found. Please create one from env.example"
        return 1
    fi
    return 0
}

# Function to start the application
start() {
    print_status "Starting LukBot in production mode..."
    check_env || exit 1
    npm run start
}

# Function to start development mode
dev() {
    print_status "Starting LukBot in development mode..."
    check_env || exit 1
    npm run dev
}

# Function to start development mode with watch
dev_watch() {
    print_status "Starting LukBot in development mode with watch..."
    check_env || exit 1
    npm run dev:watch
}

# Function to build the project
build() {
    print_status "Building LukBot..."
    npm run build
    print_success "Build completed successfully"
}


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

# Function to view logs
logs() {
    print_status "Viewing logs..."
    if [ -f "logs/app.log" ]; then
        tail -f logs/app.log
    else
        print_warning "No log file found at logs/app.log"
    fi
}

# Function to stop services
stop() {
    print_status "Stopping LukBot..."
    pkill -f "node.*dist/index.js" || true
    pkill -f "tsx.*src/index.ts" || true
    print_success "LukBot stopped"
}

# Function to clean workspace
clean() {
    print_status "Cleaning workspace..."
    rm -rf dist/
    rm -rf node_modules/.cache/
    print_success "Workspace cleaned"
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
check_outdated() {
    print_status "Checking for outdated dependencies..."
    npm run check:outdated
}

# Function to run security audit
audit() {
    print_status "Running security audit..."
    npm audit
}

# Function to show help
help() {
    echo "LukBot Development Script"
    echo ""
    echo "Usage: ./scripts/dev.sh <command>"
    echo ""
    echo "Available commands:"
    echo "  start        Start the application in production mode"
    echo "  dev          Start the application in development mode"
    echo "  dev:watch    Start the application in development mode with watch"
    echo "  build        Build the project"
    echo "  quality      Run all quality checks (lint, type-check, build)"
    echo "  format       Format code with Prettier"
    echo "  lint:fix     Fix linting issues"
    echo "  logs         View application logs"
    echo "  stop         Stop the application"
    echo "  clean        Clean workspace (remove dist, cache)"
    echo "  install      Install dependencies"
    echo "  update:deps  Update dependencies"
    echo "  check:deps   Check for outdated dependencies"
    echo "  audit        Run security audit"
    echo "  help         Show this help message"
    echo ""
}

# Main script logic
case "${1:-help}" in
    start)
        start
        ;;
    dev)
        dev
        ;;
    dev:watch)
        dev_watch
        ;;
    build)
        build
        ;;
    quality)
        quality
        ;;
    format)
        format
        ;;
    lint:fix)
        lint_fix
        ;;
    logs)
        logs
        ;;
    stop)
        stop
        ;;
    clean)
        clean
        ;;
    install)
        install
        ;;
    update:deps)
        update_deps
        ;;
    check:deps)
        check_outdated
        ;;
    audit)
        audit
        ;;
    help|--help|-h)
        help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        help
        exit 1
        ;;
esac

