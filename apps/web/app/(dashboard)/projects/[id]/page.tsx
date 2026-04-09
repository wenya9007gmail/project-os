'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, FileText, Brain, Zap, AlertTriangle, Package,
  ScrollText, Loader2, Play, ChevronRight, CheckCircle2, Circle,
  Pencil, Check, X, Trash2
} from 'lucide-react'
import { SourcesPanel } from '@/components/SourcesPanel'
import { AnalysisResultSection } from '@/components/sections/AnalysisResultSection'
import { AutomationSection } from '@/components/sections/AutomationSection'
import { GapsSection } from '@/components/sections/GapsSection'
import { HandoffsSection } from '@/components/sections/HandoffsSection'
import { ProjectLogSection } from '@/components/sections/ProjectLogSection'
import {
  PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, parseJsonSafe
} from '@/lib/utils'
import type { Project, ProjectAnalysis, ProjectHandoff, ProjectLog, ProjectStatus } from '@/lib/types'

const FLOW_STEPS = [
  { key: 'draft',         label: '创建'    },
  { key: 'sourcing',      label: '输入资料' },
  { key: 'analysis',      label: '初步分析' },
  { key: 'gap_fill',      label: '补充研究' },
  { key: 'deep_analysis', label: '二次分析' },
  { key: 'automation',    label: '自动化判断'},
  { key: 'dispatch',      label: '任务分发' },
  { key: 'executing',     label: '执行中'   },
]

const ALL_STATUSES: ProjectStatus[] = [
  'pending','analyzing','needs_info','pending_dev','in_dev','validating','active','paused','abandoned'
]

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null)
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null)
  const [handoffs, setHandoffs] = useState<ProjectHandoff[]>([])
  const [logs, setLogs] = useState<ProjectLog[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Inline edit state
  const [editingField, setEditingField] = useState<'name' | 'goal' | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingField, setSavingField] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  useEffect(() => { load() }, [params.id])

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 4000)
      return
    }
    setDeleting(true)
    await fetch(`/api/projects/${params.id}`, { method: 'DELETE' })
    router.push('/projects')
  }

  async function load() {
    setLoading(true)
    try {
      const [pRes, aRes, hRes] = await Promise.all([
        fetch(`/api/projects/${params.id}`),
        fetch(`/api/analysis/${params.id}`),
        fetch(`/api/handoffs/${params.id}`),
      ])
      const [pJson, aJson, hJson] = await Promise.all([pRes.json(), aRes.json(), hRes.json()])
      if (pJson.data) setProject(pJson.data)
      if (aJson.data) setAnalysis(aJson.data)
      if (hJson.data) setHandoffs(hJson.data)
      const lRes = await fetch(`/api/logs?project_id=${params.id}`)
      const lJson = await lRes.json()
      if (lJson.data) setLogs(lJson.data)
    } finally {
      setLoading(false)
    }
  }

  async function startAnalysis() {
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch(`/api/analysis/${params.id}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? '分析失败，请检查资料是否充足'); return }
      setAnalysis(json.data.analysis)
      setHandoffs(json.data.handoffs ?? [])
      const [pRes, lRes] = await Promise.all([
        fetch(`/api/projects/${params.id}`),
        fetch(`/api/logs?project_id=${params.id}`),
      ])
      const [pJson, lJson] = await Promise.all([pRes.json(), lRes.json()])
      if (pJson.data) setProject(pJson.data)
      if (lJson.data) setLogs(lJson.data)
    } finally {
      setAnalyzing(false)
    }
  }

  async function saveField(field: 'name' | 'goal', value: string) {
    if (!project) return
    setSavingField(true)
    try {
      const res = await fetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const json = await res.json()
      if (json.data) setProject(json.data)
      setEditingField(null)
    } finally {
      setSavingField(false)
    }
  }

  async function changeStatus(status: ProjectStatus) {
    setShowStatusMenu(false)
    const res = await fetch(`/api/projects/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const json = await res.json()
    if (json.data) setProject(json.data)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
    </div>
  )
  if (!project) return <div className="p-6 text-muted-foreground">项目不存在</div>

  const stageIndex = FLOW_STEPS.findIndex(s => s.key === project.stage)
  const statusLabel = PROJECT_STATUS_LABELS[project.status] ?? project.status
  const statusColor = PROJECT_STATUS_COLORS[project.status] ?? 'bg-muted text-muted-foreground'

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">

      {/* 面包屑 + 状态切换 */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> 项目库
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{project.name}</span>
        {/* 状态下拉 */}
        <div className="relative ml-2">

          <button
            onClick={() => setShowStatusMenu(v => !v)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${statusColor}`}
          >
            {statusLabel} ▾
          </button>
          {showStatusMenu && (
            <div className="absolute top-full left-0 mt-1 bg-popover border rounded-xl shadow-lg z-50 py-1 min-w-[120px]">
              {ALL_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => changeStatus(s)}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${s === project.status ? 'font-semibold' : ''}`}
                >
                  {PROJECT_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className={`ml-auto flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-all ${
            confirmDelete
              ? 'bg-destructive text-destructive-foreground border-destructive'
              : 'text-muted-foreground border-transparent hover:border-destructive/30 hover:text-destructive'
          }`}
        >
          <Trash2 className="w-3 h-3" />
          {deleting ? '删除中…' : confirmDelete ? '再点一次确认删除' : '删除项目'}
        </button>
      </div>

      {/* 流程进度条 */}
      <div className="border rounded-xl bg-card overflow-hidden">
        <div className="px-4 py-3 overflow-x-auto">
          <div className="flex items-center gap-0 min-w-max">
            {FLOW_STEPS.map((step, i) => {
              const isDone    = i < stageIndex
              const isCurrent = i === stageIndex
              return (
                <div key={step.key} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isCurrent ? 'bg-primary text-primary-foreground shadow-sm' :
                    isDone    ? 'text-muted-foreground' :
                    'text-muted-foreground/40'
                  }`}>
                    {isDone
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      : isCurrent
                        ? <span className="w-4 h-4 flex items-center justify-center bg-white/20 rounded-full text-[10px]">{i+1}</span>
                        : <Circle className="w-3.5 h-3.5" />
                    }
                    {step.label}
                  </div>
                  {i < FLOW_STEPS.length - 1 && (
                    <ChevronRight className={`w-3.5 h-3.5 mx-0.5 ${i < stageIndex ? 'text-green-400' : 'text-muted-foreground/25'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ① 基本信息 */}
      <Section icon={<FileText className="w-4 h-4" />} title="① 基本信息">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-4">
            {/* 项目名称 - 可编辑 */}
            <EditableRow
              label="项目名称"
              value={project.name}
              editing={editingField === 'name'}
              editValue={editValue}
              saving={savingField}
              onEdit={() => { setEditingField('name'); setEditValue(project.name) }}
              onChange={setEditValue}
              onSave={() => saveField('name', editValue)}
              onCancel={() => setEditingField(null)}
            />
            {/* 类型 */}
            <div>
              <p className="text-xs text-muted-foreground">项目分类</p>
              <p className="text-sm font-medium mt-0.5">{PROJECT_TYPE_LABELS[project.type] ?? project.type}</p>
            </div>
            {/* 目标 - 可编辑 */}
            <EditableRow
              label="当前目标"
              value={project.goal ?? '未填写'}
              editing={editingField === 'goal'}
              editValue={editValue}
              saving={savingField}
              onEdit={() => { setEditingField('goal'); setEditValue(project.goal ?? '') }}
              onChange={setEditValue}
              onSave={() => saveField('goal', editValue)}
              onCancel={() => setEditingField(null)}
              multiline
            />
          </div>
          <div className="space-y-3">
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-muted-foreground">自动化潜力</p>
                <p className="text-2xl font-bold">{project.automation_score ?? 0}<span className="text-xs font-normal text-muted-foreground">%</span></p>
              </div>
              {analysis && (
                <div>
                  <p className="text-xs text-muted-foreground">分析置信度</p>
                  <p className="text-2xl font-bold">{analysis.confidence}<span className="text-xs font-normal text-muted-foreground">%</span></p>
                </div>
              )}
            </div>
            {project.next_action && (
              <div className="border-l-2 border-primary pl-3 py-1.5 bg-primary/5 rounded-r">
                <p className="text-xs text-primary font-semibold">▶ 下一步行动</p>
                <p className="text-sm mt-0.5">{project.next_action}</p>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ② 原始资料 */}
      <Section icon={<FileText className="w-4 h-4" />} title="② 原始资料" hint="支持文本、链接、对话补充">
        <SourcesPanel projectId={project.id} />
      </Section>

      {/* 分析按钮 */}
      <div className="flex items-center gap-3 py-1">
        <button
          onClick={startAnalysis}
          disabled={analyzing}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-sm"
        >
          {analyzing
            ? <><Loader2 className="w-4 h-4 animate-spin" />正在分析...</>
            : <><Play className="w-4 h-4" />{analysis ? '重新分析' : '开始 AI 分析'}</>
          }
        </button>
        {analyzing && (
          <p className="text-xs text-muted-foreground animate-pulse">
            初步分析 → 缺口识别 → 自动化判断 → 生成任务包
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* ③ AI 分析结果 */}
      <Section icon={<Brain className="w-4 h-4" />} title="③ AI 分析结果"
        badge={analysis ? `置信度 ${analysis.confidence}%` : '待分析'} badgeColor="purple">
        <AnalysisResultSection
          analysis={analysis}
          analyzing={analyzing}
          projectId={project.id}
          hasHandoffs={handoffs.length > 0}
          onHandoffsGenerated={(h) => {
            setHandoffs(h as ProjectHandoff[])
            // Scroll to handoffs section
            setTimeout(() => document.getElementById('handoffs-section')?.scrollIntoView({ behavior: 'smooth' }), 300)
          }}
        />
      </Section>

      {/* ④ 自动化机会 */}
      <Section icon={<Zap className="w-4 h-4" />} title="④ 自动化机会"
        badge={analysis?.automation_map?.length ? `${analysis.automation_map.length} 个节点` : undefined}>
        <AutomationSection automationMap={analysis?.automation_map ?? []} analyzing={analyzing} />
      </Section>

      {/* ⑤ 信息缺口 */}
      <Section icon={<AlertTriangle className="w-4 h-4" />} title="⑤ 信息缺口"
        badge={getGapBadge(analysis)} badgeColor="amber">
        <GapsSection analysis={analysis} projectId={project.id} analyzing={analyzing} />
      </Section>

      {/* ⑥ 下游任务包 */}
      <div id="handoffs-section">
        <Section icon={<Package className="w-4 h-4" />} title="⑥ 下游任务包"
          badge={handoffs.length > 0 ? `${handoffs.length} 份已生成` : '等待确认分析后生成'} badgeColor="green">
          <HandoffsSection projectId={project.id} handoffs={handoffs} onUpdate={setHandoffs} analyzing={analyzing} />
        </Section>
      </div>

      {/* ⑦ 项目日志 */}
      <Section icon={<ScrollText className="w-4 h-4" />} title="⑦ 项目日志"
        badge={logs.length > 0 ? `${logs.length} 条` : undefined}>
        <ProjectLogSection logs={logs} />
      </Section>
    </div>
  )
}

// ── Reusable Section wrapper ───────────────────────────────────────
function Section({ icon, title, children, badge, badgeColor = 'default', hint }: {
  icon: React.ReactNode; title: string; children: React.ReactNode
  badge?: string; badgeColor?: 'default' | 'purple' | 'amber' | 'green'; hint?: string
}) {
  const colors = {
    default: 'bg-muted text-muted-foreground',
    purple:  'bg-purple-50 text-purple-700',
    amber:   'bg-amber-50 text-amber-700',
    green:   'bg-green-50 text-green-700',
  }
  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/20">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="font-semibold text-sm">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground ml-1">— {hint}</span>}
        {badge && <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${colors[badgeColor]}`}>{badge}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

// ── Inline Editable Row ────────────────────────────────────────────
function EditableRow({ label, value, editing, editValue, saving, onEdit, onChange, onSave, onCancel, multiline }: {
  label: string; value: string; editing: boolean; editValue: string; saving: boolean
  onEdit: () => void; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; multiline?: boolean
}) {
  return (
    <div className="group">
      <p className="text-xs text-muted-foreground">{label}</p>
      {editing ? (
        <div className="mt-0.5 space-y-1">
          {multiline ? (
            <textarea
              autoFocus
              value={editValue}
              onChange={e => onChange(e.target.value)}
              rows={2}
              className="w-full text-sm border rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={editValue}
              onChange={e => onChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
              className="w-full text-sm border rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/30"
            />
          )}
          <div className="flex gap-1.5">
            <button onClick={onSave} disabled={saving}
              className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2.5 py-1 rounded-md disabled:opacity-50">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} 保存
            </button>
            <button onClick={onCancel} className="text-xs px-2.5 py-1 border rounded-md hover:bg-muted">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 mt-0.5">
          <p className="text-sm font-medium flex-1">{value}</p>
          <button onClick={onEdit}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all mt-0.5">
            <Pencil className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  )
}

function getGapBadge(analysis: ProjectAnalysis | null): string | undefined {
  if (!analysis?.gaps) return undefined
  const gaps = parseJsonSafe<Array<{ importance: string }>>(analysis.gaps, [])
  const high = gaps.filter(g => g.importance === 'high').length
  return high > 0 ? `${high} 个高优先级缺口` : `${gaps.length} 个缺口`
}
