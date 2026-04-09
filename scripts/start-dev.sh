#!/usr/bin/env bash
set -e

echo ""
echo "🚀 启动 Project OS 开发环境..."
echo ""

# 检查 .env.local
if [ ! -f "apps/web/.env.local" ]; then
  echo "❌ 缺少 apps/web/.env.local，请先运行 ./scripts/setup.sh"
  exit 1
fi

# 启动 Ollama（如果未运行）
if command -v ollama &>/dev/null; then
  if ! pgrep -x "ollama" > /dev/null 2>&1; then
    echo "🦙 启动 Ollama..."
    ollama serve &>/tmp/ollama.log &
    sleep 2
    echo "✅ Ollama 已启动"
  else
    echo "✅ Ollama 已在运行"
  fi
fi

echo ""
echo "  Web App:     http://localhost:3002"
echo "  Local Agent: http://localhost:3001"
echo ""
echo "  按 Ctrl+C 停止"
echo ""

# 使用 Turbo 并发启动所有服务
pnpm dev
