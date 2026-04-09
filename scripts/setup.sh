#!/usr/bin/env bash
set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        Project OS v1 — 环境初始化             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. 检查依赖 ──────────────────────────────────────
echo "📦 检查依赖..."

if ! command -v node &>/dev/null; then
  echo "❌ 未找到 Node.js，请先安装 Node.js 18+"
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Node.js 版本过低 (当前 $NODE_VERSION，需要 18+)"
  exit 1
fi
echo "✅ Node.js $(node --version)"

if ! command -v pnpm &>/dev/null; then
  echo "📥 安装 pnpm..."
  npm install -g pnpm
fi
echo "✅ pnpm $(pnpm --version)"

# ── 2. 安装依赖 ──────────────────────────────────────
echo ""
echo "📥 安装项目依赖..."
pnpm install

# ── 3. 安装 Playwright chromium ───────────────────────
echo ""
echo "🎭 安装 Playwright chromium..."
cd packages/local-agent && pnpm exec playwright install chromium 2>/dev/null || true && cd ../..

# ── 4. 配置环境变量 ───────────────────────────────────
echo ""
if [ ! -f "apps/web/.env.local" ]; then
  echo "⚙️  创建 apps/web/.env.local ..."
  cp .env.local.example apps/web/.env.local
  echo ""
  echo "  ┌─────────────────────────────────────────────────┐"
  echo "  │  ⚠️  请编辑 apps/web/.env.local 填入以下必填项：  │"
  echo "  │                                                   │"
  echo "  │    NEXT_PUBLIC_SUPABASE_URL=                      │"
  echo "  │    NEXT_PUBLIC_SUPABASE_ANON_KEY=                 │"
  echo "  │    SUPABASE_SERVICE_ROLE_KEY=                     │"
  echo "  │    ANTHROPIC_API_KEY=                             │"
  echo "  └─────────────────────────────────────────────────┘"
else
  echo "✅ apps/web/.env.local 已存在，跳过"
fi

if [ ! -f "packages/local-agent/.env" ]; then
  cat > packages/local-agent/.env << 'EOF'
# Local Agent 配置
LOCAL_AGENT_PORT=3001
WEB_APP_URL=http://localhost:3002
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
CHROME_CDP_URL=http://localhost:9222
OBSIDIAN_VAULT_PATH=
OBSIDIAN_FOLDER=Project OS
LOCAL_AGENT_SECRET=
EOF
  echo "✅ packages/local-agent/.env 已创建"
fi

# ── 5. 检查 Ollama ────────────────────────────────────
echo ""
echo "🦙 检查 Ollama..."
if command -v ollama &>/dev/null; then
  echo "✅ Ollama 已安装"
  echo "   拉取嵌入模型（如未安装）：ollama pull nomic-embed-text"
else
  echo "⚠️  未找到 Ollama（可选，用于本地嵌入）"
  echo "   安装：brew install ollama"
  echo "   启动：ollama serve"
  echo "   模型：ollama pull nomic-embed-text"
fi

# ── 6. 数据库迁移提示 ──────────────────────────────────
echo ""
echo "🗄️  数据库迁移："
echo "   1. 打开 Supabase 控制台 → SQL Editor"
echo "   2. 运行 supabase/migrations/001_initial_schema.sql"
echo "   3. 启用 pgvector 扩展（Extensions → vector）"
echo ""

echo "══════════════════════════════════════════════"
echo "✅ 初始化完成！运行以下命令启动："
echo ""
echo "   pnpm dev   (或 ./scripts/start-dev.sh)"
echo ""
echo "  Web App: http://localhost:3002"
echo "  Local Agent: http://localhost:3001"
echo "══════════════════════════════════════════════"
