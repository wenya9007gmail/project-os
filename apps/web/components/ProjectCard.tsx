'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart2, FileText, Zap, ChevronRight, Trash2 } from 'lucide-react'
import { cn, PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, formatDate } from '@/lib/utils'
import type { ProjectWithStats } from '@/lib/types'

const STAGE_SHORT: Record<string, string> = {
  draft:        '创建',
  sourcing:     '录入资料',
  analysis:     '初步分析',
  gap_fill:     '补充研究',
  deep_analysis:'二次分析',
  automation:   '自动化判断',
  dispatch:     '任务分发',
  executing:    '执行中',
}

export function ProjectCard({
  project,
  onDeleted,
}: {
  project: ProjectWithStats
  onDeleted?: (id: string) => void
}) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const confidence = project.last_analysis?.confidence ?? null
  const statusLabel = PROJECT_STATUS_LABELS[project.status] ?? project.status
  const statusColor = PROJECT_STATUS_COLORS[project.status] ?? 'bg-muted text-muted-foreground'
  const stageHint   = STAGE_SHORT[project.stage] ?? project.stage

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000) // auto-cancel after 3s
      return
    }
    setDeleting(true)
    try {
      await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      onDeleted?.(project.id)
      router.refresh()
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="relative border rounded-xl bg-card hover:shadow-sm hover:border-primary/30 transition-all group">
      <Link href={`/projects/${project.id}`} className="block p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
              {project.name}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {PROJECT_TYPE_LABELS[project.type] ?? project.type}
            </p>
          </div>
          <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', statusColor)}>
            {statusLabel}
          </span>
        </div>

        {/* Stage hint */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <span className="opacity-50">流程：</span>
          <span className="font-medium text-foreground/70">{stageHint}</span>
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {project.source_count ?? 0} 份资料
          </span>
          {confidence !== null && (
            <span className="flex items-center gap-1">
              <BarChart2 className="w-3 h-3" />
              {confidence}% 置信度
            </span>
          )}
          {(project.automation_score ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {project.automation_score}% 自动化
            </span>
          )}
        </div>

        {project.next_action && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs font-medium text-primary line-clamp-1">▶ {project.next_action}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-2 pt-1">
          <p className="text-xs text-muted-foreground">{formatDate(project.updated_at)}</p>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors" />
        </div>
      </Link>

      {/* Delete button — appears on hover */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className={cn(
          'absolute top-3 right-8 p-1.5 rounded-md text-xs font-medium transition-all',
          'opacity-0 group-hover:opacity-100',
          confirmDelete
            ? 'opacity-100 bg-destructive text-destructive-foreground px-2'
            : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
        )}
        title="删除项目"
      >
        {deleting ? '…' : confirmDelete ? '确认删除?' : <Trash2 className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}
