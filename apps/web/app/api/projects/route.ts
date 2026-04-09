import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { CreateProjectInput, ApiResponse, ProjectWithStats } from '@/lib/types'

// GET /api/projects — list all projects with stats
export async function GET(): Promise<NextResponse<ApiResponse<ProjectWithStats[]>>> {
  try {
    const db = supabase()
    const { data: projects, error } = await db
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

    // Attach source count and latest analysis
    const enriched: ProjectWithStats[] = await Promise.all(
      (projects ?? []).map(async (p) => {
        const [{ count }, { data: latestAnalysis }] = await Promise.all([
          db.from('project_sources').select('id', { count: 'exact', head: true }).eq('project_id', p.id),
          db.from('project_analysis')
            .select('confidence, pass_count, created_at')
            .eq('project_id', p.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single(),
        ])
        return {
          ...p,
          source_count: count ?? 0,
          last_analysis: latestAnalysis ?? null,
        }
      })
    )

    return NextResponse.json({ data: enriched, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/projects — create project
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  try {
    const body = await req.json() as CreateProjectInput
    if (!body.name?.trim()) {
      return NextResponse.json({ data: null, error: '项目名称不能为空' }, { status: 400 })
    }

    const db = supabase()
    const { data, error } = await db
      .from('projects')
      .insert({
        name: body.name.trim(),
        type: body.type ?? 'other',
        description: body.description ?? null,
        goal: body.goal ?? null,
        notes: body.notes ?? null,
        status: 'pending',
        stage: 'sourcing',
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

    // Log creation
    await db.from('project_logs').insert({
      project_id: data.id,
      log_type: 'system',
      content: `项目已创建：${body.name}`,
    })

    return NextResponse.json({ data: { id: data.id }, error: null }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
