#!/usr/bin/env bash
set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Paths (same as install script)
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gofer"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"
SERVICE_FILE="$SERVICE_DIR/gofer.service"
REPL_BINARY="$BIN_DIR/gofer"

# Confirmation function
confirm() {
    local prompt="$1"
    local response
    
    while true; do
        read -p "$prompt [y/N]: " response
        case $response in
            [Yy]* ) return 0;;
            [Nn]* | "" ) return 1;;
            * ) echo "Please answer yes or no.";;
        esac
    done
}

# Main uninstall function
uninstall_gofer() {
    log_info "Starting Gofer uninstallation..."
    
    # Stop and disable systemd service
    log_info "Stopping systemd service..."
    if systemctl --user is-active --quiet gofer.service 2>/dev/null; then
        systemctl --user stop gofer.service
        log_info "Gofer service stopped"
    else
        log_warn "Gofer service was not running"
    fi
    
    if systemctl --user is-enabled --quiet gofer.service 2>/dev/null; then
        systemctl --user disable gofer.service
        log_info "Gofer service disabled"
    else
        log_warn "Gofer service was not enabled"
    fi
    
    # Remove systemd service file
    if [[ -f "$SERVICE_FILE" ]]; then
        rm -f "$SERVICE_FILE"
        log_info "Removed systemd service file"
        systemctl --user daemon-reload
    else
        log_warn "Systemd service file not found"
    fi
    
    # Remove installation directory
    if [[ -d "$INSTALL_DIR" ]]; then
        rm -rf "$INSTALL_DIR"
        log_info "Removed installation directory: $INSTALL_DIR"
    else
        log_warn "Installation directory not found: $INSTALL_DIR"
    fi
    
    # Remove REPL wrapper binary
    if [[ -f "$REPL_BINARY" ]]; then
        rm -f "$REPL_BINARY"
        log_info "Removed REPL wrapper: $REPL_BINARY"
    else
        log_warn "REPL wrapper not found: $REPL_BINARY"
    fi
    
    log_info "Gofer has been completely uninstalled"
}

# Check if anything is installed
check_installation() {
    local found_something=false
    
    if [[ -d "$INSTALL_DIR" ]]; then
        log_info "Found installation directory: $INSTALL_DIR"
        found_something=true
    fi
    
    if [[ -f "$SERVICE_FILE" ]]; then
        log_info "Found systemd service file: $SERVICE_FILE"
        found_something=true
    fi
    
    if [[ -f "$REPL_BINARY" ]]; then
        log_info "Found REPL wrapper: $REPL_BINARY"
        found_something=true
    fi
    
    if systemctl --user is-active --quiet gofer.service 2>/dev/null; then
        log_info "Gofer service is currently running"
        found_something=true
    fi
    
    if ! $found_something; then
        log_info "No Gofer installation found"
        exit 0
    fi
}

# Main execution
main() {
    echo "Gofer Uninstaller"
    echo "================="
    echo
    
    # Check what's installed
    check_installation
    
    echo
    log_warn "This will completely remove Gofer from your system:"
    log_warn "  - Stop and disable the systemd service"
    log_warn "  - Remove installation directory: $INSTALL_DIR"
    log_warn "  - Remove systemd service file: $SERVICE_FILE"
    log_warn "  - Remove REPL wrapper: $REPL_BINARY"
    echo
    
    if confirm "Are you sure you want to uninstall Gofer?"; then
        echo
        uninstall_gofer
    else
        log_info "Uninstallation cancelled"
        exit 0
    fi
}

# Run main function
main "$@"