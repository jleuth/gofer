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

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    log_info "Dependencies check passed"
}

# 1. Paths
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gofer"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"

log_info "Starting Gofer installation..."
log_info "Project directory: $PROJECT_DIR"
log_info "Install directory: $INSTALL_DIR"

# Check dependencies first
check_dependencies

# 2. Create dirs
log_info "Creating directories..."
mkdir -p "$INSTALL_DIR" "$SERVICE_DIR" "$BIN_DIR"

# 3. Sync project (skip node_modules)
log_info "Syncing project files..."
if command -v rsync &> /dev/null; then
    rsync -a --exclude 'node_modules' --exclude '.git' "$PROJECT_DIR/" "$INSTALL_DIR/"
else
    log_warn "rsync not found, using cp instead"
    cp -r "$PROJECT_DIR"/* "$INSTALL_DIR/"
    rm -rf "$INSTALL_DIR/node_modules" 2>/dev/null || true
fi

# 4. Install deps and build
log_info "Installing dependencies..."
cd "$INSTALL_DIR"
npm install

log_info "Building TypeScript..."
npm run build

# 5. Write user‐service unit
log_info "Creating systemd service..."
cat > "$SERVICE_DIR/gofer.service" <<EOF
[Unit]
Description=Gofer Node Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v node) $INSTALL_DIR/dist/daemon.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

# 6. Reload & start under your user
log_info "Starting systemd service..."
systemctl --user daemon-reload
systemctl --user enable gofer.service
systemctl --user start gofer.service

# Verify service started
if systemctl --user is-active --quiet gofer.service; then
    log_info "Gofer service started successfully"
else
    log_error "Failed to start Gofer service"
    log_info "Check service status with: systemctl --user status gofer.service"
    exit 1
fi

# 7. Install REPL wrapper
log_info "Installing REPL wrapper..."
cat > "$BIN_DIR/gofer" <<EOL
#!/usr/bin/env bash
exec node $INSTALL_DIR/dist/repl.js "\$@"
EOL
chmod +x "$BIN_DIR/gofer"

# 8. Done
log_info "Installed Gofer daemon (as $USER) and REPL at '$BIN_DIR/gofer'."
log_info "  Make sure '$BIN_DIR' is in your PATH."
log_info "  Service status: systemctl --user status gofer.service"
