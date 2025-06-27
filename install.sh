#!/usr/bin/env bash
set -euo pipefail

# 1. Paths
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gofer"
SERVICE_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
BIN_DIR="${XDG_BIN_HOME:-$HOME/.local/bin}"

# 2. Create dirs
mkdir -p "$INSTALL_DIR" "$SERVICE_DIR" "$BIN_DIR"

# 3. Sync project (skip node_modules)
rsync -a --exclude 'node_modules' "$PROJECT_DIR/" "$INSTALL_DIR/"

# 4. Install deps
cd "$INSTALL_DIR"
npm install

# 5. Write user‐service unit
cat > "$SERVICE_DIR/gofer.service" <<EOF
[Unit]
Description=Gofer Node Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v npx) ts-node $INSTALL_DIR/src/daemon.ts
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

# 6. Reload & start under your user
systemctl --user daemon-reload
systemctl --user enable gofer.service
systemctl --user start gofer.service

# 7. Install REPL wrapper
cat > "$BIN_DIR/gofer" <<EOL
#!/usr/bin/env bash
exec node $INSTALL_DIR/src/repl.ts "\$@"
EOL
chmod +x "$BIN_DIR/gofer"

# 8. Done
echo "✔ Installed Gofer daemon (as $USER) and REPL at '$BIN_DIR/gofer'."
echo "  Make sure '$BIN_DIR' is in your PATH."
