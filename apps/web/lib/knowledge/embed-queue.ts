/**
 * embed-queue.ts — Embedding 异步队列
 *
 * 职责：
 *  1. 从 Supabase 读取 embed_status = 'pending' 的 project_sources
 *  2. 对每条记录拆块、调用 local-agent /embed 生成向量
 *  3. 将结果写入 knowledge_chunks，更新 source embed_status
 *
 * 使用方式：
 *  - 单次处理：await processEmbedQueue()
 *  - 触发单条：await enqueueSource(sourceId)
 *  - 定时调用：在 Next.js API route 里触发，或挂 cron
 */

import { supabase } from '@/lib/supabase/server'

const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL ?? 'http://localhost:3001'
const CHUNK_SIZE = 500       // 约 500 词 / 块
const CHUNK_OVERLAP = 60     // 重叠词数，保留上下文连贯性
const BATCH_SIZE = 5         // 每次处理的 source 条数

// ── 文本分块 ──────────────────────────────────────────────────────────

function splitText(text: string): string[] {
  const words = text.trim().split(/\s+/)
  const chunks: string[] = []
  let start = 0

  while (start < words.length) {
    const end = Math.min(start + CHUNK_SIZE, words.length)
    const chunk = words.slice(start, end).join(' ')
    if (chunk.length > 30) chunks.push(chunk)
    if (end >= words.length) break
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

// ── 调用 local-agent 生成 embedding ──────────────────────────────────

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${LOCAL_AGENT_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const { embedding } = (await res.json()) as { embedding: number[] }
    return Array.isArray(embedding) ? embedding : null
  } catch {
    return null
  }
}

// ── 处理单条 source ────────────────────────────────────────────────────

export async function embedSource(sourceId: string): Promise<{
  stored: number
  errors: string[]
  skipped: boolean
}> {
  const db = supabase()
  const errors: string[] = []
  let stored = 0

  // 读取 source
  const { data: source, error: fetchErr } = await db
    .from('project_sources')
    .select('id, project_id, source_title, content_raw, embed_status')
    .eq('id', sourceId)
    .single()

  if (fetchErr || !source) return { stored: 0, errors: [`Source ${sourceId} 不存在`], skipped: true }
  if (source.embed_status === 'done') return { stored: 0, errors: [], skipped: true }

  // 标记处理中
  await db.from('project_sources').update({ embed_status: 'pending' }).eq('id', sourceId)

  const chunks = splitText(source.content_raw ?? '')
  if (chunks.length === 0) {
    await db.from('project_sources').update({ embed_status: 'done' }).eq('id', sourceId)
    return { stored: 0, errors: [], skipped: false }
  }

  // 清除旧 chunks（重跑时避免重复）
  await db.from('knowledge_chunks').delete().eq('source_id', sourceId)

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await getEmbedding(chunks[i])
    if (!embedding) {
      errors.push(`chunk[${i}] embedding 失败`)
      continue
    }

    const { error: insertErr } = await db.from('knowledge_chunks').insert({
      project_id: source.project_id ?? null,
      source_id: sourceId,
      title: source.source_title ?? null,
      chunk_text: chunks[i],
      chunk_index: i,
      tags: [],
      chunk_type: 'raw',
      embedding,
      embed_status: 'done',
      updated_at: new Date().toISOString(),
    })

    if (insertErr) {
      errors.push(`chunk[${i}] 写入失败: ${insertErr.message}`)
    } else {
      stored++
    }
  }

  // 更新 source 状态
  const finalStatus = stored > 0 ? 'done' : 'error'
  await db.from('project_sources').update({ embed_status: finalStatus }).eq('id', sourceId)

  return { stored, errors, skipped: false }
}

// ── 批量处理队列 ──────────────────────────────────────────────────────

export async function processEmbedQueue(limit = BATCH_SIZE): Promise<{
  processed: number
  total_stored: number
  errors: Array<{ source_id: string; errors: string[] }>
}> {
  const db = supabase()

  // 取 pending 的 sources
  const { data: pending } = await db
    .from('project_sources')
    .select('id')
    .eq('embed_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!pending || pending.length === 0) {
    return { processed: 0, total_stored: 0, errors: [] }
  }

  let totalStored = 0
  const allErrors: Array<{ source_id: string; errors: string[] }> = []

  for (const { id } of pending) {
    const result = await embedSource(id)
    if (!result.skipped) {
      totalStored += result.stored
      if (result.errors.length > 0) {
        allErrors.push({ source_id: id, errors: result.errors })
      }
    }
  }

  return { processed: pending.length, total_stored: totalStored, errors: allErrors }
}

/**
 * 手动触发单条 source 的 embedding（可在 API route 里调用）
 */
export async function enqueueSource(sourceId: string): Promise<void> {
  const db = supabase()
  await db
    .from('project_sources')
    .update({ embed_status: 'pending' })
    .eq('id', sourceId)
}
