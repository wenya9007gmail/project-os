/**
 * POST /api/knowledge/ingest
 *
 * 供外部系统（Multica PR Webhook / GitHub Actions）调用，
 * 将代码变更摘要归档到 Project OS 知识库。
 *
 * Body:
 *  {
 *    source:            "github_pr" | "paperclip_task" | "text"
 *    project_id?:       UUID   — 留空时尝试从 paperclipIssueId 反查
 *    title?:            string
 *    content:           string — 变更摘要 / Markdown / 纯文本
 *    url?:              string — PR 链接
 *    tags?:             string[]
 *    paperclipIssueId?: string — 如 "CMP-5"，用于关联 Paperclip Issue
 *    prNumber?:         number
 *    prStatus?:         "opened" | "merged" | "closed"
 *  }
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { ApiResponse } from '@/lib/types'

interface IngestPayload {
  source:            'github_pr' | 'paperclip_task' | 'text'
  project_id?:       string
  title?:            string
  content:           string
  url?:              string
  tags?:             string[]
  paperclipIssueId?: string   // e.g. "CMP-5"
  prNumber?:         number
  prStatus?:         'opened' | 'merged' | 'closed'
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<{ source_id: string; queued: boolean }>>> {

  // ── Optional Bearer auth (set LOCAL_AGENT_SECRET in env) ─────────
  const secret = process.env.LOCAL_AGENT_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: IngestPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.content?.trim()) {
    return NextResponse.json({ data: null, error: 'content is required' }, { status: 400 })
  }

  const db = supabase()

  // ── Resolve project_id ───────────────────────────────────────────
  let projectId = body.project_id ?? null

  // If no project_id but paperclipIssueId provided, try to look up via logs
  if (!projectId && body.paperclipIssueId) {
    const { data: log } = await db
      .from('project_logs')
      .select('project_id')
      .contains('meta', { paperclip_issue_id: body.paperclipIssueId })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (log) projectId = log.project_id as string
  }

  // ── Build source title ───────────────────────────────────────────
  const sourceTitle = body.title
    ?? (body.source === 'github_pr' && body.prNumber
        ? `PR #${body.prNumber} — ${body.prStatus ?? 'update'}`
        : body.paperclipIssueId
          ? `${body.paperclipIssueId} 执行结果`
          : `知识归档 ${new Date().toLocaleDateString('zh-CN')}`)

  // ── Save to project_sources ──────────────────────────────────────
  const { data: source, error: insertErr } = await db
    .from('project_sources')
    .insert({
      project_id:    projectId,
      source_type:   body.source,
      source_title:  sourceTitle,
      source_url:    body.url ?? null,
      content_raw:   body.content.trim(),
      embed_status:  'pending',
    })
    .select('id')
    .single()

  if (insertErr || !source) {
    return NextResponse.json(
      { data: null, error: insertErr?.message ?? 'Insert failed' },
      { status: 500 }
    )
  }

  // ── Log the ingest event ─────────────────────────────────────────
  if (projectId) {
    await db.from('project_logs').insert({
      project_id: projectId,
      log_type:   'ingest',
      content:    `知识归档：${sourceTitle}`,
      meta: {
        source_id:          source.id,
        source_type:        body.source,
        paperclip_issue_id: body.paperclipIssueId ?? null,
        pr_number:          body.prNumber ?? null,
        pr_status:          body.prStatus ?? null,
        url:                body.url ?? null,
        tags:               body.tags ?? [],
      },
    })
  }

  // ── Trigger embedding async ──────────────────────────────────────
  let queued = false
  void (async () => {
    try {
      const { chunkAndEmbedSource } = await import('@/lib/knowledge/chunker')
      await chunkAndEmbedSource(source.id as string)
      queued = true
    } catch { /* embedding is best-effort */ }
  })()

  return NextResponse.json({
    data: { source_id: source.id as string, queued: true },
    error: null,
  })
}
