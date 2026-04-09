import { supabase } from '../supabase/server'

interface GapEntry {
  gap: string
  importance: 'high' | 'medium' | 'low'
  fill_type: 'public' | 'login' | 'user'
  suggested_source: string
}

// ── Jina Reader: fetch clean text from a URL ───────────────────────
async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`
    const res = await fetch(jinaUrl, {
      headers: {
        Authorization: `Bearer ${process.env.JINA_API_KEY ?? ''}`,
        Accept: 'text/plain',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const text = await res.text()
    return text.slice(0, 4000) // cap at 4k chars per source
  } catch {
    return null
  }
}

// ── Tavily Search: research a topic ───────────────────────────────
async function searchViaTavily(query: string): Promise<string | null> {
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const data: {
      answer?: string
      results?: Array<{ title: string; content: string; url: string }>
    } = await res.json()

    const parts: string[] = []
    if (data.answer) parts.push(`摘要：${data.answer}`)
    if (data.results) {
      data.results.slice(0, 3).forEach(r => {
        parts.push(`来源：${r.title}\n${r.content.slice(0, 500)}`)
      })
    }
    return parts.join('\n\n---\n\n')
  } catch {
    return null
  }
}

// ── Save fetched content as a new project source ──────────────────
async function saveGapFilledSource(
  projectId: string,
  title: string,
  content: string,
  sourceUrl?: string
) {
  const db = supabase()
  await db.from('project_sources').insert({
    project_id: projectId,
    source_type: 'url',
    source_title: `[自动补充] ${title}`,
    source_url: sourceUrl ?? null,
    content_raw: content,
    embed_status: 'pending',
  })
}

// ── Create capture task for login-required content ────────────────
async function createCaptureTask(projectId: string, gap: GapEntry) {
  const db = supabase()
  await db.from('capture_tasks').insert({
    project_id: projectId,
    target_url: gap.suggested_source ?? '',
    task_type: 'read_page',
    instructions: { reason: gap.gap, importance: gap.importance },
    status: 'pending',
  })
}

// ── MAIN: fillGaps ────────────────────────────────────────────────
export async function fillGaps(projectId: string): Promise<{
  filled: number
  queued_captures: number
  errors: string[]
}> {
  const db = supabase()
  const errors: string[] = []

  // Load latest analysis
  const { data: analysis } = await db
    .from('project_analysis')
    .select('gaps')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!analysis?.gaps) return { filled: 0, queued_captures: 0, errors: [] }

  let gaps: GapEntry[] = []
  try {
    gaps = JSON.parse(analysis.gaps)
  } catch {
    return { filled: 0, queued_captures: 0, errors: ['Failed to parse gaps JSON'] }
  }

  const highPriority = gaps.filter(g => g.importance === 'high')
  let filled = 0
  let queuedCaptures = 0

  for (const gap of highPriority) {
    try {
      if (gap.fill_type === 'login') {
        // Queue for local capture agent
        await createCaptureTask(projectId, gap)
        queuedCaptures++
        continue
      }

      if (gap.fill_type !== 'public') continue

      // Try to determine if suggested_source is a URL or a search query
      const src = gap.suggested_source ?? ''
      let content: string | null = null

      if (src.startsWith('http://') || src.startsWith('https://')) {
        content = await fetchViaJina(src)
      }

      // Fall back to Tavily search
      if (!content) {
        content = await searchViaTavily(gap.gap)
      }

      if (content) {
        await saveGapFilledSource(projectId, gap.gap, content, src.startsWith('http') ? src : undefined)
        filled++
      }
    } catch (e) {
      errors.push(`Gap "${gap.gap}": ${(e as Error).message}`)
    }
  }

  // Log results
  await db.from('project_logs').insert({
    project_id: projectId,
    log_type: 'capture',
    content: `信息缺口补充完成：${filled} 条自动填充，${queuedCaptures} 条待人工采集`,
    meta: { filled, queued_captures: queuedCaptures, errors },
  })

  return { filled, queued_captures: queuedCaptures, errors }
}
