'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, FileText, Link2, Loader2, Globe, RefreshCw } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { ProjectSource } from '@/lib/types'

const SOURCE_TYPE_LABELS: Record<string, string> = {
  text: '文本', url: '链接', file: '文件', capture: '采集', chat: '对话', image_desc: '图片描述',
}

type Mode = 'text' | 'url'

export function SourcesPanel({ projectId }: { projectId: string }) {
  const [sources, setSources] = useState<ProjectSource[]>([])
  const [loading, setLoading] = useState(true)
  const [retryingAll, setRetryingAll] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [mode, setMode] = useState<Mode>('text')
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [fetching, setFetching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    fetch(`/api/sources?project_id=${projectId}`)
      .then(r => r.json())
      .then(j => { if (j.data) setSources(j.data) })
      .finally(() => setLoading(false))
  }, [projectId])

  async function fetchUrlContent() {
    if (!url.trim()) return
    setFetching(true)
    setFetchError('')
    try {
      const res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const json = await res.json()
      if (json.error) { setFetchError(json.error); return }
      setContent(json.content)
      if (!title) {
        const firstLine = json.content.split('\n').find((l: string) => l.trim())
        setTitle(firstLine?.slice(0, 60) ?? url)
      }
    } finally {
      setFetching(false)
    }
  }

  async function handleSave() {
    if (!content.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          source_type: mode,
          source_title: title.trim() || null,
          source_url: mode === 'url' ? url.trim() || null : null,
          content_raw: content.trim(),
        }),
      })
      const json = await res.json()
      if (json.data) {
        setSources(s => [json.data, ...s])
        setTitle(''); setUrl(''); setContent(''); setFetchError('')
        setShowForm(false)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这份资料？')) return
    await fetch(`/api/sources?id=${id}`, { method: 'DELETE' })
    setSources(s => s.filter(x => x.id !== id))
  }

  async function retryEmbed(id: string) {
    setSources(s => s.map(x => x.id === id ? { ...x, embed_status: 'pending' } : x))
    await fetch(`/api/sources/embed?id=${id}`, { method: 'POST' })
    // Poll for completion
    let tries = 0
    const poll = setInterval(async () => {
      tries++
      const res = await fetch(`/api/sources?project_id=${projectId}`)
      const json = await res.json()
      const updated = (json.data ?? []).find((x: ProjectSource) => x.id === id)
      if (updated && updated.embed_status !== 'pending') {
        setSources(s => s.map(x => x.id === id ? updated : x))
        clearInterval(poll)
      }
      if (tries > 20) clearInterval(poll)
    }, 1500)
  }

  async function retryAllEmbed() {
    const failedIds = sources.filter(s => s.embed_status === 'error').map(s => s.id)
    if (!failedIds.length) return
    setRetryingAll(true)
    // Mark all as pending in UI
    setSources(s => s.map(x => failedIds.includes(x.id) ? { ...x, embed_status: 'pending' } : x))
    await fetch(`/api/sources/embed?project_id=${projectId}`, { method: 'POST' })
    // Poll until none are pending
    let tries = 0
    const poll = setInterval(async () => {
      tries++
      const res = await fetch(`/api/sources?project_id=${projectId}`)
      const json = await res.json()
      const updated: ProjectSource[] = json.data ?? []
      setSources(updated)
      const stillPending = updated.some(s => s.embed_status === 'pending')
      if (!stillPending || tries > 30) {
        clearInterval(poll)
        setRetryingAll(false)
      }
    }, 2000)
  }

  function resetForm() {
    setTitle(''); setUrl(''); setContent(''); setFetchError('')
    setShowForm(false)
  }

  return (
    <div className="space-y-3">
      {/* 添加资料入口 */}
      {!showForm ? (
        <div className="flex gap-2">
          <button
            onClick={() => { setMode('text'); setShowForm(true) }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-3 py-2 transition-colors hover:border-foreground/30"
          >
            <Plus className="w-3.5 h-3.5" /><FileText className="w-3.5 h-3.5" /> 添加文本
          </button>
          <button
            onClick={() => { setMode('url'); setShowForm(true) }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-3 py-2 transition-colors hover:border-foreground/30"
          >
            <Plus className="w-3.5 h-3.5" /><Globe className="w-3.5 h-3.5" /> 添加网址
          </button>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-muted/10">
          {/* 模式切换 */}
          <div className="flex border-b">
            {(['text', 'url'] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setContent(''); setFetchError('') }}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                  mode === m ? 'bg-background border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'text' ? <><FileText className="w-3.5 h-3.5" />文本资料</> : <><Globe className="w-3.5 h-3.5" />网址链接</>}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-3">
            {/* URL 模式 */}
            {mode === 'url' && (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fetchUrlContent()}
                  placeholder="粘贴网址，AI 自动读取内容"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-1 focus:ring-primary/30"
                />
                <button
                  onClick={fetchUrlContent}
                  disabled={fetching || !url.trim()}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-50 hover:opacity-90"
                >
                  {fetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  {fetching ? '读取中...' : '读取'}
                </button>
              </div>
            )}
            {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}

            {/* 标题 */}
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="资料标题（可选，留空自动提取）"
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:ring-1 focus:ring-primary/30"
            />

            {/* 内容 */}
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={mode === 'url'
                ? '点击「读取」自动抓取，或手动粘贴页面内容'
                : '粘贴任何内容：产品介绍、竞品分析、对话记录、想法片段……'
              }
              rows={6}
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background outline-none resize-none focus:ring-1 focus:ring-primary/30"
            />

            {/* 操作 */}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !content.trim()}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 hover:opacity-90"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                保存资料
              </button>
              <button onClick={resetForm} className="px-4 py-2 border rounded-lg text-xs hover:bg-muted transition-colors">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 全部重试向量化 */}
      {!loading && sources.some(s => s.embed_status === 'error') && (
        <div className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-100 rounded-xl text-xs">
          <span className="text-red-600">
            {sources.filter(s => s.embed_status === 'error').length} 份资料向量化失败
            <span className="text-red-400 ml-1">（需要 local-agent 运行：pnpm start:agent）</span>
          </span>
          <button
            onClick={retryAllEmbed}
            disabled={retryingAll}
            className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${retryingAll ? 'animate-spin' : ''}`} />
            {retryingAll ? '重试中…' : '全部重试'}
          </button>
        </div>
      )}

      {/* 资料列表 */}
      {loading ? (
        <div className="py-6 text-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" /> 加载中...
        </div>
      ) : sources.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground text-sm border border-dashed rounded-xl">
          还没有资料，添加后 AI 分析才有依据
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map(src => (
            <div key={src.id} className="flex items-start gap-3 p-3 border rounded-xl hover:bg-muted/20 group bg-card">
              <div className="mt-0.5 text-muted-foreground shrink-0">
                {src.source_type === 'url' || src.source_type === 'capture'
                  ? <Globe className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {src.source_title ?? `[${SOURCE_TYPE_LABELS[src.source_type] ?? src.source_type}]`}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                    src.embed_status === 'done'  ? 'bg-green-50 text-green-700' :
                    src.embed_status === 'error' ? 'bg-red-50 text-red-700' :
                    'bg-amber-50 text-amber-600'
                  }`}>
                    {src.embed_status === 'done' ? '已向量化' : src.embed_status === 'error' ? '向量化失败' : '待处理'}
                  </span>
                  {src.embed_status === 'error' && (
                    <button
                      onClick={() => retryEmbed(src.id)}
                      className="text-xs text-blue-600 hover:underline shrink-0"
                    >
                      重试
                    </button>
                  )}
                </div>
                {src.source_url && (
                  <a href={src.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate block mt-0.5 max-w-xs">
                    {src.source_url}
                  </a>
                )}
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {src.content_raw.slice(0, 120)}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">{formatDateTime(src.created_at)}</p>
              </div>
              <button
                onClick={() => handleDelete(src.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 mt-0.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
