import OpenAI from 'openai'
import { supabase } from '../supabase/server'
import {
  buildDevHandoffPrompt,
  buildContentHandoffPrompt,
  buildResearchHandoffPrompt,
  SYSTEM_PROMPT,
} from './prompts'
import type { ProjectAnalysis, ProjectHandoff } from '../types'

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com',
})

const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

async function callAI(userPrompt: string): Promise<string> {
  const completion = await deepseek.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error('Empty response from DeepSeek')
  return content
}

async function saveHandoff(
  projectId: string,
  handoffType: 'dev' | 'content' | 'research',
  content: string
): Promise<ProjectHandoff> {
  const db = supabase()
  const { data, error } = await db
    .from('project_handoffs')
    .insert({ project_id: projectId, handoff_type: handoffType, handoff_content: content, version: 1 })
    .select()
    .single()
  if (error) throw new Error(`Failed to save handoff ${handoffType}: ${error.message}`)
  return data as ProjectHandoff
}

export async function generateAllHandoffs(
  projectId: string,
  analysis: ProjectAnalysis,
  parsed: Record<string, unknown>
): Promise<ProjectHandoff[]> {
  const db = supabase()
  const { data: project } = await db.from('projects').select('name').eq('id', projectId).single()
  const projectName = (project as { name: string } | null)?.name ?? 'Unknown Project'
  const analysisJson = JSON.stringify(parsed, null, 2)

  const gaps: string[] = []
  try {
    const gapsArr = JSON.parse(analysis.gaps ?? '[]')
    if (Array.isArray(gapsArr)) {
      gapsArr.forEach((g: Record<string, unknown>) => {
        if (g.gap) gaps.push(`[${g.importance}] ${g.gap} → ${g.suggested_source ?? ''}`)
      })
    }
  } catch { /* ignore */ }

  const [devContent, contentContent, researchContent] = await Promise.all([
    callAI(buildDevHandoffPrompt(analysisJson, projectName)),
    callAI(buildContentHandoffPrompt(analysisJson, projectName)),
    callAI(buildResearchHandoffPrompt(analysisJson, projectName, gaps)),
  ])

  const [devHandoff, contentHandoff, researchHandoff] = await Promise.all([
    saveHandoff(projectId, 'dev', devContent),
    saveHandoff(projectId, 'content', contentContent),
    saveHandoff(projectId, 'research', researchContent),
  ])

  await db.from('project_logs').insert({
    project_id: projectId,
    log_type: 'handoff',
    content: '已生成三份任务包：开发助手 / 内容助手 / 研究助手',
    meta: { handoff_ids: [devHandoff.id, contentHandoff.id, researchHandoff.id] },
  })

  return [devHandoff, contentHandoff, researchHandoff]
}

export async function regenerateHandoff(
  projectId: string,
  handoffType: 'dev' | 'content' | 'research'
): Promise<ProjectHandoff> {
  const db = supabase()

  const { data: analysisRow } = await db
    .from('project_analysis')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!analysisRow) throw new Error('No analysis found for project')

  const { data: project } = await db.from('projects').select('name').eq('id', projectId).single()
  const projectName = (project as { name: string } | null)?.name ?? 'Unknown Project'

  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(analysisRow.raw_response ?? '{}') } catch { /* ignore */ }
  const analysisJson = JSON.stringify(parsed, null, 2)

  const gaps: string[] = []
  try {
    const gapsArr = JSON.parse(analysisRow.gaps ?? '[]')
    if (Array.isArray(gapsArr)) {
      gapsArr.forEach((g: Record<string, unknown>) => {
        if (g.gap) gaps.push(`[${g.importance}] ${g.gap}`)
      })
    }
  } catch { /* ignore */ }

  let content: string
  if (handoffType === 'dev') {
    content = await callAI(buildDevHandoffPrompt(analysisJson, projectName))
  } else if (handoffType === 'content') {
    content = await callAI(buildContentHandoffPrompt(analysisJson, projectName))
  } else {
    content = await callAI(buildResearchHandoffPrompt(analysisJson, projectName, gaps))
  }

  const { data: existing } = await db
    .from('project_handoffs')
    .select('version')
    .eq('project_id', projectId)
    .eq('handoff_type', handoffType)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const nextVersion = ((existing as { version: number } | null)?.version ?? 0) + 1

  const { data, error } = await db
    .from('project_handoffs')
    .insert({ project_id: projectId, handoff_type: handoffType, handoff_content: content, version: nextVersion })
    .select()
    .single()
  if (error) throw new Error(`Failed to regenerate handoff: ${error.message}`)
  return data as ProjectHandoff
}
