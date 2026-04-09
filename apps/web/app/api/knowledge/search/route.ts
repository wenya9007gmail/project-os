/**
 * GET/POST /api/knowledge/search
 *
 * 向量语义检索接口：输入查询文本，返回最相关的知识块。
 *
 * POST body:
 *   { query: string, project_id?: string, match_count?: number, match_threshold?: number }
 *
 * GET params:
 *   ?q=查询文本&project_id=xxx&count=8
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'

const LOCAL_AGENT_URL = process.env.LOCAL_AGENT_URL ?? 'http://localhost:3001'

// ── 调用 local-agent 生成 embedding ───────────────────────────────────

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

// ── POST ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    query?: string
    project_id?: string
    match_count?: number
    match_threshold?: number
    chunk_types?: string[]
  }

  const query = body.query?.trim()
  if (!query) {
    return NextResponse.json({ error: 'query 是必填项' }, { status: 400 })
  }

  return runSearch({
    query,
    project_id: body.project_id,
    match_count: body.match_count ?? 8,
    match_threshold: body.match_threshold ?? 0.65,
    chunk_types: body.chunk_types,
  })
}

// ── GET ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim()
  if (!query) {
    return NextResponse.json({ error: 'q 参数是必填项' }, { status: 400 })
  }

  return runSearch({
    query,
    project_id: searchParams.get('project_id') ?? undefined,
    match_count: parseInt(searchParams.get('count') ?? '8'),
    match_threshold: parseFloat(searchParams.get('threshold') ?? '0.65'),
  })
}

// ── 核心检索逻辑 ──────────────────────────────────────────────────────

async function runSearch(opts: {
  query: string
  project_id?: string
  match_count: number
  match_threshold: number
  chunk_types?: string[]
}) {
  // 1. 生成查询向量
  const embedding = await getEmbedding(opts.query)
  if (!embedding) {
    return NextResponse.json(
      { error: 'Embedding 生成失败。请确认 Local Agent 正在运行（localhost:3001）且 Ollama 已启动。' },
      { status: 503 }
    )
  }

  // 2. 调用 pgvector RPC
  const db = supabase()
  const rpcParams: Record<string, unknown> = {
    query_embedding: embedding,
    match_threshold: opts.match_threshold,
    match_count: opts.match_count,
  }
  if (opts.project_id) rpcParams.filter_project_id = opts.project_id

  const { data, error } = await db.rpc('match_chunks', rpcParams)

  if (error) {
    return NextResponse.json({ error: `检索失败: ${error.message}` }, { status: 500 })
  }

  let results = (data ?? []) as Array<{
    id: string
    project_id: string | null
    source_id: string
    chunk_text: string
    chunk_index: number
    title: string | null
    tags: string[]
    chunk_type: string
    similarity: number
  }>

  // 3. 按 chunk_type 过滤
  if (opts.chunk_types && opts.chunk_types.length > 0) {
    results = results.filter(r => opts.chunk_types!.includes(r.chunk_type))
  }

  return NextResponse.json({
    data: results,
    query: opts.query,
    total: results.length,
  })
}
