import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { ApiResponse, AnalysisResult, ProjectAnalysis } from '@/lib/types'

type Params = { params: { projectId: string } }

// GET /api/analysis/:projectId — load latest analysis
export async function GET(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<ProjectAnalysis | null>>> {
  try {
    const db = supabase()
    const { data, error } = await db
      .from('project_analysis')
      .select('*')
      .eq('project_id', params.projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: (data as ProjectAnalysis) ?? null, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/analysis/:projectId — trigger new analysis run
export async function POST(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<AnalysisResult>>> {
  try {
    const { runAnalysis } = await import('@/lib/ai/analyzer')
    const result = await runAnalysis(params.projectId)
    return NextResponse.json({ data: result, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
