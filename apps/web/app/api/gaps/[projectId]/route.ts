import { NextRequest, NextResponse } from 'next/server'

type Params = { params: { projectId: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const { fillGaps } = await import('@/lib/ai/gap-filler')
    const result = await fillGaps(params.projectId)
    return NextResponse.json({ data: result, error: null })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
