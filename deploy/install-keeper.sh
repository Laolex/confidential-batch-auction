#!/usr/bin/env bash
# Works whether run from inside the repo (deploy/ next to keeper/)
# or from a flat VPS directory where keeper files and service file are co-located.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Detect layout: repo (has ../keeper/) vs flat VPS dir (src/ is here)
if [ -d "$SCRIPT_DIR/../keeper" ]; then
  KEEPER_DIR="$(cd "$SCRIPT_DIR/../keeper" && pwd)"
  SERVICE_FILE="$SCRIPT_DIR/cba-keeper.service"
elif [ -f "$SCRIPT_DIR/src/index.ts" ]; then
  KEEPER_DIR="$SCRIPT_DIR"
  SERVICE_FILE="$SCRIPT_DIR/cba-keeper.service"
else
  echo "ERROR: Cannot locate keeper source. Run from deploy/ or the keeper directory."
  exit 1
fi

echo "=== CBA Keeper install ==="
echo "Keeper dir: $KEEPER_DIR"

if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found."
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  exit 1
fi
echo "Node: $(node --version)"

if [ ! -f "$KEEPER_DIR/.env" ]; then
  echo "ERROR: $KEEPER_DIR/.env not found. Copy .env.example and fill in keys."
  exit 1
fi

# Patch service file paths to match actual keeper location
sed -i "s|WorkingDirectory=.*|WorkingDirectory=$KEEPER_DIR|" "$SERVICE_FILE"
sed -i "s|EnvironmentFile=.*|EnvironmentFile=$KEEPER_DIR/.env|" "$SERVICE_FILE"

cd "$KEEPER_DIR"
echo "Installing dependencies..."
npm ci || npm install
echo "Building TypeScript..."
npx tsc

echo "Installing systemd unit..."
sudo cp "$SERVICE_FILE" /etc/systemd/system/cba-keeper.service
sudo systemctl daemon-reload
sudo systemctl enable cba-keeper
sudo systemctl restart cba-keeper

echo ""
echo "=== Done ==="
echo "Status: sudo systemctl status cba-keeper"
echo "Logs:   sudo journalctl -u cba-keeper -f"
