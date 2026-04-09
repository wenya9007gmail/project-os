import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { ApiResponse } from '@/lib/types'

// POST /api/sources/embed?id=xxx — retry embedding for a single source
// POST /api/sources/embed?project_id=xxx — retry all failed sources for a project
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<{ queued: number }>>> {
  const sourceId = req.nextUrl.searchParams.get('id')
  const projectId = req.nextUrl.searchParams.get('project_id')

  const db = supabase()
  let ids: string[] = []

  if (sourceId) {
    ids = [sourceId]
  } else if (projectId) {
    const { data } = await db
      .from('project_sources')
      .select('id')
      .eq('project_id', projectId)
      .in('embed_status', ['error', 'pending'])
    ids = (data ?? []).map(r => r.id as string)
  } else {
    return NextResponse.json({ data: null, error: 'id or project_id required' }, { status: 400 })
  }

  if (ids.length === 0) {
    return NextResponse.json({ data: { queued: 0 }, error: null })
  }

  // Reset status to pending
  await db
    .from('project_sources')
    .update({ embed_status: 'pending' })
    .in('id', ids)

  // Kick off embedding in background
  void (async () => {
    const { chunkAndEmbedSource } = await import('@/lib/knowledge/chunker')
    for (const id of ids) {
      try {
        await chunkAndEmbedSource(id)
      } catch {
        await db.from('project_sources').update({ embed_status: 'error' }).eq('id', id)
      }
    }
  })()

  return NextResponse.json({ data: { queued: ids.length }, error: null })
}
