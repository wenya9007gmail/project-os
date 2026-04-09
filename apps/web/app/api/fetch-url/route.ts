import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: '缺少 url 参数' }, { status: 400 })

    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`
    const res = await fetch(jinaUrl, {
      headers: { Accept: 'text/plain', 'X-No-Cache': 'true' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return NextResponse.json({ error: `无法读取页面 (${res.status})` }, { status: 502 })
    const text = await res.text()
    return NextResponse.json({ content: text.slice(0, 12000) })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
