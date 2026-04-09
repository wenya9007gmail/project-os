import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { AddSourceInput, ApiResponse, ProjectSource } from '@/lib/types'

// GET /api/sources?project_id=xxx
export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<ProjectSource[]>>> {
  try {
    const projectId = req.nextUrl.searchParams.get('project_id')
    if (!projectId) {
      return NextResponse.json({ data: null, error: 'project_id is required' }, { status: 400 })
    }

    const db = supabase()
    const { data, error } = await db
      .from('project_sources')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    return NextResponse.json({ data: (data ?? []) as ProjectSource[], error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/sources — add source + trigger embedding
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<ProjectSource>>> {
  try {
    const body = await req.json() as AddSourceInput

    if (!body.project_id || !body.content_raw?.trim()) {
      return NextResponse.json(
        { data: null, error: 'project_id and content_raw are required' },
        { status: 400 }
      )
    }

    const db = supabase()
    const { data, error } = await db
      .from('project_sources')
      .insert({
        project_id: body.project_id,
        source_type: body.source_type ?? 'text',
        source_title: body.source_title ?? null,
        source_url: body.source_url ?? null,
        content_raw: body.content_raw.trim(),
        embed_status: 'pending',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })

    // Kick off async embedding — best effort
    const sourceId = data.id as string
    void (async () => {
      try {
        const { chunkAndEmbedSource } = await import('@/lib/knowledge/chunker')
        await chunkAndEmbedSource(sourceId)
      } catch {
        // Non-blocking
      }
    })()

    return NextResponse.json({ data: data as ProjectSource, error: null }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}

// DELETE /api/sources?id=xxx
export async function DELETE(req: NextRequest): Promise<NextResponse<ApiResponse<{ deleted: true }>>> {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ data: null, error: 'id is required' }, { status: 400 })

    const db = supabase()
    const { error } = await db.from('project_sources').delete().eq('id', id)
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    return NextResponse.json({ data: { deleted: true }, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
