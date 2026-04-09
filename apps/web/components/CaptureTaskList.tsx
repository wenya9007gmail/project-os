'use client'
import { useState } from 'react'
import { ExternalLink, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { CaptureTask } from '@/lib/types'

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: '待处理', color: 'text-amber-600 bg-amber-50',  icon: <Clock className="w-3.5 h-3.5" /> },
  running:  { label: '采集中', color: 'text-blue-600 bg-blue-50',    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" /> },
  done:     { label: '已完成', color: 'text-green-600 bg-green-50',  icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  error:    { label: '失败',   color: 'text-red-600 bg-red-50',      icon: <AlertCircle className="w-3.5 h-3.5" /> },
  manual:   { label: '需手动', color: 'text-orange-600 bg-orange-50', icon: <AlertCircle className="w-3.5 h-3.5" /> },
}

interface Props {
  tasks: CaptureTask[]
  projectMap: Record<string, string>
}

export function CaptureTaskList({ tasks: initialTasks, projectMap }: Props) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState<string>('all')

  const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)

  const retryTask = async (task: CaptureTask) => {
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: 'pending' } : t))
    try {
      await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: task.project_id,
          target_url: task.target_url,
          task_type: task.task_type,
          instructions: task.instructions,
        }),
      })
    } catch { /* ignore */ }
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {[
          { key: 'all', label: `全部 (${tasks.length})` },
          { key: 'pending', label: `待处理 (${tasks.filter(t => t.status === 'pending' || t.status === 'running').length})` },
          { key: 'done', label: `已完成 (${tasks.filter(t => t.status === 'done').length})` },
          { key: 'error', label: `失败 (${tasks.filter(t => t.status === 'error' || t.status === 'manual').length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          暂无采集任务
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const meta = STATUS_META[task.status] ?? STATUS_META.pending
            const projectName = projectMap[task.project_id] ?? '未知项目'
            return (
              <div key={task.id} className="border rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{task.target_url}</span>
                      <a href={task.target_url} target="_blank" rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{projectName}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{task.task_type}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(task.created_at)}</span>
                    </div>
                    {task.error_msg && (
                      <p className="text-xs text-red-600 mt-1">{task.error_msg}</p>
                    )}
                    {Boolean(task.instructions?.reason) && (
                      <p className="text-xs text-muted-foreground mt-1">原因：{String(task.instructions!.reason)}</p>
                    )}
                  </div>

                  {(task.status === 'error' || task.status === 'manual') && (
                    <button
                      onClick={() => retryTask(task)}
                      className="text-xs text-primary hover:underline shrink-0"
                    >
                      重试
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
