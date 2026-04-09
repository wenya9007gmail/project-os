'use client'
import { useState } from 'react'
import { Loader2, RefreshCw, Zap, AlertTriangle } from 'lucide-react'
import { AutomationTable } from './AutomationTable'
import { HandoffPanel } from './HandoffPanel'
import { parseJsonSafe, formatDateTime } from '@/lib/utils'
import type { ProjectAnalysis, ProjectHandoff, AutomationNode } from '@/lib/types'

interface Props {
  projectId: string
  initialAnalysis: ProjectAnalysis | null
  initialHandoffs: ProjectHandoff[]
}

type Tab = 'overview' | 'automation' | 'handoffs'

export function AnalysisPanel({ projectId, initialAnalysis, initialHandoffs }: Props) {
  const [analysis, setAnalysis] = useState(initialAnalysis)
  const [handoffs, setHandoffs] = useState(initialHandoffs)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')

  const runAnalysis = async () => {
    setRunning(true)
    setError('')
    try {
      const res = await fetch(`/api/analysis/${projectId}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? '分析失败，请检查资料是否充足')
        return
      }
      setAnalysis(json.data.analysis)
      setHandoffs(json.data.handoffs ?? [])
      setTab('overview')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const monetization = parseJsonSafe<Array<Record<string, string>>>(analysis?.monetization ?? null, [])
  const workflow = parseJsonSafe<Array<Record<string, unknown>>>(analysis?.workflow ?? null, [])
  const risks = parseJsonSafe<Array<Record<string, string>>>(analysis?.risks ?? null, [])
  const gaps = parseJsonSafe<Array<Record<string, string>>>(analysis?.gaps ?? null, [])
  const automationMap = (analysis?.automation_map ?? []) as AutomationNode[]

  const highRisks = risks.filter(r => r.level === 'high')
  const highGaps = gaps.filter(g => g.importance === 'high')

  return (
    <div>
      {/* Action bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {analysis && (
            <span className="text-sm text-muted-foreground">
              置信度 <strong className="text-foreground">{analysis.confidence}%</strong>
              {' · '}上次分析 {formatDateTime(analysis.created_at)}
            </span>
          )}
        </div>
        <button
          onClick={runAnalysis}
          disabled={running}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin" />分析中...</>
            : <><RefreshCw className="w-4 h-4" />{analysis ? '重新分析' : '开始分析'}</>
          }
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-destructive/30 bg-destructive/5 rounded-lg text-sm text-destructive flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {running && (
        <div className="border rounded-xl p-8 text-center text-muted-foreground animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
          <p className="font-medium">AI正在深度分析项目...</p>
          <p className="text-sm mt-1">通常需要 30-60 秒，请耐心等待</p>
        </div>
      )}

      {!running && !analysis && (
        <div className="border rounded-xl p-12 text-center text-muted-foreground">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">还没有分析报告</p>
          <p className="text-sm mt-1">先添加项目资料，然后点击「开始分析」</p>
        </div>
      )}

      {!running && analysis && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b mb-4">
            {(['overview', 'automation', 'handoffs'] as Tab[]).map(t => {
              const labels = { overview: '分析概览', automation: `自动化地图 (${automationMap.length})`, handoffs: `任务包 (${handoffs.length})` }
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {labels[t]}
                </button>
              )
            })}
          </div>

          {/* Overview tab */}
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Project definition */}
              {analysis.project_definition && (
                <Section title="项目定义">
                  <p className="text-sm leading-relaxed">{analysis.project_definition}</p>
                </Section>
              )}

              {/* Two columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Target user */}
                {analysis.target_user && (
                  <Section title="目标用户">
                    <p className="text-sm leading-relaxed">{analysis.target_user}</p>
                  </Section>
                )}

                {/* MVP suggestion */}
                {analysis.mvp_suggestion && (
                  <Section title="MVP建议">
                    <p className="text-sm leading-relaxed">{analysis.mvp_suggestion}</p>
                  </Section>
                )}
              </div>

              {/* Monetization */}
              {monetization.length > 0 && (
                <Section title="变现路径">
                  <div className="space-y-2">
                    {monetization.map((m, i) => (
                      <div key={i} className="flex items-start gap-3 p-2.5 bg-muted/40 rounded-lg">
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium whitespace-nowrap">{m.path}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{m.method}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{m.timeline} · 潜力：{m.potential}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Workflow */}
              {workflow.length > 0 && (
                <Section title="工作流">
                  <div className="space-y-1.5">
                    {workflow.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <span className="w-5 h-5 rounded-full bg-muted text-xs flex items-center justify-center shrink-0 mt-0.5">{w.step as number}</span>
                        <div className="flex-1">
                          <span className="font-medium">{w.name as string}</span>
                          {(w.automatable as boolean) && <span className="ml-2 text-xs text-green-600 bg-green-50 px-1 rounded">可自动化</span>}
                          <p className="text-xs text-muted-foreground mt-0.5">{w.description as string}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Risks + Gaps */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {risks.length > 0 && (
                  <Section title={`风险 ${highRisks.length > 0 ? `(${highRisks.length}个高风险)` : ''}`}>
                    <div className="space-y-1.5">
                      {risks.map((r, i) => (
                        <div key={i} className="text-sm">
                          <span className={`text-xs px-1 rounded mr-1.5 ${r.level === 'high' ? 'bg-red-50 text-red-700' : r.level === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                            {r.level === 'high' ? '高' : r.level === 'medium' ? '中' : '低'}
                          </span>
                          {r.risk}
                          {r.mitigation && <p className="text-xs text-muted-foreground ml-5">→ {r.mitigation}</p>}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {gaps.length > 0 && (
                  <Section title={`信息缺口 ${highGaps.length > 0 ? `(${highGaps.length}个高优先级)` : ''}`}>
                    <div className="space-y-1.5">
                      {gaps.map((g, i) => (
                        <div key={i} className="text-sm">
                          <span className={`text-xs px-1 rounded mr-1.5 ${g.importance === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                            {g.fill_type === 'login' ? '需采集' : g.fill_type === 'user' ? '需人工' : '公开'}
                          </span>
                          {g.gap}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            </div>
          )}

          {/* Automation tab */}
          {tab === 'automation' && (
            <AutomationTable nodes={automationMap} />
          )}

          {/* Handoffs tab */}
          {tab === 'handoffs' && (
            <HandoffPanel projectId={projectId} handoffs={handoffs} onRegenerate={setHandoffs} />
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-4">
      <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}
