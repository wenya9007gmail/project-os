import { AnalyzingPlaceholder, EmptyState } from './AnalysisResultSection'
import { cn } from '@/lib/utils'
import type { AutomationNode } from '@/lib/types'

const LEVEL_COLORS: Record<string, string> = {
  full:   'bg-green-50 text-green-700',
  semi:   'bg-amber-50 text-amber-700',
  manual: 'bg-red-50 text-red-700',
}
const LEVEL_LABELS: Record<string, string> = {
  full: '全自动', semi: '半自动', manual: '人工',
}

export function AutomationSection({ automationMap, analyzing }: { automationMap: AutomationNode[]; analyzing: boolean }) {
  if (analyzing) return <AnalyzingPlaceholder text="正在生成自动化判断..." />
  if (automationMap.length === 0) return <EmptyState text="分析完成后，系统将对每个业务节点判断：可全自动 / 半自动 / 必须人工，并给出推荐方案和优先级。" />

  const full = automationMap.filter(n => n.level === 'full').length
  const score = Math.round((full / automationMap.length) * 100)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs">
        <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-full font-medium">全自动 {automationMap.filter(n => n.level === 'full').length}</span>
        <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-medium">半自动 {automationMap.filter(n => n.level === 'semi').length}</span>
        <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-full font-medium">人工 {automationMap.filter(n => n.level === 'manual').length}</span>
        <span className="ml-auto font-semibold">自动化率 {score}%</span>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs text-muted-foreground uppercase">
              <th className="text-left px-3 py-2 font-medium">节点</th>
              <th className="text-left px-3 py-2 font-medium">当前做法</th>
              <th className="text-left px-3 py-2 font-medium">自动化等级</th>
              <th className="text-left px-3 py-2 font-medium">推荐方案</th>
              <th className="text-left px-3 py-2 font-medium">优先级</th>
              <th className="text-left px-3 py-2 font-medium">需人工</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {automationMap
              .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 2) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 2))
              .map((node, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-medium">{node.node}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[120px]">{node.current_approach}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', LEVEL_COLORS[node.level])}>
                      {LEVEL_LABELS[node.level] ?? node.level}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[160px]">{node.recommended_solution}</td>
                  <td className="px-3 py-2.5 text-xs font-medium">
                    <span className={node.priority === 'high' ? 'text-red-600' : node.priority === 'medium' ? 'text-amber-600' : 'text-blue-600'}>
                      {node.priority === 'high' ? '高' : node.priority === 'medium' ? '中' : '低'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{node.needs_human ? '是' : '否'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
