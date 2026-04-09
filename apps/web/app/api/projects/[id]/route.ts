import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/server'
import type { UpdateProjectInput, ApiResponse, Project } from '@/lib/types'

type Params = { params: { id: string } }

// GET /api/projects/:id
export async function GET(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<Project>>> {
  try {
    const db = supabase()
    const { data, error } = await db
      .from('projects')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 404 })
    return NextResponse.json({ data: data as Project, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}

// PATCH /api/projects/:id
export async function PATCH(
  req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<Project>>> {
  try {
    const body = await req.json() as UpdateProjectInput
    const db = supabase()

    const { data, error } = await db
      .from('projects')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select()
      .single()

    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    return NextResponse.json({ data: data as Project, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}

// DELETE /api/projects/:id
export async function DELETE(
  _req: NextRequest,
  { params }: Params
): Promise<NextResponse<ApiResponse<{ deleted: true }>>> {
  try {
    const db = supabase()
    const { error } = await db.from('projects').delete().eq('id', params.id)
    if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    return NextResponse.json({ data: { deleted: true }, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
