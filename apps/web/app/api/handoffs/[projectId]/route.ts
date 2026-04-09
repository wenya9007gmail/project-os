import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { ApiResponse, ProjectHandoff, ProjectAnalysis, HandoffType } from '@/lib/types'

type Params = { params: { projectId: string } }

// GET /api/handoffs/:projectId
export async function GET(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<ProjectHandoff[]>>> {
  try {
    const db = supabase()
    const { data, error } = await db
      .from('project_handoffs')
      .select('*')
      .eq('project_id', params.projectId)
      .order('version', { ascending: false })

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

    const byType = new Map<string, ProjectHandoff>()
    for (const h of (data ?? []) as ProjectHandoff[]) {
      if (!byType.has(h.handoff_type)) byType.set(h.handoff_type, h)
    }

    return NextResponse.json({ data: Array.from(byType.values()), error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/handoffs/:projectId
// { type: 'all' }        → 人工确认，生成全部任务包，推进到 dispatch 阶段
// { type: 'dev' | 'content' | 'research' } → 单独重新生成某一包
export async function POST(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<ProjectHandoff | ProjectHandoff[]>>> {
  try {
    const { type } = await req.json() as { type: HandoffType | 'all' }
    const db = supabase()

    if (type === 'all') {
      const { data: analysis } = await db
        .from('project_analysis')
        .select('*')
        .eq('project_id', params.projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!analysis) {
        return NextResponse.json({ data: null, error: '请先完成分析再生成任务包' }, { status: 400 })
      }

      // Parse raw JSON from analysis
      let parsedRaw: Record<string, unknown> = {}
      try {
        const raw = (analysis as { raw_response?: string }).raw_response ?? ''
        const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
        parsedRaw = JSON.parse(match ? match[1].trim() : raw.trim())
      } catch { /* use empty */ }

      const { generateAllHandoffs } = await import('@/lib/ai/handoff-generator')
      const handoffs = await generateAllHandoffs(
        params.projectId,
        analysis as ProjectAnalysis,
        parsedRaw
      )

      // Advance to dispatch stage
      await db.from('projects').update({
        stage: 'dispatch',
        status: 'pending_dev',
        updated_at: new Date().toISOString(),
      }).eq('id', params.projectId)

      await db.from('project_logs').insert({
        project_id: params.projectId,
        log_type: 'system',
        content: `✅ 人工确认分析，已生成 ${handoffs.length} 个任务包，进入分发阶段`,
      })

      return NextResponse.json({ data: handoffs, error: null })
    }

    if (!['dev', 'content', 'research'].includes(type)) {
      return NextResponse.json(
        { data: null, error: 'type must be dev | content | research | all' },
        { status: 400 }
      )
    }

    const { regenerateHandoff } = await import('@/lib/ai/handoff-generator')
    const handoff = await regenerateHandoff(params.projectId, type as HandoffType)
    return NextResponse.json({ data: handoff, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
