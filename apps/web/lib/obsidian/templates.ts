/**
 * templates.ts — Obsidian 笔记模板库
 *
 * 提供各类结构化笔记的 Markdown 渲染函数，
 * 供 writer.ts 调用写入 Obsidian Vault。
 */

import type { Project, ProjectAnalysis, ProjectHandoff, AutomationNode } from '@/lib/types'

// ── 工具 ──────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function parseJson<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback
  try { return JSON.parse(val) as T } catch { return fallback }
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim()
}

// ── 模板 1：项目主文档（分析报告） ────────────────────────────────────

interface MonetizationItem {
  path: string
  method?: string
  timeline?: string
  potential?: string
}

interface WorkflowStep {
  step: number | string
  name: string
  description?: string
  automatable?: boolean
}

interface RiskItem {
  level: string
  risk: string
  mitigation?: string
}

interface GapItem {
  importance: string
  fill_type: string
  gap: string
  suggested_source?: string
}

export function renderAnalysisNote(
  project: Project,
  analysis: ProjectAnalysis
): string {
  const monetization = parseJson<MonetizationItem[]>(analysis.monetization, [])
  const workflow     = parseJson<WorkflowStep[]>(analysis.workflow, [])
  const risks        = parseJson<RiskItem[]>(analysis.risks, [])
  const gaps         = parseJson<GapItem[]>(analysis.gaps, [])
  const automation   = (analysis.automation_map ?? []) as AutomationNode[]

  const monoMd = monetization.length > 0
    ? monetization.map(m =>
        `- **${m.path}**：${m.method ?? ''}（${m.timeline ?? ''}，潜力：${m.potential ?? ''}）`
      ).join('\n')
    : '_待分析_'

  const wfMd = workflow.length > 0
    ? workflow.map(w =>
        `${w.step}. **${w.name}** — ${w.description ?? ''}${w.automatable ? ' ✅' : ''}`
      ).join('\n')
    : '_待分析_'

  const riskMd = risks.length > 0
    ? risks.map(r =>
        `- \`${r.level.toUpperCase()}\` ${r.risk}${r.mitigation ? ` → ${r.mitigation}` : ''}`
      ).join('\n')
    : '_无明显风险_'

  const gapMd = gaps.length > 0
    ? gaps.map(g =>
        `- [${g.importance}][${g.fill_type}] ${g.gap}${g.suggested_source ? ` → ${g.suggested_source}` : ''}`
      ).join('\n')
    : '_无信息缺口_'

  const autoTable = automation.length > 0
    ? [
        '| 节点 | 当前做法 | 级别 | 推荐方案 | 优先级 | 需人工 |',
        '|------|----------|------|----------|--------|--------|',
        ...automation.map(n =>
          `| ${n.node} | ${n.current_approach} | ${n.level} | ${n.recommended_solution} | ${n.priority} | ${n.needs_human ? '是' : '否'} |`
        ),
      ].join('\n')
    : '_暂无_'

  return `---
tags:
  - project-os
  - ${project.type}
  - ${project.status}
project_id: ${project.id}
confidence: ${analysis.confidence}
pass_count: ${analysis.pass_count}
stage: ${project.stage}
created: ${today()}
---

# ${project.name}

> **核心定义**：${analysis.project_definition ?? '分析中...'}

## 📋 基本信息

| 字段 | 值 |
|------|----|
| 类型 | ${project.type} |
| 状态 | ${project.status} / ${project.stage} |
| 目标 | ${project.goal ?? '未填写'} |
| 自动化评分 | **${project.automation_score}%** |
| 置信度 | **${analysis.confidence}%** |
| 分析轮数 | ${analysis.pass_count} |

## 👥 目标用户

${analysis.target_user ?? '_待分析_'}

## 💰 变现路径

${monoMd}

## 🔄 工作流

${wfMd}

## ⚠️ 风险

${riskMd}

## 🔍 信息缺口

${gapMd}

## 🤖 自动化地图

${autoTable}

## 💡 MVP 建议

${analysis.mvp_suggestion ?? '_待分析_'}

## ⏭ 下一步行动

${project.next_action ?? '_待确定_'}

---

*置信度：${analysis.confidence}% | 更新时间：${today()}*
`
}

// ── 模板 2：任务包（Handoff） ─────────────────────────────────────────

const HANDOFF_LABELS: Record<string, string> = {
  dev: '开发助手任务包',
  content: '内容助手任务包',
  research: '研究助手任务包',
}

export function renderHandoffNote(
  handoff: ProjectHandoff,
  projectName: string
): string {
  const label = HANDOFF_LABELS[handoff.handoff_type] ?? handoff.handoff_type
  return `---
tags:
  - handoff
  - ${handoff.handoff_type}
project: ${projectName}
version: v${handoff.version}
created: ${today()}
---

# [${label}] ${projectName}

${handoff.handoff_content}

---

*生成时间：${today()} | 版本：v${handoff.version}*
`
}

// ── 模板 3：项目索引卡（项目库一览） ─────────────────────────────────

export function renderProjectIndex(projects: Project[]): string {
  const rows = projects.map(p =>
    `| [[${sanitize(p.name)}/分析报告\\|${p.name}]] | ${p.type} | ${p.status} | ${p.stage} | ${p.automation_score}% |`
  )

  return `---
tags:
  - project-os
  - index
updated: ${today()}
---

# Project OS — 项目库

| 项目 | 类型 | 状态 | 阶段 | 自动化 |
|------|------|------|------|--------|
${rows.join('\n')}

---

*共 ${projects.length} 个项目 | 更新：${today()}*
`
}

// ── 模板 4：采集任务日志 ──────────────────────────────────────────────

interface CaptureLogEntry {
  url: string
  status: 'done' | 'error' | 'pending'
  title?: string
  error?: string
  ts: string
}

export function renderCaptureLog(
  projectName: string,
  entries: CaptureLogEntry[]
): string {
  const rows = entries.map(e =>
    `| ${e.ts} | ${e.url} | ${e.status} | ${e.title ?? ''} | ${e.error ?? ''} |`
  )
  return `---
tags:
  - capture-log
project: ${projectName}
created: ${today()}
---

# 采集日志 — ${projectName}

| 时间 | URL | 状态 | 标题 | 错误 |
|------|-----|------|------|------|
${rows.join('\n')}
`
}

// ── 工具导出 ──────────────────────────────────────────────────────────

export { sanitize as sanitizeFilename }
