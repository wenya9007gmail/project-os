import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AnalyzingPlaceholder, EmptyState } from './AnalysisResultSection'
import { parseJsonSafe } from '@/lib/utils'
import type { ProjectAnalysis } from '@/lib/types'

interface Gap { gap: string; importance: 'high' | 'medium' | 'low'; fill_type: 'public' | 'login' | 'user'; suggested_source?: string }

const IMPORTANCE_COLORS: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-blue-50 text-blue-700 border-blue-200',
}
const FILL_LABELS: Record<string, string> = {
  public: '公开搜索', login: '需采集', user: '需人工提供',
}

export function GapsSection({ analysis, projectId, analyzing }: {
  analysis: ProjectAnalysis | null; projectId: string; analyzing: boolean
}) {
  const [filling, setFilling] = useState(false)
  const [fillMsg, setFillMsg] = useState('')

  if (analyzing) return <AnalyzingPlaceholder text="正在识别信息缺口..." />
  if (!analysis?.gaps) return <EmptyState text="分析完成后，系统将自动识别：哪些信息不足、哪些影响立项质量、哪些可自动补充、哪些需要登录态采集。" />

  const gaps = parseJsonSafe<Gap[]>(analysis.gaps, [])
  if (gaps.length === 0) return <p className="text-sm text-green-600">✓ 当前信息完整，无明显缺口</p>

  const highGaps = gaps.filter(g => g.importance === 'high')

  const autoFill = async () => {
    setFilling(true)
    setFillMsg('')
    try {
      const res = await fetch(`/api/gaps/${projectId}`, { method: 'POST' })
      const json = await res.json()
      if (json.data) setFillMsg(`已自动补充 ${json.data.filled} 条资料，${json.data.queued_captures} 条已加入采集队列`)
      else setFillMsg(json.error ?? '补充失败')
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="space-y-3">
      {highGaps.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{highGaps.length} 个高优先级缺口需补充</p>
          <button
            onClick={autoFill}
            disabled={filling}
            className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {filling ? <><Loader2 className="w-3 h-3 animate-spin" />补充中...</> : '自动补充研究'}
          </button>
        </div>
      )}
      {fillMsg && <p className="text-xs text-green-600">{fillMsg}</p>}
      <div className="space-y-2">
        {gaps.map((g, i) => (
          <div key={i} className={`border rounded-lg p-3 ${IMPORTANCE_COLORS[g.importance] ?? ''}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{g.gap}</p>
              <span className="text-xs shrink-0 opacity-70">{FILL_LABELS[g.fill_type] ?? g.fill_type}</span>
            </div>
            {g.suggested_source && (
              <p className="text-xs mt-1 opacity-70">来源建议：{g.suggested_source}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
