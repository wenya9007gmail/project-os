import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { ApiResponse } from '@/lib/types'

interface CaptureResultPayload {
  task_id: string
  project_id: string
  success: boolean
  content?: string
  title?: string
  source_url?: string
  error_msg?: string
}

// POST /api/capture/result — called by local-agent when capture completes
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<{ ok: true }>>> {
  // Verify request is from local-agent
  const authHeader = req.headers.get('authorization')
  const expectedToken = process.env.LOCAL_AGENT_SECRET
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ data: null, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json() as CaptureResultPayload
    const db = supabase()

    if (!body.success || !body.content) {
      // Mark task as error
      await db
        .from('capture_tasks')
        .update({
          status: 'error',
          error_msg: body.error_msg ?? 'Capture failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.task_id)

      return NextResponse.json({ data: { ok: true }, error: null })
    }

    // Save captured content as a new source
    const { data: source, error: srcErr } = await db
      .from('project_sources')
      .insert({
        project_id: body.project_id,
        source_type: 'capture',
        source_title: body.title ?? `采集内容 ${new Date().toLocaleString('zh-CN')}`,
        source_url: body.source_url ?? null,
        content_raw: body.content,
        embed_status: 'pending',
      })
      .select('id')
      .single()

    if (srcErr) throw new Error(srcErr.message)

    // Update task status
    await db
      .from('capture_tasks')
      .update({
        status: 'done',
        result_source_id: source.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.task_id)

    // Log
    await db.from('project_logs').insert({
      project_id: body.project_id,
      log_type: 'capture',
      content: `采集完成：${body.title ?? body.source_url ?? '无标题'}`,
      meta: { task_id: body.task_id, source_id: source.id },
    })

    // Trigger embedding asynchronously
    void (async () => {
      try {
        const { chunkAndEmbedSource } = await import('@/lib/knowledge/chunker')
        await chunkAndEmbedSource(source.id as string)
      } catch { /* ignore */ }
    })()

    return NextResponse.json({ data: { ok: true }, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
