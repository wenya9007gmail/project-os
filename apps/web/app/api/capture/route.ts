import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { ApiResponse, CaptureTask, CreateCaptureTaskInput } from '@/lib/types'

// GET /api/capture?project_id=xxx — list capture tasks
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<CaptureTask[]>>> {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id')
    if (!projectId) {
      return NextResponse.json({ data: null, error: 'project_id is required' }, { status: 400 })
    }

    const db = supabase()
    const { data, error } = await db
      .from('capture_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    return NextResponse.json({ data: (data ?? []) as CaptureTask[], error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/capture — create capture task + dispatch to local-agent
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<CaptureTask>>> {
  try {
    const body = await req.json() as CreateCaptureTaskInput

    if (!body.project_id || !body.target_url) {
      return NextResponse.json(
        { data: null, error: 'project_id and target_url are required' },
        { status: 400 }
      )
    }

    const db = supabase()
    const { data, error } = await db
      .from('capture_tasks')
      .insert({
        project_id: body.project_id,
        target_url: body.target_url,
        task_type: body.task_type ?? 'read_page',
        instructions: body.instructions ?? null,
        status: 'pending',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

    const task = data as CaptureTask

    // Dispatch to local-agent asynchronously
    void (async () => {
      try {
        const localAgentUrl = process.env.LOCAL_AGENT_URL ?? 'http://localhost:3001'
        await fetch(`${localAgentUrl}/capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: task.id,
            project_id: task.project_id,
            target_url: task.target_url,
            task_type: task.task_type,
            instructions: task.instructions,
          }),
        })
      } catch {
        // Local agent might be offline; task stays pending
        await db
          .from('capture_tasks')
          .update({ status: 'manual', error_msg: '本地代理未运行，请手动采集' })
          .eq('id', task.id)
      }
    })()

    return NextResponse.json({ data: task, error: null }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
