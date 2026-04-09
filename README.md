# Project OS v1 — 项目分析中枢

> AI驱动的项目全生命周期分析平台：输入项目资料 → AI深度分析 → 输出三份可执行任务包

## 核心功能

- **AI分析引擎**：Claude 3.5 Sonnet 两轮分析，输出置信度评分、变现路径、风险识别、MVP建议
- **自动化地图**：对工作流中每个节点评估自动化可行性（全自动/半自动/人工）
- **三类任务包**：开发助手包、内容助手包、研究助手包（Markdown格式，可直接给AI使用）
- **信息缺口填充**：自动通过 Jina Reader / Tavily 补充公开信息缺口
- **登录态采集**：Chrome扩展 + 本地代理，采集需登录才能访问的页面内容
- **向量知识库**：Ollama 本地嵌入 + Supabase pgvector，项目级语义检索
- **Obsidian同步**：分析报告自动写入 Obsidian 笔记库

## 技术架构

```
apps/web          Next.js 14 + TypeScript + Tailwind  (localhost:3002)
packages/local-agent   Express + Playwright            (localhost:3001)
packages/chrome-extension  MV3 采集助手
supabase/         数据库迁移脚本
```

## 快速开始

### 1. 环境要求

- Node.js 18+
- pnpm 8+
- Supabase 账号（免费）
- Anthropic API Key
- Ollama（本地嵌入，可选）

### 2. 初始化

```bash
git clone <repo>
cd project-os
./scripts/setup.sh
```

### 3. 配置环境变量

编辑 `apps/web/.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...

# 可选
JINA_API_KEY=jina_...
TAVILY_API_KEY=tvly-...
OBSIDIAN_VAULT_PATH=/Users/你的用户名/Documents/ObsidianVault
```

### 4. 数据库迁移

1. 打开 [Supabase Dashboard](https://supabase.com/dashboard)
2. 进入项目 → SQL Editor
3. 粘贴并执行 `supabase/migrations/001_initial_schema.sql`
4. 在 Extensions 中启用 `vector`

### 5. 启动

```bash
./scripts/start-dev.sh
# 或
pnpm dev
```

访问 http://localhost:3002

### 6. 安装Ollama（本地嵌入）

```bash
brew install ollama
ollama serve
ollama pull nomic-embed-text
```

### 7. 安装Chrome扩展（登录态采集）

1. Chrome → 扩展程序 → 开发者模式
2. 加载已解压的扩展程序 → 选择 `packages/chrome-extension`
3. 复制扩展ID，运行：
   ```bash
   ./scripts/install-native-host.sh <extension-id>
   ```

## 使用流程

1. **新建项目** → 填写名称、类型、目标
2. **添加资料** → 粘贴竞品分析、产品介绍、用户调研、市场数据
3. **开始分析** → AI自动分析，约30-60秒
4. **查看报告** → 概览 / 自动化地图 / 三类任务包
5. **下载任务包** → 直接发给 Claude/GPT 执行具体任务

## 项目结构

```
project-os/
├── apps/
│   └── web/                    # Next.js 前端 + API
│       ├── app/                # App Router 页面
│       ├── components/         # React 组件
│       └── lib/
│           ├── ai/             # 分析引擎、Prompt、Handoff生成
│           ├── knowledge/      # 文本分块 + 向量嵌入
│           ├── obsidian/       # Obsidian 写入
│           ├── supabase/       # 数据库客户端
│           └── types/          # TypeScript 类型
├── packages/
│   ├── local-agent/            # Express 本地服务（:3001）
│   │   └── src/routes/
│   │       ├── embed.ts        # Ollama 嵌入
│   │       ├── capture.ts      # Playwright 采集
│   │       └── obsidian.ts     # 直接写入 vault
│   └── chrome-extension/       # MV3 浏览器扩展
├── supabase/
│   └── migrations/             # SQL 迁移文件
└── scripts/
    ├── setup.sh                # 一键初始化
    ├── start-dev.sh            # 启动开发环境
    └── install-native-host.sh  # 安装 Native Messaging Host
```

## 数据表

| 表名 | 说明 |
|------|------|
| projects | 项目基本信息 |
| project_sources | 项目资料（原始文本） |
| project_analysis | AI分析结果（JSON） |
| project_handoffs | 三类任务包 |
| project_logs | 操作日志 |
| capture_tasks | 登录态采集任务队列 |
| knowledge_chunks | 文本分块（含向量） |

## 许可证

MIT
