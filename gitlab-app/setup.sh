#!/bin/bash

# Claude GitLab App Setup Script
# This script helps you configure the application for first-time use

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "${BLUE}"
    echo "=================================================="
    echo "         Claude GitLab App Setup"
    echo "=================================================="
    echo -e "${NC}"
}

print_step() {
    echo -e "\n${GREEN}➤ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

prompt_input() {
    local prompt="$1"
    local default="$2"
    local secret="$3"
    
    if [ -n "$default" ]; then
        echo -n "$prompt [$default]: "
    else
        echo -n "$prompt: "
    fi
    
    if [ "$secret" = "true" ]; then
        read -s input
        echo
    else
        read input
    fi
    
    if [ -z "$input" ] && [ -n "$default" ]; then
        input="$default"
    fi
    
    echo "$input"
}

generate_secret() {
    openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64
}

check_dependencies() {
    print_step "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        missing_deps+=("docker-compose")
    fi
    
    if ! command -v openssl &> /dev/null; then
        print_warning "OpenSSL not found. Will use /dev/urandom for secret generation."
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "Missing required dependencies: ${missing_deps[*]}"
        echo "Please install them and run this script again."
        exit 1
    fi
    
    print_success "All dependencies found"
}

setup_env_file() {
    print_step "Setting up environment configuration..."
    
    if [ -f "$ENV_FILE" ]; then
        echo -n "Environment file already exists. Overwrite? (y/N): "
        read overwrite
        if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
            print_warning "Keeping existing .env file"
            return
        fi
    fi
    
    # Copy example file
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    
    echo -e "\n${BLUE}Please provide the following configuration:${NC}\n"
    
    # App URL
    app_url=$(prompt_input "App URL (where your app will be accessible)" "http://localhost:3000")
    sed -i.bak "s|APP_URL=.*|APP_URL=$app_url|" "$ENV_FILE"
    
    # GitLab URL
    gitlab_url=$(prompt_input "GitLab URL" "https://gitlab.com")
    sed -i.bak "s|GITLAB_URL=.*|GITLAB_URL=$gitlab_url|" "$ENV_FILE"
    
    # GitLab OAuth
    echo -e "\n${YELLOW}GitLab OAuth Configuration:${NC}"
    echo "Create a GitLab application at: $gitlab_url/-/profile/applications"
    echo "Redirect URI should be: $app_url/auth/callback"
    echo "Required scopes: api, read_user, read_repository"
    echo
    
    gitlab_app_id=$(prompt_input "GitLab Application ID")
    gitlab_app_secret=$(prompt_input "GitLab Application Secret" "" "true")
    
    sed -i.bak "s|GITLAB_APP_ID=.*|GITLAB_APP_ID=$gitlab_app_id|" "$ENV_FILE"
    sed -i.bak "s|GITLAB_APP_SECRET=.*|GITLAB_APP_SECRET=$gitlab_app_secret|" "$ENV_FILE"
    sed -i.bak "s|GITLAB_REDIRECT_URI=.*|GITLAB_REDIRECT_URI=$app_url/auth/callback|" "$ENV_FILE"
    
    # Claude API
    echo -e "\n${YELLOW}Claude API Configuration:${NC}"
    echo "Choose your Claude API method:"
    echo "1) Direct Anthropic API (recommended)"
    echo "2) Claude Code OAuth Token"
    echo -n "Selection (1-2): "
    read claude_choice
    
    if [ "$claude_choice" = "2" ]; then
        claude_token=$(prompt_input "Claude Code OAuth Token" "" "true")
        sed -i.bak "s|# CLAUDE_CODE_OAUTH_TOKEN=.*|CLAUDE_CODE_OAUTH_TOKEN=$claude_token|" "$ENV_FILE"
        sed -i.bak "s|ANTHROPIC_API_KEY=.*|# ANTHROPIC_API_KEY=your_anthropic_api_key|" "$ENV_FILE"
    else
        anthropic_key=$(prompt_input "Anthropic API Key" "" "true")
        sed -i.bak "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$anthropic_key|" "$ENV_FILE"
    fi
    
    # Generate secrets
    print_step "Generating security secrets..."
    session_secret=$(generate_secret)
    encryption_key=$(generate_secret)
    
    sed -i.bak "s|SESSION_SECRET=.*|SESSION_SECRET=$session_secret|" "$ENV_FILE"
    sed -i.bak "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$encryption_key|" "$ENV_FILE"
    
    # Cloudflare Tunnel (optional)
    echo -e "\n${YELLOW}Cloudflare Tunnel (optional):${NC}"
    echo "Cloudflare Tunnel provides secure public access without port forwarding."
    echo -n "Do you want to configure Cloudflare Tunnel? (y/N): "
    read use_tunnel
    
    if [ "$use_tunnel" = "y" ] || [ "$use_tunnel" = "Y" ]; then
        tunnel_token=$(prompt_input "Cloudflare Tunnel Token" "" "true")
        sed -i.bak "s|# CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$tunnel_token|" "$ENV_FILE"
        
        # Update compose profiles
        sed -i.bak "s|# COMPOSE_PROFILES=.*|COMPOSE_PROFILES=tunnel|" "$ENV_FILE"
    fi
    
    # Remove backup file
    rm -f "$ENV_FILE.bak"
    
    print_success "Environment configuration saved to .env"
}

create_directories() {
    print_step "Creating required directories..."
    
    mkdir -p "$SCRIPT_DIR/data"
    mkdir -p "$SCRIPT_DIR/logs"
    mkdir -p "$SCRIPT_DIR/config"
    
    print_success "Directories created"
}

build_and_start() {
    print_step "Building and starting services..."
    
    cd "$SCRIPT_DIR"
    
    # Determine compose profiles
    profiles=""
    if grep -q "COMPOSE_PROFILES=" "$ENV_FILE"; then
        profiles=$(grep "COMPOSE_PROFILES=" "$ENV_FILE" | cut -d'=' -f2 | sed 's/^#//')
        if [ -n "$profiles" ]; then
            export COMPOSE_PROFILES="$profiles"
        fi
    fi
    
    # Build and start
    if [ -n "$profiles" ]; then
        print_success "Using profiles: $profiles"
        docker-compose --profile "$profiles" up -d --build
    else
        docker-compose up -d --build
    fi
    
    print_success "Services started successfully"
}

show_completion() {
    print_step "Setup completed!"
    
    # Get app URL from env file
    app_url=$(grep "APP_URL=" "$ENV_FILE" | cut -d'=' -f2)
    
    echo -e "\n${GREEN}🎉 Your Claude GitLab App is ready!${NC}\n"
    echo "📍 App URL: $app_url"
    echo "📊 Health Check: $app_url/health"
    echo -e "\n${BLUE}Next Steps:${NC}"
    echo "1. Visit your app URL and login with GitLab"
    echo "2. Go to Dashboard and load your GitLab projects"
    echo "3. Enable Claude for the projects you want to use"
    echo "4. Mention @claude in issue/MR comments to get help"
    
    echo -e "\n${BLUE}Useful Commands:${NC}"
    echo "• View logs: docker-compose logs -f"
    echo "• Stop services: docker-compose down"
    echo "• Restart: docker-compose restart"
    echo "• Update: git pull && docker-compose up -d --build"
    
    echo -e "\n${YELLOW}Need help? Check the README.md file or create an issue on GitHub.${NC}"
}

main() {
    print_header
    
    check_dependencies
    setup_env_file
    create_directories
    build_and_start
    show_completion
    
    echo -e "\n${GREEN}Setup completed successfully! 🚀${NC}"
}

# Check if running as root (not recommended)
if [ "$EUID" -eq 0 ]; then
    print_warning "Running as root is not recommended for security reasons."
    echo -n "Continue anyway? (y/N): "
    read continue_root
    if [ "$continue_root" != "y" ] && [ "$continue_root" != "Y" ]; then
        exit 1
    fi
fi

# Run main function
main "$@"