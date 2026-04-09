import express from 'express'
import cors from 'cors'
import { embedRoute } from './routes/embed'
import { captureRoute } from './routes/capture'
import { obsidianRoute } from './routes/obsidian'
import { startNativeBridge } from './browser/native-bridge'
import { checkOllamaHealth } from './knowledge/embedder'

const app = express()
const PORT = process.env.LOCAL_AGENT_PORT ? parseInt(process.env.LOCAL_AGENT_PORT) : 3001
const WEB_APP_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3002',
]

app.use(cors({ origin: WEB_APP_ORIGINS }))
app.use(express.json({ limit: '10mb' }))

// ── Health check（包含 Ollama 状态） ──────────────────────────────────
app.get('/health', async (_req, res) => {
  const ollama = await checkOllamaHealth().catch(() => ({ ok: false, model: 'unknown', error: 'check failed' }))
  res.json({
    status: 'ok',
    version: '1.0.0',
    port: PORT,
    ollama,
    chrome_cdp: process.env.CHROME_CDP_URL ?? 'http://localhost:9222',
  })
})

// ── Routes ────────────────────────────────────────────────────────────
app.use('/embed', embedRoute)
app.use('/capture', captureRoute)
app.use('/obsidian', obsidianRoute)

// ── 启动 ──────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[local-agent] 运行在 http://localhost:${PORT}`)
  console.log(`[local-agent] Ollama: ${process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'}`)
  console.log(`[local-agent] Chrome CDP: ${process.env.CHROME_CDP_URL ?? 'http://localhost:9222'}`)
  console.log(`[local-agent] Web App: ${process.env.WEB_APP_URL ?? 'http://localhost:3002'}`)

  // 启动 Native Messaging Bridge（仅在被 Chrome 调起时生效）
  startNativeBridge()
})

process.on('unhandledRejection', (reason) => {
  console.error('[local-agent] Unhandled rejection:', reason)
})
