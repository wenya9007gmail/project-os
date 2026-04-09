'use client'
import { useState } from 'react'
import { Download, RefreshCw, Loader2, Code2, Megaphone, Search } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { ProjectHandoff, HandoffType } from '@/lib/types'

const TYPE_META: Record<HandoffType, { label: string; icon: React.ReactNode; desc: string }> = {
  dev: {
    label: '开发助手包',
    icon: <Code2 className="w-4 h-4" />,
    desc: '技术架构、任务拆分、代码规范',
  },
  content: {
    label: '内容助手包',
    icon: <Megaphone className="w-4 h-4" />,
    desc: '内容策略、选题计划、文案模板',
  },
  research: {
    label: '研究助手包',
    icon: <Search className="w-4 h-4" />,
    desc: '竞品分析、数据来源、调研计划',
  },
}

interface Props {
  projectId: string
  handoffs: ProjectHandoff[]
  onRegenerate: (handoffs: ProjectHandoff[]) => void
}

export function HandoffPanel({ projectId, handoffs, onRegenerate }: Props) {
  const [activeType, setActiveType] = useState<HandoffType>('dev')
  const [regenerating, setRegenerating] = useState<HandoffType | null>(null)

  const byType = new Map(handoffs.map(h => [h.handoff_type as HandoffType, h]))
  const current = byType.get(activeType)

  const handleRegenerate = async (type: HandoffType) => {
    setRegenerating(type)
    try {
      const res = await fetch(`/api/handoffs/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const json = await res.json()
      if (json.data) {
        const updated = handoffs.filter(h => h.handoff_type !== type)
        onRegenerate([...updated, json.data])
      }
    } finally {
      setRegenerating(null)
    }
  }

  const handleDownload = (handoff: ProjectHandoff) => {
    const blob = new Blob([handoff.handoff_content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${TYPE_META[handoff.handoff_type as HandoffType]?.label ?? handoff.handoff_type}_v${handoff.version}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (handoffs.length === 0) {
    return (
      <div className="border rounded-xl p-8 text-center text-muted-foreground text-sm">
        请先运行分析以生成任务包
      </div>
    )
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Type selector */}
      <div className="flex border-b bg-muted/30">
        {(Object.entries(TYPE_META) as [HandoffType, typeof TYPE_META[HandoffType]][]).map(([type, meta]) => {
          const exists = byType.has(type)
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              disabled={!exists}
              className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 text-xs font-medium transition-colors border-b-2 ${
                activeType === type
                  ? 'border-primary text-primary bg-background'
                  : 'border-transparent text-muted-foreground hover:text-foreground disabled:opacity-40'
              }`}
            >
              {meta.icon}
              <span>{meta.label}</span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {current && (
        <div>
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/20">
            <span className="text-xs text-muted-foreground">
              {TYPE_META[activeType]?.desc} · v{current.version}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleRegenerate(activeType)}
                disabled={regenerating === activeType}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
              >
                {regenerating === activeType
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />
                }
                重新生成
              </button>
              <button
                onClick={() => handleDownload(current)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                下载 .md
              </button>
            </div>
          </div>

          {/* Markdown content */}
          <div className="p-4 max-h-[600px] overflow-y-auto prose-sm text-sm leading-relaxed">
            <ReactMarkdown>{current.handoff_content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
