#!/bin/bash

# LukBot Portainer Deployment Script
# This script handles deployment via Portainer API

set -e

# Configuration
PROJECT_DIR="/home/luk-server/LukBot"
PORTAINER_URL="${PORTAINER_URL:-http://localhost:9000}"
PORTAINER_USERNAME="${PORTAINER_USERNAME:-admin}"
PORTAINER_PASSWORD="${PORTAINER_PASSWORD:-}"
PORTAINER_STACK_ID="${PORTAINER_STACK_ID:-}"
PORTAINER_ENDPOINT_ID="${PORTAINER_ENDPOINT_ID:-1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Function to get Portainer JWT token
get_portainer_token() {
    print_status "Authenticating with Portainer..."
    
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"Username\":\"$PORTAINER_USERNAME\",\"Password\":\"$PORTAINER_PASSWORD\"}" \
        "$PORTAINER_URL/api/auth")
    
    if [ $? -ne 0 ]; then
        print_error "Failed to authenticate with Portainer"
        exit 1
    fi
    
    # Extract JWT token from response
    local token=$(echo "$response" | grep -o '"jwt":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$token" ]; then
        print_error "Failed to get authentication token from Portainer"
        exit 1
    fi
    
    echo "$token"
}

# Function to update Portainer stack
update_portainer_stack() {
    local token="$1"
    
    print_status "Updating Portainer stack..."
    
    # Read the stack file
    local stack_content=$(cat "$PROJECT_DIR/portainer-stack.yml")
    
    # Update the stack via Portainer API
    local response=$(curl -s -X PUT \
        -H "Authorization: Bearer $token" \
        -H "Content-Type: application/json" \
        -d "{
            \"StackFileContent\": \"$stack_content\",
            \"Prune\": true
        }" \
        "$PORTAINER_URL/api/stacks/$PORTAINER_STACK_ID?endpointId=$PORTAINER_ENDPOINT_ID")
    
    if [ $? -ne 0 ]; then
        print_error "Failed to update Portainer stack"
        exit 1
    fi
    
    print_success "Portainer stack updated successfully"
}

# Function to check stack status
check_stack_status() {
    local token="$1"
    
    print_status "Checking stack status..."
    
    local response=$(curl -s -H "Authorization: Bearer $token" \
        "$PORTAINER_URL/api/stacks/$PORTAINER_STACK_ID?endpointId=$PORTAINER_ENDPOINT_ID")
    
    if [ $? -eq 0 ]; then
        print_success "Stack status retrieved successfully"
    else
        print_warning "Could not retrieve stack status"
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Environment Variables:"
    echo "  PORTAINER_URL         Portainer URL (default: http://localhost:9000)"
    echo "  PORTAINER_USERNAME    Portainer username (default: admin)"
    echo "  PORTAINER_PASSWORD   Portainer password"
    echo "  PORTAINER_STACK_ID   Portainer stack ID"
    echo "  PORTAINER_ENDPOINT_ID Portainer endpoint ID (default: 1)"
    echo ""
    echo "Options:"
    echo "  --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                   # Deploy with environment variables"
    echo "  PORTAINER_PASSWORD=mypass $0  # Deploy with password"
}

# Main function
main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help)
                show_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    print_status "Starting Portainer deployment for LukBot..."
    
    # Check if required environment variables are set
    if [ -z "$PORTAINER_PASSWORD" ]; then
        print_error "PORTAINER_PASSWORD environment variable is required"
        exit 1
    fi
    
    if [ -z "$PORTAINER_STACK_ID" ]; then
        print_error "PORTAINER_STACK_ID environment variable is required"
        exit 1
    fi
    
    # Check if we're in the correct directory
    if [ ! -f "portainer-stack.yml" ]; then
        print_error "portainer-stack.yml not found. Run this script from the project root."
        exit 1
    fi
    
    # Get authentication token
    local token=$(get_portainer_token)
    
    # Update the stack
    update_portainer_stack "$token"
    
    # Check stack status
    check_stack_status "$token"
    
    print_success "Portainer deployment completed successfully!"
}

# Run main function with all arguments
main "$@"
