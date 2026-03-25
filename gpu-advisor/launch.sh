#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GPU & LLM Infrastructure Advisor — Mac / Linux Launcher
# Double-click this file or run: bash launch.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIN_NODE_MAJOR=18

# ── Terminal title ────────────────────────────────────────────────────────────
echo -e "\033[1;36m"
echo "  ╔════════════════════════════════════════════╗"
echo "  ║   GPU & LLM Infrastructure Advisor         ║"
echo "  ║   India 2026 — Starting up...              ║"
echo "  ╚════════════════════════════════════════════╝"
echo -e "\033[0m"

# ── Check Node.js ─────────────────────────────────────────────────────────────
check_node() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
    if [ "$NODE_VER" -ge "$MIN_NODE_MAJOR" ]; then
      echo "  ✓ Node.js $(node --version) found"
      return 0
    else
      echo "  ✗ Node.js $(node --version) is too old (need v${MIN_NODE_MAJOR}+)"
      return 1
    fi
  fi
  return 1
}

# ── Install Node.js ───────────────────────────────────────────────────────────
install_node() {
  echo ""
  echo "  Node.js (v${MIN_NODE_MAJOR}+) is required but not installed."
  echo ""

  # Prompt user
  read -r -p "  Allow automatic Node.js installation? [Y/n]: " REPLY
  REPLY=${REPLY:-Y}
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo ""
    echo "  Please install Node.js manually from https://nodejs.org"
    echo "  Then run this script again."
    exit 1
  fi

  echo ""
  PLATFORM="$(uname -s)"

  if [ "$PLATFORM" = "Darwin" ]; then
    # macOS: try homebrew first, then nvm, then official installer
    if command -v brew &>/dev/null; then
      echo "  → Installing via Homebrew..."
      brew install node
    elif command -v nvm &>/dev/null || [ -s "$HOME/.nvm/nvm.sh" ]; then
      echo "  → Installing via nvm..."
      source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
      nvm install --lts
      nvm use --lts
    else
      echo "  → Downloading official Node.js installer for macOS..."
      TMP=$(mktemp -d)
      PKG="$TMP/node.pkg"
      curl -fsSL "https://nodejs.org/dist/latest-v20.x/node-v20.19.1.pkg" -o "$PKG"
      echo "  → Running installer (may ask for password)..."
      sudo installer -pkg "$PKG" -target /
      rm -rf "$TMP"
    fi

  elif [ "$PLATFORM" = "Linux" ]; then
    if command -v apt-get &>/dev/null; then
      echo "  → Installing via apt (may ask for sudo password)..."
      curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v dnf &>/dev/null; then
      echo "  → Installing via dnf..."
      sudo dnf module install -y nodejs:20
    elif command -v yum &>/dev/null; then
      echo "  → Installing via yum..."
      curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
      sudo yum install -y nodejs
    elif command -v pacman &>/dev/null; then
      echo "  → Installing via pacman..."
      sudo pacman -Sy --noconfirm nodejs npm
    else
      echo "  → Installing via nvm..."
      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
      export NVM_DIR="$HOME/.nvm"
      source "$NVM_DIR/nvm.sh"
      nvm install --lts
      nvm use --lts
    fi
  else
    echo "  ✗ Unsupported platform: $PLATFORM"
    echo "  Please install Node.js from https://nodejs.org"
    exit 1
  fi

  echo ""
  echo "  ✓ Node.js installed successfully!"
}

# ── Ensure nvm is loaded if it exists ────────────────────────────────────────
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
[ -s "$HOME/.profile"    ] && source "$HOME/.profile" 2>/dev/null || true

# ── Main flow ─────────────────────────────────────────────────────────────────
if ! check_node; then
  install_node
  # Re-check
  if ! check_node; then
    echo "  ✗ Node.js installation may have failed. Please restart your terminal and try again."
    exit 1
  fi
fi

echo "  → Starting advisor server..."
echo "  → Browser will open automatically at http://localhost:3131"
echo "  → Press Ctrl+C to stop"
echo ""

cd "$SCRIPT_DIR"
node server.js
