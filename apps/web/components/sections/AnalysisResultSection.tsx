'use client'
import { useState } from 'react'
import { Loader2, CheckCircle2, AlertTriangle, Zap } from 'lucide-react'
import { parseJsonSafe } from '@/lib/utils'
import type { ProjectAnalysis } from '@/lib/types'

// ── 七维评分展示 ──────────────────────────────────────────────────
interface DimScore {
  score: number
  label: string
  verdict: string
  reason: string
}

function DimensionCard({ dim }: { dim: DimScore }) {
  const [open, setOpen] = useState(false)
  const color =
    dim.score >= 70 ? 'bg-green-500' :
    dim.score >= 45 ? 'bg-amber-400' : 'bg-red-400'
  const textColor =
    dim.score >= 70 ? 'text-green-700' :
    dim.score >= 45 ? 'text-amber-700' : 'text-red-600'

  return (
    <button
      onClick={() => setOpen(v => !v)}
      className="w-full text-left border rounded-lg p-3 hover:bg-muted/30 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold">{dim.label}</span>
            <span className={`text-xs font-bold ${textColor}`}>{dim.verdict}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${dim.score}%` }} />
          </div>
        </div>
        <span className={`text-sm font-bold tabular-nums w-8 text-right shrink-0 ${textColor}`}>{dim.score}</span>
      </div>
      {open && (
        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t leading-relaxed">
          {dim.reason}
        </p>
      )}
    </button>
  )
}

// ── 人工确认按钮 ─────────────────────────────────────────────────
export function ApprovalGate({
  projectId,
  onApproved,
}: {
  projectId: string
  onApproved: (handoffs: unknown[]) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleApprove() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/handoffs/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'all' }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? '生成失败')
      onApproved(json.data ?? [])
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="border-2 border-dashed border-primary/30 rounded-xl p-5 bg-primary/5 text-center">
      <Zap className="w-6 h-6 text-primary mx-auto mb-2" />
      <p className="text-sm font-semibold mb-1">确认分析结果，生成执行任务包</p>
      <p className="text-xs text-muted-foreground mb-4">
        确认后将为本项目生成三份任务包（开发 / 内容 / 研究），进入分发阶段
      </p>
      {error && <p className="text-xs text-destructive mb-3">{error}</p>}
      <button
        onClick={handleApprove}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" />生成任务包中…</>
          : <><CheckCircle2 className="w-4 h-4" />✅ 我认可分析，生成任务包</>
        }
      </button>
    </div>
  )
}

// ── 主分析结果组件 ────────────────────────────────────────────────
export function AnalysisResultSection({
  analysis,
  analyzing,
  projectId,
  hasHandoffs,
  onHandoffsGenerated,
}: {
  analysis: ProjectAnalysis | null
  analyzing: boolean
  projectId: string
  hasHandoffs: boolean
  onHandoffsGenerated: (handoffs: unknown[]) => void
}) {
  if (analyzing) return <AnalyzingPlaceholder text="AI 七维深度分析中，请稍候…" />
  if (!analysis) return (
    <EmptyState text="添加资料后点击「开始 AI 分析」，系统将输出七维评估报告（可行性、新度、效度、信度、变现、竞品、成本）。" />
  )

  // Parse dimension scores from raw_response or stored json
  let dimScores: Record<string, DimScore> = {}
  let competitiveLandscape: Record<string, unknown> = {}
  let startupCost: Record<string, unknown> = {}
  let overallVerdict = ''
  let verdictReason = ''
  let monetizationPaths: Array<Record<string, string>> = []

  try {
    const raw = (analysis as unknown as { raw_response?: string }).raw_response ?? ''
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    const parsed = JSON.parse(match ? match[1].trim() : raw.trim())
    dimScores = parsed.dimension_scores ?? {}
    competitiveLandscape = parsed.competitive_landscape ?? {}
    startupCost = parsed.startup_cost_breakdown ?? {}
    overallVerdict = parsed.overall_verdict ?? ''
    verdictReason = parsed.verdict_reason ?? ''
    monetizationPaths = parsed.monetization_paths ?? []
  } catch { /* fallback to stored fields */ }

  const monetization = monetizationPaths.length > 0
    ? monetizationPaths
    : parseJsonSafe<Array<Record<string, string>>>(analysis.monetization, [])

  const workflow = parseJsonSafe<Array<Record<string, unknown>>>(analysis.workflow, [])
  const risks = parseJsonSafe<Array<Record<string, string>>>(analysis.risks, [])
  const dims = Object.values(dimScores) as DimScore[]

  const verdictColor =
    overallVerdict === '可推进' ? 'bg-green-50 text-green-700 border-green-200' :
    overallVerdict === '不建议推进' ? 'bg-red-50 text-red-700 border-red-200' :
    'bg-amber-50 text-amber-700 border-amber-200'

  return (
    <div className="space-y-4">
      {/* 综合裁定 */}
      {(overallVerdict || analysis.project_definition) && (
        <div className={`border rounded-xl p-4 ${overallVerdict ? verdictColor : ''}`}>
          {overallVerdict && (
            <div className="flex items-center gap-2 mb-2">
              {overallVerdict === '可推进'
                ? <CheckCircle2 className="w-4 h-4" />
                : <AlertTriangle className="w-4 h-4" />}
              <span className="font-semibold text-sm">综合判断：{overallVerdict}</span>
              <span className="text-xs ml-auto">置信度 {analysis.confidence}%</span>
            </div>
          )}
          {verdictReason && <p className="text-xs leading-relaxed mb-2">{verdictReason}</p>}
          {analysis.project_definition && (
            <p className="text-xs text-muted-foreground italic">"{analysis.project_definition}"</p>
          )}
        </div>
      )}

      {/* 七维评分 */}
      {dims.length > 0 && (
        <Block title="七维评分（点击查看详情）">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {dims.map(d => <DimensionCard key={d.label} dim={d} />)}
          </div>
        </Block>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analysis.target_user && (
          <Block title="目标用户">
            <p className="text-sm leading-relaxed">{analysis.target_user}</p>
          </Block>
        )}
        {analysis.mvp_suggestion && (
          <Block title="MVP 建议">
            <p className="text-sm leading-relaxed">{analysis.mvp_suggestion}</p>
          </Block>
        )}
      </div>

      {/* 变现路径 */}
      {monetization.length > 0 && (
        <Block title="变现路径">
          <div className="space-y-2">
            {monetization.map((m, i) => (
              <div key={i} className="flex gap-3 items-start p-2.5 bg-muted/40 rounded-lg">
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-medium whitespace-nowrap shrink-0">{m.path}</span>
                <div className="min-w-0">
                  <p className="text-sm">{m.method}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m.timeline} · 潜力：{m.revenue_potential ?? m.potential}
                    {m.prerequisite && ` · 前提：${m.prerequisite}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* 竞品格局 */}
      {Boolean(competitiveLandscape.differentiation_opportunity) && (
        <Block title="竞品格局">
          {(competitiveLandscape.main_competitors as Array<Record<string, string>> ?? []).length > 0 && (
            <div className="space-y-1.5 mb-3">
              {(competitiveLandscape.main_competitors as Array<Record<string, string>>).map((c, i) => (
                <div key={i} className="text-xs flex gap-2 items-start">
                  <span className="font-semibold shrink-0">{c.name}</span>
                  <span className="text-green-700">↑ {c.strengths}</span>
                  <span className="text-red-600">↓ {c.weaknesses}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            差异化机会：{String(competitiveLandscape.differentiation_opportunity)}
          </p>
          {Boolean(competitiveLandscape.moat) && (
            <p className="text-xs text-muted-foreground mt-1">护城河：{String(competitiveLandscape.moat)}</p>
          )}
        </Block>
      )}

      {/* 启动成本 */}
      {Boolean(startupCost.capital) && (
        <Block title="启动成本估算">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-muted-foreground">资金：</span>{String(startupCost.capital)}</div>
            <div><span className="text-muted-foreground">团队：</span>{String(startupCost.team)}</div>
            <div><span className="text-muted-foreground">MVP周期：</span>{String(startupCost.time_to_mvp)}</div>
            {(startupCost.key_resources as string[] ?? []).length > 0 && (
              <div className="col-span-2">
                <span className="text-muted-foreground">关键资源：</span>
                {(startupCost.key_resources as string[]).join('、')}
              </div>
            )}
          </div>
        </Block>
      )}

      {/* 流程拆解 */}
      {workflow.length > 0 && (
        <Block title="流程拆解">
          <div className="space-y-2">
            {workflow.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="w-5 h-5 shrink-0 rounded-full bg-muted text-xs flex items-center justify-center mt-0.5">{w.step as number}</span>
                <div>
                  <span className="font-medium">{w.name as string}</span>
                  {(w.automatable as boolean) && (
                    <span className="ml-2 text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">可自动化</span>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">{w.description as string}</p>
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* 风险 */}
      {risks.length > 0 && (
        <Block title="风险初判">
          <div className="space-y-1.5">
            {risks.map((r, i) => (
              <div key={i} className="text-sm">
                <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${
                  r.level === 'high' ? 'bg-red-50 text-red-700' :
                  r.level === 'medium' ? 'bg-amber-50 text-amber-700' :
                  'bg-blue-50 text-blue-700'
                }`}>
                  {r.level === 'high' ? '高风险' : r.level === 'medium' ? '中风险' : '低风险'}
                </span>
                {r.risk}
                {r.mitigation && <p className="text-xs text-muted-foreground mt-0.5 ml-14">应对：{r.mitigation}</p>}
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* 人工确认门 — 仅在未生成任务包时显示 */}
      {!hasHandoffs && (
        <ApprovalGate
          projectId={projectId}
          onApproved={onHandoffsGenerated}
        />
      )}
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  )
}

export function AnalyzingPlaceholder({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground py-4">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">{text}</span>
    </div>
  )
}

export function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-2">{text}</p>
}
