'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Link2, Trash2, Loader2, Sparkles, FileText, Globe } from 'lucide-react'

type SourceInput = { id: string; type: 'text' | 'url'; content: string; title: string }

function newSource(type: 'text' | 'url' = 'text'): SourceInput {
  return { id: Math.random().toString(36).slice(2), type, content: '', title: '' }
}

export default function NewProjectPage() {
  const router = useRouter()
  const [sources, setSources] = useState<SourceInput[]>([newSource('text')])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function addSource(type: 'text' | 'url') {
    setSources(prev => [...prev, newSource(type)])
  }

  function removeSource(id: string) {
    setSources(prev => prev.filter(s => s.id !== id))
  }

  function updateSource(id: string, field: 'content' | 'title', value: string) {
    setSources(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  function toggleType(id: string) {
    setSources(prev => prev.map(s => s.id === id ? { ...s, type: s.type === 'text' ? 'url' : 'text', content: '' } : s))
  }

  const hasContent = sources.some(s => s.content.trim().length > 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const filled = sources.filter(s => s.content.trim())
    if (!filled.length) { setError('请至少输入一条资料'); return }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/projects/from-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: filled.map(s => ({ type: s.type, content: s.content.trim(), title: s.title.trim() || undefined }))
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? '创建失败，请重试'); return }
      router.push(`/projects/${json.data.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* 顶部 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/projects" className="hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" /> 项目库
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">新建项目</span>
      </div>

      {/* 说明标题 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          投喂资料，AI 自动建项目
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5">
          把你关于这个项目的一切资料丢进来：产品文档、竞品网址、对话记录、想法片段……AI 会读懂并自动创建项目，然后直接分析。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* 资料列表 */}
        {sources.map((src, i) => (
          <div key={src.id} className="border rounded-xl overflow-hidden bg-card">
            {/* 资料顶部栏 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b">
              <span className="text-xs text-muted-foreground font-medium">资料 {i + 1}</span>
              <button
                type="button"
                onClick={() => toggleType(src.id)}
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors ${
                  src.type === 'url'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {src.type === 'url' ? <><Globe className="w-3 h-3" />网址</> : <><FileText className="w-3 h-3" />文本</>}
              </button>
              {src.type === 'text' && (
                <input
                  type="text"
                  value={src.title}
                  onChange={e => updateSource(src.id, 'title', e.target.value)}
                  placeholder="资料标题（选填）"
                  className="flex-1 text-xs bg-transparent outline-none text-muted-foreground placeholder:text-muted-foreground/50"
                />
              )}
              {sources.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSource(src.id)}
                  className="ml-auto text-muted-foreground/40 hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* 资料输入区 */}
            {src.type === 'url' ? (
              <input
                type="url"
                value={src.content}
                onChange={e => updateSource(src.id, 'content', e.target.value)}
                placeholder="https://example.com — AI 会自动读取页面内容"
                className="w-full px-4 py-3 text-sm bg-transparent outline-none placeholder:text-muted-foreground/40"
              />
            ) : (
              <textarea
                ref={i === 0 ? textareaRef : undefined}
                value={src.content}
                onChange={e => updateSource(src.id, 'content', e.target.value)}
                placeholder={`粘贴任何内容：产品介绍、商业计划、竞品截图描述、微信对话、脑暴记录……`}
                rows={5}
                className="w-full px-4 py-3 text-sm bg-transparent outline-none resize-none placeholder:text-muted-foreground/40"
              />
            )}
          </div>
        ))}

        {/* 添加资料按钮 */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => addSource('text')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-3 py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> 添加文本资料
          </button>
          <button
            type="button"
            onClick={() => addSource('url')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed rounded-lg px-3 py-2 transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" /> 添加网址
          </button>
        </div>

        {/* 提示 */}
        {hasContent && !loading && (
          <p className="text-xs text-muted-foreground bg-primary/5 border border-primary/10 rounded-lg px-4 py-2.5">
            💡 AI 将读取你的资料，自动提取项目名称、类型、目标，并创建项目进入分析流程。
          </p>
        )}

        {/* 错误 */}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* 提交 */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading || !hasContent}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 shadow-sm"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" />AI 正在解析资料...</>
              : <><Sparkles className="w-4 h-4" />AI 解析并创建项目</>
            }
          </button>
          <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
            取消
          </Link>
        </div>

        {loading && (
          <p className="text-xs text-muted-foreground animate-pulse">
            正在读取资料 → 提取项目信息 → 自动创建项目……
          </p>
        )}
      </form>
    </div>
  )
}
