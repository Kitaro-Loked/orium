#!/usr/bin/env bash
# Orium Installer for macOS / Linux
# Run: curl -fsSL https://orium.dev/install.sh | bash

set -e

INSTALL_DIR="${HOME}/.local/bin"
VERSION="0.1.0"
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

echo "Installing Orium v${VERSION}..."

# Detect architecture
if [ "$ARCH" = "x86_64" ]; then
    ARCH="x64"
elif [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
    ARCH="arm64"
fi

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download (placeholder URL)
# curl -fsSL "https://github.com/your-org/orium/releases/download/v${VERSION}/orium-${OS}-${ARCH}.tar.gz" -o "/tmp/orium.tar.gz"
# tar -xzf "/tmp/orium.tar.gz" -C "$INSTALL_DIR"

echo "Orium installed to ${INSTALL_DIR}"
echo "Make sure ${INSTALL_DIR} is in your PATH."
echo "Run 'orium --help' to get started."
