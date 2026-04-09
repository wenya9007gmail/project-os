#!/usr/bin/env bash
# Install Chrome Native Messaging Host for local-agent
set -e

EXTENSION_ID="${1:-}"
if [ -z "$EXTENSION_ID" ]; then
  echo "Usage: ./scripts/install-native-host.sh <chrome-extension-id>"
  echo "Example: ./scripts/install-native-host.sh abcdefghijklmnopabcdefghijklmnop"
  exit 1
fi

HOST_NAME="com.projectos.localagent"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
AGENT_PATH="$PROJECT_ROOT/packages/local-agent"

# Build the agent first
echo "🔨 构建 local-agent..."
cd "$AGENT_PATH" && pnpm build && cd "$PROJECT_ROOT"

MANIFEST_CONTENT=$(cat << EOF
{
  "name": "$HOST_NAME",
  "description": "Project OS Local Agent",
  "path": "$AGENT_PATH/dist/index.js",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
)

# macOS: install to ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
NATIVE_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$NATIVE_HOST_DIR"

MANIFEST_PATH="$NATIVE_HOST_DIR/$HOST_NAME.json"
echo "$MANIFEST_CONTENT" > "$MANIFEST_PATH"

echo "✅ Native Messaging Host 已安装"
echo "   路径：$MANIFEST_PATH"
echo "   扩展ID：$EXTENSION_ID"
echo ""
echo "重启 Chrome 后生效"
