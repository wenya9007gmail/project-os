import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { supabase } from '@/lib/supabase/server'
import { buildProjectExtractionPrompt } from '@/lib/ai/prompts'
import type { ApiResponse } from '@/lib/types'

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com',
})

interface SourceInput {
  type: 'text' | 'url'
  content: string
  title?: string
}

interface ExtractedProject {
  name: string
  type: string
  description: string
  goal: string
  notes: string
}

async function fetchUrl(url: string): Promise<string> {
  try {
    // Use Jina Reader for clean text extraction
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`
    const res = await fetch(jinaUrl, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return `[无法读取链接: ${url}]`
    const text = await res.text()
    return text.slice(0, 8000) // cap per URL
  } catch {
    return `[读取失败: ${url}]`
  }
}

function extractJson(raw: string): ExtractedProject {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = match ? match[1].trim() : raw.trim()
  return JSON.parse(jsonStr) as ExtractedProject
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<{ id: string }>>> {
  try {
    const body = await req.json() as { sources: SourceInput[] }
    const { sources } = body

    if (!sources?.length) {
      return NextResponse.json({ data: null, error: '请至少提供一条资料' }, { status: 400 })
    }

    // 1. Resolve all sources to text
    const resolvedParts: string[] = []
    const savedSources: Array<{ type: string; content: string; title: string; url?: string }> = []

    for (const src of sources) {
      if (src.type === 'url') {
        const text = await fetchUrl(src.content)
        resolvedParts.push(`【链接资料】${src.content}\n${text}`)
        savedSources.push({ type: 'url', content: text, title: src.title || src.content, url: src.content })
      } else {
        resolvedParts.push(`【文本资料】\n${src.content}`)
        savedSources.push({ type: 'text', content: src.content, title: src.title || '用户输入' })
      }
    }

    const materialsText = resolvedParts.join('\n\n---\n\n')

    // 2. AI extracts project info
    const completion = await deepseek.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildProjectExtractionPrompt(materialsText) }],
    })
    const rawResponse = completion.choices[0]?.message?.content ?? ''
    let extracted: ExtractedProject
    try {
      extracted = extractJson(rawResponse)
    } catch {
      // Fallback: create project with first 30 chars as name
      extracted = {
        name: sources[0].content.slice(0, 30).trim() + '...',
        type: 'other',
        description: sources[0].content.slice(0, 200),
        goal: '',
        notes: '',
      }
    }

    const db = supabase()

    // 3. Create project
    const { data: project, error: pErr } = await db
      .from('projects')
      .insert({
        name: extracted.name,
        type: extracted.type ?? 'other',
        description: extracted.description ?? null,
        goal: extracted.goal ?? null,
        notes: extracted.notes ?? null,
        status: 'pending',
        stage: 'sourcing',
      })
      .select('id')
      .single()

    if (pErr || !project) {
      return NextResponse.json({ data: null, error: pErr?.message ?? 'Failed to create project' }, { status: 500 })
    }

    // 4. Save all sources
    await db.from('project_sources').insert(
      savedSources.map(s => ({
        project_id: project.id,
        source_type: s.type,
        source_title: s.title,
        source_url: s.url ?? null,
        content_raw: s.content,
      }))
    )

    // 5. Log creation
    await db.from('project_logs').insert({
      project_id: project.id,
      log_type: 'system',
      content: `项目已从 ${savedSources.length} 份资料中自动创建：${extracted.name}`,
    })

    // 6. Auto-trigger analysis in background (non-blocking)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'
    void fetch(`${baseUrl}/api/analysis/${project.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => { /* ignore background errors */ })

    return NextResponse.json({ data: { id: project.id }, error: null }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ data: null, error: (e as Error).message }, { status: 500 })
  }
}
