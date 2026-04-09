'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Download, RefreshCw, Loader2, Code2, Megaphone, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { AnalyzingPlaceholder, EmptyState } from './AnalysisResultSection'
import type { ProjectHandoff, HandoffType } from '@/lib/types'

const TYPE_META: Record<HandoffType, { label: string; icon: React.ReactNode; color: string; desc: string }> = {
  dev:      { label: '开发任务包', icon: <Code2 className="w-4 h-4" />,     color: 'border-blue-200',   desc: '技术架构 · 任务拆分 · 代码规范 · MVP范围' },
  content:  { label: '内容任务包', icon: <Megaphone className="w-4 h-4" />, color: 'border-green-200',  desc: '内容策略 · 选题计划 · 平台方向 · 承接动作' },
  research: { label: '研究任务包', icon: <Search className="w-4 h-4" />,    color: 'border-amber-200',  desc: '信息缺口 · 调研方向 · 竞品对标 · 输出格式' },
}

export function HandoffsSection({ projectId, handoffs, onUpdate, analyzing }: {
  projectId: string; handoffs: ProjectHandoff[]; onUpdate: (h: ProjectHandoff[]) => void; analyzing: boolean
}) {
  const [expanded, setExpanded] = useState<HandoffType | null>(null)
  const [regenerating, setRegenerating] = useState<HandoffType | null>(null)

  if (analyzing) return <AnalyzingPlaceholder text="正在生成三类任务包..." />
  if (handoffs.length === 0) return (
    <EmptyState text="分析完成后自动生成三类任务包：开发助手包 / 内容助手包 / 研究助手包，可直接复制给对应 AI 助手执行。" />
  )

  const byType = new Map(handoffs.map(h => [h.handoff_type as HandoffType, h]))

  async function handleRegenerate(type: HandoffType) {
    setRegenerating(type)
    try {
      const res = await fetch(`/api/handoffs/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const json = await res.json()
      if (json.data) onUpdate([...handoffs.filter(h => h.handoff_type !== type), json.data])
    } finally {
      setRegenerating(null)
    }
  }

  function handleDownload(h: ProjectHandoff) {
    const blob = new Blob([h.handoff_content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${TYPE_META[h.handoff_type as HandoffType]?.label ?? h.handoff_type}_v${h.version}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      {(Object.entries(TYPE_META) as [HandoffType, typeof TYPE_META[HandoffType]][]).map(([type, meta]) => {
        const h = byType.get(type)
        if (!h) return null
        const isExpanded = expanded === type
        return (
          <div key={type} className={`border rounded-xl overflow-hidden ${meta.color}`}>
            {/* 卡片头部 */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
              onClick={() => setExpanded(isExpanded ? null : type)}
            >
              <span className="text-muted-foreground">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{meta.label}</p>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">v{h.version}</span>
                </div>
                <p className="text-xs text-muted-foreground">{meta.desc}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); handleRegenerate(type) }}
                  disabled={!!regenerating}
                  title="重新生成"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 transition-colors"
                >
                  {regenerating === type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDownload(h) }}
                  title="下载 .md"
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground ml-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />}
              </div>
            </div>

            {/* 展开内容 - Markdown渲染 */}
            {isExpanded && (
              <div className="border-t bg-background">
                <div className="p-5 max-h-[600px] overflow-y-auto prose prose-sm prose-neutral max-w-none
                  prose-headings:font-semibold prose-headings:text-foreground
                  prose-p:text-muted-foreground prose-li:text-muted-foreground
                  prose-strong:text-foreground prose-code:text-primary
                  prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs">
                  <ReactMarkdown>{h.handoff_content}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
