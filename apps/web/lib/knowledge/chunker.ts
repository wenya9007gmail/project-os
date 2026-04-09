import { supabase } from '../supabase/server'
import type { ChunkType } from '../types'

const CHUNK_SIZE = 500      // chars per chunk
const CHUNK_OVERLAP = 80    // overlap between consecutive chunks

// ── Split text into overlapping chunks ────────────────────────────
function splitText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end).trim())
    if (end === text.length) break
    start += chunkSize - overlap
  }
  return chunks.filter(c => c.length > 10)
}

// ── Detect chunk type from content heuristics ─────────────────────
function detectChunkType(text: string): ChunkType {
  const lower = text.toLowerCase()
  if (lower.includes('总结') || lower.includes('conclusion') || lower.includes('结论')) return 'conclusion'
  if (lower.includes('步骤') || lower.includes('流程') || lower.includes('sop') || lower.includes('how to')) return 'sop'
  if (lower.includes('规则') || lower.includes('规范') || lower.includes('policy')) return 'rule'
  if (lower.includes('机会') || lower.includes('商机') || lower.includes('opportunity')) return 'opportunity'
  if (lower.includes('摘要') || lower.includes('summary') || lower.includes('概述')) return 'summary'
  return 'raw'
}

// ── Extract simple tags from text ─────────────────────────────────
function extractTags(text: string, sourceTitle?: string): string[] {
  const tags: string[] = []
  const keywords = [
    '变现', '自动化', '用户', '产品', 'MVP', '风险',
    '内容', '开发', '研究', '竞品', '数据', '流量',
    'AI', '工具', '平台', '市场', '运营',
  ]
  const lower = text.toLowerCase()
  keywords.forEach(kw => {
    if (lower.includes(kw.toLowerCase())) tags.push(kw)
  })
  if (sourceTitle) {
    // Add first 2 words of title as tags
    sourceTitle.split(/[\s,，。、]+/).slice(0, 2).forEach(w => {
      if (w.length > 1) tags.push(w)
    })
  }
  return [...new Set(tags)].slice(0, 8)
}

// ── Embed via local-agent Ollama ───────────────────────────────────
async function embedChunk(text: string): Promise<number[] | null> {
  try {
    const url = `${process.env.LOCAL_AGENT_URL ?? 'http://localhost:3001'}/embed`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const { embedding } = await res.json()
    return Array.isArray(embedding) ? embedding : null
  } catch {
    return null
  }
}

// ── MAIN: chunkAndEmbedSource ──────────────────────────────────────
export async function chunkAndEmbedSource(sourceId: string): Promise<{
  chunksCreated: number
  embedded: number
}> {
  const db = supabase()

  // Load source
  const { data: source, error } = await db
    .from('project_sources')
    .select('*')
    .eq('id', sourceId)
    .single()

  if (error || !source) throw new Error(`Source not found: ${sourceId}`)

  const text = source.content_raw as string
  const projectId = source.project_id as string
  const title = (source.source_title as string | null) ?? undefined

  const chunks = splitText(text)
  let embedded = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i]
    const chunkType = detectChunkType(chunkText)
    const tags = extractTags(chunkText, title)
    const embedding = await embedChunk(chunkText)

    await db.from('knowledge_chunks').insert({
      project_id: projectId,
      source_id: sourceId,
      title: title ?? null,
      chunk_text: chunkText,
      chunk_index: i,
      tags,
      chunk_type: chunkType,
      embedding: embedding ?? null,
    })

    if (embedding) embedded++
  }

  // Mark source as embedded
  await db
    .from('project_sources')
    .update({ embed_status: embedded > 0 ? 'done' : 'error' })
    .eq('id', sourceId)

  return { chunksCreated: chunks.length, embedded }
}

// ── Process all pending sources for a project ─────────────────────
export async function processAllPendingSources(projectId: string): Promise<void> {
  const db = supabase()
  const { data: sources } = await db
    .from('project_sources')
    .select('id')
    .eq('project_id', projectId)
    .eq('embed_status', 'pending')

  if (!sources) return

  for (const s of sources) {
    try {
      await chunkAndEmbedSource(s.id as string)
    } catch {
      await db
        .from('project_sources')
        .update({ embed_status: 'error' })
        .eq('id', s.id as string)
    }
  }
}
