#!/usr/bin/env bash
set -euo pipefail

REPO="benedyktdryl/threaddy"
BINARY_NAME="threaddy"
INSTALL_DIR="${THREADDY_INSTALL_DIR:-/usr/local/bin}"

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  ARTIFACT="threaddy-macos-arm64" ;;
      x86_64) ARTIFACT="threaddy-macos-x64" ;;
      *)      echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64)  ARTIFACT="threaddy-linux-x64" ;;
      aarch64) ARTIFACT="threaddy-linux-arm64" ;;
      arm64)   ARTIFACT="threaddy-linux-arm64" ;;
      *)       echo "Unsupported Linux architecture: $ARCH" >&2; exit 1 ;;
    esac
    ;;
  *)
    echo "Unsupported OS: $OS. Build from source: https://github.com/$REPO" >&2
    exit 1
    ;;
esac

# Resolve version
VERSION="${THREADDY_VERSION:-}"
if [ -z "$VERSION" ]; then
  echo "Fetching latest release..."
  VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
fi

if [ -z "$VERSION" ]; then
  echo "Could not determine latest version. Set THREADDY_VERSION explicitly." >&2
  exit 1
fi

URL="https://github.com/$REPO/releases/download/$VERSION/$ARTIFACT"

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "Downloading Threaddy $VERSION ($ARTIFACT)..."
curl -fsSL --progress-bar "$URL" -o "$TMP"
chmod +x "$TMP"

# Verify it runs
if ! "$TMP" --help >/dev/null 2>&1; then
  echo "Downloaded binary failed self-test. Check the release for your platform." >&2
  exit 1
fi

# Install
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP" "$INSTALL_DIR/$BINARY_NAME"
else
  echo "Installing to $INSTALL_DIR requires sudo..."
  sudo mv "$TMP" "$INSTALL_DIR/$BINARY_NAME"
fi

echo ""
echo "Threaddy $VERSION installed to $INSTALL_DIR/$BINARY_NAME"
echo ""
echo "Get started:"
echo "  threaddy init     # create config"
echo "  threaddy serve    # start the web UI at http://localhost:4821"
