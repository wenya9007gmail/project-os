import { Router } from 'express'

export const embedRoute = Router()

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'

// POST /embed — generate embedding via Ollama
// Tries new /api/embed endpoint first, falls back to /api/embeddings
embedRoute.post('/', async (req, res) => {
  const { text } = req.body as { text?: string }
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' })
  }

  const trimmed = text.trim()

  // Try new API first (Ollama ≥ 0.3.6): POST /api/embed with { model, input }
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: trimmed }),
      signal: AbortSignal.timeout(15_000),
    })

    if (r.ok) {
      const data = await r.json() as { embeddings?: number[][]; embedding?: number[] }
      const embedding = data.embeddings?.[0] ?? data.embedding
      if (embedding) {
        return res.json({ embedding, model: EMBED_MODEL, dims: embedding.length })
      }
    }
  } catch { /* fall through to legacy */ }

  // Fall back to legacy API: POST /api/embeddings with { model, prompt }
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: trimmed }),
      signal: AbortSignal.timeout(15_000),
    })

    if (r.ok) {
      const data = await r.json() as { embedding: number[] }
      return res.json({ embedding: data.embedding, model: EMBED_MODEL, dims: data.embedding.length })
    }

    const err = await r.text()
    return res.status(500).json({ error: `Ollama error (${r.status}): ${err}` })
  } catch (e) {
    const msg = (e as Error).message
    console.error('[embed] Error:', msg)
    return res.status(500).json({
      error: `Embedding failed: ${msg}. Ollama 是否在运行？Run: ollama serve`,
    })
  }
})

// GET /embed/health — check Ollama + model availability
embedRoute.get('/health', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    })
    if (!r.ok) return res.json({ ok: false, error: 'Ollama 无响应' })

    const { models } = await r.json() as { models: Array<{ name: string }> }
    const modelNames = models.map(m => m.name)
    const hasModel = modelNames.some(n => n.startsWith(EMBED_MODEL))

    return res.json({
      ok: hasModel,
      ollama: true,
      model: EMBED_MODEL,
      modelFound: hasModel,
      availableModels: modelNames,
      hint: hasModel ? null : `模型未找到，请运行: ollama pull ${EMBED_MODEL}`,
    })
  } catch (e) {
    return res.json({ ok: false, ollama: false, error: (e as Error).message })
  }
})
