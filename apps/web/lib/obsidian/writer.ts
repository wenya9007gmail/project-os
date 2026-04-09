/**
 * writer.ts — Obsidian Vault 写入器
 *
 * 通过 Obsidian Local REST API 插件（默认端口 27123）把 Markdown 笔记
 * 写入本地 Vault。模板渲染逻辑统一由 templates.ts 提供。
 */

import type { Project, ProjectAnalysis, ProjectHandoff } from '../types'
import {
  renderAnalysisNote,
  renderHandoffNote,
  sanitizeFilename,
} from './templates'

const OBSIDIAN_PORT   = process.env.OBSIDIAN_PORT      ?? '27123'
const OBSIDIAN_TOKEN  = process.env.OBSIDIAN_API_TOKEN ?? ''
const OBSIDIAN_BASE   = `http://localhost:${OBSIDIAN_PORT}`

// ── 底层 HTTP 写入（PUT） ────────────────────────────────────────────

async function obsidianRequest(path: string, body: string): Promise<void> {
  const res = await fetch(`${OBSIDIAN_BASE}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${OBSIDIAN_TOKEN}`,
      'Content-Type': 'text/markdown',
    },
    body,
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Obsidian API error ${res.status}: ${txt}`)
  }
}

// ── 公共写入接口 ─────────────────────────────────────────────────────

/**
 * 将项目分析报告 + 所有任务包一次性写入 Obsidian Vault。
 * 目录结构：<OBSIDIAN_FOLDER>/<项目名>/分析报告.md
 *                                       开发任务包.md
 *                                       内容任务包.md
 *                                       研究任务包.md
 */
export async function writeAnalysisToObsidian(
  project: Project,
  analysis: ProjectAnalysis,
  handoffs: ProjectHandoff[]
): Promise<void> {
  const safeName    = sanitizeFilename(project.name)
  const vaultFolder = process.env.OBSIDIAN_FOLDER ?? 'Project OS'

  // 分析报告主文档
  const analysisPath = `/vault/${vaultFolder}/${safeName}/分析报告.md`
  await obsidianRequest(analysisPath, renderAnalysisNote(project, analysis))

  // 各类任务包
  const typeLabels: Record<string, string> = {
    dev:      '开发任务包',
    content:  '内容任务包',
    research: '研究任务包',
  }
  for (const handoff of handoffs) {
    const label      = typeLabels[handoff.handoff_type] ?? handoff.handoff_type
    const handoffPath = `/vault/${vaultFolder}/${safeName}/${label}.md`
    await obsidianRequest(handoffPath, renderHandoffNote(handoff, project.name))
  }
}

/**
 * 直接将任意 Markdown 内容写入指定相对路径（相对于 Vault 根目录）。
 */
export async function writeNoteToObsidian(path: string, content: string): Promise<void> {
  await obsidianRequest(`/vault/${path}`, content)
}
