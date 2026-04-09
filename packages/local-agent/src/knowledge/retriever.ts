/**
 * retriever.ts — pgvector 向量相似度检索
 *
 * 调用 Supabase RPC `match_chunks`，返回与查询文本最相关的知识片段。
 */

import { createClient } from '@supabase/supabase-js'
import { generateEmbedding } from './embedder'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase 环境变量未配置')
  return createClient(url, key)
}

// ── 检索结果类型 ──────────────────────────────────────────────────────

export interface ChunkMatch {
  id: string
  project_id: string | null
  source_id: string
  chunk_text: string
  chunk_index: number
  title: string | null
  tags: string[]
  chunk_type: string
  similarity: number   // 0-1，越高越相关
}

// ── 主检索函数 ────────────────────────────────────────────────────────

export interface RetrieveOptions {
  query: string
  project_id?: string          // 限制在某个项目范围内
  match_threshold?: number     // 最低相似度，默认 0.65
  match_count?: number         // 最多返回条数，默认 8
  chunk_types?: string[]       // 过滤 chunk_type
}

export async function retrieve(opts: RetrieveOptions): Promise<ChunkMatch[]> {
  const {
    query,
    project_id,
    match_threshold = 0.65,
    match_count = 8,
  } = opts

  const embedding = await generateEmbedding(query)
  const supabase = getSupabase()

  const rpcParams: Record<string, unknown> = {
    query_embedding: embedding,
    match_threshold,
    match_count,
  }
  if (project_id) rpcParams.filter_project = project_id

  const { data, error } = await supabase.rpc('match_chunks', rpcParams)

  if (error) throw new Error(`pgvector 检索失败: ${error.message}`)

  let results = (data ?? []) as ChunkMatch[]

  // 可选：按 chunk_type 过滤
  if (opts.chunk_types && opts.chunk_types.length > 0) {
    results = results.filter(r => opts.chunk_types!.includes(r.chunk_type))
  }

  return results
}

/**
 * 将检索结果格式化成 Prompt 用的文本块
 */
export function formatChunksForPrompt(chunks: ChunkMatch[]): string {
  if (chunks.length === 0) return ''
  return chunks
    .map((c, i) =>
      `[知识库片段 ${i + 1}] (相似度 ${(c.similarity * 100).toFixed(0)}%)\n${c.chunk_text}`
    )
    .join('\n\n---\n\n')
}
