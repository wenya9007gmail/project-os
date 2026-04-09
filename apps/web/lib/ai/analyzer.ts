import OpenAI from 'openai'
import { supabase } from '../supabase/server'
import { buildFirstPassPrompt, SYSTEM_PROMPT } from './prompts'
import type {
  Project,
  ProjectSource,
  ProjectAnalysis,
  AutomationNode,
  AnalysisResult,
} from '../types'

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com',
})

const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

// ── Helper: call DeepSeek and return raw text ──────────────────────
async function callAI(userPrompt: string): Promise<string> {
  const completion = await deepseek.chat.completions.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('Empty response from DeepSeek')
  return content
}

// ── Helper: extract JSON from AI response ──────────────────────────
function extractJson(raw: string): Record<string, unknown> {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = match ? match[1].trim() : raw.trim()
  return JSON.parse(jsonStr)
}

// ── Helper: fetch knowledge chunks via local-agent embedding ───────
async function fetchKnowledgeChunks(
  projectId: string,
  queryText: string
): Promise<Array<{ chunk_text: string; tags: string[]; similarity: number }>> {
  try {
    const localAgentUrl = process.env.LOCAL_AGENT_URL ?? 'http://localhost:3001'
    const embedRes = await fetch(`${localAgentUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: queryText }),
    })
    if (!embedRes.ok) return []
    const { embedding } = await embedRes.json()

    const db = supabase()
    const { data, error } = await db.rpc('match_chunks', {
      query_embedding: embedding,
      match_threshold: 0.65,
      match_count: 8,
      filter_project: projectId,
    })
    if (error || !data) return []
    return data as Array<{ chunk_text: string; tags: string[]; similarity: number }>
  } catch {
    return []
  }
}

// ── Parse raw AI JSON into DB-ready shape ──────────────────────────
function parseAnalysisJson(
  projectId: string,
  parsed: Record<string, unknown>,
  rawResponse: string
): Omit<ProjectAnalysis, 'id' | 'created_at'> {
  const arr = (key: string) => {
    const val = parsed[key]
    return Array.isArray(val) ? JSON.stringify(val) : null
  }

  return {
    project_id: projectId,
    project_definition: (parsed.project_definition as string) ?? null,
    target_user: (parsed.target_user as string) ?? null,
    monetization: arr('monetization'),
    workflow: arr('workflow'),
    risks: arr('risks'),
    gaps: arr('gaps'),
    automation_map: Array.isArray(parsed.automation_map)
      ? (parsed.automation_map as AutomationNode[])
      : null,
    mvp_suggestion: (parsed.mvp_suggestion as string) ?? null,
    confidence: typeof parsed.overall_confidence === 'number'
      ? parsed.overall_confidence
      : typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    pass_count: 1,
    raw_response: rawResponse,
  }
}

// ── Detect gaps that need filling ──────────────────────────────────
function detectGapsRequiringCapture(parsed: Record<string, unknown>): string[] {
  const gaps = parsed.gaps
  if (!Array.isArray(gaps)) return []
  return gaps
    .filter((g: Record<string, unknown>) => g.importance === 'high' && g.fill_type === 'public')
    .map((g: Record<string, unknown>) => g.gap as string)
    .filter(Boolean)
}

// ── Write analysis back to Supabase ───────────────────────────────
async function upsertAnalysis(
  analysisData: Omit<ProjectAnalysis, 'id' | 'created_at'>
): Promise<ProjectAnalysis> {
  const db = supabase()
  const { data, error } = await db
    .from('project_analysis')
    .insert(analysisData)
    .select()
    .single()
  if (error) throw new Error(`Failed to save analysis: ${error.message}`)
  return data as ProjectAnalysis
}

// ── Update project with next_action + automation_score ────────────
async function updateProjectMeta(
  projectId: string,
  parsed: Record<string, unknown>
) {
  const db = supabase()
  const automationMap = parsed.automation_map as AutomationNode[] | undefined
  let score = 0
  if (Array.isArray(automationMap) && automationMap.length > 0) {
    const fullCount = automationMap.filter(n => n.level === 'full').length
    score = Math.round((fullCount / automationMap.length) * 100)
  }

  // After analysis: stage → 'analysis'，等待人工确认后再推进到 dispatch
  const hasHighGaps = (parsed.gaps as unknown[])?.some?.(
    (g: unknown) => (g as Record<string, string>).importance === 'high'
  )
  const confidence = typeof parsed.overall_confidence === 'number'
    ? parsed.overall_confidence
    : typeof parsed.confidence === 'number' ? parsed.confidence : 0

  await db.from('projects').update({
    next_action: (parsed.next_action as string) ?? null,
    automation_score: score,
    stage: 'analysis',
    status: confidence < 50 || hasHighGaps ? 'needs_info' : 'analyzing',
    updated_at: new Date().toISOString(),
  }).eq('id', projectId)
}

// ── Log analysis event ────────────────────────────────────────────
async function logAnalysis(projectId: string, message: string, meta?: Record<string, unknown>) {
  const db = supabase()
  await db.from('project_logs').insert({
    project_id: projectId,
    log_type: 'analysis',
    content: message,
    meta: meta ?? null,
  })
}

// ── MAIN: runAnalysis ─────────────────────────────────────────────
export async function runAnalysis(projectId: string): Promise<AnalysisResult> {
  const db = supabase()

  const { data: project, error: pErr } = await db
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()
  if (pErr || !project) throw new Error(`Project not found: ${projectId}`)

  const { data: sources } = await db
    .from('project_sources')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  const projectSources: ProjectSource[] = sources ?? []

  const queryText = `${(project as Project).name} ${(project as Project).description ?? ''} ${(project as Project).goal ?? ''}`
  const knowledgeChunks = await fetchKnowledgeChunks(projectId, queryText)

  await logAnalysis(projectId, `开始分析，资料数量：${projectSources.length}，知识块：${knowledgeChunks.length}`)

  const firstPassPrompt = buildFirstPassPrompt(
    project as Project,
    projectSources,
    knowledgeChunks
  )
  const rawResponse = await callAI(firstPassPrompt)

  let parsed: Record<string, unknown>
  try {
    parsed = extractJson(rawResponse)
  } catch (e) {
    await logAnalysis(projectId, `JSON解析失败: ${(e as Error).message}`, { raw: rawResponse.slice(0, 500) })
    throw new Error('AI returned unparseable JSON. Check raw_response in logs.')
  }

  const gapsRequiringCapture = detectGapsRequiringCapture(parsed)
  if (gapsRequiringCapture.length > 0) {
    await logAnalysis(projectId, `发现 ${gapsRequiringCapture.length} 个高优先级信息缺口，已标记待补充`)
  }

  const analysisData = parseAnalysisJson(projectId, parsed, rawResponse)
  const savedAnalysis = await upsertAnalysis(analysisData)

  await updateProjectMeta(projectId, parsed)

  await logAnalysis(
    projectId,
    `分析完成，综合置信度：${savedAnalysis.confidence}%，等待人工确认后生成任务包`,
    { gaps_count: gapsRequiringCapture.length }
  )

  return {
    analysis: savedAnalysis,
    handoffs: [],
    gaps_requiring_capture: gapsRequiringCapture,
    obsidian_written: false,
  }
}
