'use client'
import { cn, AUTOMATION_LEVEL_COLORS, AUTOMATION_LEVEL_LABELS } from '@/lib/utils'
import type { AutomationNode } from '@/lib/types'

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600',
  medium: 'text-amber-600',
  low: 'text-blue-600',
}

export function AutomationTable({ nodes }: { nodes: AutomationNode[] }) {
  if (nodes.length === 0) {
    return (
      <div className="border rounded-xl p-8 text-center text-muted-foreground text-sm">
        暂无自动化节点数据
      </div>
    )
  }

  const fullCount = nodes.filter(n => n.level === 'full').length
  const semiCount = nodes.filter(n => n.level === 'semi').length
  const manualCount = nodes.filter(n => n.level === 'manual').length
  const score = Math.round((fullCount / nodes.length) * 100)

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-green-700 font-medium">全自动 {fullCount}</span>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-xs text-amber-700 font-medium">半自动 {semiCount}</span>
        </div>
        <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-red-400" />
          <span className="text-xs text-red-700 font-medium">人工 {manualCount}</span>
        </div>
        <div className="ml-auto text-sm text-muted-foreground">
          总自动化率 <strong className="text-foreground">{score}%</strong>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left px-4 py-2.5 font-medium">节点</th>
              <th className="text-left px-4 py-2.5 font-medium">自动化级别</th>
              <th className="text-left px-4 py-2.5 font-medium">推荐方案</th>
              <th className="text-left px-4 py-2.5 font-medium">优先级</th>
              <th className="text-left px-4 py-2.5 font-medium">需人工</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {nodes
              .sort((a, b) => {
                const order = { high: 0, medium: 1, low: 2 }
                return (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
              })
              .map((node, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{node.node}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', AUTOMATION_LEVEL_COLORS[node.level])}>
                      {AUTOMATION_LEVEL_LABELS[node.level] ?? node.level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs">{node.recommended_solution}</td>
                  <td className={cn('px-4 py-3 text-xs font-medium', PRIORITY_COLORS[node.priority])}>
                    {node.priority === 'high' ? '高' : node.priority === 'medium' ? '中' : '低'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {node.needs_human ? '是' : '否'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
