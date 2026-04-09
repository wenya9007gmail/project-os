'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, BarChart2, Clock, Zap, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { ProjectCard } from '@/components/ProjectCard'
import type { ProjectWithStats } from '@/lib/types'

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: number | string; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="border rounded-xl p-4 bg-card flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setProjects(json.data ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const analyzed  = projects.filter(p => p.last_analysis).length
  const active    = projects.filter(p => ['active', 'in_dev', 'executing'].includes(p.status)).length
  const needsWork = projects.filter(p => ['pending', 'needs_info', 'analyzing'].includes(p.status)).length
  const avgConf   = analyzed > 0
    ? Math.round(
        projects
          .filter(p => p.last_analysis?.confidence)
          .reduce((s, p) => s + (p.last_analysis?.confidence ?? 0), 0) / analyzed
      )
    : null

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">项目库</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? '加载中…' : `共 ${projects.length} 个项目`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="p-2 rounded-md border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            新建项目
          </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20">
          加载失败：{error}
        </div>
      )}

      {/* Stats row */}
      {projects.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="已分析"
            value={analyzed}
            sub={`共 ${projects.length} 个项目`}
            icon={BarChart2}
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            label="进行中"
            value={active}
            sub="active / in_dev"
            icon={Zap}
            color="bg-green-50 text-green-600"
          />
          <StatCard
            label="待处理"
            value={needsWork}
            sub="pending / needs_info"
            icon={Clock}
            color="bg-yellow-50 text-yellow-600"
          />
          <StatCard
            label="平均置信度"
            value={avgConf !== null ? `${avgConf}%` : '—'}
            sub={analyzed > 0 ? `基于 ${analyzed} 次分析` : '暂无分析数据'}
            icon={avgConf !== null && avgConf >= 60 ? CheckCircle : AlertCircle}
            color={avgConf !== null && avgConf >= 60 ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground'}
          />
        </div>
      )}

      {/* Project grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3].map(i => (
            <div key={i} className="border rounded-xl p-4 bg-card animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-3" />
              <div className="h-3 bg-muted rounded w-1/2 mb-2" />
              <div className="h-3 bg-muted rounded w-full" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <p className="text-lg">还没有项目</p>
          <p className="text-sm mt-1">点击「新建项目」，把项目资料丢进来，AI 自动创建 + 分析</p>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 mt-4 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> 新建第一个项目
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDeleted={(id) => setProjects(prev => prev.filter(p => p.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
