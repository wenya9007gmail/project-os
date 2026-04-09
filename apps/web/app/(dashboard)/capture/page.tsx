import { createServerClient } from '@/lib/supabase/server'
import { CaptureTaskList } from '@/components/CaptureTaskList'
import type { CaptureTask, Project } from '@/lib/types'

async function getData() {
  const db = createServerClient()
  const [{ data: tasks }, { data: projects }] = await Promise.all([
    db.from('capture_tasks').select('*').order('created_at', { ascending: false }).limit(100),
    db.from('projects').select('id, name'),
  ])

  const projectMap = new Map<string, string>()
  for (const p of (projects ?? []) as Project[]) {
    projectMap.set(p.id, p.name)
  }

  return {
    tasks: (tasks ?? []) as CaptureTask[],
    projectMap,
  }
}

export default async function CapturePage() {
  const { tasks, projectMap } = await getData()

  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'running')
  const done = tasks.filter(t => t.status === 'done')
  const errors = tasks.filter(t => t.status === 'error' || t.status === 'manual')

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">采集队列</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          登录态内容采集任务 — 需本地代理运行（localhost:3001）
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">待处理</p>
          <p className="text-2xl font-bold mt-0.5 text-amber-600">{pending.length}</p>
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">已完成</p>
          <p className="text-2xl font-bold mt-0.5 text-green-600">{done.length}</p>
        </div>
        <div className="border rounded-lg p-3">
          <p className="text-xs text-muted-foreground">失败/手动</p>
          <p className="text-2xl font-bold mt-0.5 text-red-600">{errors.length}</p>
        </div>
      </div>

      <CaptureTaskList tasks={tasks} projectMap={Object.fromEntries(projectMap)} />
    </div>
  )
}
