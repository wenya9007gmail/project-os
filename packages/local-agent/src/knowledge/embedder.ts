/**
 * embedder.ts — Ollama Embedding 生成器
 *
 * 调用本地 Ollama 服务（默认 nomic-embed-text 模型）生成文本向量。
 * 同时负责将 embedding 写入 Supabase knowledge_chunks 表。
 */

import { createClient } from '@supabase/supabase-js'

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text'

// ── Supabase client（server-side） ────────────────────────────────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase 环境变量未配置（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）')
  return createClient(url, key)
}

// ── 核心：生成 embedding ──────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text.trim()) throw new Error('text 不能为空')

  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text.trim() }),
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Ollama 返回错误 ${res.status}: ${err}`)
  }

  const data = (await res.json()) as { embedding: number[] }
  if (!Array.isArray(data.embedding) || data.embedding.length === 0) {
    throw new Error('Ollama 返回的 embedding 为空')
  }
  return data.embedding
}

// ── 文本分块 ──────────────────────────────────────────────────────────

const CHUNK_SIZE  = 512  // tokens 约估：1 token ≈ 4 chars
const CHUNK_OVERLAP = 64

export function splitIntoChunks(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const words = text.split(/\s+/)
  const chunks: string[] = []
  let start = 0

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length)
    chunks.push(words.slice(start, end).join(' '))
    if (end >= words.length) break
    start += chunkSize - overlap
  }

  return chunks.filter(c => c.trim().length > 20)
}

// ── 写入 knowledge_chunks ────────────────────────────────────────────

export interface ChunkInput {
  project_id: string | null
  source_id: string
  title?: string
  chunk_type?: 'raw' | 'summary' | 'rule' | 'sop' | 'opportunity' | 'conclusion'
  tags?: string[]
}

export async function embedAndStore(
  text: string,
  input: ChunkInput
): Promise<{ stored: number; errors: string[] }> {
  const supabase = getSupabase()
  const chunks = splitIntoChunks(text)
  const errors: string[] = []
  let stored = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    try {
      const embedding = await generateEmbedding(chunk)

      const { error } = await supabase.from('knowledge_chunks').insert({
        project_id: input.project_id ?? null,
        source_id: input.source_id,
        title: input.title ?? null,
        chunk_text: chunk,
        chunk_index: i,
        tags: input.tags ?? [],
        chunk_type: input.chunk_type ?? 'raw',
        embedding,
        embed_status: 'done',
        updated_at: new Date().toISOString(),
      })

      if (error) {
        errors.push(`chunk[${i}]: ${error.message}`)
      } else {
        stored++
      }
    } catch (e) {
      errors.push(`chunk[${i}] embedding 失败: ${(e as Error).message}`)
    }
  }

  // 更新 source embed_status
  if (errors.length === 0) {
    await supabase
      .from('project_sources')
      .update({ embed_status: 'done' })
      .eq('id', input.source_id)
  } else if (stored === 0) {
    await supabase
      .from('project_sources')
      .update({ embed_status: 'error' })
      .eq('id', input.source_id)
  }

  return { stored, errors }
}

/** 检查 Ollama 是否在线 */
export async function checkOllamaHealth(): Promise<{ ok: boolean; model: string; error?: string }> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = (await res.json()) as { models?: Array<{ name: string }> }
    const models = (data.models ?? []).map(m => m.name)
    const modelAvailable = models.some(m => m.includes(EMBED_MODEL.split(':')[0]))
    if (!modelAvailable) {
      return {
        ok: false,
        model: EMBED_MODEL,
        error: `模型 ${EMBED_MODEL} 未找到。请运行: ollama pull ${EMBED_MODEL}`,
      }
    }
    return { ok: true, model: EMBED_MODEL }
  } catch (e) {
    return {
      ok: false,
      model: EMBED_MODEL,
      error: `Ollama 不可用: ${(e as Error).message}。请运行: ollama serve`,
    }
  }
}
