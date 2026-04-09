import { EmptyState } from './AnalysisResultSection'
import { formatDateTime } from '@/lib/utils'
import type { ProjectLog } from '@/lib/types'

const LOG_ICONS: Record<string, string> = {
  analysis: '🧠', capture: '📥', handoff: '📦', user: '👤', system: '⚙️',
}

export function ProjectLogSection({ logs }: { logs: ProjectLog[] }) {
  if (logs.length === 0) return <EmptyState text="操作日志将在这里自动记录：分析、采集、任务包生成等所有关键事件。" />

  return (
    <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
      {logs.map(log => (
        <div key={log.id} className="flex items-start gap-2.5 py-2 border-b last:border-0">
          <span className="text-base shrink-0">{LOG_ICONS[log.log_type] ?? '📋'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm">{log.content}</p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{formatDateTime(log.created_at)}</span>
        </div>
      ))}
    </div>
  )
}
